import { z } from "zod";
import type { RegisterableModule } from "#registry/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getClient, repoPath } from "#lib/client.js";
import { formatError, jsonResult, textResult } from "#lib/errors.js";
import { fetchPage } from "#lib/pagination.js";

// Shared description constants
const DESC_PROJECT_KEY = "Project key";
const DESC_REPO_SLUG = "Repository slug";
const DESC_BRANCH_TAG_COMMIT = "Branch, tag, or commit hash";
const DESC_ITEMS_PER_PAGE = "Items per page";
const DESC_START_INDEX = "Start index";
const DESC_FETCH_ALL_PAGES = "Fetch all pages";

const filesModule: RegisterableModule = {
  type: "tool",
  name: "files",
  description: "Bitbucket DC file browsing and content operations",
  register(server: McpServer) {
    server.registerTool(
      "browseFiles",
      {
        description: "Browse files and directories in a repository",
        inputSchema: {
        projectKey: z.string().describe(DESC_PROJECT_KEY),
        repoSlug: z.string().describe(DESC_REPO_SLUG),
        path: z.string().optional().default("").describe("Path within the repository"),
        at: z.string().optional().describe("Branch, tag, or commit hash (defaults to default branch)"),
        limit: z.coerce.number().optional().describe(DESC_ITEMS_PER_PAGE),
        start: z.coerce.number().optional().describe(DESC_START_INDEX),
      },
      },
      async (args) => {
        try {
          const client = getClient();
          const params: Record<string, unknown> = {};
          if (args.at !== undefined) params.at = args.at;
          const filePath = args.path !== "" ? `/${args.path}` : "";
          const response = await client.get(
            `${repoPath(args.projectKey, args.repoSlug)}/browse${filePath}`,
            { params: { ...params, limit: args.limit, start: args.start } }
          );
          return jsonResult(response.data);
        } catch (error) {
          return { content: [{ type: "text" as const, text: formatError(error) }], isError: true };
        }
      }
    );

    server.registerTool(
      "getFileContent",
      {
        description: "Get raw content of a file",
        inputSchema: {
        projectKey: z.string().describe(DESC_PROJECT_KEY),
        repoSlug: z.string().describe(DESC_REPO_SLUG),
        path: z.string().describe("File path within the repository"),
        at: z.string().optional().describe(DESC_BRANCH_TAG_COMMIT),
      },
      },
      async (args) => {
        try {
          const client = getClient();
          const params: Record<string, unknown> = {};
          if (args.at !== undefined) params.at = args.at;
          const response = await client.get(
            `${repoPath(args.projectKey, args.repoSlug)}/raw/${args.path}`,
            { params, responseType: "text", headers: { Accept: "application/octet-stream" } }
          );
          return textResult(response.data as string);
        } catch (error) {
          return { content: [{ type: "text" as const, text: formatError(error) }], isError: true };
        }
      }
    );

    server.registerTool(
      "editFile",
      {
        description: "Edit (create or update) a file in the repository",
        inputSchema: {
        projectKey: z.string().describe(DESC_PROJECT_KEY),
        repoSlug: z.string().describe(DESC_REPO_SLUG),
        path: z.string().describe("File path"),
        content: z.string().describe("New file content"),
        message: z.string().describe("Commit message"),
        branch: z.string().describe("Branch to commit to"),
        sourceCommitId: z.string().optional().describe("Source commit ID for optimistic locking (required for updates)"),
      },
      },
      async (args) => {
        try {
          const client = getClient();
          // DC uses multipart form for file edits via PUT to /browse/{path}
          const formData = new FormData();
          formData.append("content", args.content);
          formData.append("message", args.message);
          formData.append("branch", args.branch);
          if (args.sourceCommitId !== undefined) {
            formData.append("sourceCommitId", args.sourceCommitId);
          }
          const response = await client.put(
            `${repoPath(args.projectKey, args.repoSlug)}/browse/${args.path}`,
            formData,
            { headers: { "Content-Type": "multipart/form-data" } }
          );
          return jsonResult(response.data);
        } catch (error) {
          return { content: [{ type: "text" as const, text: formatError(error) }], isError: true };
        }
      }
    );

    server.registerTool(
      "listFiles",
      {
        description: "List file paths recursively in a repository (stream files endpoint)",
        inputSchema: {
        projectKey: z.string().describe(DESC_PROJECT_KEY),
        repoSlug: z.string().describe(DESC_REPO_SLUG),
        at: z.string().optional().describe(DESC_BRANCH_TAG_COMMIT),
        limit: z.coerce.number().optional().describe(DESC_ITEMS_PER_PAGE),
        start: z.coerce.number().optional().describe(DESC_START_INDEX),
        all: z.boolean().optional().describe(DESC_FETCH_ALL_PAGES),
      },
      },
      async (args) => {
        try {
          const client = getClient();
          const params: Record<string, unknown> = {};
          if (args.at !== undefined) params.at = args.at;
          const result = await fetchPage<string>(
            client,
            `${repoPath(args.projectKey, args.repoSlug)}/files`,
            { limit: args.limit, start: args.start, all: args.all, params }
          );
          return jsonResult(result.values);
        } catch (error) {
          return { content: [{ type: "text" as const, text: formatError(error) }], isError: true };
        }
      }
    );
  },
};

export default filesModule;
