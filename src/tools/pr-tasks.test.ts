import { beforeAll, describe, expect, mock, test } from "bun:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getClient, initClient } from "#lib/client.js";
import type { ToolResult } from "#lib/errors.js";
import prTasksModule from "./pr-tasks.js";

type Handler = (args: Record<string, unknown>) => ToolResult | Promise<ToolResult>;
const handlers = new Map<string, Handler>();

beforeAll(() => {
    initClient({ baseUrl: "http://bitbucket.invalid/rest/api/latest", token: "t", username: undefined, password: undefined, defaultProject: undefined, enableDangerous: false, timeoutMs: 30_000 });
    prTasksModule.register({
        registerTool: (name: string, _config: unknown, handler: Handler) => handlers.set(name, handler),
    } as unknown as McpServer);
});

describe("addBlockerComment anchor (#52)", () => {
    test("sends line type and file type like addPRComment", async () => {
        const client = getClient() as unknown as Record<string, unknown>;
        const original = client.post;
        const post = mock(() => Promise.resolve({ data: {} }));
        client.post = post;
        try {
            await handlers.get("addBlockerComment")?.({ projectKey: "PROJ", repoSlug: "repo", prId: 7, text: "t", anchorPath: "a.ts", anchorLine: 4, anchorLineType: "REMOVED", anchorFileType: "FROM" });
        }
        finally {
            client.post = original;
        }
        expect((post.mock.calls[0] as unknown[])[1]).toEqual({
            text: "t",
            severity: "BLOCKER",
            anchor: { path: "a.ts", diffType: "EFFECTIVE", line: 4, lineType: "REMOVED", fileType: "FROM" },
        });
    });
});
