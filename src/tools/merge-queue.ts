import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getClient, prPath } from "#lib/client.js";
import { formatError, jsonResult } from "#lib/errors.js";
import {
    mergeQueueKey,
    enqueuePullRequest,
    getMergeQueue,
    dequeuePullRequest,
    tryAcquireProcessing,
    releaseProcessing,
} from "#lib/merge-queue-state.js";

const DESC_PROJECT_KEY = "Project key";
const DESC_REPO_SLUG = "Repository slug";
const DESC_PR_ID = "Pull request ID";

interface MergeabilityResponse {
    canMerge?: boolean;
    conflicted?: boolean;
    outcome?: string;
    vetoes?: unknown[];
    [key: string]: unknown;
}

const mergeQueueModule = {
    type: "tool",
    name: "merge-queue",
    description: "Bitbucket DC per-repository merge queue operations",
    register(server: McpServer): void {
        server.registerTool("enqueuePullRequest", {
            description: "Append a pull request to the repository merge queue and return its 1-based position",
            inputSchema: {
                projectKey: z.string().describe(DESC_PROJECT_KEY),
                repoSlug: z.string().describe(DESC_REPO_SLUG),
                prId: z.coerce.number().describe(DESC_PR_ID),
            },
        }, async (args) => {
            try {
                const key = mergeQueueKey(args.projectKey, args.repoSlug);
                const position = enqueuePullRequest(key, args.prId);
                return jsonResult({
                    projectKey: args.projectKey,
                    repoSlug: args.repoSlug,
                    prId: args.prId,
                    position,
                    queueLength: getMergeQueue(key).length,
                });
            } catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });

        server.registerTool("getMergeQueue", {
            description: "List the queued pull request IDs in order for a repository",
            inputSchema: {
                projectKey: z.string().describe(DESC_PROJECT_KEY),
                repoSlug: z.string().describe(DESC_REPO_SLUG),
            },
        }, async (args) => {
            try {
                const key = mergeQueueKey(args.projectKey, args.repoSlug);
                const queue = getMergeQueue(key);
                return jsonResult({
                    projectKey: args.projectKey,
                    repoSlug: args.repoSlug,
                    queue,
                    total: queue.length,
                });
            } catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });

        server.registerTool("dequeuePullRequest", {
            description: "Remove a pull request from the repository merge queue (e.g. a blocked, declined or mistyped PR) and return the remaining queue",
            inputSchema: {
                projectKey: z.string().describe(DESC_PROJECT_KEY),
                repoSlug: z.string().describe(DESC_REPO_SLUG),
                prId: z.coerce.number().describe(DESC_PR_ID),
            },
        }, (args) => {
            try {
                const key = mergeQueueKey(args.projectKey, args.repoSlug);
                if (dequeuePullRequest(key, args.prId) === undefined) {
                    return { content: [{ type: "text", text: `PR #${String(args.prId)} is not in the merge queue for ${key}` }], isError: true };
                }
                const remainingQueue = getMergeQueue(key);
                return jsonResult({
                    projectKey: args.projectKey,
                    repoSlug: args.repoSlug,
                    prId: args.prId,
                    remainingQueue,
                    total: remainingQueue.length,
                });
            } catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });

        server.registerTool("processMergeQueue", {
            description: "Process queued pull requests in order: drop (and report as skipped) those that are no longer OPEN, merge those whose mergeability check passes, stopping at the first that cannot merge",
            inputSchema: {
                projectKey: z.string().describe(DESC_PROJECT_KEY),
                repoSlug: z.string().describe(DESC_REPO_SLUG),
                message: z.string().optional().describe("Optional commit message to use for merges"),
                strategy: z.enum(["merge-commit", "squash", "fast-forward"]).optional().describe("Merge strategy"),
            },
        }, async (args) => {
            const key = mergeQueueKey(args.projectKey, args.repoSlug);
            if (!tryAcquireProcessing(key)) {
                return { content: [{ type: "text", text: `processMergeQueue is already running for ${key}` }], isError: true };
            }
            const merged: Array<{ prId: number; result: unknown }> = [];
            const skipped: Array<{ prId: number; reason: string }> = [];
            let currentPrId: number | undefined;
            try {
                const client = getClient();

                while (true) {
                    const queue = getMergeQueue(key);
                    if (queue.length === 0) {
                        break;
                    }
                    const prId = queue[0];
                    currentPrId = prId;

                    const currentPr = await client.get<{ version?: number; state?: string }>(prPath(args.projectKey, args.repoSlug, prId));
                    const prState = currentPr.data.state;
                    if (typeof prState === "string" && prState !== "OPEN") {
                        // Declined/merged outside the queue: drop it instead of blocking the repo
                        dequeuePullRequest(key, prId);
                        skipped.push({ prId, reason: `state ${prState}` });
                        continue;
                    }

                    // Check mergeability: GET /projects/{projectKey}/repos/{repoSlug}/pull-requests/{id}/merge
                    const checkRes = await client.get<MergeabilityResponse>(`${prPath(args.projectKey, args.repoSlug, prId)}/merge`);
                    const mergeInfo = checkRes.data;

                    if (!mergeInfo.canMerge) {
                        // First PR that cannot merge: halt processing, leave it and subsequent PRs in queue, report it
                        return jsonResult({
                            status: "blocked",
                            blockedPrId: prId,
                            reason: mergeInfo,
                            merged,
                            skipped,
                            remainingQueue: getMergeQueue(key),
                        });
                    }

                    const mergeData: Record<string, unknown> = {
                        version: currentPr.data.version,
                    };
                    if (args.message !== undefined) {
                        mergeData.message = args.message;
                    }
                    if (args.strategy !== undefined) {
                        const strategyMap: Record<string, string> = {
                            "merge-commit": "no-ff",
                            "squash": "squash",
                            "fast-forward": "ff-only",
                        };
                        mergeData.strategyId = strategyMap[args.strategy] ?? args.strategy;
                    }

                    const mergeRes = await client.post(`${prPath(args.projectKey, args.repoSlug, prId)}/merge`, mergeData);

                    // Dequeue the merged PR
                    dequeuePullRequest(key, prId);
                    merged.push({ prId, result: mergeRes.data });
                }

                return jsonResult({
                    status: "completed",
                    merged,
                    skipped,
                    remainingQueue: getMergeQueue(key),
                });
            } catch (error) {
                return {
                    ...jsonResult({
                        status: "error",
                        error: formatError(error),
                        failedPrId: currentPrId,
                        merged,
                        skipped,
                        remainingQueue: getMergeQueue(key),
                    }),
                    isError: true,
                };
            } finally {
                releaseProcessing(key);
            }
        });
    },
};

export default mergeQueueModule;
