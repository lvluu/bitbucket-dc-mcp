import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getClient, initClient } from "#lib/client.js";
import { addPendingComment, reviewKey, startReviewSession } from "#lib/review-state.js";
import type { ToolResult } from "#lib/errors.js";
import prReviewModule from "./pr-review.js";

type Handler = (args: Record<string, unknown>) => ToolResult | Promise<ToolResult>;
const handlers = new Map<string, Handler>();
const BASE = "/projects/PROJ/repos/repo/pull-requests/7";
const ARGS = { projectKey: "PROJ", repoSlug: "repo", prId: 7 };

beforeAll(() => {
    initClient({ baseUrl: "http://bitbucket.invalid/rest/api/latest", token: "t", username: undefined, password: undefined, defaultProject: undefined, enableDangerous: false, timeoutMs: 30_000 });
    const fakeServer = {
        registerTool: (name: string, _config: unknown, handler: Handler) => handlers.set(name, handler),
    } as unknown as McpServer;
    prReviewModule.register(fakeServer);
});

const client = () => getClient() as unknown as Record<string, unknown>;
function stubHttp(post: (url: string) => Promise<unknown>, del: (url: string) => Promise<unknown> = () => Promise.resolve({ data: {} })) {
    const postMock = mock(post);
    const deleteMock = mock(del);
    originals ??= { post: client().post, delete: client().delete };
    client().post = postMock;
    client().delete = deleteMock;
    return { postMock, deleteMock };
}
async function finish(args: Record<string, unknown>): Promise<ToolResult> {
    const handler = handlers.get("finishReview");
    if (handler === undefined) throw new Error("finishReview not registered");
    return handler({ ...ARGS, ...args });
}
const text = (result: ToolResult) => result.content[0]?.text ?? "";

let originals: { post: unknown; delete: unknown } | undefined;
afterEach(() => {
    if (originals !== undefined) Object.assign(client(), originals);
    originals = undefined;
});

describe("finishReview", () => {
    test("approves the PR even when no comments were buffered", async () => {
        startReviewSession(reviewKey("PROJ", "repo", 7));
        const { postMock } = stubHttp(() => Promise.resolve({ data: {} }));
        const result = await finish({ reviewStatus: "APPROVED" });
        expect(postMock).toHaveBeenCalledTimes(1);
        expect(postMock.mock.calls[0]?.[0]).toBe(`${BASE}/approve`);
        expect(result.isError).toBeUndefined();
        expect(JSON.parse(text(result))).toMatchObject({ totalComments: 0, reviewStatus: { status: "APPROVED", success: true } });
    });

    test("removes approval even when no comments were buffered", async () => {
        startReviewSession(reviewKey("PROJ", "repo", 7));
        const { postMock, deleteMock } = stubHttp(() => Promise.resolve({ data: {} }));
        await finish({ reviewStatus: "UNAPPROVED" });
        expect(postMock).not.toHaveBeenCalled();
        expect(deleteMock.mock.calls[0]?.[0]).toBe(`${BASE}/approve`);
    });

    test("reports an error when setting the status fails and there were no comments", async () => {
        startReviewSession(reviewKey("PROJ", "repo", 7));
        stubHttp(() => Promise.reject(new Error("forbidden")));
        const result = await finish({ reviewStatus: "APPROVED" });
        expect(result.isError).toBe(true);
        expect(JSON.parse(text(result))).toMatchObject({ reviewStatus: { success: false, error: "forbidden" } });
    });

    test("makes no request when there are no comments and no status", async () => {
        startReviewSession(reviewKey("PROJ", "repo", 7));
        const { postMock, deleteMock } = stubHttp(() => Promise.resolve({ data: {} }));
        const result = await finish({});
        expect(postMock).not.toHaveBeenCalled();
        expect(deleteMock).not.toHaveBeenCalled();
        expect(text(result)).toBe("Review session finished with no pending comments.");
    });

    test("posts buffered comments, then sets the status", async () => {
        const key = reviewKey("PROJ", "repo", 7);
        startReviewSession(key);
        addPendingComment(key, { text: "nit" });
        const { postMock } = stubHttp((url) => Promise.resolve({ data: { url } }));
        const result = await finish({ reviewStatus: "APPROVED" });
        expect(postMock.mock.calls.map((c) => c[0])).toEqual([`${BASE}/comments`, `${BASE}/approve`]);
        expect(JSON.parse(text(result))).toMatchObject({ totalComments: 1, successfulComments: 1, reviewStatus: { success: true } });
    });

    test("returns a compact error result when every comment fails", async () => {
        const key = reviewKey("PROJ", "repo", 7);
        startReviewSession(key);
        addPendingComment(key, { text: "nit" });
        stubHttp(() => Promise.reject(new Error("down")));
        const result = await finish({});
        expect(result.isError).toBe(true);
        expect(text(result)).not.toContain("\n");
        expect(JSON.parse(text(result))).toMatchObject({ failedComments: 1 });
    });

    test("skips the status change when every buffered comment fails", async () => {
        const key = reviewKey("PROJ", "repo", 7);
        startReviewSession(key);
        addPendingComment(key, { text: "nit" });
        const { postMock } = stubHttp(() => Promise.reject(new Error("down")));
        const result = await finish({ reviewStatus: "APPROVED" });
        expect(postMock.mock.calls.map((c) => c[0])).toEqual([`${BASE}/comments`]);
        expect(result.isError).toBe(true);
        expect(JSON.parse(text(result))).toMatchObject({ failedComments: 1, reviewStatus: { skipped: true } });
    });

    test("still sets the status when only some comments fail", async () => {
        const key = reviewKey("PROJ", "repo", 7);
        startReviewSession(key);
        addPendingComment(key, { text: "a" });
        addPendingComment(key, { text: "b" });
        let n = 0;
        const { postMock } = stubHttp((url) => (url.endsWith("/comments") && n++ === 0 ? Promise.reject(new Error("x")) : Promise.resolve({ data: {} })));
        const result = await finish({ reviewStatus: "APPROVED" });
        expect(postMock.mock.calls.map((c) => c[0]).at(-1)).toBe(`${BASE}/approve`);
        expect(JSON.parse(text(result))).toMatchObject({ successfulComments: 1, failedComments: 1, reviewStatus: { success: true } });
    });
});
