import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { repoArgs, pageArgs } from "#lib/params.js";
import { getClient, repoFilePath, repoPath } from "#lib/client.js";
import { formatError, jsonResult, textResult } from "#lib/errors.js";
import { fetchPage, pageResult } from "#lib/pagination.js";
// Shared description constants
const DESC_BRANCH_TAG_COMMIT = "Branch, tag, or commit hash";
/** UTF-8 text as is; binary (NUL byte or invalid UTF-8) as a one-line note, so no garbage reaches the model. */
export function decodeText(bytes: Uint8Array, contentType: string): string {
    const note = `binary file, ${String(bytes.length)} bytes, ${contentType}`;
    if (bytes.includes(0))
        return note;
    try {
        return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    }
    catch {
        return note;
    }
}
const filesModule = {
    type: "tool",
    name: "files",
    description: "Bitbucket DC file browsing and content operations",
    register(server: McpServer): void {
        server.registerTool("browseFiles", {
            description: "List a directory",
            inputSchema: {
                ...repoArgs,
                path: z.string().optional().default("").describe("Path within the repository"),
                at: z.string().optional().describe("Branch, tag or commit"),
                limit: z.coerce.number().optional(),
                start: z.coerce.number().optional(),
            },
        }, async (args) => {
            try {
                const client = getClient();
                const params: Record<string, unknown> = {};
                if (args.at !== undefined)
                    params.at = args.at;
                const response = await client.get(repoFilePath(args.projectKey, args.repoSlug, "browse", args.path), { params: { ...params, limit: args.limit, start: args.start } });
                return jsonResult(response.data);
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
        server.registerTool("getFileContent", {
            description: "Get raw content of a file",
            inputSchema: {
                ...repoArgs,
                path: z.string().describe("File path"),
                at: z.string().optional().describe(DESC_BRANCH_TAG_COMMIT),
            },
        }, async (args) => {
            try {
                const client = getClient();
                const params: Record<string, unknown> = {};
                if (args.at !== undefined)
                    params.at = args.at;
                const response = await client.get<ArrayBuffer>(repoFilePath(args.projectKey, args.repoSlug, "raw", args.path), { params, responseType: "arraybuffer", headers: { Accept: "application/octet-stream" } });
                return textResult(decodeText(new Uint8Array(response.data), String(response.headers["content-type"] ?? "unknown type")));
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
        server.registerTool("editFile", {
            description: "Create or update a file (commits it)",
            inputSchema: {
                ...repoArgs,
                path: z.string(),
                content: z.string().describe("New file content"),
                message: z.string(),
                branch: z.string().describe("Branch to commit to"),
                sourceCommitId: z.string().optional().describe("Required to update an existing file"),
            },
        }, async (args) => {
            try {
                const client = getClient();
                // DC uses multipart form for file edits via PUT to /browse/{path}
                const formData = new FormData();
                formData.append("content", args.content);
                formData.append("message", args.message);
                formData.append("branch", args.branch);
                if (args.sourceCommitId !== undefined) {
                    formData.append("sourceCommitId", args.sourceCommitId);
                }
                const response = await client.put(repoFilePath(args.projectKey, args.repoSlug, "browse", args.path), formData, { headers: { "Content-Type": "multipart/form-data" } });
                return jsonResult(response.data);
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
        server.registerTool("listFiles", {
            description: "List all file paths in a repository",
            inputSchema: {
                ...repoArgs,
                at: z.string().optional().describe(DESC_BRANCH_TAG_COMMIT),
                ...pageArgs,
            },
        }, async (args) => {
            try {
                const client = getClient();
                const params: Record<string, unknown> = {};
                if (args.at !== undefined)
                    params.at = args.at;
                const result = await fetchPage(client, `${repoPath(args.projectKey, args.repoSlug)}/files`, { limit: args.limit, start: args.start, all: args.all, params });
                return jsonResult(pageResult(result, result.values));
            }
            catch (error) {
                return { content: [{ type: "text", text: formatError(error) }], isError: true };
            }
        });
    },
};
export default filesModule;
