import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { repoArgs, pageArgs } from "#lib/params.js";
import { getClient, repoPath } from "#lib/client.js";
import { formatError, jsonResult } from "#lib/errors.js";
import { fetchPage, pageResult } from "#lib/pagination.js";
import { summarizeCommit, summarizeArray } from "#lib/field-filter.js";
const compareModule = {
    type: "tool",
    name: "compare",
    description: "Bitbucket DC ref comparison operations",
    register(server: McpServer): void {
        server.registerTool("compareRefs", {
            description: "List commits in 'to' that are not in 'from'.",
            inputSchema: {
                ...repoArgs,
                from: z.string().describe("Branch, tag or commit"),
                to: z.string().describe("Branch, tag or commit"),
                ...pageArgs,
            },
        }, async (args) => {
            try {
                const client = getClient();
                const params: Record<string, unknown> = {};
                if (args.from !== undefined)
                    params.from = args.from;
                if (args.to !== undefined)
                    params.to = args.to;
                const result = await fetchPage(client, `${repoPath(args.projectKey, args.repoSlug)}/compare/commits`, { limit: args.limit, start: args.start, all: args.all, params });
                const summaryValues = summarizeArray(result.values, summarizeCommit);
                return jsonResult(pageResult(result, summaryValues));
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
    },
};
export default compareModule;