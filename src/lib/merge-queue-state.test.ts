import { describe, expect, it, beforeEach } from "bun:test";
import {
    mergeQueueKey,
    enqueuePullRequest,
    getMergeQueue,
    dequeuePullRequest,
    clearMergeQueue,
} from "./merge-queue-state.js";

describe("merge-queue-state", () => {
    const key = mergeQueueKey("PROJ", "repo");

    beforeEach(() => {
        clearMergeQueue(key);
    });

    it("enqueues PRs and returns 1-based position", () => {
        expect(enqueuePullRequest(key, 101)).toBe(1);
        expect(enqueuePullRequest(key, 102)).toBe(2);
        expect(getMergeQueue(key)).toEqual([101, 102]);
    });

    it("dequeues PRs in FIFO order", () => {
        enqueuePullRequest(key, 101);
        enqueuePullRequest(key, 102);

        expect(dequeuePullRequest(key)).toBe(101);
        expect(getMergeQueue(key)).toEqual([102]);

        expect(dequeuePullRequest(key)).toBe(102);
        expect(getMergeQueue(key)).toEqual([]);
        expect(dequeuePullRequest(key)).toBeUndefined();
    });

    it("keeps queues isolated by repository key", () => {
        const key2 = mergeQueueKey("PROJ", "other-repo");
        enqueuePullRequest(key, 1);
        enqueuePullRequest(key2, 2);

        expect(getMergeQueue(key)).toEqual([1]);
        expect(getMergeQueue(key2)).toEqual([2]);
    });
});

describe("merge-queue-state dedupe and targeted dequeue", () => {
    const key = mergeQueueKey("PROJ", "dedupe");
    beforeEach(() => {
        clearMergeQueue(key);
    });

    it("returns the existing position when a PR is enqueued twice", () => {
        enqueuePullRequest(key, 1);
        enqueuePullRequest(key, 2);
        expect(enqueuePullRequest(key, 1)).toBe(1);
        expect(getMergeQueue(key)).toEqual([1, 2]);
    });

    it("dequeues by prId and is a no-op when absent", () => {
        enqueuePullRequest(key, 1);
        enqueuePullRequest(key, 2);
        expect(dequeuePullRequest(key, 2)).toBe(2);
        expect(dequeuePullRequest(key, 9)).toBeUndefined();
        expect(getMergeQueue(key)).toEqual([1]);
    });
});
