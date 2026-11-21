import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { prArgs } from "#lib/params.js";
import { getClient, prPath } from "#lib/client.js";
import type { AxiosInstance } from "axios";
import { formatError, jsonResult, textResult, type ToolResult } from "#lib/errors.js";
import type { PendingComment } from "#lib/review-state.js";
import { reviewKey, startReviewSession, getReviewSession, clearReviewSession, releaseReviewOwner, } from "#lib/review-state.js";
function errorResult(error: unknown): ToolResult {
    return {
        content: [
            {
                type: "text",
                text: error instanceof Error ? error.message : formatError(error),
            },
        ],
        isError: true,
    };
}
async function postPendingComments(client: AxiosInstance, basePath: string, pendingComments: PendingComment[]) {
    const succeeded: { index: number; comment: unknown }[] = [];
    const failed: { index: number; text: unknown; error: string }[] = [];
    for (let i = 0; i < pendingComments.length; i++) {
        const pending = pendingComments[i];
        if (pending === undefined)
            continue;
        try {
            const response = await client.post(`${basePath}/comments`, pending);
            succeeded.push({ index: i, comment: response.data });
        }
        catch (error) {
            failed.push({ index: i, text: pending.text, error: formatError(error) });
        }
    }
    return { succeeded, failed };
}
async function setReviewStatus(client: AxiosInstance, basePath: string, reviewStatus: string) {
    try {
        if (reviewStatus === "APPROVED") {
            await client.post(`${basePath}/approve`);
        }
        else {
            await client.delete(`${basePath}/approve`);
        }
        return { status: reviewStatus, success: true };
    }
    catch (error) {
        return { status: reviewStatus, success: false, error: formatError(error) };
    }
}
const prReviewModule = {
    type: "tool",
    name: "pr-review",
    description: "Bitbucket DC pull request review session operations",
    register(server: McpServer): void {
        const previousOnClose = server.server.onclose;
        server.server.onclose = () => {
            releaseReviewOwner(server);
            previousOnClose?.();
        };
        server.registerTool("startReview", {
            description: "Start a review: addPRComment buffers comments until finishReview or discardReview.",
            inputSchema: {
                ...prArgs,
            },
        }, (args) => {
            try {
                const key = reviewKey(args.projectKey, args.repoSlug, args.prId);
                startReviewSession(key, server);
                return textResult(`Review session started for ${key} PR. Comments added via addPRComment will be buffered until you call finishReview.`);
            }
            catch (error) {
                return errorResult(error);
            }
        });
        server.registerTool("finishReview", {
            description: "Publish buffered review comments, then optionally set your review status.",
            inputSchema: {
                ...prArgs,
                reviewStatus: z
                    .enum(["APPROVED", "UNAPPROVED"])
                    .optional()
                    .describe("Status to set after posting"),
            },
        }, async (args) => {
            try {
                const key = reviewKey(args.projectKey, args.repoSlug, args.prId);
                const pendingComments = clearReviewSession(key, server);
                if (pendingComments.length === 0 && args.reviewStatus === undefined) {
                    return textResult("Review session finished with no pending comments.");
                }
                const client = getClient();
                const basePath = prPath(args.projectKey, args.repoSlug, args.prId);
                const { succeeded, failed } = await postPendingComments(client, basePath, pendingComments);
                const allCommentsFailed = failed.length > 0 && succeeded.length === 0;
                // Never approve (or un-approve) a PR when none of the review's comments were published.
                const reviewStatusResult = args.reviewStatus === undefined
                    ? undefined
                    : allCommentsFailed
                        ? { skipped: true }
                        : await setReviewStatus(client, basePath, args.reviewStatus);
                const summary = {
                    totalComments: pendingComments.length,
                    successfulComments: succeeded.length,
                    failedComments: failed.length,
                    succeeded,
                    failed,
                    reviewStatus: reviewStatusResult,
                };
                const statusOnlyFailed = pendingComments.length === 0 && reviewStatusResult !== undefined && "success" in reviewStatusResult && !reviewStatusResult.success;
                if (allCommentsFailed || statusOnlyFailed) {
                    return { ...jsonResult(summary), isError: true };
                }
                return jsonResult(summary);
            }
            catch (error) {
                return errorResult(error);
            }
        });
        server.registerTool("discardReview", {
            description: "Drop the review and its buffered comments.",
            inputSchema: {
                ...prArgs,
            },
        }, (args) => {
            try {
                const key = reviewKey(args.projectKey, args.repoSlug, args.prId);
                const discarded = clearReviewSession(key, server);
                return textResult(`Review discarded. ${String(discarded.length)} pending comment(s) dropped.`);
            }
            catch (error) {
                return errorResult(error);
            }
        });
        server.registerTool("listPendingReviewComments", {
            description: "List buffered review comments.",
            inputSchema: {
                ...prArgs,
            },
        }, (args) => {
            try {
                const key = reviewKey(args.projectKey, args.repoSlug, args.prId);
                const session = getReviewSession(key, server);
                if (session === undefined) {
                    return {
                        content: [
                            {
                                type: "text",
                                text: `No active review session for ${key}.`,
                            },
                        ],
                        isError: true,
                    };
                }
                const indexed = session.map((c, i) => ({ index: i, ...c }));
                return jsonResult(indexed);
            }
            catch (error) {
                return {
                    content: [
                        { type: "text", text: formatError(error) },
                    ],
                    isError: true,
                };
            }
        });
    },
};
export default prReviewModule;
