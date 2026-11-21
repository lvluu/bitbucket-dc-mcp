import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { repoArgs, pageArgs } from "#lib/params.js";
import { getClient, projectPath, repoPath } from "#lib/client.js";
import { formatError, jsonResult } from "#lib/errors.js";
import { fetchPage, pageResult } from "#lib/pagination.js";
import { summarizeRepository, summarizeArray } from "#lib/field-filter.js";
// Shared description constants
const DESC_PROJECT_KEY = "Project key";
const repositoriesModule = {
    type: "tool",
    name: "repositories",
    description: "Bitbucket DC repository operations",
    register(server: McpServer): void {
        server.registerTool("listRepositories", {
            description: "List repositories in a project",
            inputSchema: {
                projectKey: z.string().optional(),
                name: z.string().optional().describe("Name contains"),
                ...pageArgs,
            },
        }, async (args) => {
            try {
                const client = getClient();
                const params: Record<string, unknown> = {};
                if (args.name !== undefined)
                    params.name = args.name;
                const result = await fetchPage(client, `${projectPath(args.projectKey)}/repos`, {
                    limit: args.limit,
                    start: args.start,
                    all: args.all,
                    params,
                });
                const summaryValues = summarizeArray(result.values, summarizeRepository);
                return jsonResult(pageResult(result, summaryValues));
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
        server.registerTool("getRepository", {
            description: "Get a repository",
            inputSchema: {
                ...repoArgs,
            },
        }, async (args) => {
            try {
                const client = getClient();
                const response = await client.get(repoPath(args.projectKey, args.repoSlug));
                return jsonResult(response.data);
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
        server.registerTool("createRepository", {
            description: "Create a repository",
            inputSchema: {
                projectKey: z.string().optional(),
                name: z.string(),
                scmId: z.string().optional().default("git").describe("SCM type (default: git)"),
                forkable: z.boolean().optional(),
                defaultBranch: z.string().optional().describe("Default branch name"),
            },
        }, async (args) => {
            try {
                const client = getClient();
                const response = await client.post(`${projectPath(args.projectKey)}/repos`, {
                    name: args.name,
                    scmId: args.scmId,
                    forkable: args.forkable,
                    defaultBranch: args.defaultBranch,
                });
                return jsonResult(response.data);
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
        server.registerTool("forkRepository", {
            description: "Fork a repository",
            inputSchema: {
                ...repoArgs,
                targetProjectKey: z.string().optional().describe("Default: your personal project"),
                name: z.string().optional().describe("Fork name"),
            },
        }, async (args) => {
            try {
                const client = getClient();
                const body: Record<string, unknown> = {};
                if (args.name !== undefined)
                    body.name = args.name;
                if (args.targetProjectKey !== undefined)
                    body.project = { key: args.targetProjectKey };
                const response = await client.post(repoPath(args.projectKey, args.repoSlug), body);
                return jsonResult(response.data);
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
        server.registerTool("getDefaultBranch", {
            description: "Get the default branch",
            inputSchema: {
                ...repoArgs,
            },
        }, async (args) => {
            try {
                const client = getClient();
                const response = await client.get(`${repoPath(args.projectKey, args.repoSlug)}/default-branch`);
                return jsonResult(response.data);
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
        server.registerTool("setDefaultBranch", {
            description: "Set the default branch",
            inputSchema: {
                ...repoArgs,
                branchId: z.string().describe("Branch ID (e.g. refs/heads/main)"),
            },
        }, async (args) => {
            try {
                const client = getClient();
                const response = await client.put(`${repoPath(args.projectKey, args.repoSlug)}/default-branch`, { id: args.branchId });
                return jsonResult(response.data);
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
    },
};
export default repositoriesModule;
