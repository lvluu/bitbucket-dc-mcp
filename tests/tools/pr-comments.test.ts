import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockAxiosClient, axiosResponse, paginatedResponse } from "../helpers/mock-client.js";

const mockAxios = createMockAxiosClient();
vi.mock("#lib/client.js", () => ({
  getClient: () => mockAxios,
  getConfig: () => ({ enableDangerous: false }),
  repoPath: (p: string, r: string) => `/projects/${p}/repos/${r}`,
  prPath: (p: string, r: string, id: string | number) => `/projects/${p}/repos/${r}/pull-requests/${id}`,
}));

import prCommentsModule from "#tools/pr-comments.js";
import { createFakeServer, type ToolHandler } from "../helpers/fake-server.js";
import { hasActiveReview, reviewKey, startReviewSession, clearReviewSession } from "#lib/review-state.js";

const toolHandlers = new Map<string, ToolHandler>();

function registerTools() {
  prCommentsModule.register(createFakeServer(toolHandlers));
}

describe("pr-comments tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toolHandlers.clear();
    registerTools();
  });

  describe("listPRComments", () => {
    const activities = [
      { action: "COMMENTED", comment: { id: 1, text: "open comment", threadResolved: false } },
      { action: "COMMENTED", comment: { id: 2, text: "resolved comment", threadResolved: true } },
      { action: "COMMENTED", comment: { id: 3, text: "no resolved field" } },
      { action: "APPROVED", comment: null },
    ];

    it("should default to UNRESOLVED comments only", async () => {
      mockAxios.get.mockResolvedValueOnce(paginatedResponse(activities));

      const handler = toolHandlers.get("listPRComments")!;
      const result = await handler({ projectKey: "PROJ", repoSlug: "repo", prId: 1 }) as any;

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toHaveLength(2);
      expect(parsed.map((c: any) => c.id)).toEqual([1, 3]);
    });

    it("should return all comments when state=ALL", async () => {
      mockAxios.get.mockResolvedValueOnce(paginatedResponse(activities));

      const handler = toolHandlers.get("listPRComments")!;
      const result = await handler({ projectKey: "PROJ", repoSlug: "repo", prId: 1, state: "ALL" }) as any;

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toHaveLength(3);
    });

    it("should return only resolved comments when state=RESOLVED", async () => {
      mockAxios.get.mockResolvedValueOnce(paginatedResponse(activities));

      const handler = toolHandlers.get("listPRComments")!;
      const result = await handler({ projectKey: "PROJ", repoSlug: "repo", prId: 1, state: "RESOLVED" }) as any;

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].id).toBe(2);
    });
  });

  describe("addPRComment", () => {
    it("should POST a general comment", async () => {
      mockAxios.post.mockResolvedValueOnce(axiosResponse({ id: 5, text: "Nice work" }));

      const handler = toolHandlers.get("addPRComment")!;
      const result = await handler({ projectKey: "PROJ", repoSlug: "repo", prId: 1, text: "Nice work" }) as any;

      expect(mockAxios.post).toHaveBeenCalledWith(
        "/projects/PROJ/repos/repo/pull-requests/1/comments",
        { text: "Nice work" }
      );
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.text).toBe("Nice work");
    });
  });

  describe("getPRComment", () => {
    it("should GET a specific comment", async () => {
      mockAxios.get.mockResolvedValueOnce(axiosResponse({ id: 5, text: "hello", version: 0 }));

      const handler = toolHandlers.get("getPRComment")!;
      const result = await handler({ projectKey: "PROJ", repoSlug: "repo", prId: 1, commentId: 5 }) as any;

      expect(mockAxios.get).toHaveBeenCalledWith(
        "/projects/PROJ/repos/repo/pull-requests/1/comments/5"
      );
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.id).toBe(5);
    });
  });

  describe("updatePRComment", () => {
    it("should PUT updated text with version", async () => {
      mockAxios.put.mockResolvedValueOnce(axiosResponse({ id: 5, text: "updated", version: 1 }));

      const handler = toolHandlers.get("updatePRComment")!;
      const result = await handler({ projectKey: "PROJ", repoSlug: "repo", prId: 1, commentId: 5, text: "updated", version: 0 }) as any;

      expect(mockAxios.put).toHaveBeenCalledWith(
        "/projects/PROJ/repos/repo/pull-requests/1/comments/5",
        { text: "updated", version: 0 }
      );
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.text).toBe("updated");
    });
  });

  describe("resolvePRComment", () => {
    it("should PUT with threadResolved true", async () => {
      mockAxios.put.mockResolvedValueOnce(axiosResponse({ id: 5, threadResolved: true, version: 1 }));

      const handler = toolHandlers.get("resolvePRComment")!;
      const result = await handler({ projectKey: "PROJ", repoSlug: "repo", prId: 1, commentId: 5, version: 0 }) as any;

      expect(mockAxios.put).toHaveBeenCalledWith(
        "/projects/PROJ/repos/repo/pull-requests/1/comments/5",
        { threadResolved: true, version: 0 }
      );
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.threadResolved).toBe(true);
    });

    it("should return error on failure", async () => {
      mockAxios.put.mockRejectedValueOnce(new Error("Forbidden"));

      const handler = toolHandlers.get("resolvePRComment")!;
      const result = await handler({ projectKey: "PROJ", repoSlug: "repo", prId: 1, commentId: 5, version: 0 }) as any;

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Forbidden");
    });
  });

  describe("reopenPRComment", () => {
    it("should PUT with threadResolved false", async () => {
      mockAxios.put.mockResolvedValueOnce(axiosResponse({ id: 5, threadResolved: false, version: 2 }));

      const handler = toolHandlers.get("reopenPRComment")!;
      const result = await handler({ projectKey: "PROJ", repoSlug: "repo", prId: 1, commentId: 5, version: 1 }) as any;

      expect(mockAxios.put).toHaveBeenCalledWith(
        "/projects/PROJ/repos/repo/pull-requests/1/comments/5",
        { threadResolved: false, version: 1 }
      );
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.threadResolved).toBe(false);
    });
  });

  describe("deletePRComment", () => {
    it("should reject when dangerous mode is disabled", async () => {
      const handler = toolHandlers.get("deletePRComment")!;
      const result = await handler({ projectKey: "PROJ", repoSlug: "repo", prId: 1, commentId: 5, version: 0 }) as any;

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("disabled");
    });
  });

  describe("addPRComment with active review", () => {
    const key = reviewKey("PROJ", "repo", 1);

    beforeEach(() => {
      if (hasActiveReview(key)) {
        clearReviewSession(key);
      }
    });

    it("should buffer comment when review is active", async () => {
      startReviewSession(key);

      const handler = toolHandlers.get("addPRComment")!;
      const result = await handler({ projectKey: "PROJ", repoSlug: "repo", prId: 1, text: "pending comment" }) as any;

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.state).toBe("PENDING");
      expect(parsed.pendingIndex).toBe(0);
      expect(parsed.text).toBe("pending comment");
      expect(mockAxios.post).not.toHaveBeenCalled();
    });

    it("should buffer inline comment with anchor when review is active", async () => {
      startReviewSession(key);

      const handler = toolHandlers.get("addPRComment")!;
      const result = await handler({
        projectKey: "PROJ", repoSlug: "repo", prId: 1,
        text: "inline comment",
        anchorPath: "src/main.ts",
        anchorLine: 42,
        anchorLineType: "ADDED",
        anchorFileType: "TO",
      }) as any;

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.state).toBe("PENDING");
      expect(parsed.pendingIndex).toBe(0);
      expect(mockAxios.post).not.toHaveBeenCalled();

      // Clean up
      clearReviewSession(key);
    });

    it("should POST normally when no review is active", async () => {
      mockAxios.post.mockResolvedValueOnce(axiosResponse({ id: 5, text: "direct" }));

      const handler = toolHandlers.get("addPRComment")!;
      const result = await handler({ projectKey: "PROJ", repoSlug: "repo", prId: 1, text: "direct" }) as any;

      expect(mockAxios.post).toHaveBeenCalledWith(
        "/projects/PROJ/repos/repo/pull-requests/1/comments",
        { text: "direct" }
      );
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.id).toBe(5);
    });
  });
});
