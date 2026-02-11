import { z } from "zod";
import { getClient, repoPath } from "../lib/client.js";
import { formatError, jsonResult } from "../lib/errors.js";
import { fetchPage } from "../lib/pagination.js";
import type { RegisterableModule } from "../registry/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const DESC_PROJECT_KEY = "Project key";
const DESC_REPO_SLUG = "Repository slug";
const DESC_COMMIT_ID = "Full 40-character commit hash";
const DESC_ITEMS_PER_PAGE = "Items per page";
const DESC_START_INDEX = "Start index";
const DESC_FETCH_ALL_PAGES = "Fetch all pages";

const buildStatusModule: RegisterableModule = {
  type: "tool",
  name: "build-status",
  description: "Bitbucket DC build status operations",
  register(server: McpServer) {
    server.registerTool(
      "getBuildStatuses",
      {
        description:
          "Get build statuses for a specific commit in a repository (since Bitbucket DC 7.14)",
        inputSchema: {
          projectKey: z.string().describe(DESC_PROJECT_KEY),
          repoSlug: z.string().describe(DESC_REPO_SLUG),
          commitId: z.string().describe(DESC_COMMIT_ID),
          key: z.string().optional().describe("Filter by a specific build key"),
          limit: z.number().optional().describe(DESC_ITEMS_PER_PAGE),
          start: z.number().optional().describe(DESC_START_INDEX),
          all: z.boolean().optional().describe(DESC_FETCH_ALL_PAGES),
        },
      },
      async (args) => {
        try {
          const client = getClient();
          const params: Record<string, unknown> = {};
          if (args.key !== undefined) params.key = args.key;
          const result = await fetchPage(
            client,
            `${repoPath(args.projectKey, args.repoSlug)}/commits/${args.commitId}/builds`,
            { limit: args.limit, start: args.start, all: args.all, params }
          );
          return jsonResult(result.values);
        } catch (error) {
          return {
            content: [{ type: "text" as const, text: formatError(error) }],
            isError: true,
          };
        }
      }
    );

    server.registerTool(
      "getBuildStatusStats",
      {
        description:
          "Get build status statistics (successful, failed, in-progress counts) for a commit",
        inputSchema: {
          commitId: z.string().describe(DESC_COMMIT_ID),
          includeUnique: z
            .boolean()
            .optional()
            .describe(
              "Include a unique build result if there is only one failed, in-progress, or successful build"
            ),
        },
      },
      async (args) => {
        try {
          const client = getClient();
          const params: Record<string, unknown> = {};
          if (args.includeUnique !== undefined)
            params.includeUnique = args.includeUnique;
          const response = await client.get(
            `/build-status/latest/commits/stats/${args.commitId}`,
            { params }
          );
          return jsonResult(response.data);
        } catch (error) {
          return {
            content: [{ type: "text" as const, text: formatError(error) }],
            isError: true,
          };
        }
      }
    );
  },
};

export default buildStatusModule;
