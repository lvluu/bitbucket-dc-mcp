import { z } from "zod";
import { getClient, repoPath } from "../lib/client.js";
import { formatError, jsonResult } from "../lib/errors.js";
import { fetchPage } from "../lib/pagination.js";
import type { RegisterableModule } from "../registry/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Shared description constants
const DESC_PROJECT_KEY = "Project key";
const DESC_REPO_SLUG = "Repository slug";
const DESC_COMMIT_HASH = "Commit hash";
const DESC_ITEMS_PER_PAGE = "Items per page";
const DESC_START_INDEX = "Start index";
const DESC_FETCH_ALL_PAGES = "Fetch all pages";

const commitsModule: RegisterableModule = {
  type: "tool",
  name: "commits",
  description: "Bitbucket DC commit operations",
  register(server: McpServer) {
    server.registerTool(
      "listCommits",
      {
        description: "List commits in a repository",
        inputSchema: {
        projectKey: z.string().describe(DESC_PROJECT_KEY),
        repoSlug: z.string().describe(DESC_REPO_SLUG),
        until: z.string().optional().describe("Commit hash or ref to list commits until"),
        since: z.string().optional().describe("Commit hash or ref to list commits since (exclusive)"),
        path: z.string().optional().describe("Filter commits that touch this file path"),
        limit: z.coerce.number().optional().describe(DESC_ITEMS_PER_PAGE),
        start: z.coerce.number().optional().describe(DESC_START_INDEX),
        all: z.boolean().optional().describe(DESC_FETCH_ALL_PAGES),
      },
      },
      async (args) => {
        try {
          const client = getClient();
          const params: Record<string, unknown> = {};
          if (args.until !== undefined) params.until = args.until;
          if (args.since !== undefined) params.since = args.since;
          if (args.path !== undefined) params.path = args.path;
          const result = await fetchPage(
            client,
            `${repoPath(args.projectKey, args.repoSlug)}/commits`,
            { limit: args.limit, start: args.start, all: args.all, params }
          );
          return jsonResult(result.values);
        } catch (error) {
          return { content: [{ type: "text" as const, text: formatError(error) }], isError: true };
        }
      }
    );

    server.registerTool(
      "getCommit",
      {
        description: "Get details of a specific commit",
        inputSchema: {
        projectKey: z.string().describe(DESC_PROJECT_KEY),
        repoSlug: z.string().describe(DESC_REPO_SLUG),
        commitId: z.string().describe(DESC_COMMIT_HASH),
      },
      },
      async (args) => {
        try {
          const client = getClient();
          const response = await client.get(
            `${repoPath(args.projectKey, args.repoSlug)}/commits/${args.commitId}`
          );
          return jsonResult(response.data);
        } catch (error) {
          return { content: [{ type: "text" as const, text: formatError(error) }], isError: true };
        }
      }
    );

    server.registerTool(
      "getCommitChanges",
      {
        description: "Get list of files changed in a commit",
        inputSchema: {
        projectKey: z.string().describe(DESC_PROJECT_KEY),
        repoSlug: z.string().describe(DESC_REPO_SLUG),
        commitId: z.string().describe(DESC_COMMIT_HASH),
        limit: z.coerce.number().optional().describe(DESC_ITEMS_PER_PAGE),
        start: z.coerce.number().optional().describe(DESC_START_INDEX),
        all: z.boolean().optional().describe(DESC_FETCH_ALL_PAGES),
      },
      },
      async (args) => {
        try {
          const client = getClient();
          const result = await fetchPage(
            client,
            `${repoPath(args.projectKey, args.repoSlug)}/commits/${args.commitId}/changes`,
            { limit: args.limit, start: args.start, all: args.all }
          );
          return jsonResult(result.values);
        } catch (error) {
          return { content: [{ type: "text" as const, text: formatError(error) }], isError: true };
        }
      }
    );

    server.registerTool(
      "getCommitDiff",
      {
        description: "Get the diff for a specific commit",
        inputSchema: {
        projectKey: z.string().describe(DESC_PROJECT_KEY),
        repoSlug: z.string().describe(DESC_REPO_SLUG),
        commitId: z.string().describe(DESC_COMMIT_HASH),
        contextLines: z.coerce.number().optional().describe("Number of context lines"),
      },
      },
      async (args) => {
        try {
          const client = getClient();
          const params: Record<string, unknown> = {};
          if (args.contextLines !== undefined) params.contextLines = args.contextLines;
          const response = await client.get(
            `${repoPath(args.projectKey, args.repoSlug)}/commits/${args.commitId}/diff`,
            { params }
          );
          return jsonResult(response.data);
        } catch (error) {
          return { content: [{ type: "text" as const, text: formatError(error) }], isError: true };
        }
      }
    );
  },
};

export default commitsModule;
