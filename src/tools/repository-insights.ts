import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { repoArgs, pageArgs } from "#lib/params.js";
import { getClient, getOriginUrl, repoFilePath, repoPath } from "#lib/client.js";
import { formatError, jsonResult } from "#lib/errors.js";
import { fetchPage, pageResult } from "#lib/pagination.js";
import { summarizeArray, summarizeCodeSearchResult, summarizePullRequestCondition, summarizeRestriction } from "#lib/field-filter.js";
// Shared description constants
const DESC_BRANCH_TAG_COMMIT = "Branch, tag, or commit hash";
const repositoryInsightsModule = {
    type: "tool",
    name: "repository-insights",
    description: "Bitbucket DC repository insight operations (search, blame, settings, reviewers, restrictions)",
    register(server: McpServer): void {
        server.registerTool("searchCode", {
            description: "Search code in a repository",
            inputSchema: {
                ...repoArgs,
                query: z.string().describe("Search text"),
                ...pageArgs,
            },
        }, async (args) => {
            try {
                const client = getClient();
                // Code search is scoped by numeric project/repository ids, so resolve them first.
                const repo = await client.get(repoPath(args.projectKey, args.repoSlug));
                const projectId = repo.data.project?.id;
                const repositoryId = repo.data.id;
                if (projectId === undefined || repositoryId === undefined) {
                    return { content: [{ type: "text", text: "Could not resolve project/repository ids for code search." }], isError: true };
                }
                const result = await fetchPage(client, `${getOriginUrl()}/rest/search/latest/search`, {
                    limit: args.limit,
                    start: args.start,
                    all: args.all,
                    params: { query: args.query, entities: "code", projectId, repositoryId },
                });
                const summaryValues = summarizeArray(result.values, summarizeCodeSearchResult);
                return jsonResult(pageResult(result, summaryValues));
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
        server.registerTool("getFileBlame", {
            description: "Get blame for a file",
            inputSchema: {
                ...repoArgs,
                path: z.string().describe("File path"),
                at: z.string().optional().describe(DESC_BRANCH_TAG_COMMIT),
                noContent: z.boolean().optional().describe("Blame only, no file content"),
            },
        }, async (args) => {
            try {
                const client = getClient();
                const params: Record<string, unknown> = { blame: "true" };
                if (args.at !== undefined)
                    params.at = args.at;
                if (args.noContent === true)
                    params.noContent = "true";
                const response = await client.get(repoFilePath(args.projectKey, args.repoSlug, "browse", args.path), { params });
                return jsonResult(response.data);
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
        server.registerTool("getPullRequestSettings", {
            description: "Get repository PR settings (merge config, required approvers)",
            inputSchema: {
                ...repoArgs,
            },
        }, async (args) => {
            try {
                const client = getClient();
                const response = await client.get(`${repoPath(args.projectKey, args.repoSlug)}/settings/pull-requests`);
                return jsonResult(response.data);
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
        server.registerTool("getDefaultReviewers", {
            description: "List default reviewer conditions",
            inputSchema: {
                ...repoArgs,
                ...pageArgs,
            },
        }, async (args) => {
            try {
                const client = getClient();
                const result = await fetchPage(client, `${getOriginUrl()}/rest/default-reviewers/latest${repoPath(args.projectKey, args.repoSlug)}/conditions`, { limit: args.limit, start: args.start, all: args.all });
                const summaryValues = summarizeArray(result.values, summarizePullRequestCondition);
                return jsonResult(pageResult(result, summaryValues));
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
        server.registerTool("getBranchRestrictions", {
            description: "List branch restrictions (permissions)",
            inputSchema: {
                ...repoArgs,
                type: z.string().optional().describe("e.g. read-only, no-deletes, pull-request-only"),
                matcherType: z.string().optional().describe("e.g. BRANCH, PATTERN"),
                ...pageArgs,
            },
        }, async (args) => {
            try {
                const client = getClient();
                const params: Record<string, unknown> = {};
                if (args.type !== undefined)
                    params.type = args.type;
                if (args.matcherType !== undefined)
                    params.matcherType = args.matcherType;
                const result = await fetchPage(client, `${getOriginUrl()}/rest/branch-permissions/latest${repoPath(args.projectKey, args.repoSlug)}/restrictions`, { limit: args.limit, start: args.start, all: args.all, params });
                const summaryValues = summarizeArray(result.values, summarizeRestriction);
                return jsonResult(pageResult(result, summaryValues));
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
    },
};
export default repositoryInsightsModule;