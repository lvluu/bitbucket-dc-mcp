import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { prArgs, pageArgs } from "#lib/params.js";
import type { PrActivity, PrComment } from "#lib/types.js";
import { getClient, prPath } from "#lib/client.js";
import { formatError, jsonResult, textResult } from "#lib/errors.js";
import { fetchFiltered, pageResult } from "#lib/pagination.js";
import { summarizeArray, summarizeComment } from "#lib/field-filter.js";
import { hasActiveReview, addPendingComment, reviewKey } from "#lib/review-state.js";
// Shared description constants
const prCommentsModule = {
    type: "tool",
    name: "pr-comments",
    description: "Bitbucket DC pull request comment operations",
    register(server: McpServer): void {
        server.registerTool("listPRComments", {
            description: "List PR comments (default: unresolved only).",
            inputSchema: {
                ...prArgs,
                state: z.enum(["UNRESOLVED", "RESOLVED", "ALL"]).optional().describe("Default UNRESOLVED"),
                ...pageArgs,
            },
        }, async (args) => {
            try {
                const client = getClient();
                const state = args.state ?? "UNRESOLVED";
                const result = await fetchFiltered<PrActivity, PrComment>(client, `${prPath(args.projectKey, args.repoSlug, args.prId)}/activities`, (a) => {
                    if (a.action !== "COMMENTED" || a.comment == null)
                        return undefined;
                    const c = a.comment as PrComment;
                    if (state === "ALL")
                        return c;
                    if (state === "RESOLVED")
                        return c.threadResolved === true ? c : undefined;
                    return c.threadResolved !== true ? c : undefined; // UNRESOLVED: not resolved or no threadResolved property
                }, { limit: args.limit, start: args.start, all: args.all });
                const summaryValues = summarizeArray(result.values, summarizeComment);
                return jsonResult(pageResult(result, summaryValues));
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
        server.registerTool("addPRComment", {
            description: "Add a general or inline PR comment (buffered while this session has a review open).",
            inputSchema: {
                ...prArgs,
                text: z.string(),
                parentId: z.coerce.number().optional().describe("Reply to this comment"),
                anchorPath: z.string().optional().describe("Inline: file path"),
                anchorLine: z.coerce.number().optional().describe("Inline: line"),
                anchorLineType: z.enum(["ADDED", "REMOVED", "CONTEXT"]).optional().describe("Line type for inline comment"),
                anchorFileType: z.enum(["FROM", "TO"]).optional().describe("FROM=old, TO=new file"),
                severity: z.enum(["NORMAL", "BLOCKER"]).optional().describe("BLOCKER = task"),
            },
        }, async (args) => {
            try {
                const body: Record<string, unknown> = { text: args.text };
                if (args.parentId !== undefined) {
                    body.parent = { id: args.parentId };
                }
                if (args.anchorPath !== undefined) {
                    const anchor: Record<string, unknown> = {
                        path: args.anchorPath,
                        diffType: "EFFECTIVE",
                    };
                    if (args.anchorLine !== undefined)
                        anchor.line = args.anchorLine;
                    if (args.anchorLineType !== undefined)
                        anchor.lineType = args.anchorLineType;
                    if (args.anchorFileType !== undefined)
                        anchor.fileType = args.anchorFileType;
                    body.anchor = anchor;
                }
                if (args.severity !== undefined) {
                    body.severity = args.severity;
                }
                // If a review session is active, buffer the comment instead of posting
                const key = reviewKey(args.projectKey, args.repoSlug, args.prId);
                if (hasActiveReview(key, server)) {
                    const index = addPendingComment(key, server, body);
                    return jsonResult({ state: "PENDING", pendingIndex: index, text: args.text });
                }
                const client = getClient();
                const response = await client.post(`${prPath(args.projectKey, args.repoSlug, args.prId)}/comments`, body);
                return jsonResult(response.data);
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
        server.registerTool("getPRComment", {
            description: "Get a specific pull request comment by ID",
            inputSchema: {
                ...prArgs,
                commentId: z.coerce.number(),
            },
        }, async (args) => {
            try {
                const client = getClient();
                const response = await client.get(`${prPath(args.projectKey, args.repoSlug, args.prId)}/comments/${String(args.commentId)}`);
                return jsonResult(response.data);
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
        server.registerTool("updatePRComment", {
            description: "Update a pull request comment",
            inputSchema: {
                ...prArgs,
                commentId: z.coerce.number(),
                text: z.string(),
                version: z.coerce.number(),
            },
        }, async (args) => {
            try {
                const client = getClient();
                const response = await client.put(`${prPath(args.projectKey, args.repoSlug, args.prId)}/comments/${String(args.commentId)}`, { text: args.text, version: args.version });
                return jsonResult(response.data);
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
        server.registerTool("resolvePRComment", {
            description: "Resolve a PR comment thread",
            inputSchema: {
                ...prArgs,
                commentId: z.coerce.number().describe("Root comment of the thread"),
                version: z.coerce.number(),
            },
        }, async (args) => {
            try {
                const client = getClient();
                const response = await client.put(`${prPath(args.projectKey, args.repoSlug, args.prId)}/comments/${String(args.commentId)}`, { threadResolved: true, version: args.version });
                return jsonResult(response.data);
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
        server.registerTool("reopenPRComment", {
            description: "Reopen a resolved PR comment thread",
            inputSchema: {
                ...prArgs,
                commentId: z.coerce.number().describe("Root comment of the thread"),
                version: z.coerce.number(),
            },
        }, async (args) => {
            try {
                const client = getClient();
                const response = await client.put(`${prPath(args.projectKey, args.repoSlug, args.prId)}/comments/${String(args.commentId)}`, { threadResolved: false, version: args.version });
                return jsonResult(response.data);
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
        server.registerTool("deletePRComment", {
            description: "Delete a pull request comment (requires BITBUCKET_ENABLE_DANGEROUS=true)",
            inputSchema: {
                ...prArgs,
                commentId: z.coerce.number(),
                version: z.coerce.number(),
            },
        }, async (args) => {
            try {
                const { getConfig } = await import("../lib/client.js");
                const config = getConfig();
                if (!config.enableDangerous) {
                    return { content: [{ type: "text", text: "deletePRComment is disabled. Set BITBUCKET_ENABLE_DANGEROUS=true to enable." }], isError: true };
                }
                const client = getClient();
                await client.delete(`${prPath(args.projectKey, args.repoSlug, args.prId)}/comments/${String(args.commentId)}`, { params: { version: args.version } });
                return textResult("Comment deleted successfully.");
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
    },
};
export default prCommentsModule;
