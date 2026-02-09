import { z } from "zod";
import { getClient, prPath } from "../lib/client.js";
import { formatError, jsonResult } from "../lib/errors.js";
import { fetchPage } from "../lib/pagination.js";
import type { RegisterableModule } from "../registry/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Shared description constants
const DESC_PROJECT_KEY = "Project key";
const DESC_REPO_SLUG = "Repository slug";
const DESC_PR_ID = "Pull request ID";
const DESC_ITEMS_PER_PAGE = "Items per page";
const DESC_START_INDEX = "Start index";
const DESC_FETCH_ALL_PAGES = "Fetch all pages";

const prActivityModule: RegisterableModule = {
  type: "tool",
  name: "pr-activity",
  description: "Bitbucket DC pull request activity and commit operations",
  register(server: McpServer) {
    server.tool(
      "getPullRequestActivity",
      "Get the activity log for a pull request (comments, approvals, merges, etc.)",
      {
        projectKey: z.string().describe(DESC_PROJECT_KEY),
        repoSlug: z.string().describe(DESC_REPO_SLUG),
        prId: z.number().describe(DESC_PR_ID),
        limit: z.number().optional().describe(DESC_ITEMS_PER_PAGE),
        start: z.number().optional().describe(DESC_START_INDEX),
        all: z.boolean().optional().describe(DESC_FETCH_ALL_PAGES),
      },
      async (args) => {
        try {
          const client = getClient();
          const result = await fetchPage(
            client,
            `${prPath(args.projectKey, args.repoSlug, args.prId)}/activities`,
            { limit: args.limit, start: args.start, all: args.all }
          );
          return jsonResult(result.values);
        } catch (error) {
          return { content: [{ type: "text" as const, text: formatError(error) }], isError: true };
        }
      }
    );

    server.tool(
      "getPullRequestCommits",
      "Get commits in a pull request",
      {
        projectKey: z.string().describe(DESC_PROJECT_KEY),
        repoSlug: z.string().describe(DESC_REPO_SLUG),
        prId: z.number().describe(DESC_PR_ID),
        limit: z.number().optional().describe(DESC_ITEMS_PER_PAGE),
        start: z.number().optional().describe(DESC_START_INDEX),
        all: z.boolean().optional().describe(DESC_FETCH_ALL_PAGES),
      },
      async (args) => {
        try {
          const client = getClient();
          const result = await fetchPage(
            client,
            `${prPath(args.projectKey, args.repoSlug, args.prId)}/commits`,
            { limit: args.limit, start: args.start, all: args.all }
          );
          return jsonResult(result.values);
        } catch (error) {
          return { content: [{ type: "text" as const, text: formatError(error) }], isError: true };
        }
      }
    );

    server.tool(
      "getPullRequestParticipants",
      "Get participants (reviewers, author) of a pull request",
      {
        projectKey: z.string().describe(DESC_PROJECT_KEY),
        repoSlug: z.string().describe(DESC_REPO_SLUG),
        prId: z.number().describe(DESC_PR_ID),
      },
      async (args) => {
        try {
          const client = getClient();
          const response = await client.get(
            `${prPath(args.projectKey, args.repoSlug, args.prId)}/participants`
          );
          return jsonResult(response.data);
        } catch (error) {
          return { content: [{ type: "text" as const, text: formatError(error) }], isError: true };
        }
      }
    );
  },
};

export default prActivityModule;
