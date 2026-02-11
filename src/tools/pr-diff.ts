import { z } from "zod";
import { getClient, prPath } from "../lib/client.js";
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
const DESC_PR_ID = "Pull request ID";

const prDiffModule: RegisterableModule = {
  type: "tool",
  name: "pr-diff",
  description: "Bitbucket DC pull request diff, patch, and change operations",
  register(server: McpServer) {
    server.registerTool(
      "getPullRequestDiff",
      {
        description: "Get the raw diff for a pull request",
        inputSchema: {
        projectKey: z.string().describe(DESC_PROJECT_KEY),
        repoSlug: z.string().describe(DESC_REPO_SLUG),
        prId: z.coerce.number().describe(DESC_PR_ID),
        contextLines: z.coerce.number().optional().describe("Number of context lines in diff"),
        withComments: z.boolean().optional().describe("Include comments in diff response"),
      },
      },
      async (args) => {
        try {
          const client = getClient();
          const params: Record<string, unknown> = {};
          if (args.contextLines !== undefined) params.contextLines = args.contextLines;
          if (args.withComments !== undefined) params.withComments = args.withComments;
          const response = await client.get(
            `${prPath(args.projectKey, args.repoSlug, args.prId)}/diff`,
            { params }
          );
          return jsonResult(response.data);
        } catch (error) {
          return { content: [{ type: "text" as const, text: formatError(error) }], isError: true };
        }
      }
    );

    server.registerTool(
      "streamPullRequestDiff",
      {
        description: "Stream the raw unified diff for a pull request as plain text",
        inputSchema: {
        projectKey: z.string().describe(DESC_PROJECT_KEY),
        repoSlug: z.string().describe(DESC_REPO_SLUG),
        prId: z.coerce.number().describe(DESC_PR_ID),
      },
      },
      async (args) => {
        try {
          const client = getClient();
          const response = await client.get(
            `${prPath(args.projectKey, args.repoSlug, args.prId)}.diff`,
            { headers: { Accept: "text/plain" }, responseType: "text", maxRedirects: 5 }
          );
          return textResult(response.data as string);
        } catch (error) {
          return { content: [{ type: "text" as const, text: formatError(error) }], isError: true };
        }
      }
    );

    server.registerTool(
      "getPullRequestPatch",
      {
        description: "Get the pull request as a patch file",
        inputSchema: {
        projectKey: z.string().describe(DESC_PROJECT_KEY),
        repoSlug: z.string().describe(DESC_REPO_SLUG),
        prId: z.coerce.number().describe(DESC_PR_ID),
      },
      },
      async (args) => {
        try {
          const client = getClient();
          const response = await client.get(
            `${prPath(args.projectKey, args.repoSlug, args.prId)}.patch`,
            { headers: { Accept: "text/plain" }, responseType: "text", maxRedirects: 5 }
          );
          return textResult(response.data as string);
        } catch (error) {
          return { content: [{ type: "text" as const, text: formatError(error) }], isError: true };
        }
      }
    );

    server.registerTool(
      "getPullRequestChanges",
      {
        description: "Get the list of changed files in a pull request",
        inputSchema: {
        projectKey: z.string().describe(DESC_PROJECT_KEY),
        repoSlug: z.string().describe(DESC_REPO_SLUG),
        prId: z.coerce.number().describe(DESC_PR_ID),
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
            `${prPath(args.projectKey, args.repoSlug, args.prId)}/changes`,
            { limit: args.limit, start: args.start, all: args.all }
          );
          return jsonResult(result.values);
        } catch (error) {
          return { content: [{ type: "text" as const, text: formatError(error) }], isError: true };
        }
      }
    );
  },
};

export default prDiffModule;
