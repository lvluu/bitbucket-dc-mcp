import { randomUUID } from "node:crypto";
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
}

export const DEFAULT_IDLE_TTL_MS = 30 * 60 * 1000;
export const DEFAULT_MAX_SESSIONS = 100;
/** Parse a positive integer env value; anything else (unset, NaN, <= 0) yields the fallback. */
export function positiveInt(raw: string | undefined, fallback: number): number {
    const n = Number(raw);
    return raw !== undefined && Number.isInteger(n) && n > 0 ? n : fallback;
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
            session.inFlight++;
            res.once("close", () => {
                session.inFlight--;
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
