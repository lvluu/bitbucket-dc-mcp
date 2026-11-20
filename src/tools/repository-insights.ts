import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getClient, getOriginUrl, repoFilePath, repoPath } from "#lib/client.js";
import { formatError, jsonResult } from "#lib/errors.js";
import { fetchPage, pageResult } from "#lib/pagination.js";
import { summarizeArray, summarizeCodeSearchResult, summarizePullRequestCondition, summarizeRestriction } from "#lib/field-filter.js";
// Shared description constants
const DESC_PROJECT_KEY = "Project key";
const DESC_REPO_SLUG = "Repository slug";
const DESC_ITEMS_PER_PAGE = "Items per page";
const DESC_START_INDEX = "Start index";
const DESC_FETCH_ALL_PAGES = "Fetch all pages";
const DESC_BRANCH_TAG_COMMIT = "Branch, tag, or commit hash";
const repositoryInsightsModule = {
    type: "tool",
    name: "repository-insights",
    description: "Bitbucket DC repository insight operations (search, blame, settings, reviewers, restrictions)",
    register(server: McpServer): void {
        server.registerTool("searchCode", {
            description: "Search code in a repository (Bitbucket DC code search)",
            inputSchema: {
                projectKey: z.string().describe(DESC_PROJECT_KEY),
                repoSlug: z.string().describe(DESC_REPO_SLUG),
                query: z.string().describe("Search text (e.g. 'todoFIXME' or a function name)"),
                limit: z.coerce.number().optional().describe(DESC_ITEMS_PER_PAGE),
                start: z.coerce.number().optional().describe(DESC_START_INDEX),
                all: z.boolean().optional().describe(DESC_FETCH_ALL_PAGES),
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
            description: "Get blame (author/commit per line) for a file at a revision",
            inputSchema: {
                projectKey: z.string().describe(DESC_PROJECT_KEY),
                repoSlug: z.string().describe(DESC_REPO_SLUG),
                path: z.string().describe("File path within the repository"),
                at: z.string().optional().describe(DESC_BRANCH_TAG_COMMIT),
                noContent: z.boolean().optional().describe("If true, return blame only and omit file contents"),
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
            description: "Get the pull request settings (merge config, required approvers) for a repository",
            inputSchema: {
                projectKey: z.string().describe(DESC_PROJECT_KEY),
                repoSlug: z.string().describe(DESC_REPO_SLUG),
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
            description: "List the default reviewer conditions configured for a repository",
            inputSchema: {
                projectKey: z.string().describe(DESC_PROJECT_KEY),
                repoSlug: z.string().describe(DESC_REPO_SLUG),
                limit: z.coerce.number().optional().describe(DESC_ITEMS_PER_PAGE),
                start: z.coerce.number().optional().describe(DESC_START_INDEX),
                all: z.boolean().optional().describe(DESC_FETCH_ALL_PAGES),
            },
        }, async (args) => {
            try {
                const client = getClient();
                const result = await fetchPage(client, `${getOriginUrl()}/rest/default-reviewers/latest/projects/${encodeURIComponent(args.projectKey)}/repos/${encodeURIComponent(args.repoSlug)}/conditions`, { limit: args.limit, start: args.start, all: args.all });
                const summaryValues = summarizeArray(result.values, summarizePullRequestCondition);
                return jsonResult(pageResult(result, summaryValues));
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
        server.registerTool("getBranchRestrictions", {
            description: "List the branch restrictions (e.g. branch permissions) configured for a repository",
            inputSchema: {
                projectKey: z.string().describe(DESC_PROJECT_KEY),
                repoSlug: z.string().describe(DESC_REPO_SLUG),
                type: z.string().optional().describe("Restriction type to filter on (e.g. read-only, push, fast-forward-only, no-deletes, no-reverts, no-rewrites, pull-request-only)"),
                matcherType: z.string().optional().describe("Matcher type to filter on (e.g. BRANCH, PATTERN, BRANCH_PREFIX, MODEL_BRANCH, MODEL_BRANCH_PREFIX)"),
                limit: z.coerce.number().optional().describe(DESC_ITEMS_PER_PAGE),
                start: z.coerce.number().optional().describe(DESC_START_INDEX),
                all: z.boolean().optional().describe(DESC_FETCH_ALL_PAGES),
            },
        }, async (args) => {
            try {
                const client = getClient();
                const params: Record<string, unknown> = {};
                if (args.type !== undefined)
                    params.type = args.type;
                if (args.matcherType !== undefined)
                    params.matcherType = args.matcherType;
                const result = await fetchPage(client, `${getOriginUrl()}/rest/branch-permissions/latest/projects/${encodeURIComponent(args.projectKey)}/repos/${encodeURIComponent(args.repoSlug)}/restrictions`, { limit: args.limit, start: args.start, all: args.all, params });
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