import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { diffArgs, prArgs, pageArgs } from "#lib/params.js";
import { getClient, prDiffPath, prPath } from "#lib/client.js";
import { diffToText } from "#lib/diff-text.js";
import { summarizeArray, summarizeChange } from "#lib/field-filter.js";
import { formatError, jsonResult, textResult } from "#lib/errors.js";
import { fetchPage, pageResult } from "#lib/pagination.js";
const prDiffModule = {
    type: "tool",
    name: "pr-diff",
    description: "Bitbucket DC pull request diff, patch, and change operations",
    register(server: McpServer): void {
        server.registerTool("getPullRequestDiff", {
            description: "Get the PR diff as unified text (whole PR, or one file)",
            inputSchema: {
                ...prArgs,
                ...diffArgs,
            },
        }, async (args) => {
            try {
                const client = getClient();
                const params = { contextLines: args.contextLines ?? 3, withComments: false };
                const response = await client.get(prDiffPath(args.projectKey, args.repoSlug, args.prId, args.path), { params });
                return textResult(diffToText(response.data));
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
        server.registerTool("streamPullRequestDiff", {
            description: "Get the PR diff as unified text",
            inputSchema: {
                ...prArgs,
            },
        }, async (args) => {
            try {
                const client = getClient();
                const response = await client.get(`${prPath(args.projectKey, args.repoSlug, args.prId)}.diff`, { headers: { Accept: "text/plain" }, responseType: "text", maxRedirects: 5 });
                return textResult(response.data);
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
        server.registerTool("getPullRequestPatch", {
            description: "Get the PR as a patch",
            inputSchema: {
                ...prArgs,
            },
        }, async (args) => {
            try {
                const client = getClient();
                const response = await client.get(`${prPath(args.projectKey, args.repoSlug, args.prId)}.patch`, { headers: { Accept: "text/plain" }, responseType: "text", maxRedirects: 5 });
                return textResult(response.data);
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
        server.registerTool("getPullRequestChanges", {
            description: "List files changed in a PR",
            inputSchema: {
                ...prArgs,
                ...pageArgs,
            },
        }, async (args) => {
            try {
                const client = getClient();
                const result = await fetchPage(client, `${prPath(args.projectKey, args.repoSlug, args.prId)}/changes`, { limit: args.limit, start: args.start, all: args.all });
                return jsonResult(pageResult(result, summarizeArray(result.values, summarizeChange)));
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
    },
};
export default prDiffModule;
