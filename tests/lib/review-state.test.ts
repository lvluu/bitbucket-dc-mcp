import { describe, it, expect, beforeEach } from "vitest";
import {
  reviewKey,
  hasActiveReview,
  startReviewSession,
  getReviewSession,
  addPendingComment,
  clearReviewSession,
} from "#lib/review-state.js";

describe("review-state", () => {
  const key = reviewKey("PROJ", "repo", 1);

  beforeEach(() => {
    // Clean up any active session from previous test
    if (hasActiveReview(key)) {
      clearReviewSession(key);
    }
  });

  describe("reviewKey", () => {
    it("should build a key from project, repo, and PR ID", () => {
      expect(reviewKey("PROJ", "my-repo", 42)).toBe("PROJ/my-repo/42");
    });
  });

  describe("startReviewSession", () => {
    it("should create a new empty session", () => {
      startReviewSession(key);
      expect(hasActiveReview(key)).toBe(true);
      expect(getReviewSession(key)).toEqual([]);
    });

    it("should throw if session already exists", () => {
      startReviewSession(key);
      expect(() => startReviewSession(key)).toThrow("already active");
    });
  });

  describe("hasActiveReview", () => {
    it("should return false when no session exists", () => {
      expect(hasActiveReview("NO/SUCH/99")).toBe(false);
    });

    it("should return true when session exists", () => {
      startReviewSession(key);
      expect(hasActiveReview(key)).toBe(true);
    });
  });

  describe("addPendingComment", () => {
    it("should add a comment and return its index", () => {
      startReviewSession(key);
      const idx0 = addPendingComment(key, { text: "first" });
      const idx1 = addPendingComment(key, { text: "second" });
      expect(idx0).toBe(0);
      expect(idx1).toBe(1);
      expect(getReviewSession(key)).toHaveLength(2);
    });

    it("should throw if no active session", () => {
      expect(() => addPendingComment("NO/SUCH/99", { text: "oops" })).toThrow(
        "No active review session",
      );
    });
  });

  describe("clearReviewSession", () => {
    it("should return pending comments and remove session", () => {
      startReviewSession(key);
      addPendingComment(key, { text: "c1" });
      addPendingComment(key, { text: "c2" });
      const cleared = clearReviewSession(key);
      expect(cleared).toHaveLength(2);
      expect(cleared[0]!.text).toBe("c1");
      expect(hasActiveReview(key)).toBe(false);
    });

    it("should throw if no active session", () => {
      expect(() => clearReviewSession("NO/SUCH/99")).toThrow(
        "No active review session",
      );
    });
  });
});
