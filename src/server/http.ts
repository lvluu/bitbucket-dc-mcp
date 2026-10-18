import { randomUUID } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import cors from "cors";
import express, { type Express, type Request, type Response } from "express";

export interface HttpApp {
    app: Express;
    sessionCount: () => number;
    close: () => Promise<void>;
}

interface Session {
    server: McpServer;
    transport: StreamableHTTPServerTransport;
}

function sendJsonRpcError(res: Response, status: number, code: number, message: string): void {
    res.status(status).json({ jsonrpc: "2.0", error: { code, message }, id: null });
}

/**
 * Express app serving MCP over Streamable HTTP with one transport + McpServer per session.
 * An McpServer/transport pair accepts exactly one `initialize`, so sessions cannot share one.
 */
export function createHttpApp(createServer: () => Promise<McpServer>, corsOrigin: string): HttpApp {
    const sessions = new Map<string, Session>();
    const app = express();
    app.use(express.json({ limit: "1mb" }));
    app.use(cors({
        origin: corsOrigin,
        credentials: true,
        methods: ["GET", "POST", "OPTIONS", "DELETE"],
        allowedHeaders: ["Content-Type", "Authorization", "mcp-session-id", "mcp-protocol-version", "last-event-id"],
        exposedHeaders: ["mcp-session-id"]
    }));
    app.get("/health", (_req, res) => {
        res.json({ status: "ok", server: "bitbucket-dc-mcp" });
    });

    async function startSession(req: Request, res: Response): Promise<void> {
        const server = await createServer();
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (sessionId) => {
                sessions.set(sessionId, { server, transport });
            },
        });
        // Closing the transport also detaches the server (Protocol chains this handler).
        transport.onclose = () => {
            if (transport.sessionId !== undefined) {
                sessions.delete(transport.sessionId);
            }
        };
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        // Initialization rejected (bad request): nothing registered, release the pair.
        if (transport.sessionId === undefined) {
            await server.close();
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
            await session.transport.handleRequest(req, res, req.body);
            return;
        }
        if (req.method === "POST" && isInitializeRequest(req.body)) {
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

    return {
        app,
        sessionCount: () => sessions.size,
        close: async () => {
            const open = [...sessions.values()];
            sessions.clear();
            await Promise.allSettled(open.map(s => s.server.close()));
        },
    };
}
