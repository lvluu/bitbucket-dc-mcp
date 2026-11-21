import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getClient, initClient } from "#lib/client.js";
import type { ToolResult } from "#lib/errors.js";
import pullRequestsModule from "./pull-requests.js";

type Handler = (args: Record<string, unknown>) => ToolResult | Promise<ToolResult>;
const handlers = new Map<string, Handler>();

beforeAll(() => {
    initClient({ baseUrl: "http://bitbucket.invalid/rest/api/latest", token: "t", username: undefined, password: undefined, defaultProject: undefined, enableDangerous: false, timeoutMs: 30_000 });
    const fakeServer = {
        registerTool: (name: string, _config: unknown, handler: Handler) => handlers.set(name, handler),
    } as unknown as McpServer;
    pullRequestsModule.register(fakeServer);
});

const client = () => getClient() as unknown as Record<string, unknown>;
let originalPost: unknown;
afterEach(() => {
    if (originalPost !== undefined) client().post = originalPost;
    originalPost = undefined;
});

describe("addPullRequestReviewers", () => {
    test("all-failed result is squeezed compact JSON flagged isError", async () => {
        originalPost = client().post;
        client().post = mock(() => Promise.reject(new Error("boom")));
        const handler = handlers.get("addPullRequestReviewers");
        if (handler === undefined) throw new Error("addPullRequestReviewers not registered");
        const result = await handler({ projectKey: "PROJ", repoSlug: "repo", prId: 7, reviewers: ["alice"] });
        const body = result.content[0]?.text ?? "";
        expect(result.isError).toBe(true);
        expect(body).not.toContain("\n");
        expect(JSON.parse(body)).toMatchObject({ failed: 1, errors: [{ username: "alice", error: "boom" }] });
    });
});

describe("default project (#54)", () => {
    const withDefault = (defaultProject: string | undefined) =>
        initClient({ baseUrl: "http://bitbucket.invalid/rest/api/latest", token: "t", username: undefined, password: undefined, defaultProject, enableDangerous: false, timeoutMs: 30_000 });
    afterEach(() => withDefault(undefined));
    const run = (name: string, args: Record<string, unknown>) => {
        const handler = handlers.get(name);
        if (handler === undefined) throw new Error(`${name} not registered`);
        return handler(args);
    };

    test("listPullRequests without projectKey uses BITBUCKET_DEFAULT_PROJECT", async () => {
        withDefault("PROJ");
        const get = mock(() => Promise.resolve({ data: { values: [], isLastPage: true } }));
        client().get = get;
        await run("listPullRequests", { repoSlug: "r" });
        expect((get.mock.calls[0] as unknown[])[0]).toBe("/projects/PROJ/repos/r/pull-requests");
    });
    test("an explicit projectKey wins over the default", async () => {
        withDefault("PROJ");
        const get = mock(() => Promise.resolve({ data: { values: [], isLastPage: true } }));
        client().get = get;
        await run("listPullRequests", { projectKey: "OTHER", repoSlug: "r" });
        expect((get.mock.calls[0] as unknown[])[0]).toBe("/projects/OTHER/repos/r/pull-requests");
    });
    test("no projectKey and no default returns one clear line", async () => {
        withDefault(undefined);
        const result = await run("listPullRequests", { repoSlug: "r" });
        expect(result.isError).toBe(true);
        expect(result.content[0]?.text).toBe("projectKey is required (or set BITBUCKET_DEFAULT_PROJECT)");
    });
});
