import { afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getClient, initClient } from "#lib/client.js";
import type { ToolResult } from "#lib/errors.js";
import { clearMergeQueue, getMergeQueue, mergeQueueKey } from "#lib/merge-queue-state.js";
import mergeQueueModule from "./merge-queue.js";

type Handler = (args: Record<string, unknown>) => ToolResult | Promise<ToolResult>;
const handlers = new Map<string, Handler>();

beforeAll(() => {
    initClient({ baseUrl: "http://bitbucket.invalid/rest/api/latest", token: "t", username: undefined, password: undefined, defaultProject: undefined, enableDangerous: false, timeoutMs: 30_000 });
    const fakeServer = {
        registerTool: (name: string, _config: unknown, handler: Handler) => handlers.set(name, handler),
    } as unknown as McpServer;
    mergeQueueModule.register(fakeServer);
});

const client = () => getClient() as unknown as Record<string, unknown>;
const originals: Record<string, unknown> = {};
const stub = (method: "get" | "post", impl: (url: string) => Promise<{ data: unknown }>) => {
    originals[method] = client()[method];
    const fn = mock(impl);
    client()[method] = fn;
    return fn;
};
const base = { projectKey: "PROJ", repoSlug: "repo" };
const key = mergeQueueKey("PROJ", "repo");
const run = (name: string, args: Record<string, unknown> = base) => {
    const handler = handlers.get(name);
    if (handler === undefined) throw new Error(`${name} not registered`);
    return handler(args);
};
const parse = (res: ToolResult) => JSON.parse(res.content[0]?.text ?? "") as Record<string, unknown>;
const prUrl = (id: number) => `/projects/PROJ/repos/repo/pull-requests/${String(id)}`;

/** GET stub: `/merge` answers canMerge per PR, the bare PR URL answers its version. */
const getFor = (canMerge: (id: number) => boolean, state?: (id: number) => string) => (url: string) => {
    const id = Number(/pull-requests\/(\d+)/.exec(url)?.[1]);
    return Promise.resolve({ data: url.endsWith("/merge") ? { canMerge: canMerge(id) } : { version: 7, state: state?.(id) } });
};

beforeEach(() => {
    clearMergeQueue(key);
});
afterEach(() => {
    for (const [method, fn] of Object.entries(originals)) client()[method] = fn;
});

describe("processMergeQueue", () => {
    test("merges every queued PR in order", async () => {
        await run("enqueuePullRequest", { ...base, prId: 1 });
        await run("enqueuePullRequest", { ...base, prId: 2 });
        stub("get", getFor(() => true));
        const post = stub("post", () => Promise.resolve({ data: { state: "MERGED" } }));

        const res = await run("processMergeQueue");

        const body = parse(res);
        expect(body.status).toBe("completed");
        expect((body.merged as { prId: number }[]).map((m) => m.prId)).toEqual([1, 2]);
        expect(getMergeQueue(key)).toEqual([]); // squeeze drops the empty remainingQueue
        expect(post.mock.calls.map((c) => (c as unknown[])[0])).toEqual([`${prUrl(1)}/merge`, `${prUrl(2)}/merge`]);
    });

    test("halts at a blocked head and keeps it queued", async () => {
        await run("enqueuePullRequest", { ...base, prId: 1 });
        await run("enqueuePullRequest", { ...base, prId: 2 });
        stub("get", getFor((id) => id !== 2));
        stub("post", () => Promise.resolve({ data: {} }));

        const body = parse(await run("processMergeQueue"));

        expect(body.status).toBe("blocked");
        expect(body.blockedPrId).toBe(2);
        expect((body.merged as { prId: number }[]).map((m) => m.prId)).toEqual([1]);
        expect(body.remainingQueue).toEqual([2]);
    });

    test("reports already merged PRs and the failing PR when a merge throws", async () => {
        await run("enqueuePullRequest", { ...base, prId: 1 });
        await run("enqueuePullRequest", { ...base, prId: 2 });
        await run("enqueuePullRequest", { ...base, prId: 3 });
        stub("get", getFor(() => true));
        stub("post", (url) => (url.includes("/2/") ? Promise.reject(new Error("boom")) : Promise.resolve({ data: { ok: true } })));

        const res = await run("processMergeQueue");

        expect(res.isError).toBe(true);
        const body = parse(res);
        expect(body.error).toBe("boom");
        expect(body.failedPrId).toBe(2);
        expect((body.merged as { prId: number }[]).map((m) => m.prId)).toEqual([1]);
        expect(body.remainingQueue).toEqual([2, 3]);
    });

    test("first-PR failure reports failedPrId (squeeze drops the empty merged list)", async () => {
        await run("enqueuePullRequest", { ...base, prId: 1 });
        stub("get", getFor(() => true));
        stub("post", () => Promise.reject(new Error("boom")));

        const res = await run("processMergeQueue");

        expect(res.isError).toBe(true);
        const body = parse(res);
        expect(body.failedPrId).toBe(1);
        expect(body.merged).toBeUndefined();
        expect(getMergeQueue(key)).toEqual([1]);
    });

    test("rejects an overlapping run for the same repo and frees the lock afterwards", async () => {
        await run("enqueuePullRequest", { ...base, prId: 1 });
        await run("enqueuePullRequest", { ...base, prId: 2 });
        let release: () => void = () => undefined;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        stub("get", async (url) => {
            await gate;
            return getFor(() => true)(url);
        });
        stub("post", () => Promise.resolve({ data: {} }));

        const first = run("processMergeQueue");
        const second = await run("processMergeQueue");
        expect(second.isError).toBe(true);
        expect(second.content[0]?.text).toBe("processMergeQueue is already running for PROJ/repo");

        release();
        const body = parse(await first);
        expect((body.merged as { prId: number }[]).map((m) => m.prId)).toEqual([1, 2]);
        expect(getMergeQueue(key)).toEqual([]);

        await run("enqueuePullRequest", { ...base, prId: 3 });
        expect(parse(await run("processMergeQueue")).status).toBe("completed");
    });
});

describe("enqueuePullRequest", () => {
    test("returns the existing position for a duplicate PR", async () => {
        await run("enqueuePullRequest", { ...base, prId: 1 });
        await run("enqueuePullRequest", { ...base, prId: 2 });

        const body = parse(await run("enqueuePullRequest", { ...base, prId: 1 }));

        expect(body.position).toBe(1);
        expect(body.queueLength).toBe(2);
        expect(getMergeQueue(key)).toEqual([1, 2]);
    });
});

describe("dequeuePullRequest", () => {
    test("removes a blocked head so processing continues", async () => {
        await run("enqueuePullRequest", { ...base, prId: 1 });
        await run("enqueuePullRequest", { ...base, prId: 2 });
        stub("get", getFor((id) => id !== 1));
        stub("post", () => Promise.resolve({ data: { state: "MERGED" } }));
        expect(parse(await run("processMergeQueue")).status).toBe("blocked");

        const removed = parse(await run("dequeuePullRequest", { ...base, prId: 1 }));
        expect(removed.remainingQueue).toEqual([2]);
        const body = parse(await run("processMergeQueue"));

        expect(body.status).toBe("completed");
        expect((body.merged as { prId: number }[]).map((m) => m.prId)).toEqual([2]);
        expect(getMergeQueue(key)).toEqual([]);
    });

    test("errors on a PR that is not queued", async () => {
        const res = await run("dequeuePullRequest", { ...base, prId: 9 });

        expect(res.isError).toBe(true);
        expect(res.content[0]?.text).toBe("PR #9 is not in the merge queue for PROJ/repo");
    });
});

describe("processMergeQueue skipping non-OPEN PRs", () => {
    test("drops a non-OPEN head without merging it and merges the rest", async () => {
        await run("enqueuePullRequest", { ...base, prId: 1 });
        await run("enqueuePullRequest", { ...base, prId: 2 });
        stub("get", getFor(() => true, (id) => (id === 1 ? "DECLINED" : "OPEN")));
        const post = stub("post", () => Promise.resolve({ data: { state: "MERGED" } }));

        const body = parse(await run("processMergeQueue"));

        expect(body.status).toBe("completed");
        expect(body.skipped).toEqual([{ prId: 1, reason: "state DECLINED" }]);
        expect((body.merged as { prId: number }[]).map((m) => m.prId)).toEqual([2]);
        expect(post.mock.calls.map((c) => (c as unknown[])[0])).toEqual([`${prUrl(2)}/merge`]);
        expect(getMergeQueue(key)).toEqual([]);
    });

    test("still reports skipped PRs when a later PR is blocked", async () => {
        await run("enqueuePullRequest", { ...base, prId: 1 });
        await run("enqueuePullRequest", { ...base, prId: 2 });
        stub("get", getFor((id) => id !== 2, (id) => (id === 1 ? "MERGED" : "OPEN")));
        stub("post", () => Promise.resolve({ data: {} }));

        const body = parse(await run("processMergeQueue"));

        expect(body.status).toBe("blocked");
        expect(body.blockedPrId).toBe(2);
        expect(body.skipped).toEqual([{ prId: 1, reason: "state MERGED" }]);
        expect(body.remainingQueue).toEqual([2]);
    });
});
