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

const prCommentsModule: RegisterableModule = {
  type: "tool",
  name: "pr-comments",
  description: "Bitbucket DC pull request comment operations",
  register(server: McpServer) {
    server.tool(
      "listPRComments",
      "List comments on a pull request (fetched from activities, filtered to comments)",
      {
        projectKey: z.string().describe(DESC_PROJECT_KEY),
        repoSlug: z.string().describe(DESC_REPO_SLUG),
        prId: z.number().describe("Pull request ID"),
        limit: z.number().optional().describe(DESC_ITEMS_PER_PAGE),
        start: z.number().optional().describe(DESC_START_INDEX),
        all: z.boolean().optional().describe(DESC_FETCH_ALL_PAGES),
      },
      async (args) => {
        try {
          const client = getClient();
          const result = await fetchPage<Record<string, unknown>>(
            client,
            `${prPath(args.projectKey, args.repoSlug, args.prId)}/activities`,
            { limit: args.limit, start: args.start, all: args.all }
          );
          const comments = result.values
            .filter((a) => a.action === "COMMENTED" && a.comment != null)
            .map((a) => a.comment);
          return jsonResult(comments);
        } catch (error) {
          return { content: [{ type: "text" as const, text: formatError(error) }], isError: true };
        }
      }
    );

    server.tool(
      "addPRComment",
      "Add a comment to a pull request (general or inline)",
      {
        projectKey: z.string().describe(DESC_PROJECT_KEY),
        repoSlug: z.string().describe(DESC_REPO_SLUG),
        prId: z.number().describe("Pull request ID"),
        text: z.string().describe("Comment text"),
        parentId: z.number().optional().describe("Parent comment ID for replies"),
        anchorPath: z.string().optional().describe("File path for inline comment"),
        anchorLine: z.number().optional().describe("Line number for inline comment"),
        anchorLineType: z.enum(["ADDED", "REMOVED", "CONTEXT"]).optional().describe("Line type for inline comment"),
        anchorFileType: z.enum(["FROM", "TO"]).optional().describe("FROM = old file, TO = new file"),
        severity: z.enum(["NORMAL", "BLOCKER"]).optional().describe("Comment severity (BLOCKER = task)"),
      },
      async (args) => {
        try {
          const client = getClient();
          const body: Record<string, unknown> = { text: args.text };
          if (args.parentId !== undefined) {
            body.parent = { id: args.parentId };
          }
          if (args.anchorPath !== undefined) {
            const anchor: Record<string, unknown> = {
              path: args.anchorPath,
              diffType: "EFFECTIVE",
            };
            if (args.anchorLine !== undefined) anchor.line = args.anchorLine;
            if (args.anchorLineType !== undefined) anchor.lineType = args.anchorLineType;
            if (args.anchorFileType !== undefined) anchor.fileType = args.anchorFileType;
            body.anchor = anchor;
          }
          if (args.severity !== undefined) {
            body.severity = args.severity;
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
      "getPRComment",
      "Get a specific pull request comment by ID",
      {
        projectKey: z.string().describe(DESC_PROJECT_KEY),
        repoSlug: z.string().describe(DESC_REPO_SLUG),
        prId: z.number().describe("Pull request ID"),
        commentId: z.number().describe("Comment ID"),
      },
      async (args) => {
        try {
          const client = getClient();
          const response = await client.get(
            `${prPath(args.projectKey, args.repoSlug, args.prId)}/comments/${String(args.commentId)}`
          );
          return jsonResult(response.data);
        } catch (error) {
          return { content: [{ type: "text" as const, text: formatError(error) }], isError: true };
        }
      }
    );

    server.tool(
      "updatePRComment",
      "Update a pull request comment",
      {
        projectKey: z.string().describe(DESC_PROJECT_KEY),
        repoSlug: z.string().describe(DESC_REPO_SLUG),
        prId: z.number().describe("Pull request ID"),
        commentId: z.number().describe("Comment ID"),
        text: z.string().describe("Updated comment text"),
        version: z.number().describe("Comment version for optimistic locking"),
      },
      async (args) => {
        try {
          const client = getClient();
          const response = await client.put(
            `${prPath(args.projectKey, args.repoSlug, args.prId)}/comments/${String(args.commentId)}`,
            { text: args.text, version: args.version }
          );
          return jsonResult(response.data);
        } catch (error) {
          return { content: [{ type: "text" as const, text: formatError(error) }], isError: true };
        }
      }
    );

    server.tool(
      "deletePRComment",
      "Delete a pull request comment (requires BITBUCKET_ENABLE_DANGEROUS=true)",
      {
        projectKey: z.string().describe(DESC_PROJECT_KEY),
        repoSlug: z.string().describe(DESC_REPO_SLUG),
        prId: z.number().describe("Pull request ID"),
        commentId: z.number().describe("Comment ID"),
        version: z.number().describe("Comment version for optimistic locking"),
      },
      async (args) => {
        try {
          const { getConfig } = await import("../lib/client.js");
          const config = getConfig();
          if (!config.enableDangerous) {
            return { content: [{ type: "text" as const, text: "deletePRComment is disabled. Set BITBUCKET_ENABLE_DANGEROUS=true to enable." }], isError: true };
          }
          const client = getClient();
          await client.delete(
            `${prPath(args.projectKey, args.repoSlug, args.prId)}/comments/${String(args.commentId)}`,
            { params: { version: args.version } }
          );
          return textResult("Comment deleted successfully.");
        } catch (error) {
          return { content: [{ type: "text" as const, text: formatError(error) }], isError: true };
        }
      }
    );
  },
};

export default prCommentsModule;
