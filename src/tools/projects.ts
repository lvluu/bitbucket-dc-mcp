import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { pageArgs } from "#lib/params.js";
import { getClient, projectPath } from "#lib/client.js";
import { formatError, jsonResult } from "#lib/errors.js";
import { fetchPage, pageResult } from "#lib/pagination.js";
import { summarizeProject, summarizeArray } from "#lib/field-filter.js";
const projectsModule = {
    type: "tool",
    name: "projects",
    description: "Bitbucket DC project operations",
    register(server: McpServer): void {
        server.registerTool("listProjects", {
            description: "List projects",
            inputSchema: {
                name: z.string().optional().describe("Name contains"),
                ...pageArgs,
            },
        }, async (args) => {
            try {
                const client = getClient();
                const params: Record<string, unknown> = {};
                if (args.name !== undefined)
                    params.name = args.name;
                const result = await fetchPage(client, "/projects", {
                    limit: args.limit,
                    start: args.start,
                    all: args.all,
                    params,
                });
                const summaryValues = summarizeArray(result.values, summarizeProject);
                return jsonResult(pageResult(result, summaryValues));
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
        server.registerTool("getProject", {
            description: "Get a project",
            inputSchema: {
                projectKey: z.string().optional(),
            },
        }, async (args) => {
            try {
                const client = getClient();
                const response = await client.get(projectPath(args.projectKey));
                return jsonResult(response.data);
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
        server.registerTool("createProject", {
            description: "Create a project",
            inputSchema: {
                key: z.string().describe("Project key (e.g. PROJ)"),
                name: z.string(),
                description: z.string().optional(),
            },
        }, async (args) => {
            try {
                const client = getClient();
                const response = await client.post("/projects", {
                    key: args.key,
                    name: args.name,
                    description: args.description,
                });
                return jsonResult(response.data);
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
        server.registerTool("updateProject", {
            description: "Update a project",
            inputSchema: {
                projectKey: z.string().optional(),
                name: z.string().optional(),
                description: z.string().optional(),
            },
        }, async (args) => {
            try {
                const client = getClient();
                const data: Record<string, unknown> = {};
                if (args.name !== undefined)
                    data.name = args.name;
                if (args.description !== undefined)
                    data.description = args.description;
                const response = await client.put(projectPath(args.projectKey), data);
                return jsonResult(response.data);
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
    },
};
export default projectsModule;
