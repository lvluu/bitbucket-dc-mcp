import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getClient, repoPath } from "#lib/client.js";
import { formatError, jsonResult } from "#lib/errors.js";
import { fetchPage, pageResult } from "#lib/pagination.js";
import { summarizeCommit, summarizeArray } from "#lib/field-filter.js";
const DESC_PROJECT_KEY = "Project key";
const DESC_REPO_SLUG = "Repository slug";
const DESC_ITEMS_PER_PAGE = "Items per page";
const DESC_START_INDEX = "Start index";
const DESC_FETCH_ALL_PAGES = "Fetch all pages";
const compareModule = {
    type: "tool",
    name: "compare",
    description: "Bitbucket DC ref comparison operations",
    register(server: McpServer): void {
        server.registerTool("compareRefs", {
            description: "Compare two refs (branches, tags or commit hashes) in a repository and list the commits reachable from the 'to' ref but not the 'from' ref.",
            inputSchema: {
                projectKey: z.string().describe(DESC_PROJECT_KEY),
                repoSlug: z.string().describe(DESC_REPO_SLUG),
                from: z.string().describe("Source ref: branch name, tag, or commit hash (e.g. 'main' or 'feature/x')"),
                to: z.string().describe("Target ref: branch name, tag, or commit hash (e.g. 'main' or 'feature/x')"),
                limit: z.coerce.number().optional().describe(DESC_ITEMS_PER_PAGE),
                start: z.coerce.number().optional().describe(DESC_START_INDEX),
                all: z.boolean().optional().describe(DESC_FETCH_ALL_PAGES),
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