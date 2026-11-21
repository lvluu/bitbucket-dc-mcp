import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getClient, initClient } from "#lib/client.js";
import { addPendingComment, clearReviewSession, getReviewSession, hasActiveReview, resetReviewState, reviewKey, startReviewSession } from "#lib/review-state.js";
import type { ToolResult } from "#lib/errors.js";
import prReviewModule from "./pr-review.js";

type Handler = (args: Record<string, unknown>) => ToolResult | Promise<ToolResult>;
const handlers = new Map<string, Handler>();
const owner = {
    server: {} as { onclose?: () => void },
    registerTool: (name: string, _config: unknown, handler: Handler) => handlers.set(name, handler),
} as unknown as McpServer;
const BASE = "/projects/PROJ/repos/repo/pull-requests/7";
const ARGS = { projectKey: "PROJ", repoSlug: "repo", prId: 7 };

beforeAll(() => {
    initClient({ baseUrl: "http://bitbucket.invalid/rest/api/latest", token: "t", username: undefined, password: undefined, defaultProject: undefined, enableDangerous: false, timeoutMs: 30_000 });
    prReviewModule.register(owner);
});

const client = () => getClient() as unknown as Record<string, unknown>;
const STATUS_URL = `${BASE}/participants/admin.user`;
type Req = (url: string) => Promise<unknown>;
const ok: Req = () => Promise.resolve({ data: {} });
// The token user: X-AUSERNAME "Admin.User", whose slug is "admin.user".
const whoAmI = (url: string) => Promise.resolve(url === "/application-properties"
    ? { data: {}, headers: { "x-ausername": "Admin.User" } }
    : { data: { values: [{ name: "Other", slug: "other" }, { name: "Admin.User", slug: "admin.user" }] }, headers: {} });
function stubHttp(post: Req, put: Req = ok) {
    const postMock = mock(post);
    const putMock = mock(put);
    originals ??= { post: client().post, put: client().put, get: client().get };
    client().post = postMock;
    client().put = putMock;
    client().get = mock(whoAmI);
    return { postMock, putMock };
}
async function call(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const handler = handlers.get(name);
    if (handler === undefined) throw new Error(`${name} not registered`);
    return handler({ ...ARGS, ...args });
}
const finish = (args: Record<string, unknown>) => call("finishReview", args);
const text = (result: ToolResult) => result.content[0]?.text ?? "";

let originals: Record<string, unknown> | undefined;
afterEach(() => {
    resetReviewState();
    if (originals !== undefined) Object.assign(client(), originals);
    originals = undefined;
});

describe("finishReview", () => {
    for (const status of ["APPROVED", "NEEDS_WORK", "UNAPPROVED"]) {
        test(`sets ${status} on the token user's participant entry even when no comments were buffered`, async () => {
            startReviewSession(reviewKey("PROJ", "repo", 7), owner);
            const { postMock, putMock } = stubHttp(ok);
            const result = await finish({ reviewStatus: status });
            expect(postMock).not.toHaveBeenCalled();
            expect(putMock.mock.calls).toEqual([[STATUS_URL, { status }]] as never);
            expect(result.isError).toBeUndefined();
            expect(JSON.parse(text(result))).toMatchObject({ totalComments: 0, reviewStatus: { status, success: true } });
        });
    }

    test("reports an error when setting the status fails and there were no comments", async () => {
        startReviewSession(reviewKey("PROJ", "repo", 7), owner);
        stubHttp(ok, () => Promise.reject(new Error("forbidden")));
        const result = await finish({ reviewStatus: "APPROVED" });
        expect(result.isError).toBe(true);
        expect(JSON.parse(text(result))).toMatchObject({ reviewStatus: { success: false, error: "forbidden" } });
    });

    test("makes no request when there are no comments and no status", async () => {
        startReviewSession(reviewKey("PROJ", "repo", 7), owner);
        const { postMock, putMock } = stubHttp(ok);
        const result = await finish({});
        expect(postMock).not.toHaveBeenCalled();
        expect(putMock).not.toHaveBeenCalled();
        expect(text(result)).toBe("Review session finished with no pending comments.");
    });

    test("posts buffered comments, then sets NEEDS_WORK", async () => {
        const key = reviewKey("PROJ", "repo", 7);
        startReviewSession(key, owner);
        addPendingComment(key, owner, { text: "nit" });
        const { postMock, putMock } = stubHttp((url) => Promise.resolve({ data: { url } }));
        const result = await finish({ reviewStatus: "NEEDS_WORK" });
        expect(postMock.mock.calls.map((c) => c[0])).toEqual([`${BASE}/comments`]);
        expect(putMock.mock.calls).toEqual([[STATUS_URL, { status: "NEEDS_WORK" }]] as never);
        expect(JSON.parse(text(result))).toMatchObject({ totalComments: 1, successfulComments: 1, reviewStatus: { success: true } });
    });

    test("returns a compact error result when every comment fails", async () => {
        const key = reviewKey("PROJ", "repo", 7);
        startReviewSession(key, owner);
        addPendingComment(key, owner, { text: "nit" });
        stubHttp(() => Promise.reject(new Error("down")));
        const result = await finish({});
        expect(result.isError).toBe(true);
        expect(text(result)).not.toContain("\n");
        expect(JSON.parse(text(result))).toMatchObject({ failedComments: 1 });
    });

    for (const status of ["APPROVED", "NEEDS_WORK"]) {
        test(`skips ${status} when every buffered comment fails`, async () => {
            const key = reviewKey("PROJ", "repo", 7);
            startReviewSession(key, owner);
            addPendingComment(key, owner, { text: "nit" });
            const { putMock } = stubHttp(() => Promise.reject(new Error("down")));
            const result = await finish({ reviewStatus: status });
            expect(putMock).not.toHaveBeenCalled();
            expect(result.isError).toBe(true);
            expect(JSON.parse(text(result))).toMatchObject({ failedComments: 1, reviewStatus: { skipped: true } });
        });
    }

    test("still sets the status when only some comments fail", async () => {
        const key = reviewKey("PROJ", "repo", 7);
        startReviewSession(key, owner);
        addPendingComment(key, owner, { text: "a" });
        addPendingComment(key, owner, { text: "b" });
        let n = 0;
        const { putMock } = stubHttp(() => (n++ === 0 ? Promise.reject(new Error("x")) : Promise.resolve({ data: {} })));
        const result = await finish({ reviewStatus: "APPROVED" });
        expect(putMock).toHaveBeenCalledTimes(1);
        expect(JSON.parse(text(result))).toMatchObject({ successfulComments: 1, failedComments: 1, reviewStatus: { success: true } });
    });
});

describe("setPullRequestStatus", () => {
    test("PUTs NEEDS_WORK to the token user's participant entry", async () => {
        const { putMock } = stubHttp(ok);
        const result = await call("setPullRequestStatus", { status: "NEEDS_WORK" });
        expect(result.isError).toBeUndefined();
        expect(putMock.mock.calls).toEqual([[STATUS_URL, { status: "NEEDS_WORK" }]] as never);
    });
    test("a failed PUT is a one-line error", async () => {
        stubHttp(ok, () => Promise.reject(new Error("You cannot review your own pull request")));
        const result = await call("setPullRequestStatus", { status: "APPROVED" });
        expect(result.isError).toBe(true);
        expect(text(result)).toBe("You cannot review your own pull request");
    });
});

describe("review session ownership", () => {
    const other = {};
    const key = reviewKey("PROJ", "repo", 7);

    test("another session cannot buffer into, list, finish or discard it", () => {
        startReviewSession(key, owner);
        expect(hasActiveReview(key, other)).toBe(false);
        expect(hasActiveReview(key, owner)).toBe(true);
        expect(getReviewSession(key, other)).toBeUndefined();
        expect(() => addPendingComment(key, other, { text: "x" })).toThrow("No active review session");
        expect(() => clearReviewSession(key, other)).toThrow("No active review session");
    });

    test("another session's startReview is refused with a clear message", () => {
        startReviewSession(key, other);
        expect(() => startReviewSession(key, owner)).toThrow("another MCP session");
    });

    test("closing the owning session drops its reviews", () => {
        startReviewSession(key, owner);
        owner.server.onclose?.();
        expect(hasActiveReview(key, owner)).toBe(false);
    });
});
