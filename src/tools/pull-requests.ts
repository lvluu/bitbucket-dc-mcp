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
const DESC_PR_ID = "Pull request ID";

const pullRequestsModule: RegisterableModule = {
  type: "tool",
  name: "pull-requests",
  description: "Bitbucket DC pull request operations",
  register(server: McpServer) {
    server.registerTool(
      "listPullRequests",
      {
        description: "List pull requests for a repository",
        inputSchema: {
        projectKey: z.string().describe(DESC_PROJECT_KEY),
        repoSlug: z.string().describe(DESC_REPO_SLUG),
        state: z.enum(["OPEN", "MERGED", "DECLINED", "ALL"]).optional().describe("PR state filter"),
        direction: z.enum(["INCOMING", "OUTGOING"]).optional().describe("PR direction"),
        at: z.string().optional().describe("Branch to filter by (fully-qualified ref)"),
        limit: z.coerce.number().optional().describe(DESC_ITEMS_PER_PAGE),
        start: z.coerce.number().optional().describe(DESC_START_INDEX),
        all: z.boolean().optional().describe(DESC_FETCH_ALL_PAGES),
      },
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

    server.registerTool(
      "getPullRequest",
      {
        description: "Get details of a specific pull request",
        inputSchema: {
        projectKey: z.string().describe(DESC_PROJECT_KEY),
        repoSlug: z.string().describe(DESC_REPO_SLUG),
        prId: z.coerce.number().describe(DESC_PR_ID),
      },
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

    server.registerTool(
      "createPullRequest",
      {
        description: "Create a new pull request",
        inputSchema: {
        projectKey: z.string().describe(DESC_PROJECT_KEY),
        repoSlug: z.string().describe(DESC_REPO_SLUG),
        title: z.string().describe("PR title"),
        description: z.string().optional().describe("PR description"),
        sourceBranch: z.string().describe("Source branch name"),
        targetBranch: z.string().describe("Target branch name"),
        reviewers: z.array(z.string()).optional().describe("Reviewer usernames"),
        draft: z.boolean().optional().describe("Create as draft PR"),
      },
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

    server.registerTool(
      "updatePullRequest",
      {
        description: "Update a pull request (title, description, reviewers, target branch)",
        inputSchema: {
        projectKey: z.string().describe(DESC_PROJECT_KEY),
        repoSlug: z.string().describe(DESC_REPO_SLUG),
        prId: z.coerce.number().describe(DESC_PR_ID),
        title: z.string().optional().describe("New title"),
        description: z.string().optional().describe("New description"),
      },
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

    server.registerTool(
      "mergePullRequest",
      {
        description: "Merge a pull request",
        inputSchema: {
        projectKey: z.string().describe(DESC_PROJECT_KEY),
        repoSlug: z.string().describe(DESC_REPO_SLUG),
        prId: z.coerce.number().describe(DESC_PR_ID),
        message: z.string().optional().describe("Merge commit message"),
        strategy: z.enum(["merge-commit", "squash", "fast-forward"]).optional().describe("Merge strategy"),
      },
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

    server.registerTool(
      "declinePullRequest",
      {
        description: "Decline a pull request",
        inputSchema: {
        projectKey: z.string().describe(DESC_PROJECT_KEY),
        repoSlug: z.string().describe(DESC_REPO_SLUG),
        prId: z.coerce.number().describe(DESC_PR_ID),
        message: z.string().optional().describe("Reason for declining"),
      },
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

    server.registerTool(
      "reopenPullRequest",
      {
        description: "Reopen a declined pull request",
        inputSchema: {
        projectKey: z.string().describe(DESC_PROJECT_KEY),
        repoSlug: z.string().describe(DESC_REPO_SLUG),
        prId: z.coerce.number().describe(DESC_PR_ID),
      },
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

    server.registerTool(
      "approvePullRequest",
      {
        description: "Approve a pull request",
        inputSchema: {
        projectKey: z.string().describe(DESC_PROJECT_KEY),
        repoSlug: z.string().describe(DESC_REPO_SLUG),
        prId: z.coerce.number().describe(DESC_PR_ID),
      },
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

    server.registerTool(
      "unapprovePullRequest",
      {
        description: "Remove approval from a pull request",
        inputSchema: {
        projectKey: z.string().describe(DESC_PROJECT_KEY),
        repoSlug: z.string().describe(DESC_REPO_SLUG),
        prId: z.coerce.number().describe(DESC_PR_ID),
      },
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

    server.registerTool(
      "markPullRequestAsDraft",
      {
        description: "Mark a pull request as draft or remove draft status",
        inputSchema: {
        projectKey: z.string().describe(DESC_PROJECT_KEY),
        repoSlug: z.string().describe(DESC_REPO_SLUG),
        prId: z.coerce.number().describe(DESC_PR_ID),
        draft: z.boolean().describe("true to mark as draft, false to remove draft status"),
      },
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

    server.registerTool(
      "canMergePullRequest",
      {
        description: "Check if a pull request can be merged",
        inputSchema: {
        projectKey: z.string().describe(DESC_PROJECT_KEY),
        repoSlug: z.string().describe(DESC_REPO_SLUG),
        prId: z.coerce.number().describe(DESC_PR_ID),
      },
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

    server.registerTool(
      "addPullRequestReviewers",
      {
        description: "Add reviewers to an existing pull request. Assigns users the REVIEWER role. If a user is already a participant with a different role (except AUTHOR), their role will be updated to REVIEWER.",
        inputSchema: {
        projectKey: z.string().describe(DESC_PROJECT_KEY),
        repoSlug: z.string().describe(DESC_REPO_SLUG),
        prId: z.coerce.number().describe(DESC_PR_ID),
        reviewers: z.array(z.string()).min(1).describe("Array of reviewer usernames to add"),
      },
      },
      async (args) => {
        try {
          const client = getClient();
          const results: Array<{ username: string; success: boolean; data: unknown }> = [];
          const errors: Array<{ username: string; error: string }> = [];

          // Add each reviewer individually via the participants endpoint
          for (const username of args.reviewers) {
            const trimmedUsername = username.trim();
            if (trimmedUsername.length === 0) continue;

            try {
              const payload = {
                user: { name: trimmedUsername },
                role: "REVIEWER",
              };
              const response = await client.post(
                `${prPath(args.projectKey, args.repoSlug, args.prId)}/participants`,
                payload
              );
              results.push({ username: trimmedUsername, success: true, data: response.data as unknown });
            } catch (error) {
              errors.push({ username: trimmedUsername, error: formatError(error) });
            }
          }

          // Return combined results
          const summary = {
            success: results.length,
            failed: errors.length,
            results,
            errors,
          };

          if (errors.length > 0 && results.length === 0) {
            // All failed
            return { content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }], isError: true };
          }

          return jsonResult(summary);
        } catch (error) {
          return { content: [{ type: "text" as const, text: formatError(error) }], isError: true };
        }
      }
    );
  },
};

export default pullRequestsModule;
