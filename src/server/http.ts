import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import cors from "cors";
import express, { type Express, type Request, type Response } from "express";

export interface HttpApp {
    app: Express;
    sessionCount: () => number;
    /** Close sessions idle longer than the TTL (no request in flight); runs on a timer too. */
    sweep: () => Promise<void>;
    close: () => Promise<void>;
}

export interface HttpOptions {
    idleTtlMs?: number;
    maxSessions?: number;
    sweepIntervalMs?: number;
    now?: () => number;
    /** When set, `/mcp` requires `Authorization: Bearer <authToken>`; `/health` stays open. */
    authToken?: string;
    /** Accepted `Host` header hostnames (lowercase, no port); others get 403. Blocks DNS rebinding on loopback binds. */
    allowedHosts?: string[];
}

export const DEFAULT_IDLE_TTL_MS = 30 * 60 * 1000;
export const DEFAULT_MAX_SESSIONS = 100;
/** Parse a positive integer env value; anything else (unset, NaN, <= 0) yields the fallback. */
export function positiveInt(raw: string | undefined, fallback: number): number {
    const n = Number(raw);
    return raw !== undefined && Number.isInteger(n) && n > 0 ? n : fallback;
}

export const DEFAULT_HOST = "127.0.0.1";
/** Bind address from env: unset or blank falls back to loopback so the Bitbucket token is not exposed. */
export function resolveHost(raw: string | undefined): string {
    const host = raw?.trim();
    return host === undefined || host === "" ? DEFAULT_HOST : host;
}
export function isLoopbackHost(host: string): boolean {
    return host === "localhost" || host === "::1" || host === "[::1]" || /^127(\.\d{1,3}){3}$/.test(host);
}

/** Hostnames a client legitimately uses to reach a loopback-bound server. */
export const LOOPBACK_HOSTNAMES = ["localhost", "127.0.0.1", "[::1]"];

const sha256 = (value: string): Buffer => createHash("sha256").update(value).digest();

/** Constant-time bearer check; hashing first equalises lengths so timingSafeEqual cannot throw. */
function hasValidBearer(header: string | undefined, token: string): boolean {
    const match = header === undefined ? null : /^Bearer\s+(.+)$/i.exec(header);
    return match !== null && timingSafeEqual(sha256(match[1] ?? ""), sha256(token));
}

const DEFAULT_SWEEP_INTERVAL_MS = 60 * 1000;
const RETRY_AFTER_SECONDS = "30";

interface Session {
    server: McpServer;
    transport: StreamableHTTPServerTransport;
    lastSeen: number;
    inFlight: number;
}

function sendJsonRpcError(res: Response, status: number, code: number, message: string): void {
    res.status(status).json({ jsonrpc: "2.0", error: { code, message }, id: null });
}

/**
 * Express app serving MCP over Streamable HTTP with one transport + McpServer per session.
 * An McpServer/transport pair accepts exactly one `initialize`, so sessions cannot share one.
 */
export function createHttpApp(createServer: () => Promise<McpServer>, corsOrigin: string, options: HttpOptions = {}): HttpApp {
    const idleTtlMs = options.idleTtlMs ?? DEFAULT_IDLE_TTL_MS;
    const maxSessions = options.maxSessions ?? DEFAULT_MAX_SESSIONS;
    const now = options.now ?? Date.now;
    const sessions = new Map<string, Session>();
    let pendingInits = 0;
    const app = express();
    const allowedHosts = options.allowedHosts;
    if (allowedHosts !== undefined) {
        app.use((req, res, next) => {
            const hostname = /^(\[[^\]]+\]|[^:]*)/.exec(req.headers.host ?? "")?.[1]?.toLowerCase() ?? "";
            if (allowedHosts.includes(hostname)) {
                next();
                return;
            }
            sendJsonRpcError(res, 403, -32000, "Forbidden: unexpected Host header");
        });
    }
    app.use(express.json({ limit: "1mb" }));
    // Browsers reject credentialed responses with ACAO "*", so credentials need an explicit origin list.
    const configured = corsOrigin.trim() || "*";
    const isWildcard = configured === "*";
    app.use(cors({
        origin: isWildcard ? "*" : configured.split(",").map(o => o.trim()).filter(Boolean),
        credentials: !isWildcard,
        methods: ["GET", "POST", "OPTIONS", "DELETE"],
        allowedHeaders: ["Content-Type", "Authorization", "mcp-session-id", "mcp-protocol-version", "last-event-id"],
        exposedHeaders: ["mcp-session-id"]
    }));
    app.get("/health", (_req, res) => {
        res.json({ status: "ok", server: "bitbucket-dc-mcp" });
    });

    const authToken = options.authToken;
    if (authToken !== undefined && authToken !== "") {
        app.use("/mcp", (req, res, next) => {
            // Preflights carry no credentials; the cors middleware above has already answered them.
            if (req.method === "OPTIONS" || hasValidBearer(req.headers.authorization, authToken)) {
                next();
                return;
            }
            res.setHeader("WWW-Authenticate", "Bearer");
            sendJsonRpcError(res, 401, -32001, "Unauthorized");
        });
    }

    async function startSession(req: Request, res: Response): Promise<void> {
        pendingInits++;
        try {
            await runSession(req, res);
        } finally {
            pendingInits--;
        }
    }

    async function runSession(req: Request, res: Response): Promise<void> {
        const server = await createServer();
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (sessionId) => {
                sessions.set(sessionId, { server, transport, lastSeen: now(), inFlight: 0 });
            },
        });
        // Closing the transport also detaches the server (Protocol chains this handler).
        transport.onclose = () => {
            if (transport.sessionId !== undefined) {
                sessions.delete(transport.sessionId);
            }
        };
        try {
            await server.connect(transport);
            await transport.handleRequest(req, res, req.body);
        } finally {
            // Initialization rejected or failed: nothing registered, release the pair.
            if (transport.sessionId === undefined) {
                await server.close();
            }
        }
    }

    async function handle(req: Request, res: Response): Promise<void> {
        const header = req.headers["mcp-session-id"];
        const sessionId = Array.isArray(header) ? header[0] : header;
        if (sessionId !== undefined) {
            const session = sessions.get(sessionId);
            if (session === undefined) {
                sendJsonRpcError(res, 404, -32001, "Session not found");
                return;
            }
            // A GET is a long-lived SSE stream a vanished client can leave half-open forever, so it
            // must not pin the session: only POST/DELETE count as in flight.
            const tracked = req.method !== "GET";
            session.lastSeen = now();
            if (tracked) {
                session.inFlight++;
            }
            res.once("close", () => {
                if (tracked) {
                    session.inFlight--;
                }
                session.lastSeen = now();
            });
            await session.transport.handleRequest(req, res, req.body);
            return;
        }
        if (req.method === "POST" && isInitializeRequest(req.body)) {
            if (sessions.size + pendingInits >= maxSessions) {
                res.setHeader("Retry-After", RETRY_AFTER_SECONDS);
                sendJsonRpcError(res, 503, -32000, "Too many sessions");
                return;
            }
            await startSession(req, res);
            return;
        }
        sendJsonRpcError(res, 400, -32000, "Bad Request: missing mcp-session-id header");
    }

    app.all("/mcp", (req, res) => {
        handle(req, res).catch((error: unknown) => {
            console.error("MCP request failed:", error instanceof Error ? error.message : String(error));
            if (!res.headersSent) {
                sendJsonRpcError(res, 500, -32603, "Internal server error");
            }
        });
    });

    async function sweep(): Promise<void> {
        const cutoff = now() - idleTtlMs;
        const expired: Session[] = [];
        for (const [id, session] of sessions) {
            if (session.inFlight === 0 && session.lastSeen <= cutoff) {
                sessions.delete(id);
                expired.push(session);
            }
        }
        await Promise.allSettled(expired.map(s => s.server.close()));
    }

    const timer = setInterval(() => { void sweep(); }, options.sweepIntervalMs ?? DEFAULT_SWEEP_INTERVAL_MS);
    timer.unref();

    return {
        app,
        sessionCount: () => sessions.size,
        sweep,
        close: async () => {
            clearInterval(timer);
            const open = [...sessions.values()];
            sessions.clear();
            await Promise.allSettled(open.map(s => s.server.close()));
        },
    };
}
