import { beforeAll, describe, expect, mock, test } from "bun:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getClient, initClient } from "#lib/client.js";
import type { ToolResult } from "#lib/errors.js";
import prCommentsModule from "./pr-comments.js";

type Handler = (args: Record<string, unknown>) => ToolResult | Promise<ToolResult>;
const handlers = new Map<string, Handler>();

beforeAll(() => {
    initClient({ baseUrl: "http://bitbucket.invalid/rest/api/latest", token: "t", username: undefined, password: undefined, defaultProject: undefined, enableDangerous: false, timeoutMs: 30_000 });
    prCommentsModule.register({
        registerTool: (name: string, _config: unknown, handler: Handler) => handlers.set(name, handler),
    } as unknown as McpServer);
});

const client = () => getClient() as unknown as Record<string, unknown>;
const ARGS = { projectKey: "PROJ", repoSlug: "repo", prId: 7 };
const resolved = (id: number) => ({ action: "COMMENTED", comment: { id, text: "done", threadResolved: true } });
const open = (id: number) => ({ action: "COMMENTED", comment: { id, text: "todo" } });

async function listWith(pages: Record<number, unknown>, args: Record<string, unknown>) {
    const get = mock((_url: string, config: { params: Record<string, unknown> }) => Promise.resolve({ data: pages[(config.params.start as number | undefined) ?? 0] }));
    const original = client().get;
    client().get = get;
    try {
        const handler = handlers.get("listPRComments");
        if (handler === undefined) throw new Error("listPRComments not registered");
        const result = await handler({ ...ARGS, ...args });
        const first = result.content[0];
        return { body: JSON.parse(first?.type === "text" ? first.text : "{}") as Record<string, unknown>, get };
    }
    finally {
        client().get = original;
    }
}

describe("listPRComments paging", () => {
    test("pages past an activities page with no unresolved comments", async () => {
        const { body, get } = await listWith({
            0: { values: [resolved(1), resolved(2)], isLastPage: false, nextPageStart: 2 },
            2: { values: [open(3)], isLastPage: true },
        }, {});
        expect((body.values as { id: number }[]).map((c) => c.id)).toEqual([3]);
        expect(body.isLastPage).toBe(true);
        expect(get).toHaveBeenCalledTimes(2);
    });

    test("exposes nextPageStart when more activities remain", async () => {
        const { body } = await listWith({
            0: { values: [open(1)], isLastPage: false, nextPageStart: 25 },
        }, { limit: 1 });
        expect(body.isLastPage).toBe(false);
        expect(body.nextPageStart).toBe(25);
    });
});
