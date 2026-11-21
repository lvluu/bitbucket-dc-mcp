import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { repoArgs, pageArgs } from "#lib/params.js";
import { getClient, getOriginUrl, repoPath } from "#lib/client.js";
import { formatError, jsonResult } from "#lib/errors.js";
import { fetchPage, pageResult } from "#lib/pagination.js";
import { summarizeWebhook, summarizeArray } from "#lib/field-filter.js";


const webhooksModule = {
    type: "tool",
    name: "webhooks",
    description: "Bitbucket DC webhook operations",
    register(server: McpServer): void {
        server.registerTool("listRepositoryWebhooks", {
            description: "List repository webhooks",
            inputSchema: {
                ...repoArgs,
                ...pageArgs,
            },
        }, async (args) => {
            try {
                const client = getClient();
                const url = `${getOriginUrl()}/rest/webhooks/1.0${repoPath(args.projectKey, args.repoSlug)}/webhooks`;
                const result = await fetchPage(client, url, {
                    limit: args.limit,
                    start: args.start,
                    all: args.all,
                });
                const summaryValues = summarizeArray(result.values, summarizeWebhook);
                return jsonResult(pageResult(result, summaryValues));
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
    },
};

export default webhooksModule;
