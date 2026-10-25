import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getClient, getConfig, getOriginUrl } from "#lib/client.js";
import { formatError, jsonResult } from "#lib/errors.js";
import { fetchPage, pageResult } from "#lib/pagination.js";
import { summarizeWebhook, summarizeArray } from "#lib/field-filter.js";

const DESC_PROJECT_KEY = "Project key (uses BITBUCKET_DEFAULT_PROJECT if not set)";
const DESC_REPO_SLUG = "Repository slug";

const webhooksModule = {
    type: "tool",
    name: "webhooks",
    description: "Bitbucket DC webhook operations",
    register(server: McpServer): void {
        server.registerTool("listRepositoryWebhooks", {
            description: "List webhooks for a repository in Bitbucket DC",
            inputSchema: {
                projectKey: z.string().optional().describe(DESC_PROJECT_KEY),
                repoSlug: z.string().describe(DESC_REPO_SLUG),
                limit: z.coerce.number().optional().describe("Number of items per page (default 25, max 100)"),
                start: z.coerce.number().optional().describe("Start index for pagination"),
                all: z.boolean().optional().describe("Fetch all pages (up to 1000 items)"),
            },
        }, async (args) => {
            try {
                const client = getClient();
                const config = getConfig();
                const project = args.projectKey ?? config.defaultProject;
                if (project === undefined) {
                    return { content: [{ type: "text", text: "projectKey is required (or set BITBUCKET_DEFAULT_PROJECT)" }], isError: true };
                }
                const url = `${getOriginUrl()}/rest/webhooks/1.0/projects/${encodeURIComponent(project)}/repos/${encodeURIComponent(args.repoSlug)}/webhooks`;
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
