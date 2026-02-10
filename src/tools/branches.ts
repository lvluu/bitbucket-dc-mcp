import { z } from "zod";
import { getClient, repoPath } from "../lib/client.js";
import { formatError, jsonResult, textResult } from "../lib/errors.js";
import { fetchPage } from "../lib/pagination.js";
import type { RegisterableModule } from "../registry/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Shared description constants
const DESC_PROJECT_KEY = "Project key";
const DESC_REPO_SLUG = "Repository slug";
const DESC_ITEMS_PER_PAGE = "Items per page";
const DESC_START_INDEX = "Start index";
const DESC_FETCH_ALL_PAGES = "Fetch all pages";

const branchesModule: RegisterableModule = {
  type: "tool",
  name: "branches",
  description: "Bitbucket DC branch and tag operations",
  register(server: McpServer) {
    server.registerTool(
      "listBranches",
      {
        description: "List branches in a repository",
        inputSchema: {
        projectKey: z.string().describe(DESC_PROJECT_KEY),
        repoSlug: z.string().describe(DESC_REPO_SLUG),
        filterText: z.string().optional().describe("Filter branches by name"),
        orderBy: z.enum(["ALPHABETICAL", "MODIFICATION"]).optional().describe("Sort order"),
        limit: z.number().optional().describe(DESC_ITEMS_PER_PAGE),
        start: z.number().optional().describe(DESC_START_INDEX),
        all: z.boolean().optional().describe(DESC_FETCH_ALL_PAGES),
      },
      },
      async (args) => {
        try {
          const client = getClient();
          const params: Record<string, unknown> = {};
          if (args.filterText !== undefined) params.filterText = args.filterText;
          if (args.orderBy !== undefined) params.orderBy = args.orderBy;
          const result = await fetchPage(
            client,
            `${repoPath(args.projectKey, args.repoSlug)}/branches`,
            { limit: args.limit, start: args.start, all: args.all, params }
          );
          return jsonResult(result.values);
        } catch (error) {
          return { content: [{ type: "text" as const, text: formatError(error) }], isError: true };
        }
      }
    );

    server.registerTool(
      "createBranch",
      {
        description: "Create a new branch in a repository",
        inputSchema: {
        projectKey: z.string().describe(DESC_PROJECT_KEY),
        repoSlug: z.string().describe(DESC_REPO_SLUG),
        name: z.string().describe("Branch name"),
        startPoint: z.string().describe("Start point (commit hash or branch name)"),
      },
      },
      async (args) => {
        try {
          const client = getClient();
          const response = await client.post(
            `${repoPath(args.projectKey, args.repoSlug)}/branches`,
            { name: args.name, startPoint: args.startPoint }
          );
          return jsonResult(response.data);
        } catch (error) {
          return { content: [{ type: "text" as const, text: formatError(error) }], isError: true };
        }
      }
    );

    server.registerTool(
      "deleteBranch",
      {
        description: "Delete a branch (requires BITBUCKET_ENABLE_DANGEROUS=true)",
        inputSchema: {
        projectKey: z.string().describe(DESC_PROJECT_KEY),
        repoSlug: z.string().describe(DESC_REPO_SLUG),
        name: z.string().describe("Branch name to delete"),
        dryRun: z.boolean().optional().describe("If true, only check if delete is possible"),
      },
      },
      async (args) => {
        try {
          const { getConfig } = await import("../lib/client.js");
          const config = getConfig();
          if (!config.enableDangerous) {
            return { content: [{ type: "text" as const, text: "deleteBranch is disabled. Set BITBUCKET_ENABLE_DANGEROUS=true." }], isError: true };
          }
          const client = getClient();
          // DC uses branch-utils API for deletion
          await client.delete(
            `/branch-utils/latest/projects/${args.projectKey}/repos/${args.repoSlug}/branches`,
            { data: { name: `refs/heads/${args.name}`, dryRun: args.dryRun ?? false } }
          );
          return textResult(`Branch '${args.name}' deleted successfully.`);
        } catch (error) {
          return { content: [{ type: "text" as const, text: formatError(error) }], isError: true };
        }
      }
    );

    server.registerTool(
      "listTags",
      {
        description: "List tags in a repository",
        inputSchema: {
        projectKey: z.string().describe(DESC_PROJECT_KEY),
        repoSlug: z.string().describe(DESC_REPO_SLUG),
        filterText: z.string().optional().describe("Filter tags by name"),
        orderBy: z.enum(["ALPHABETICAL", "MODIFICATION"]).optional().describe("Sort order"),
        limit: z.number().optional().describe(DESC_ITEMS_PER_PAGE),
        start: z.number().optional().describe(DESC_START_INDEX),
        all: z.boolean().optional().describe(DESC_FETCH_ALL_PAGES),
      },
      },
      async (args) => {
        try {
          const client = getClient();
          const params: Record<string, unknown> = {};
          if (args.filterText !== undefined) params.filterText = args.filterText;
          if (args.orderBy !== undefined) params.orderBy = args.orderBy;
          const result = await fetchPage(
            client,
            `${repoPath(args.projectKey, args.repoSlug)}/tags`,
            { limit: args.limit, start: args.start, all: args.all, params }
          );
          return jsonResult(result.values);
        } catch (error) {
          return { content: [{ type: "text" as const, text: formatError(error) }], isError: true };
        }
      }
    );

    server.registerTool(
      "createTag",
      {
        description: "Create a tag in a repository",
        inputSchema: {
        projectKey: z.string().describe(DESC_PROJECT_KEY),
        repoSlug: z.string().describe(DESC_REPO_SLUG),
        name: z.string().describe("Tag name"),
        startPoint: z.string().describe("Commit hash to tag"),
        message: z.string().optional().describe("Tag message (for annotated tags)"),
      },
      },
      async (args) => {
        try {
          const client = getClient();
          const response = await client.post(
            `${repoPath(args.projectKey, args.repoSlug)}/tags`,
            { name: args.name, startPoint: args.startPoint, message: args.message }
          );
          return jsonResult(response.data);
        } catch (error) {
          return { content: [{ type: "text" as const, text: formatError(error) }], isError: true };
        }
      }
    );
  },
};

export default branchesModule;
