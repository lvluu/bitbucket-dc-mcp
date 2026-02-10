import { z } from "zod";
import { getClient, repoPath, prPath } from "../lib/client.js";
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

const pullRequestsModule: RegisterableModule = {
  type: "tool",
  name: "pull-requests",
  description: "Bitbucket DC pull request operations",
  register(server: McpServer) {
    server.tool(
      "listPullRequests",
      "List pull requests for a repository",
      {
        projectKey: z.string().describe(DESC_PROJECT_KEY),
        repoSlug: z.string().describe(DESC_REPO_SLUG),
        state: z.enum(["OPEN", "MERGED", "DECLINED", "ALL"]).optional().describe("PR state filter"),
        direction: z.enum(["INCOMING", "OUTGOING"]).optional().describe("PR direction"),
        at: z.string().optional().describe("Branch to filter by (fully-qualified ref)"),
        limit: z.number().optional().describe(DESC_ITEMS_PER_PAGE),
        start: z.number().optional().describe(DESC_START_INDEX),
        all: z.boolean().optional().describe(DESC_FETCH_ALL_PAGES),
      },
      async (args) => {
        try {
          const client = getClient();
          const params: Record<string, unknown> = {};
          if (args.state !== undefined) params.state = args.state;
          if (args.direction !== undefined) params.direction = args.direction;
          if (args.at !== undefined) params.at = args.at;
          const result = await fetchPage(client, `${repoPath(args.projectKey, args.repoSlug)}/pull-requests`, {
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

    server.tool(
      "getPullRequest",
      "Get details of a specific pull request",
      {
        projectKey: z.string().describe(DESC_PROJECT_KEY),
        repoSlug: z.string().describe(DESC_REPO_SLUG),
        prId: z.number().describe("Pull request ID"),
      },
      async (args) => {
        try {
          const client = getClient();
          const response = await client.get(prPath(args.projectKey, args.repoSlug, args.prId));
          return jsonResult(response.data);
        } catch (error) {
          return { content: [{ type: "text" as const, text: formatError(error) }], isError: true };
        }
      }
    );

    server.tool(
      "createPullRequest",
      "Create a new pull request",
      {
        projectKey: z.string().describe(DESC_PROJECT_KEY),
        repoSlug: z.string().describe(DESC_REPO_SLUG),
        title: z.string().describe("PR title"),
        description: z.string().optional().describe("PR description"),
        sourceBranch: z.string().describe("Source branch name"),
        targetBranch: z.string().describe("Target branch name"),
        reviewers: z.array(z.string()).optional().describe("Reviewer usernames"),
        draft: z.boolean().optional().describe("Create as draft PR"),
      },
      async (args) => {
        try {
          const client = getClient();
          const payload: Record<string, unknown> = {
            title: args.title,
            description: args.description ?? "",
            fromRef: {
              id: `refs/heads/${args.sourceBranch}`,
              repository: {
                slug: args.repoSlug,
                project: { key: args.projectKey },
              },
            },
            toRef: {
              id: `refs/heads/${args.targetBranch}`,
              repository: {
                slug: args.repoSlug,
                project: { key: args.projectKey },
              },
            },
          };
          if (args.reviewers != null && args.reviewers.length > 0) {
            payload.reviewers = args.reviewers
              .filter((name) => name.trim().length > 0)
              .map((name) => ({ user: { name: name.trim() } }));
          }
          if (args.draft === true) {
            payload.draft = true;
          }
          const response = await client.post(
            `${repoPath(args.projectKey, args.repoSlug)}/pull-requests`,
            payload
          );
          return jsonResult(response.data);
        } catch (error) {
          return { content: [{ type: "text" as const, text: formatError(error) }], isError: true };
        }
      }
    );

    server.tool(
      "updatePullRequest",
      "Update a pull request (title, description, reviewers, target branch)",
      {
        projectKey: z.string().describe(DESC_PROJECT_KEY),
        repoSlug: z.string().describe(DESC_REPO_SLUG),
        prId: z.number().describe("Pull request ID"),
        title: z.string().optional().describe("New title"),
        description: z.string().optional().describe("New description"),
      },
      async (args) => {
        try {
          const client = getClient();
          // Fetch current PR for optimistic locking version and to preserve fields
          const current = await client.get(prPath(args.projectKey, args.repoSlug, args.prId));
          const currentData = current.data as Record<string, unknown>;
          const data: Record<string, unknown> = {
            title: currentData.title,
            description: currentData.description,
            version: currentData.version,
            toRef: currentData.toRef,
            reviewers: currentData.reviewers,
          };
          if (args.title !== undefined) data.title = args.title;
          if (args.description !== undefined) data.description = args.description;
          const response = await client.put(prPath(args.projectKey, args.repoSlug, args.prId), data);
          return jsonResult(response.data);
        } catch (error) {
          return { content: [{ type: "text" as const, text: formatError(error) }], isError: true };
        }
      }
    );

    server.tool(
      "mergePullRequest",
      "Merge a pull request",
      {
        projectKey: z.string().describe(DESC_PROJECT_KEY),
        repoSlug: z.string().describe(DESC_REPO_SLUG),
        prId: z.number().describe("Pull request ID"),
        message: z.string().optional().describe("Merge commit message"),
        strategy: z.enum(["merge-commit", "squash", "fast-forward"]).optional().describe("Merge strategy"),
      },
      async (args) => {
        try {
          const client = getClient();
          const current = await client.get(prPath(args.projectKey, args.repoSlug, args.prId));
          const data: Record<string, unknown> = {
            version: (current.data as Record<string, unknown>).version,
          };
          if (args.message !== undefined) data.message = args.message;
          if (args.strategy !== undefined) {
            const strategyMap: Record<string, string> = {
              "merge-commit": "no-ff",
              "squash": "squash",
              "fast-forward": "ff-only",
            };
            data.strategyId = strategyMap[args.strategy] ?? args.strategy;
          }
          const response = await client.post(`${prPath(args.projectKey, args.repoSlug, args.prId)}/merge`, data);
          return jsonResult(response.data);
        } catch (error) {
          return { content: [{ type: "text" as const, text: formatError(error) }], isError: true };
        }
      }
    );

    server.tool(
      "declinePullRequest",
      "Decline a pull request",
      {
        projectKey: z.string().describe(DESC_PROJECT_KEY),
        repoSlug: z.string().describe(DESC_REPO_SLUG),
        prId: z.number().describe("Pull request ID"),
        message: z.string().optional().describe("Reason for declining"),
      },
      async (args) => {
        try {
          const client = getClient();
          const current = await client.get(prPath(args.projectKey, args.repoSlug, args.prId));
          const data: Record<string, unknown> = {
            version: (current.data as Record<string, unknown>).version,
          };
          if (args.message !== undefined) data.comment = { text: args.message };
          const response = await client.post(`${prPath(args.projectKey, args.repoSlug, args.prId)}/decline`, data);
          return jsonResult(response.data);
        } catch (error) {
          return { content: [{ type: "text" as const, text: formatError(error) }], isError: true };
        }
      }
    );

    server.tool(
      "reopenPullRequest",
      "Reopen a declined pull request",
      {
        projectKey: z.string().describe(DESC_PROJECT_KEY),
        repoSlug: z.string().describe(DESC_REPO_SLUG),
        prId: z.number().describe("Pull request ID"),
      },
      async (args) => {
        try {
          const client = getClient();
          const current = await client.get(prPath(args.projectKey, args.repoSlug, args.prId));
          const data: Record<string, unknown> = {
            version: (current.data as Record<string, unknown>).version,
          };
          const response = await client.post(`${prPath(args.projectKey, args.repoSlug, args.prId)}/reopen`, data);
          return jsonResult(response.data);
        } catch (error) {
          return { content: [{ type: "text" as const, text: formatError(error) }], isError: true };
        }
      }
    );

    server.tool(
      "approvePullRequest",
      "Approve a pull request",
      {
        projectKey: z.string().describe(DESC_PROJECT_KEY),
        repoSlug: z.string().describe(DESC_REPO_SLUG),
        prId: z.number().describe("Pull request ID"),
      },
      async (args) => {
        try {
          const client = getClient();
          const response = await client.post(`${prPath(args.projectKey, args.repoSlug, args.prId)}/approve`);
          return jsonResult(response.data);
        } catch (error) {
          return { content: [{ type: "text" as const, text: formatError(error) }], isError: true };
        }
      }
    );

    server.tool(
      "unapprovePullRequest",
      "Remove approval from a pull request",
      {
        projectKey: z.string().describe(DESC_PROJECT_KEY),
        repoSlug: z.string().describe(DESC_REPO_SLUG),
        prId: z.number().describe("Pull request ID"),
      },
      async (args) => {
        try {
          const client = getClient();
          await client.delete(`${prPath(args.projectKey, args.repoSlug, args.prId)}/approve`);
          return textResult("Pull request approval removed successfully.");
        } catch (error) {
          return { content: [{ type: "text" as const, text: formatError(error) }], isError: true };
        }
      }
    );

    server.tool(
      "markPullRequestAsDraft",
      "Mark a pull request as draft or remove draft status",
      {
        projectKey: z.string().describe(DESC_PROJECT_KEY),
        repoSlug: z.string().describe(DESC_REPO_SLUG),
        prId: z.number().describe("Pull request ID"),
        draft: z.boolean().describe("true to mark as draft, false to remove draft status"),
      },
      async (args) => {
        try {
          const client = getClient();
          const current = await client.get(prPath(args.projectKey, args.repoSlug, args.prId));
          const currentData = current.data as Record<string, unknown>;
          const response = await client.put(prPath(args.projectKey, args.repoSlug, args.prId), {
            title: currentData.title,
            description: currentData.description,
            version: currentData.version,
            toRef: currentData.toRef,
            reviewers: currentData.reviewers,
            draft: args.draft,
          });
          return jsonResult(response.data);
        } catch (error) {
          return { content: [{ type: "text" as const, text: formatError(error) }], isError: true };
        }
      }
    );

    server.tool(
      "canMergePullRequest",
      "Check if a pull request can be merged",
      {
        projectKey: z.string().describe(DESC_PROJECT_KEY),
        repoSlug: z.string().describe(DESC_REPO_SLUG),
        prId: z.number().describe("Pull request ID"),
      },
      async (args) => {
        try {
          const client = getClient();
          const response = await client.get(`${prPath(args.projectKey, args.repoSlug, args.prId)}/merge`);
          return jsonResult(response.data);
        } catch (error) {
          return { content: [{ type: "text" as const, text: formatError(error) }], isError: true };
        }
      }
    );
  },
};

export default pullRequestsModule;
