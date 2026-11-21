import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { pageArgs } from "#lib/params.js";
import { getClient } from "#lib/client.js";
import { formatError, jsonResult } from "#lib/errors.js";
import { fetchPage, pageResult } from "#lib/pagination.js";
import { summarizeArray, summarizePullRequest } from "#lib/field-filter.js";
// Shared description constants
const DESC_STATE = "PR state filter";
/** Bitbucket DC dashboard: pull requests scoped to the current (authenticated) user. */
const dashboardModule = {
    type: "tool",
    name: "dashboard",
    description: "Bitbucket DC pull requests scoped to the current user",
    register(server: McpServer): void {
        server.registerTool("listMyPullRequests", {
            description: "List my pull requests across all repositories",
            inputSchema: {
                state: z.enum(["OPEN", "MERGED", "DECLINED", "ALL"]).optional().describe(DESC_STATE),
                ...pageArgs,
            },
        }, async (args) => {
            try {
                const client = getClient();
                const params: Record<string, unknown> = { role: "AUTHOR" };
                if (args.state !== undefined)
                    params.state = args.state;
                const result = await fetchPage(client, "/dashboard/pull-requests", {
                    limit: args.limit,
                    start: args.start,
                    all: args.all,
                    params,
                });
                const summaryValues = summarizeArray(result.values, summarizePullRequest);
                return jsonResult(pageResult(result, summaryValues));
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
        server.registerTool("listPullRequestsAwaitingMyReview", {
            description: "List open PRs I review",
            inputSchema: {
                state: z.enum(["OPEN", "MERGED", "DECLINED", "ALL"]).optional().describe(DESC_STATE),
                ...pageArgs,
            },
        }, async (args) => {
            try {
                const client = getClient();
                const params: Record<string, unknown> = { role: "REVIEWER" };
                if (args.state !== undefined)
                    params.state = args.state;
                const result = await fetchPage(client, "/dashboard/pull-requests", {
                    limit: args.limit,
                    start: args.start,
                    all: args.all,
                    params,
                });
                const summaryValues = summarizeArray(result.values, summarizePullRequest);
                return jsonResult(pageResult(result, summaryValues));
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
    },
};
export default dashboardModule;