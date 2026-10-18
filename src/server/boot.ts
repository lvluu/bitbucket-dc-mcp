import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { config } from "dotenv";
import { initClient } from "#lib/client.js";
import { loadConfig } from "#lib/config.js";
import { autoRegisterModules } from "#registry/auto-loader.js";
import { createHttpApp, DEFAULT_IDLE_TTL_MS, DEFAULT_MAX_SESSIONS, positiveInt } from "./http.js";
// Load environment variables from .env file
config();
export async function boot(mode?: string): Promise<void> {
    // Initialize Bitbucket DC client from environment
    const bbConfig = loadConfig();
    initClient(bbConfig);
    const require = createRequire(import.meta.url);
    const pkg = require("../../package.json") as { version: string };
    console.error(`Bitbucket DC MCP Server v${pkg.version} connecting to: ${bbConfig.baseUrl}`);
    if (bbConfig.defaultProject !== undefined) {
        console.error(`Default project: ${bbConfig.defaultProject}`);
    }
    const transportMode = mode ?? process.env.MCP_TRANSPORT ?? "http";
    const createServer = async (): Promise<McpServer> => {
        const server = new McpServer({
            name: "bitbucket-dc-mcp",
            version: pkg.version,
            description: "MCP server exposing Bitbucket Data Center operations as tools",
        });
        await autoRegisterModules(server);
        return server;
    };
    if (transportMode === "stdio") {
        const transport = new StdioServerTransport();
        await (await createServer()).connect(transport);
        console.error("Bitbucket DC MCP Server running on stdio");
        return;
    }
    // HTTP mode: one McpServer + transport per MCP session
    const corsOrigin = process.env.CORS_ORIGIN ?? "*";
    const http = createHttpApp(createServer, corsOrigin, {
        idleTtlMs: positiveInt(process.env.MCP_SESSION_IDLE_TTL_MS, DEFAULT_IDLE_TTL_MS),
        maxSessions: positiveInt(process.env.MCP_MAX_SESSIONS, DEFAULT_MAX_SESSIONS),
    });
    const port = Number(process.env.PORT ?? 3000);
    const httpServer = http.app.listen(port, () => {
        console.log(`Bitbucket DC MCP Server (HTTP) listening on http://localhost:${String(port)}/mcp`);
        console.log(`Health check: http://localhost:${String(port)}/health`);
        console.log(`CORS origin: ${corsOrigin}`);
    });
    process.on("SIGINT", () => {
        console.log("Shutting down...");
        void http.close();
        httpServer.close(() => {
            process.exit(0);
        });
    });
}
