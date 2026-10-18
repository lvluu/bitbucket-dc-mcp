import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getClient, initClient } from "#lib/client.js";
import type { ToolResult } from "#lib/errors.js";
import pullRequestsModule from "./pull-requests.js";

type Handler = (args: Record<string, unknown>) => ToolResult | Promise<ToolResult>;
const handlers = new Map<string, Handler>();

beforeAll(() => {
    initClient({ baseUrl: "http://bitbucket.invalid/rest/api/latest", token: "t", username: undefined, password: undefined, defaultProject: undefined, enableDangerous: false });
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
