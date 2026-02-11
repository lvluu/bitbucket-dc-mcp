import { z } from "zod";
import { getClient } from "../lib/client.js";
import { formatError, jsonResult } from "../lib/errors.js";
import { fetchPage } from "../lib/pagination.js";
import type { RegisterableModule } from "../registry/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const projectsModule: RegisterableModule = {
  type: "tool",
  name: "projects",
  description: "Bitbucket DC project operations",
  register(server: McpServer) {
    server.registerTool(
      "listProjects",
      {
        description: "List Bitbucket Data Center projects",
        inputSchema: {
        name: z.string().optional().describe("Filter projects by name (partial match)"),
        limit: z.coerce.number().optional().describe("Number of items per page (default 25, max 100)"),
        start: z.coerce.number().optional().describe("Start index for pagination"),
        all: z.boolean().optional().describe("Fetch all pages (up to 1000 items)"),
      },
      },
      async (args) => {
        try {
          const client = getClient();
          const params: Record<string, unknown> = {};
          if (args.name !== undefined) params.name = args.name;
          const result = await fetchPage(client, "/projects", {
            limit: args.limit,
            start: args.start,
            all: args.all,
            params,
          });
          return jsonResult(result.values);
        } catch (error) {
          return { content: [{ type: "text" as const, text: formatError(error) }], isError: true };
        }
      }
    );

    server.registerTool(
      "getProject",
      {
        description: "Get details of a specific Bitbucket DC project",
        inputSchema: {
        projectKey: z.string().describe("The project key (e.g. PROJ)"),
      },
      },
      async (args) => {
        try {
          const client = getClient();
          const response = await client.get(`/projects/${args.projectKey}`);
          return jsonResult(response.data);
        } catch (error) {
          return { content: [{ type: "text" as const, text: formatError(error) }], isError: true };
        }
      }
    );

    server.registerTool(
      "createProject",
      {
        description: "Create a new Bitbucket DC project",
        inputSchema: {
        key: z.string().describe("Project key (e.g. PROJ)"),
        name: z.string().describe("Project name"),
        description: z.string().optional().describe("Project description"),
      },
      },
      async (args) => {
        try {
          const client = getClient();
          const response = await client.post("/projects", {
            key: args.key,
            name: args.name,
            description: args.description,
          });
          return jsonResult(response.data);
        } catch (error) {
          return { content: [{ type: "text" as const, text: formatError(error) }], isError: true };
        }
      }
    );

    server.registerTool(
      "updateProject",
      {
        description: "Update an existing Bitbucket DC project",
        inputSchema: {
        projectKey: z.string().describe("The project key"),
        name: z.string().optional().describe("New project name"),
        description: z.string().optional().describe("New project description"),
      },
      },
      async (args) => {
        try {
          const client = getClient();
          const data: Record<string, unknown> = {};
          if (args.name !== undefined) data.name = args.name;
          if (args.description !== undefined) data.description = args.description;
          const response = await client.put(`/projects/${args.projectKey}`, data);
          return jsonResult(response.data);
        } catch (error) {
          return { content: [{ type: "text" as const, text: formatError(error) }], isError: true };
        }
      }
    );
  },
};

export default projectsModule;
