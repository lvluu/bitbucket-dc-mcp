import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getClient, initClient } from "#lib/client.js";
import type { ToolResult } from "#lib/errors.js";
import repositoryInsightsModule from "./repository-insights.js";

type Handler = (args: Record<string, unknown>) => ToolResult | Promise<ToolResult>;
const handlers = new Map<string, Handler>();

beforeAll(() => {
    initClient({ baseUrl: "http://bitbucket.invalid/rest/api/latest", token: "t", username: undefined, password: undefined, defaultProject: undefined, enableDangerous: false, timeoutMs: 30_000 });
    const fakeServer = {
        registerTool: (name: string, _config: unknown, handler: Handler) => handlers.set(name, handler),
    } as unknown as McpServer;
    repositoryInsightsModule.register(fakeServer);
});

const client = () => getClient() as unknown as Record<string, unknown>;
const originals: Record<string, unknown> = {};
const stubGet = () => {
    originals.get = client().get;
    const fn = mock(() => Promise.resolve({ data: {} }));
    client().get = fn;
    return fn;
};
afterEach(() => {
    for (const [method, fn] of Object.entries(originals)) client()[method] = fn;
});
const run = (name: string, args: Record<string, unknown>) => {
    const handler = handlers.get(name);
    if (handler === undefined) throw new Error(`${name} not registered`);
    return handler(args);
};
const base = { projectKey: "PROJ", repoSlug: "repo" };

describe("searchCode", () => {
    test("resolves project/repo ids then calls /rest/search/latest/search", async () => {
        const get = stubGet();
        // First call resolves the repo; the fetchPage call returns a page of results.
        get.mockImplementationOnce(() => Promise.resolve({ data: { id: 12, project: { id: 34 } } }));
        get.mockImplementationOnce(() => Promise.resolve({ data: { values: [], isLastPage: true } }));
        await run("searchCode", { ...base, query: "todo" });
        const first = get.mock.calls[0] as unknown[];
        expect(first[0]).toBe("/projects/PROJ/repos/repo");
        const second = get.mock.calls[1] as unknown[];
        expect(second[0]).toBe("http://bitbucket.invalid/rest/search/latest/search");
        const params = second[1] as { params: Record<string, unknown> };
        expect(params.params).toEqual({ query: "todo", entities: "code", projectId: 34, repositoryId: 12, limit: 25 });
    });
});

describe("getFileBlame", () => {
    test("builds the browse path with blame=true and at", async () => {
        const get = stubGet();
        await run("getFileBlame", { ...base, path: "src/a b#1.ts", at: "main" });
        const call = get.mock.calls[0] as unknown[];
        expect(call[0]).toBe("/projects/PROJ/repos/repo/browse/src/a%20b%231.ts");
        const params = (call[1] as { params: Record<string, unknown> }).params;
        expect(params.blame).toBe("true");
        expect(params.at).toBe("main");
        expect(params.noContent).toBeUndefined();
    });
    test("sets noContent=true when requested", async () => {
        const get = stubGet();
        await run("getFileBlame", { ...base, path: "src/index.ts", noContent: true });
        const params = ((get.mock.calls[0] as unknown[])[1] as { params: Record<string, unknown> }).params;
        expect(params.noContent).toBe("true");
    });
});

describe("getPullRequestSettings", () => {
    test("builds the settings/pull-requests URL", async () => {
        const get = stubGet();
        await run("getPullRequestSettings", base);
        expect((get.mock.calls[0] as unknown[])[0]).toBe("/projects/PROJ/repos/repo/settings/pull-requests");
    });
});

describe("getDefaultReviewers", () => {
    test("builds the default-reviewers conditions URL and encodes project/repo", async () => {
        const get = stubGet();
        await run("getDefaultReviewers", { projectKey: "../o", repoSlug: "r/epo?" });
        expect((get.mock.calls[0] as unknown[])[0]).toBe("http://bitbucket.invalid/rest/default-reviewers/latest/projects/..%2Fo/repos/r%2Fepo%3F/conditions");
    });
});

describe("getBranchRestrictions", () => {
    test("builds the branch-permissions restrictions URL with type filter", async () => {
        const get = stubGet();
        await run("getBranchRestrictions", { ...base, type: "push" });
        const call = get.mock.calls[0] as unknown[];
        expect(call[0]).toBe("http://bitbucket.invalid/rest/branch-permissions/latest/projects/PROJ/repos/repo/restrictions");
        const params = (call[1] as { params: Record<string, unknown> }).params;
        expect(params.type).toBe("push");
    });
});