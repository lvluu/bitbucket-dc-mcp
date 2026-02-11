import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockAxiosClient, axiosResponse } from "../helpers/mock-client.js";

const mockAxios = createMockAxiosClient();
vi.mock("#lib/client.js", () => ({
  getClient: () => mockAxios,
  getConfig: () => ({ enableDangerous: false }),
  repoPath: (p: string, r: string) => `/projects/${p}/repos/${r}`,
  prPath: (p: string, r: string, id: string | number) =>
    `/projects/${p}/repos/${r}/pull-requests/${id}`,
}));

import prReviewModule from "#tools/pr-review.js";
import { createFakeServer, type ToolHandler } from "../helpers/fake-server.js";
import {
  hasActiveReview,
  reviewKey,
  clearReviewSession,
  startReviewSession,
  addPendingComment,
} from "#lib/review-state.js";

const toolHandlers = new Map<string, ToolHandler>();

function registerTools() {
  prReviewModule.register(createFakeServer(toolHandlers));
}

const prArgs = { projectKey: "PROJ", repoSlug: "repo", prId: 1 };
const key = reviewKey("PROJ", "repo", 1);

describe("pr-review tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toolHandlers.clear();
    registerTools();
    // Clean up review state
    if (hasActiveReview(key)) {
      clearReviewSession(key);
    }
  });

  describe("startReview", () => {
    it("should start a review session", async () => {
      const handler = toolHandlers.get("startReview")!;
      const result = (await handler(prArgs)) as any;

      expect(result.content[0].text).toContain("Review session started");
      expect(hasActiveReview(key)).toBe(true);
    });

    it("should return error if review already active", async () => {
      startReviewSession(key);

      const handler = toolHandlers.get("startReview")!;
      const result = (await handler(prArgs)) as any;

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("already active");
    });
  });

  describe("finishReview", () => {
    it("should post all buffered comments", async () => {
      startReviewSession(key);
      addPendingComment(key, { text: "comment 1" });
      addPendingComment(key, { text: "comment 2" });

      mockAxios.post
        .mockResolvedValueOnce(axiosResponse({ id: 10, text: "comment 1" }))
        .mockResolvedValueOnce(axiosResponse({ id: 11, text: "comment 2" }));

      const handler = toolHandlers.get("finishReview")!;
      const result = (await handler(prArgs)) as any;
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.totalComments).toBe(2);
      expect(parsed.successfulComments).toBe(2);
      expect(parsed.failedComments).toBe(0);
      expect(parsed.succeeded).toHaveLength(2);
      expect(mockAxios.post).toHaveBeenCalledTimes(2);
      expect(mockAxios.post).toHaveBeenCalledWith(
        "/projects/PROJ/repos/repo/pull-requests/1/comments",
        { text: "comment 1" },
      );
      expect(hasActiveReview(key)).toBe(false);
    });

    it("should handle partial failure", async () => {
      startReviewSession(key);
      addPendingComment(key, { text: "good" });
      addPendingComment(key, { text: "bad" });

      mockAxios.post
        .mockResolvedValueOnce(axiosResponse({ id: 10, text: "good" }))
        .mockRejectedValueOnce(new Error("Server error"));

      const handler = toolHandlers.get("finishReview")!;
      const result = (await handler(prArgs)) as any;
      const parsed = JSON.parse(result.content[0].text);

      expect(result.isError).toBeUndefined();
      expect(parsed.successfulComments).toBe(1);
      expect(parsed.failedComments).toBe(1);
      expect(parsed.failed[0].text).toBe("bad");
    });

    it("should return isError when all comments fail", async () => {
      startReviewSession(key);
      addPendingComment(key, { text: "fail1" });
      addPendingComment(key, { text: "fail2" });

      mockAxios.post
        .mockRejectedValueOnce(new Error("err1"))
        .mockRejectedValueOnce(new Error("err2"));

      const handler = toolHandlers.get("finishReview")!;
      const result = (await handler(prArgs)) as any;

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.successfulComments).toBe(0);
      expect(parsed.failedComments).toBe(2);
    });

    it("should set APPROVED status after posting comments", async () => {
      startReviewSession(key);
      addPendingComment(key, { text: "lgtm" });

      mockAxios.post
        .mockResolvedValueOnce(axiosResponse({ id: 10, text: "lgtm" }))
        // approve endpoint
        .mockResolvedValueOnce(axiosResponse({}));

      const handler = toolHandlers.get("finishReview")!;
      const result = (await handler({
        ...prArgs,
        reviewStatus: "APPROVED",
      })) as any;
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.reviewStatus).toEqual({
        status: "APPROVED",
        success: true,
      });
      expect(mockAxios.post).toHaveBeenCalledWith(
        "/projects/PROJ/repos/repo/pull-requests/1/approve",
      );
    });

    it("should set UNAPPROVED status via DELETE", async () => {
      startReviewSession(key);
      addPendingComment(key, { text: "needs work" });

      mockAxios.post.mockResolvedValueOnce(
        axiosResponse({ id: 10, text: "needs work" }),
      );
      mockAxios.delete.mockResolvedValueOnce(axiosResponse({}));

      const handler = toolHandlers.get("finishReview")!;
      const result = (await handler({
        ...prArgs,
        reviewStatus: "UNAPPROVED",
      })) as any;
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.reviewStatus).toEqual({
        status: "UNAPPROVED",
        success: true,
      });
      expect(mockAxios.delete).toHaveBeenCalledWith(
        "/projects/PROJ/repos/repo/pull-requests/1/approve",
      );
    });

    it("should handle approval failure gracefully", async () => {
      startReviewSession(key);
      addPendingComment(key, { text: "comment" });

      mockAxios.post
        .mockResolvedValueOnce(axiosResponse({ id: 10, text: "comment" }))
        .mockRejectedValueOnce(new Error("Not authorized"));

      const handler = toolHandlers.get("finishReview")!;
      const result = (await handler({
        ...prArgs,
        reviewStatus: "APPROVED",
      })) as any;
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.successfulComments).toBe(1);
      expect(parsed.reviewStatus.success).toBe(false);
      expect(parsed.reviewStatus.error).toBeDefined();
    });

    it("should return message when no pending comments", async () => {
      startReviewSession(key);

      const handler = toolHandlers.get("finishReview")!;
      const result = (await handler(prArgs)) as any;

      expect(result.content[0].text).toContain("no pending comments");
    });

    it("should return error if no active review", async () => {
      const handler = toolHandlers.get("finishReview")!;
      const result = (await handler(prArgs)) as any;

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("No active review session");
    });
  });

  describe("discardReview", () => {
    it("should discard pending comments", async () => {
      startReviewSession(key);
      addPendingComment(key, { text: "will be dropped" });

      const handler = toolHandlers.get("discardReview")!;
      const result = (await handler(prArgs)) as any;

      expect(result.content[0].text).toContain("1 pending comment(s) dropped");
      expect(hasActiveReview(key)).toBe(false);
    });

    it("should return error if no active review", async () => {
      const handler = toolHandlers.get("discardReview")!;
      const result = (await handler(prArgs)) as any;

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("No active review session");
    });
  });

  describe("listPendingReviewComments", () => {
    it("should list buffered comments with indices", async () => {
      startReviewSession(key);
      addPendingComment(key, { text: "first" });
      addPendingComment(key, { text: "second", severity: "BLOCKER" });

      const handler = toolHandlers.get("listPendingReviewComments")!;
      const result = (await handler(prArgs)) as any;
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed).toHaveLength(2);
      expect(parsed[0]).toEqual({ index: 0, text: "first" });
      expect(parsed[1]).toEqual({
        index: 1,
        text: "second",
        severity: "BLOCKER",
      });
    });

    it("should return error if no active review", async () => {
      const handler = toolHandlers.get("listPendingReviewComments")!;
      const result = (await handler(prArgs)) as any;

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("No active review session");
    });
  });
});
