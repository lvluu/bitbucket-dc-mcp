import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import cors from "cors";
import { config } from "dotenv";
import express from "express";
import { initClient } from "#lib/client.js";
import { loadConfig } from "#lib/config.js";
import { autoRegisterModules } from "#registry/auto-loader.js";

type TransportMode = "stdio" | "http";

// Load environment variables from .env file
config();

export async function boot(
  mode?: TransportMode
): Promise<void> {
  // Initialize Bitbucket DC client from environment
  const bbConfig = loadConfig();
  initClient(bbConfig);
  const require = createRequire(import.meta.url);
  const pkg = require("../../package.json") as { version: string };

  console.error(`Bitbucket DC MCP Server v${pkg.version} connecting to: ${bbConfig.baseUrl}`);
  if (bbConfig.defaultProject !== undefined) {
    console.error(`Default project: ${bbConfig.defaultProject}`);
  }

  const transportMode = mode ?? (process.env.MCP_TRANSPORT as TransportMode | undefined) ?? "http";

  const server = new McpServer({
    name: "bitbucket-dc-mcp",
    version: pkg.version,
    description: "MCP server exposing Bitbucket Data Center operations as tools",
  });

  await autoRegisterModules(server);

  if (transportMode === "stdio") {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Bitbucket DC MCP Server running on stdio");
    return;
  }

  // HTTP mode with SSE support
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  const corsOrigin = process.env.CORS_ORIGIN ?? "*";
  app.use(cors({
    origin: corsOrigin,
    credentials: true,
    methods: ["GET", "POST", "OPTIONS", "DELETE"],
    allowedHeaders: ["Content-Type", "x-mcp-session", "x-mcp-session-id"],
    exposedHeaders: ["x-mcp-session-id"]
  }));

  // Health check endpoint
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", server: "bitbucket-dc-mcp" });
  });

  // Create transport with session support
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID()
  });

  await server.connect(transport);

  // Handle all MCP requests (GET for SSE, POST for JSON-RPC, DELETE for cleanup)
  app.all("/mcp", (req, res) => {
    void transport.handleRequest(req, res, req.body);
  });

  const port = Number(process.env.PORT ?? 3000);
  const httpServer = app.listen(port, () => {
    console.log(`Bitbucket DC MCP Server (HTTP) listening on http://localhost:${String(port)}/mcp`);
    console.log(`Health check: http://localhost:${String(port)}/health`);
    console.log(`CORS origin: ${corsOrigin}`);
  });

  process.on("SIGINT", () => {
    console.log("Shutting down...");
    void transport.close();
    httpServer.close(() => {
      process.exit(0);
    });
  });
}
