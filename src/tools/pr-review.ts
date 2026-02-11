import { z } from "zod";
import type { PendingComment } from "#lib/review-state.js";
import type { RegisterableModule } from "#registry/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AxiosInstance } from "axios";
import { getClient, prPath } from "#lib/client.js";
import { formatError, jsonResult, textResult } from "#lib/errors.js";
import {
  reviewKey,
  startReviewSession,
  getReviewSession,
  clearReviewSession,
} from "#lib/review-state.js";

const DESC_PROJECT_KEY = "Project key";
const DESC_REPO_SLUG = "Repository slug";
const DESC_PR_ID = "Pull request ID";

function errorResult(error: unknown): { content: Array<{ type: "text"; text: string }>; isError: true } {
  return {
    content: [
      {
        type: "text" as const,
        text:
          error instanceof Error ? error.message : formatError(error),
      },
    ],
    isError: true,
  };
}

async function postPendingComments(
  client: AxiosInstance,
  basePath: string,
  pendingComments: Array<PendingComment>,
): Promise<{ succeeded: Array<{ index: number; comment: unknown }>; failed: Array<{ index: number; text: string; error: string }> }> {
  const succeeded: Array<{ index: number; comment: unknown }> = [];
  const failed: Array<{ index: number; text: string; error: string }> = [];

  for (let i = 0; i < pendingComments.length; i++) {
    const pending = pendingComments[i];
    if (pending === undefined) continue;
    try {
      const response = await client.post(`${basePath}/comments`, pending);
      succeeded.push({ index: i, comment: response.data as unknown });
    } catch (error) {
      failed.push({ index: i, text: pending.text, error: formatError(error) });
    }
  }

  return { succeeded, failed };
}

async function setReviewStatus(
  client: AxiosInstance,
  basePath: string,
  reviewStatus: string,
): Promise<{ status: string; success: boolean; error?: string }> {
  try {
    if (reviewStatus === "APPROVED") {
      await client.post(`${basePath}/approve`);
    } else {
      await client.delete(`${basePath}/approve`);
    }
    return { status: reviewStatus, success: true };
  } catch (error) {
    return { status: reviewStatus, success: false, error: formatError(error) };
  }
}

const prReviewModule: RegisterableModule = {
  type: "tool",
  name: "pr-review",
  description: "Bitbucket DC pull request review session operations",
  register(server: McpServer) {
    server.registerTool(
      "startReview",
      {
        description:
          "Start a review session for a pull request. While a review is active, comments added via addPRComment are buffered in memory instead of being posted immediately. Use finishReview to publish all buffered comments at once, or discardReview to drop them.",
        inputSchema: {
          projectKey: z.string().describe(DESC_PROJECT_KEY),
          repoSlug: z.string().describe(DESC_REPO_SLUG),
          prId: z.coerce.number().describe(DESC_PR_ID),
        },
      },
      (args) => {
        try {
          const key = reviewKey(args.projectKey, args.repoSlug, args.prId);
          startReviewSession(key);
          return textResult(
            `Review session started for ${args.projectKey}/${args.repoSlug} PR #${String(args.prId)}. Comments added via addPRComment will be buffered until you call finishReview.`,
          );
        } catch (error) {
          return errorResult(error);
        }
      },
    );

    server.registerTool(
      "finishReview",
      {
        description:
          "Finish a review session: publish all buffered comments and optionally set approval status. Comments are posted sequentially. Partial failures are reported in the result.",
        inputSchema: {
          projectKey: z.string().describe(DESC_PROJECT_KEY),
          repoSlug: z.string().describe(DESC_REPO_SLUG),
          prId: z.coerce.number().describe(DESC_PR_ID),
          reviewStatus: z
            .enum(["APPROVED", "UNAPPROVED"])
            .optional()
            .describe(
              "Set reviewer status after posting comments (APPROVED = approve, UNAPPROVED = remove approval)",
            ),
        },
      },
      async (args) => {
        try {
          const key = reviewKey(args.projectKey, args.repoSlug, args.prId);
          const pendingComments = clearReviewSession(key);

          if (pendingComments.length === 0) {
            return textResult(
              "Review session finished with no pending comments.",
            );
          }

          const client = getClient();
          const basePath = prPath(args.projectKey, args.repoSlug, args.prId);
          const { succeeded, failed } = await postPendingComments(
            client,
            basePath,
            pendingComments,
          );

          const reviewStatusResult =
            args.reviewStatus !== undefined
              ? await setReviewStatus(client, basePath, args.reviewStatus)
              : undefined;

          const summary = {
            totalComments: pendingComments.length,
            successfulComments: succeeded.length,
            failedComments: failed.length,
            succeeded,
            failed,
            reviewStatus: reviewStatusResult,
          };

          if (failed.length > 0 && succeeded.length === 0) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(summary, null, 2),
                },
              ],
              isError: true,
            };
          }

          return jsonResult(summary);
        } catch (error) {
          return errorResult(error);
        }
      },
    );

    server.registerTool(
      "discardReview",
      {
        description:
          "Discard a review session, dropping all buffered comments without publishing them.",
        inputSchema: {
          projectKey: z.string().describe(DESC_PROJECT_KEY),
          repoSlug: z.string().describe(DESC_REPO_SLUG),
          prId: z.coerce.number().describe(DESC_PR_ID),
        },
      },
      (args) => {
        try {
          const key = reviewKey(args.projectKey, args.repoSlug, args.prId);
          const discarded = clearReviewSession(key);
          return textResult(
            `Review discarded. ${String(discarded.length)} pending comment(s) dropped.`,
          );
        } catch (error) {
          return errorResult(error);
        }
      },
    );

    server.registerTool(
      "listPendingReviewComments",
      {
        description:
          "List all buffered comments in the current review session for a pull request.",
        inputSchema: {
          projectKey: z.string().describe(DESC_PROJECT_KEY),
          repoSlug: z.string().describe(DESC_REPO_SLUG),
          prId: z.coerce.number().describe(DESC_PR_ID),
        },
      },
      (args) => {
        try {
          const key = reviewKey(args.projectKey, args.repoSlug, args.prId);
          const session = getReviewSession(key);
          if (session === undefined) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `No active review session for ${key}.`,
                },
              ],
              isError: true,
            };
          }
          const indexed = session.map((c, i) => ({ index: i, ...c }));
          return jsonResult(indexed);
        } catch (error) {
          return {
            content: [
              { type: "text" as const, text: formatError(error) },
            ],
            isError: true,
          };
        }
      },
    );
  },
};

export default prReviewModule;
