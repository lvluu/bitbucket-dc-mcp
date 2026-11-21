import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { repoArgs, pageArgs, diffArgs } from "#lib/params.js";
import { commitDiffPath, getClient, repoPath } from "#lib/client.js";
import { formatError, jsonResult, textResult } from "#lib/errors.js";
import { fetchPage, pageResult } from "#lib/pagination.js";
import { summarizeChange, summarizeCommit, summarizeArray } from "#lib/field-filter.js";
import { diffToText } from "#lib/diff-text.js";
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
                return jsonResult(pageResult(result, summarizeArray(result.values, summarizeChange)));
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
        server.registerTool("getCommitDiff", {
            description: "Get a commit diff as unified text (whole commit, or one file)",
            inputSchema: {
                ...repoArgs,
                commitId: z.string(),
                ...diffArgs,
            },
        }, async (args) => {
            try {
                const client = getClient();
                const params = { contextLines: args.contextLines ?? 3 };
                const response = await client.get(commitDiffPath(args.projectKey, args.repoSlug, args.commitId, args.path), { params });
                return textResult(diffToText(response.data));
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
    },
};
export default commitsModule;
