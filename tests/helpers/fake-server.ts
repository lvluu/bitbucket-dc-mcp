import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

export function createFakeServer(toolHandlers: Map<string, ToolHandler>): McpServer {
  return {
    tool: (name: string, _desc: string, _schema: unknown, handler: ToolHandler) => {
      toolHandlers.set(name, handler);
    },
    registerTool: (name: string, _config: unknown, handler: ToolHandler) => {
      toolHandlers.set(name, handler);
    },
  } as unknown as McpServer;
}
