import { z } from "zod";
import { getClient, prPath } from "../lib/client.js";
import { formatError, jsonResult } from "../lib/errors.js";
import { fetchPage } from "../lib/pagination.js";
import type { RegisterableModule } from "../registry/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Shared description constants
const DESC_PROJECT_KEY = "Project key";
const DESC_REPO_SLUG = "Repository slug";
const DESC_ITEMS_PER_PAGE = "Items per page";
const DESC_START_INDEX = "Start index";
const DESC_FETCH_ALL_PAGES = "Fetch all pages";

const prTasksModule: RegisterableModule = {
  type: "tool",
  name: "pr-tasks",
  description: "Bitbucket DC pull request task operations (blocker comments)",
  register(server: McpServer) {
    server.tool(
      "listPRTasks",
      "List tasks (blocker comments) on a pull request",
      {
        projectKey: z.string().describe(DESC_PROJECT_KEY),
        repoSlug: z.string().describe(DESC_REPO_SLUG),
        prId: z.number().describe("Pull request ID"),
        limit: z.number().optional().describe(DESC_ITEMS_PER_PAGE),
        start: z.number().optional().describe(DESC_START_INDEX),
        all: z.boolean().optional().default(true).describe(DESC_FETCH_ALL_PAGES),
      },
      async (args) => {
        try {
          const client = getClient();
          // In DC, tasks are blocker comments. Fetch activities and filter.
          const result = await fetchPage<Record<string, unknown>>(
            client,
            `${prPath(args.projectKey, args.repoSlug, args.prId)}/activities`,
            { limit: args.limit, start: args.start, all: args.all }
          );
          const tasks = result.values
            .filter((a) =>
              a.action === "COMMENTED" &&
              a.comment != null &&
              (a.comment as Record<string, unknown>).severity === "BLOCKER"
            )
            .map((a) => a.comment);
          return jsonResult(tasks);
        } catch (error) {
          return { content: [{ type: "text" as const, text: formatError(error) }], isError: true };
        }
      }
    );

    server.tool(
      "addBlockerComment",
      "Add a blocker comment (task) to a pull request",
      {
        projectKey: z.string().describe(DESC_PROJECT_KEY),
        repoSlug: z.string().describe(DESC_REPO_SLUG),
        prId: z.number().describe("Pull request ID"),
        text: z.string().describe("Task text"),
        anchorPath: z.string().optional().describe("File path for inline task"),
        anchorLine: z.number().optional().describe("Line number"),
        anchorFileType: z.enum(["FROM", "TO"]).optional().describe("FROM=old, TO=new file"),
      },
      async (args) => {
        try {
          const client = getClient();
          const body: Record<string, unknown> = {
            text: args.text,
            severity: "BLOCKER",
          };
          if (args.anchorPath !== undefined) {
            const anchor: Record<string, unknown> = {
              path: args.anchorPath,
              diffType: "EFFECTIVE",
            };
            if (args.anchorLine !== undefined) anchor.line = args.anchorLine;
            if (args.anchorFileType !== undefined) anchor.fileType = args.anchorFileType;
            body.anchor = anchor;
          }
          const response = await client.post(
            `${prPath(args.projectKey, args.repoSlug, args.prId)}/comments`,
            body
          );
          return jsonResult(response.data);
        } catch (error) {
          return { content: [{ type: "text" as const, text: formatError(error) }], isError: true };
        }
      }
    );

    server.tool(
      "resolveTask",
      "Resolve a task (blocker comment) by updating its state",
      {
        projectKey: z.string().describe(DESC_PROJECT_KEY),
        repoSlug: z.string().describe(DESC_REPO_SLUG),
        prId: z.number().describe("Pull request ID"),
        commentId: z.number().describe("Comment/task ID"),
        version: z.number().describe("Comment version for optimistic locking"),
      },
      async (args) => {
        try {
          const client = getClient();
          const response = await client.put(
            `${prPath(args.projectKey, args.repoSlug, args.prId)}/comments/${String(args.commentId)}`,
            { severity: "NORMAL", version: args.version }
          );
          return jsonResult(response.data);
        } catch (error) {
          return { content: [{ type: "text" as const, text: formatError(error) }], isError: true };
        }
      }
    );
  },
};

export default prTasksModule;
