import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { repoArgs, prArgs, pageArgs } from "#lib/params.js";
import { branchRef, getClient, prPath, repoPath, resolveProject } from "#lib/client.js";
import { formatError, jsonResult, textResult } from "#lib/errors.js";
import { fetchPage, pageResult } from "#lib/pagination.js";
import { summarizePullRequest, summarizeArray } from "#lib/field-filter.js";
// Shared description constants
const pullRequestsModule = {
    type: "tool",
    name: "pull-requests",
    description: "Bitbucket DC pull request operations",
    register(server: McpServer): void {
        server.registerTool("listPullRequests", {
            description: "List pull requests for a repository",
            inputSchema: {
                ...repoArgs,
                state: z.enum(["OPEN", "MERGED", "DECLINED", "ALL"]).optional(),
                direction: z.enum(["INCOMING", "OUTGOING"]).optional(),
                at: z.string().optional().describe("Full ref, e.g. refs/heads/main"),
                ...pageArgs,
            },
        }, async (args) => {
            try {
                const client = getClient();
                const params: Record<string, unknown> = {};
                if (args.state !== undefined)
                    params.state = args.state;
                if (args.direction !== undefined)
                    params.direction = args.direction;
                if (args.at !== undefined)
                    params.at = branchRef(args.at);
                const result = await fetchPage(client, `${repoPath(args.projectKey, args.repoSlug)}/pull-requests`, {
                    limit: args.limit,
                    start: args.start,
                    all: args.all,
                    params,
                });
                const summaryValues = summarizeArray(result.values, summarizePullRequest);
                return jsonResult(pageResult(result, summaryValues));
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
        server.registerTool("getPullRequest", {
            description: "Get a pull request",
            inputSchema: {
                ...prArgs,
            },
        }, async (args) => {
            try {
                const client = getClient();
                const response = await client.get(prPath(args.projectKey, args.repoSlug, args.prId));
                return jsonResult(summarizePullRequest(response.data));
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
        server.registerTool("createPullRequest", {
            description: "Create a pull request (from a fork: set sourceProjectKey/sourceRepoSlug)",
            inputSchema: {
                ...repoArgs,
                sourceProjectKey: z.string().optional().describe("Fork project, e.g. ~USER"),
                sourceRepoSlug: z.string().optional().describe("Fork repo slug"),
                title: z.string(),
                description: z.string().optional(),
                sourceBranch: z.string(),
                targetBranch: z.string(),
                reviewers: z.array(z.string()).optional(),
                draft: z.boolean().optional().describe("Create as draft PR"),
            },
        }, async (args) => {
            try {
                const client = getClient();
                const target = { slug: args.repoSlug, project: { key: resolveProject(args.projectKey) } };
                const source = args.sourceProjectKey === undefined && args.sourceRepoSlug === undefined
                    ? target
                    : { slug: args.sourceRepoSlug ?? args.repoSlug, project: { key: args.sourceProjectKey ?? target.project.key } };
                const payload: Record<string, unknown> = {
                    title: args.title,
                    description: args.description ?? "",
                    fromRef: { id: branchRef(args.sourceBranch), repository: source },
                    toRef: { id: branchRef(args.targetBranch), repository: target },
                };
                if (args.reviewers != null && args.reviewers.length > 0) {
                    payload.reviewers = args.reviewers
                        .filter((name) => name.trim().length > 0)
                        .map((name) => ({ user: { name: name.trim() } }));
                }
                if (args.draft === true) {
                    payload.draft = true;
                }
                const response = await client.post(`${repoPath(args.projectKey, args.repoSlug)}/pull-requests`, payload);
                return jsonResult(response.data);
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
        server.registerTool("updatePullRequest", {
            description: "Update a pull request's title, description, target branch or reviewers",
            inputSchema: {
                ...prArgs,
                title: z.string().optional(),
                description: z.string().optional(),
                targetBranch: z.string().optional(),
                reviewers: z.array(z.string()).optional().describe("Replaces the reviewer list"),
            },
        }, async (args) => {
            try {
                const client = getClient();
                // Fetch current PR for optimistic locking version and to preserve fields.
                // Reviewers are re-sent when not given: DC does not document that an absent list keeps them.
                const current = await client.get(prPath(args.projectKey, args.repoSlug, args.prId));
                const currentData = current.data;
                const data = {
                    title: args.title ?? currentData.title,
                    description: args.description ?? currentData.description,
                    version: currentData.version,
                    toRef: args.targetBranch === undefined ? currentData.toRef : { id: branchRef(args.targetBranch), repository: currentData.toRef?.repository },
                    reviewers: args.reviewers === undefined
                        ? currentData.reviewers
                        : args.reviewers.map((name) => name.trim()).filter((name) => name !== "").map((name) => ({ user: { name } })),
                };
                const response = await client.put(prPath(args.projectKey, args.repoSlug, args.prId), data);
                return jsonResult(response.data);
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
        server.registerTool("mergePullRequest", {
            description: "Merge a pull request",
            inputSchema: {
                ...prArgs,
                message: z.string().optional().describe("Merge commit message"),
                strategy: z.enum(["merge-commit", "squash", "fast-forward"]).optional(),
            },
        }, async (args) => {
            try {
                const client = getClient();
                const current = await client.get(prPath(args.projectKey, args.repoSlug, args.prId));
                const data: Record<string, unknown> = {
                    version: current.data.version,
                };
                if (args.message !== undefined)
                    data.message = args.message;
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
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
        server.registerTool("declinePullRequest", {
            description: "Decline a pull request",
            inputSchema: {
                ...prArgs,
                message: z.string().optional().describe("Reason for declining"),
            },
        }, async (args) => {
            try {
                const client = getClient();
                const current = await client.get(prPath(args.projectKey, args.repoSlug, args.prId));
                const data: Record<string, unknown> = {
                    version: current.data.version,
                };
                if (args.message !== undefined)
                    data.comment = { text: args.message };
                const response = await client.post(`${prPath(args.projectKey, args.repoSlug, args.prId)}/decline`, data);
                return jsonResult(response.data);
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
        server.registerTool("reopenPullRequest", {
            description: "Reopen a declined PR",
            inputSchema: {
                ...prArgs,
            },
        }, async (args) => {
            try {
                const client = getClient();
                const current = await client.get(prPath(args.projectKey, args.repoSlug, args.prId));
                const data = {
                    version: current.data.version,
                };
                const response = await client.post(`${prPath(args.projectKey, args.repoSlug, args.prId)}/reopen`, data);
                return jsonResult(response.data);
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
        server.registerTool("approvePullRequest", {
            description: "Approve a pull request",
            inputSchema: {
                ...prArgs,
            },
        }, async (args) => {
            try {
                const client = getClient();
                const response = await client.post(`${prPath(args.projectKey, args.repoSlug, args.prId)}/approve`);
                return jsonResult(response.data);
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
        server.registerTool("unapprovePullRequest", {
            description: "Remove your PR approval",
            inputSchema: {
                ...prArgs,
            },
        }, async (args) => {
            try {
                const client = getClient();
                await client.delete(`${prPath(args.projectKey, args.repoSlug, args.prId)}/approve`);
                return textResult("Pull request approval removed successfully.");
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
        server.registerTool("markPullRequestAsDraft", {
            description: "Set or clear PR draft status",
            inputSchema: {
                ...prArgs,
                draft: z.boolean().describe("true to mark as draft, false to remove draft status"),
            },
        }, async (args) => {
            try {
                const client = getClient();
                const current = await client.get(prPath(args.projectKey, args.repoSlug, args.prId));
                const currentData = current.data;
                const response = await client.put(prPath(args.projectKey, args.repoSlug, args.prId), {
                    title: currentData.title,
                    description: currentData.description,
                    version: currentData.version,
                    toRef: currentData.toRef,
                    reviewers: currentData.reviewers,
                    draft: args.draft,
                });
                return jsonResult(response.data);
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
        server.registerTool("canMergePullRequest", {
            description: "Check whether a PR can merge",
            inputSchema: {
                ...prArgs,
            },
        }, async (args) => {
            try {
                const client = getClient();
                const response = await client.get(`${prPath(args.projectKey, args.repoSlug, args.prId)}/merge`);
                return jsonResult(response.data);
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
        server.registerTool("addPullRequestReviewers", {
            description: "Add reviewers to a pull request.",
            inputSchema: {
                ...prArgs,
                reviewers: z.array(z.string()).min(1).describe("Usernames"),
            },
        }, async (args) => {
            try {
                const client = getClient();
                const results = [];
                const errors = [];
                // Add each reviewer individually via the participants endpoint
                for (const username of args.reviewers) {
                    const trimmedUsername = username.trim();
                    if (trimmedUsername.length === 0)
                        continue;
                    try {
                        const payload = {
                            user: { name: trimmedUsername },
                            role: "REVIEWER",
                        };
                        const response = await client.post(`${prPath(args.projectKey, args.repoSlug, args.prId)}/participants`, payload);
                        results.push({ username: trimmedUsername, success: true, data: response.data });
                    }
                    catch (error) {
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
                    return { ...jsonResult(summary), isError: true };
                }
                return jsonResult(summary);
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
        server.registerTool("removePullRequestReviewer", {
            description: "Remove a PR reviewer",
            inputSchema: {
                ...prArgs,
                username: z.string().describe("Username"),
            },
        }, async (args) => {
            try {
                const client = getClient();
                await client.delete(`${prPath(args.projectKey, args.repoSlug, args.prId)}/participants/${encodeURIComponent(args.username)}`);
                return textResult(`Reviewer '${args.username}' removed from pull request ${String(args.prId)}.`);
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
    },
};
export default pullRequestsModule;
