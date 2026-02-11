import { z } from "zod";
import { getClient, getConfig, repoPath } from "../lib/client.js";
import { formatError, jsonResult } from "../lib/errors.js";
import { fetchPage } from "../lib/pagination.js";
import type { RegisterableModule } from "../registry/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Shared description constants
const DESC_PROJECT_KEY = "Project key";
const DESC_REPO_SLUG = "Repository slug";

const repositoriesModule: RegisterableModule = {
  type: "tool",
  name: "repositories",
  description: "Bitbucket DC repository operations",
  register(server: McpServer) {
    server.registerTool(
      "listRepositories",
      {
        description: "List repositories in a Bitbucket DC project",
        inputSchema: {
        projectKey: z.string().optional().describe("Project key (uses BITBUCKET_DEFAULT_PROJECT if not set)"),
        name: z.string().optional().describe("Filter repositories by name (partial match)"),
        limit: z.coerce.number().optional().describe("Number of items per page (default 25, max 100)"),
        start: z.coerce.number().optional().describe("Start index for pagination"),
        all: z.boolean().optional().describe("Fetch all pages (up to 1000 items)"),
      },
      },
      async (args) => {
        try {
          const client = getClient();
          const config = getConfig();
          const project = args.projectKey ?? config.defaultProject;
          if (project === undefined) {
            return { content: [{ type: "text" as const, text: "projectKey is required (or set BITBUCKET_DEFAULT_PROJECT)" }], isError: true };
          }
          const params: Record<string, unknown> = {};
          if (args.name !== undefined) params.name = args.name;
          const result = await fetchPage(client, `/projects/${project}/repos`, {
            limit: args.limit,
            start: args.start,
            all: args.all,
            params,
          });
          return jsonResult(result.values);
        } catch (error) {
          return { content: [{ type: "text" as const, text: formatError(error) }], isError: true };
        }
      }
    );

    server.registerTool(
      "getRepository",
      {
        description: "Get details of a specific repository",
        inputSchema: {
        projectKey: z.string().describe(DESC_PROJECT_KEY),
        repoSlug: z.string().describe(DESC_REPO_SLUG),
      },
      },
      async (args) => {
        try {
          const client = getClient();
          const response = await client.get(repoPath(args.projectKey, args.repoSlug));
          return jsonResult(response.data);
        } catch (error) {
          return { content: [{ type: "text" as const, text: formatError(error) }], isError: true };
        }
      }
    );

    server.registerTool(
      "createRepository",
      {
        description: "Create a new repository in a project",
        inputSchema: {
        projectKey: z.string().describe(DESC_PROJECT_KEY),
        name: z.string().describe("Repository name"),
        scmId: z.string().optional().default("git").describe("SCM type (default: git)"),
        forkable: z.boolean().optional().describe("Whether the repo is forkable"),
        defaultBranch: z.string().optional().describe("Default branch name"),
      },
      },
      async (args) => {
        try {
          const client = getClient();
          const response = await client.post(`/projects/${args.projectKey}/repos`, {
            name: args.name,
            scmId: args.scmId,
            forkable: args.forkable,
            defaultBranch: args.defaultBranch,
          });
          return jsonResult(response.data);
        } catch (error) {
          return { content: [{ type: "text" as const, text: formatError(error) }], isError: true };
        }
      }
    );

    server.registerTool(
      "forkRepository",
      {
        description: "Fork a repository",
        inputSchema: {
        projectKey: z.string().describe("Source project key"),
        repoSlug: z.string().describe("Source repository slug"),
        targetProjectKey: z.string().optional().describe("Target project key for the fork"),
        name: z.string().optional().describe("Name for the forked repository"),
      },
      },
      async (args) => {
        try {
          const client = getClient();
          const body: Record<string, unknown> = {};
          if (args.name !== undefined) body.name = args.name;
          if (args.targetProjectKey !== undefined) body.project = { key: args.targetProjectKey };
          const response = await client.post(repoPath(args.projectKey, args.repoSlug), body);
          return jsonResult(response.data);
        } catch (error) {
          return { content: [{ type: "text" as const, text: formatError(error) }], isError: true };
        }
      }
    );

    server.registerTool(
      "getDefaultBranch",
      {
        description: "Get the default branch of a repository",
        inputSchema: {
        projectKey: z.string().describe(DESC_PROJECT_KEY),
        repoSlug: z.string().describe(DESC_REPO_SLUG),
      },
      },
      async (args) => {
        try {
          const client = getClient();
          const response = await client.get(`${repoPath(args.projectKey, args.repoSlug)}/default-branch`);
          return jsonResult(response.data);
        } catch (error) {
          return { content: [{ type: "text" as const, text: formatError(error) }], isError: true };
        }
      }
    );

    server.registerTool(
      "setDefaultBranch",
      {
        description: "Set the default branch of a repository",
        inputSchema: {
        projectKey: z.string().describe(DESC_PROJECT_KEY),
        repoSlug: z.string().describe(DESC_REPO_SLUG),
        branchId: z.string().describe("Branch ID (e.g. refs/heads/main)"),
      },
      },
      async (args) => {
        try {
          const client = getClient();
          const response = await client.put(
            `${repoPath(args.projectKey, args.repoSlug)}/default-branch`,
            { id: args.branchId }
          );
          return jsonResult(response.data);
        } catch (error) {
          return { content: [{ type: "text" as const, text: formatError(error) }], isError: true };
        }
      }
    );
  },
};

export default repositoriesModule;
