import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { prArgs, pageArgs, anchorArgs, buildAnchor } from "#lib/params.js";
import { summarizeArray, summarizeComment } from "#lib/field-filter.js";
import type { PrActivity, PrComment } from "#lib/types.js";
import { getClient, prPath } from "#lib/client.js";
import { formatError, jsonResult } from "#lib/errors.js";
import { fetchFiltered, pageResult } from "#lib/pagination.js";
// Shared description constants
const prTasksModule = {
    type: "tool",
    name: "pr-tasks",
    description: "Bitbucket DC pull request task operations (blocker comments)",
    register(server: McpServer): void {
        server.registerTool("listPRTasks", {
            description: "List PR tasks (blocker comments)",
            inputSchema: {
                ...prArgs,
                ...pageArgs,
            },
        }, async (args) => {
            try {
                const client = getClient();
                // In DC, tasks are blocker comments. Fetch activities and filter.
                const result = await fetchFiltered<PrActivity, PrComment>(client, `${prPath(args.projectKey, args.repoSlug, args.prId)}/activities`, (a) => a.action === "COMMENTED" && a.comment != null && a.comment.severity === "BLOCKER" ? a.comment as PrComment : undefined, { limit: args.limit, start: args.start, all: args.all });
                return jsonResult(pageResult(result, summarizeArray(result.values, summarizeComment)));
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
        server.registerTool("addBlockerComment", {
            description: "Add a blocker comment (task) to a pull request",
            inputSchema: {
                ...prArgs,
                text: z.string(),
                ...anchorArgs,
            },
        }, async (args) => {
            try {
                const client = getClient();
                const body: Record<string, unknown> = {
                    text: args.text,
                    severity: "BLOCKER",
                };
                const anchor = buildAnchor(args);
                if (anchor !== undefined)
                    body.anchor = anchor;
                const response = await client.post(`${prPath(args.projectKey, args.repoSlug, args.prId)}/comments`, body);
                return jsonResult(response.data);
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
        server.registerTool("resolveTask", {
            description: "Resolve a task (blocker comment)",
            inputSchema: {
                ...prArgs,
                commentId: z.coerce.number().describe("Comment/task ID"),
                version: z.coerce.number(),
            },
        }, async (args) => {
            try {
                const client = getClient();
                const response = await client.put(`${prPath(args.projectKey, args.repoSlug, args.prId)}/comments/${String(args.commentId)}`, { state: "RESOLVED", version: args.version });
                return jsonResult(response.data);
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
        server.registerTool("reopenTask", {
            description: "Reopen a resolved task",
            inputSchema: {
                ...prArgs,
                commentId: z.coerce.number().describe("Comment/task ID"),
                version: z.coerce.number(),
            },
        }, async (args) => {
            try {
                const client = getClient();
                const response = await client.put(`${prPath(args.projectKey, args.repoSlug, args.prId)}/comments/${String(args.commentId)}`, { state: "OPEN", version: args.version });
                return jsonResult(response.data);
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
    },
};
export default prTasksModule;
