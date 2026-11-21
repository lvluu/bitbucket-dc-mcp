import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { repoArgs, pageArgs } from "#lib/params.js";
import { commitDiffPath, getClient, repoPath } from "#lib/client.js";
import { formatError, jsonResult } from "#lib/errors.js";
import { fetchPage, pageResult } from "#lib/pagination.js";
import { summarizeCommit, summarizeArray } from "#lib/field-filter.js";
// Shared description constants
const commitsModule = {
    type: "tool",
    name: "commits",
    description: "Bitbucket DC commit operations",
    register(server: McpServer): void {
        server.registerTool("listCommits", {
            description: "List commits in a repository",
            inputSchema: {
                ...repoArgs,
                until: z.string().optional().describe("Newest ref"),
                since: z.string().optional().describe("Oldest ref (exclusive)"),
                path: z.string().optional().describe("Only commits touching this path"),
                ...pageArgs,
            },
        }, async (args) => {
            try {
                const client = getClient();
                const params: Record<string, unknown> = {};
                if (args.until !== undefined)
                    params.until = args.until;
                if (args.since !== undefined)
                    params.since = args.since;
                if (args.path !== undefined)
                    params.path = args.path;
                const result = await fetchPage(client, `${repoPath(args.projectKey, args.repoSlug)}/commits`, { limit: args.limit, start: args.start, all: args.all, params });
                const summaryValues = summarizeArray(result.values, summarizeCommit);
                return jsonResult(pageResult(result, summaryValues));
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
        server.registerTool("getCommit", {
            description: "Get a commit",
            inputSchema: {
                ...repoArgs,
                commitId: z.string(),
            },
        }, async (args) => {
            try {
                const client = getClient();
                const response = await client.get(`${repoPath(args.projectKey, args.repoSlug)}/commits/${encodeURIComponent(args.commitId)}`);
                return jsonResult(response.data);
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
        server.registerTool("getCommitChanges", {
            description: "List files changed in a commit",
            inputSchema: {
                ...repoArgs,
                commitId: z.string(),
                ...pageArgs,
            },
        }, async (args) => {
            try {
                const client = getClient();
                const result = await fetchPage(client, `${repoPath(args.projectKey, args.repoSlug)}/commits/${encodeURIComponent(args.commitId)}/changes`, { limit: args.limit, start: args.start, all: args.all });
                return jsonResult(pageResult(result, result.values));
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
        server.registerTool("getCommitDiff", {
            description: "Get a commit diff (whole commit, or one file)",
            inputSchema: {
                ...repoArgs,
                commitId: z.string(),
                path: z.string().optional().describe("One file; omit for all"),
                contextLines: z.coerce.number().optional().describe("Number of context lines"),
            },
        }, async (args) => {
            try {
                const client = getClient();
                const params: Record<string, unknown> = {};
                if (args.contextLines !== undefined)
                    params.contextLines = args.contextLines;
                const response = await client.get(commitDiffPath(args.projectKey, args.repoSlug, args.commitId, args.path), { params });
                return jsonResult(response.data);
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
    },
};
export default commitsModule;
