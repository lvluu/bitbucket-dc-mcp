import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { repoArgs, pageArgs } from "#lib/params.js";
import { getClient, getOriginUrl, repoPath } from "#lib/client.js";
import { formatError, jsonResult, textResult } from "#lib/errors.js";
import { fetchPage, pageResult } from "#lib/pagination.js";
import { summarizeBranch, summarizeArray } from "#lib/field-filter.js";
// Shared description constants
const branchesModule = {
    type: "tool",
    name: "branches",
    description: "Bitbucket DC branch and tag operations",
    register(server: McpServer): void {
        server.registerTool("listBranches", {
            description: "List branches in a repository",
            inputSchema: {
                ...repoArgs,
                filterText: z.string().optional().describe("Filter branches by name"),
                orderBy: z.enum(["ALPHABETICAL", "MODIFICATION"]).optional(),
                ...pageArgs,
            },
        }, async (args) => {
            try {
                const client = getClient();
                const params: Record<string, unknown> = {};
                if (args.filterText !== undefined)
                    params.filterText = args.filterText;
                if (args.orderBy !== undefined)
                    params.orderBy = args.orderBy;
                const result = await fetchPage(client, `${repoPath(args.projectKey, args.repoSlug)}/branches`, { limit: args.limit, start: args.start, all: args.all, params });
                const summaryValues = summarizeArray(result.values, summarizeBranch);
                return jsonResult(pageResult(result, summaryValues));
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
        server.registerTool("createBranch", {
            description: "Create a new branch in a repository",
            inputSchema: {
                ...repoArgs,
                name: z.string(),
                startPoint: z.string().describe("Commit or branch"),
            },
        }, async (args) => {
            try {
                const client = getClient();
                const response = await client.post(`${repoPath(args.projectKey, args.repoSlug)}/branches`, { name: args.name, startPoint: args.startPoint });
                return jsonResult(response.data);
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
        server.registerTool("deleteBranch", {
            description: "Delete a branch (requires BITBUCKET_ENABLE_DANGEROUS=true)",
            inputSchema: {
                ...repoArgs,
                name: z.string().describe("Branch name to delete"),
                dryRun: z.boolean().optional().describe("Only check"),
            },
        }, async (args) => {
            try {
                const { getConfig } = await import("#lib/client.js");
                const config = getConfig();
                if (!config.enableDangerous) {
                    return { content: [{ type: "text", text: "deleteBranch is disabled. Set BITBUCKET_ENABLE_DANGEROUS=true." }], isError: true };
                }
                const client = getClient();
                // branch-utils is a separate REST module, not under /rest/api/1.0
                await client.delete(`${getOriginUrl()}/rest/branch-utils/latest${repoPath(args.projectKey, args.repoSlug)}/branches`, { data: { name: `refs/heads/${args.name}`, dryRun: args.dryRun ?? false } });
                return textResult(`Branch '${args.name}' deleted successfully.`);
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
        server.registerTool("listTags", {
            description: "List tags in a repository",
            inputSchema: {
                ...repoArgs,
                filterText: z.string().optional().describe("Filter tags by name"),
                orderBy: z.enum(["ALPHABETICAL", "MODIFICATION"]).optional(),
                ...pageArgs,
            },
        }, async (args) => {
            try {
                const client = getClient();
                const params: Record<string, unknown> = {};
                if (args.filterText !== undefined)
                    params.filterText = args.filterText;
                if (args.orderBy !== undefined)
                    params.orderBy = args.orderBy;
                const result = await fetchPage(client, `${repoPath(args.projectKey, args.repoSlug)}/tags`, { limit: args.limit, start: args.start, all: args.all, params });
                const summaryValues = summarizeArray(result.values, summarizeBranch);
                return jsonResult(pageResult(result, summaryValues));
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
        server.registerTool("createTag", {
            description: "Create a tag in a repository",
            inputSchema: {
                ...repoArgs,
                name: z.string(),
                startPoint: z.string().describe("Commit hash to tag"),
                message: z.string().optional().describe("Annotated tag message"),
            },
        }, async (args) => {
            try {
                const client = getClient();
                const response = await client.post(`${repoPath(args.projectKey, args.repoSlug)}/tags`, { name: args.name, startPoint: args.startPoint, message: args.message });
                return jsonResult(response.data);
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
    },
};
export default branchesModule;
