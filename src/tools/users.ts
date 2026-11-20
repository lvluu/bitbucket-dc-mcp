import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getClient } from "#lib/client.js";
import { formatError, jsonResult } from "#lib/errors.js";
const usersModule = {
    type: "tool",
    name: "users",
    description: "Bitbucket DC user operations",
    register(server: McpServer): void {
        server.registerTool("getUser", {
            description: "Look up a Bitbucket Data Center user by username. Returns their display name, email address and id.",
            inputSchema: {
                username: z.string().describe("Username (userSlug) of the user to look up"),
            },
        }, async (args) => {
            try {
                const client = getClient();
                const response = await client.get(`/users/${encodeURIComponent(args.username)}`);
                return jsonResult(response.data);
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
    },
};
export default usersModule;