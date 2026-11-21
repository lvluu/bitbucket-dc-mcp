import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { prArgs, pageArgs } from "#lib/params.js";
import { getClient, prPath } from "#lib/client.js";
import { formatError, jsonResult } from "#lib/errors.js";
import { fetchPage, pageResult } from "#lib/pagination.js";
import { summarizeActivity, summarizeArray } from "#lib/field-filter.js";
// Shared description constants
const prActivityModule = {
    type: "tool",
    name: "pr-activity",
    description: "Bitbucket DC pull request activity and commit operations",
    register(server: McpServer): void {
        server.registerTool("getPullRequestActivity", {
            description: "Get the PR activity feed",
            inputSchema: {
                ...prArgs,
                ...pageArgs,
            },
        }, async (args) => {
            try {
                const client = getClient();
                const result = await fetchPage(client, `${prPath(args.projectKey, args.repoSlug, args.prId)}/activities`, { limit: args.limit, start: args.start, all: args.all });
                const summaryValues = summarizeArray(result.values, summarizeActivity);
                return jsonResult(pageResult(result, summaryValues));
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
        server.registerTool("getPullRequestCommits", {
            description: "Get commits in a pull request",
            inputSchema: {
                ...prArgs,
                ...pageArgs,
            },
        }, async (args) => {
            try {
                const client = getClient();
                const result = await fetchPage(client, `${prPath(args.projectKey, args.repoSlug, args.prId)}/commits`, { limit: args.limit, start: args.start, all: args.all });
                return jsonResult(pageResult(result, result.values));
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
        server.registerTool("getPullRequestParticipants", {
            description: "Get PR participants",
            inputSchema: {
                ...prArgs,
            },
        }, async (args) => {
            try {
                const client = getClient();
                const response = await client.get(`${prPath(args.projectKey, args.repoSlug, args.prId)}/participants`);
                return jsonResult(response.data);
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
    },
};
export default prActivityModule;
