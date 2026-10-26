import { describe, expect, mock, test } from "bun:test";
import type { AxiosInstance } from "axios";
import { jsonResult } from "./errors.js";
import { fetchFiltered, fetchPage, pageResult } from "./pagination.js";

interface FakePage { values: unknown[]; isLastPage: boolean; nextPageStart?: number; start?: number }

function fakeClient(pages: Record<number, FakePage>) {
    const get = mock((_path: string, config: { params: Record<string, unknown> }) => {
        const start = (config.params.start as number | undefined) ?? 0;
        return Promise.resolve({ data: pages[start] });
    });
    return { get, client: { get } as unknown as AxiosInstance };
}

const calls = (get: ReturnType<typeof fakeClient>["get"]) => get.mock.calls.map((c) => c[1].params);

describe("fetchPage", () => {
    test("single page exposes isLastPage and nextPageStart", async () => {
        const { client } = fakeClient({ 0: { values: [1, 2], isLastPage: false, nextPageStart: 2 } });
        const result = await fetchPage<number>(client, "/x", { limit: 2 });
        expect(pageResult(result, result.values)).toEqual({ values: [1, 2], isLastPage: false, nextPageStart: 2 });
    });

    test("last single page has no nextPageStart or truncated flag", async () => {
        const { client } = fakeClient({ 0: { values: [1], isLastPage: true } });
        const result = await fetchPage<number>(client, "/x");
        expect(pageResult(result, result.values)).toEqual({ values: [1], isLastPage: true });
    });

    test("all aggregates multiple pages", async () => {
        const { client, get } = fakeClient({
            0: { values: [1, 2], isLastPage: false, nextPageStart: 2 },
            2: { values: [3], isLastPage: true },
        });
        const result = await fetchPage<number>(client, "/x", { limit: 2, all: true });
        expect(result.values).toEqual([1, 2, 3]);
        expect(result.isLastPage).toBe(true);
        expect(result.truncated).toBeFalsy();
        expect(get).toHaveBeenCalledTimes(2);
    });

    test("all stops at the cap, reports truncation and the server's nextPageStart", async () => {
        const { client, get } = fakeClient({
            0: { values: [1, 2], isLastPage: false, nextPageStart: 2 },
            2: { values: [3], isLastPage: false, nextPageStart: 3 },
        });
        const result = await fetchPage<number>(client, "/x", { limit: 2, all: true, maxItems: 3 });
        expect(result.values).toEqual([1, 2, 3]);
        expect(result.isLastPage).toBe(false);
        expect(result.truncated).toBe(true);
        expect(result.nextPageStart).toBe(3);
        expect(calls(get)[1]?.limit).toBe(1);
        expect(pageResult(result, result.values)).toEqual({ values: [1, 2, 3], isLastPage: false, nextPageStart: 3, truncated: true });
    });

    test("all with start pages from start", async () => {
        const { client, get } = fakeClient({
            5: { values: [6, 7], isLastPage: false, nextPageStart: 7 },
            7: { values: [8], isLastPage: true },
        });
        const result = await fetchPage<number>(client, "/x", { limit: 2, all: true, start: 5 });
        expect(result.values).toEqual([6, 7, 8]);
        expect(result.start).toBe(5);
        expect(calls(get)[0]?.start).toBe(5);
    });

    test("a page with no values cannot loop forever (#8)", async () => {
        let requests = 0;
        const get = mock((_path: string, config: { params: Record<string, unknown> }) => {
            requests++;
            if (requests > 20)
                throw new Error("pagination did not stop");
            const start = (config.params.start as number | undefined) ?? 0;
            return Promise.resolve({ data: { values: [], isLastPage: false, nextPageStart: start + 1 } });
        });
        const client = { get } as unknown as AxiosInstance;
        const result = await fetchPage<number>(client, "/x", { limit: 2, all: true, maxItems: 10 });
        expect(get).toHaveBeenCalledTimes(1);
        expect(result.values).toEqual([]);
        expect(result.isLastPage).toBe(false);
        expect(result.truncated).toBe(true);
        expect(result.nextPageStart).toBe(1);
    });

    test("a nextPageStart that does not advance stops the scan (#8)", async () => {
        let requests = 0;
        const get = mock((_path: string, config: { params: Record<string, unknown> }) => {
            requests++;
            if (requests > 20)
                throw new Error("pagination did not stop");
            const start = (config.params.start as number | undefined) ?? 0;
            return Promise.resolve({ data: { values: [start], isLastPage: false, nextPageStart: 2 } });
        });
        const client = { get } as unknown as AxiosInstance;
        const result = await fetchPage<number>(client, "/x", { limit: 2, all: true, maxItems: 10 });
        expect(get).toHaveBeenCalledTimes(2);
        expect(result.values).toEqual([0, 2]);
        expect(result.truncated).toBe(true);
        expect(result.nextPageStart).toBe(2);
    });
});

describe("fetchFiltered", () => {
    const pick = (n: number) => (n % 2 === 0 ? n : undefined);

    test("pages past a page with no matches", async () => {
        const { client, get } = fakeClient({
            0: { values: [1, 3], isLastPage: false, nextPageStart: 2 },
            2: { values: [4, 6], isLastPage: true },
        });
        const result = await fetchFiltered<number, number>(client, "/x", pick, { limit: 1 });
        expect(result.values).toEqual([4, 6]);
        expect(get).toHaveBeenCalledTimes(2);
    });

    test("a filtered scan with no new items cannot loop forever (#8)", async () => {
        let requests = 0;
        const get = mock((_path: string, config: { params: Record<string, unknown> }) => {
            requests++;
            if (requests > 20)
                throw new Error("pagination did not stop");
            const start = (config.params.start as number | undefined) ?? 0;
            return Promise.resolve({ data: { values: [], isLastPage: false, nextPageStart: start + 1 } });
        });
        const client = { get } as unknown as AxiosInstance;
        const result = await fetchFiltered<number, number>(client, "/x", pick, { limit: 1, maxItems: 10 });
        expect(get).toHaveBeenCalledTimes(1);
        expect(result.values).toEqual([]);
        expect(result.truncated).toBe(true);
    });

    test("stops once limit matches are found and keeps the continuation point", async () => {
        const { client, get } = fakeClient({
            0: { values: [2, 4], isLastPage: false, nextPageStart: 2 },
            2: { values: [6], isLastPage: true },
        });
        const result = await fetchFiltered<number, number>(client, "/x", pick, { limit: 2 });
        expect(result.values).toEqual([2, 4]);
        expect(result.isLastPage).toBe(false);
        expect(result.nextPageStart).toBe(2);
        expect(result.truncated).toBe(false);
        expect(get).toHaveBeenCalledTimes(1);
    });

    test("reports truncation when the scan cap is hit without enough matches", async () => {
        const { client } = fakeClient({ 0: { values: [1, 3], isLastPage: false, nextPageStart: 2 } });
        const result = await fetchFiltered<number, number>(client, "/x", pick, { limit: 1, maxItems: 2 });
        expect(result.values).toEqual([]);
        expect(result.truncated).toBe(true);
        expect(result.nextPageStart).toBe(2);
    });
});

describe("pageResult with the text cap", () => {
    test("paging metadata survives a BITBUCKET_MAX_CHARS cut", () => {
        const prev = process.env.BITBUCKET_MAX_CHARS;
        process.env.BITBUCKET_MAX_CHARS = "80";
        try {
            const big = Array.from({ length: 50 }, (_, i) => ({ id: i, name: "x".repeat(20) }));
            const text = jsonResult(pageResult({ isLastPage: false, nextPageStart: 50, truncated: true }, big)).content[0]?.text ?? "";
            expect(text).toContain("[truncated");
            expect(text).toContain('"nextPageStart":50');
            expect(text).toContain('"isLastPage":false');
        }
        finally {
            if (prev === undefined) delete process.env.BITBUCKET_MAX_CHARS;
            else process.env.BITBUCKET_MAX_CHARS = prev;
        }
    });
});
