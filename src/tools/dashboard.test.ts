import { beforeAll, describe, expect, test } from "bun:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getClient, initClient } from "#lib/client.js";
import type { ToolResult } from "#lib/errors.js";
import dashboardModule from "./dashboard.js";

type Handler = (args: Record<string, unknown>) => ToolResult | Promise<ToolResult>;
const handlers = new Map<string, Handler>();

beforeAll(() => {
    initClient({ baseUrl: "http://bitbucket.invalid/rest/api/latest", token: "t", username: undefined, password: undefined, defaultProject: undefined, enableDangerous: false, timeoutMs: 30_000 });
    const fakeServer = {
        registerTool: (name: string, _config: unknown, handler: Handler) => handlers.set(name, handler),
    } as unknown as McpServer;
    dashboardModule.register(fakeServer);
});

const client = () => getClient() as unknown as Record<string, unknown>;
const run = (name: string, args: Record<string, unknown> = {}) => {
    const handler = handlers.get(name);
    if (handler === undefined) throw new Error(`${name} not registered`);
    return handler(args);
};
const parse = (res: ToolResult) => JSON.parse(res.content[0]?.text ?? "") as Record<string, unknown>;

const pr = (id: number) => ({
    id,
    title: `PR ${String(id)}`,
    state: "OPEN",
    draft: false,
    createdDate: 1,
    updatedDate: 2,
    author: { user: { name: "alice", displayName: "Alice" } },
    fromRef: { id: "refs/heads/feature", displayId: "feature" },
    toRef: { id: "refs/heads/main", displayId: "main" },
});

describe("listMyPullRequests", () => {
    test("calls the dashboard endpoint with role=AUTHOR and returns summarized PRs", async () => {
        const get = client().get;
        client().get = (_path: string, config: { params: Record<string, unknown> }) => {
            expect(config.params.role).toBe("AUTHOR");
            return Promise.resolve({ data: { values: [pr(1), pr(2)], isLastPage: true } });
        };
        try {
            const body = parse(await run("listMyPullRequests"));
            const values = body.values as Array<Record<string, unknown>>;
            expect(values).toHaveLength(2);
            expect(values[0]).toMatchObject({ id: 1, title: "PR 1", author: { name: "alice" } });
            expect(body.isLastPage).toBe(true);
        }
        finally {
            client().get = get;
        }
    });

    test("passes an explicit state filter", async () => {
        const get = client().get;
        client().get = (_path: string, config: { params: Record<string, unknown> }) => {
            expect(config.params.state).toBe("MERGED");
            return Promise.resolve({ data: { values: [pr(3)], isLastPage: true } });
        };
        try {
            const body = parse(await run("listMyPullRequests", { state: "MERGED" }));
            expect((body.values as Array<Record<string, unknown>>)).toHaveLength(1);
        }
        finally {
            client().get = get;
        }
    });

    test("propagates an API error", async () => {
        const get = client().get;
        client().get = () => Promise.reject(new Error("boom"));
        try {
            const res = await run("listMyPullRequests");
            expect(res.isError).toBe(true);
            expect(res.content[0]?.text).toBe("boom");
        }
        finally {
            client().get = get;
        }
    });
});

describe("listPullRequestsAwaitingMyReview", () => {
    test("calls the dashboard endpoint with role=REVIEWER and returns summarized PRs", async () => {
        const get = client().get;
        client().get = (_path: string, config: { params: Record<string, unknown> }) => {
            expect(config.params.role).toBe("REVIEWER");
            return Promise.resolve({ data: { values: [pr(7)], isLastPage: true } });
        };
        try {
            const body = parse(await run("listPullRequestsAwaitingMyReview"));
            const values = body.values as Array<Record<string, unknown>>;
            expect(values).toHaveLength(1);
            expect(values[0]).toMatchObject({ id: 7 });
            expect(body.isLastPage).toBe(true);
        }
        finally {
            client().get = get;
        }
    });
});