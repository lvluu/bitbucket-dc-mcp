import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockAxiosClient, axiosResponse, paginatedResponse } from "../helpers/mock-client.js";

const mockAxios = createMockAxiosClient();
vi.mock("../../src/lib/client.js", () => ({
  getClient: () => mockAxios,
  getConfig: () => ({ enableDangerous: false }),
  repoPath: (p: string, r: string) => `/projects/${p}/repos/${r}`,
  prPath: (p: string, r: string, id: string | number) => `/projects/${p}/repos/${r}/pull-requests/${id}`,
}));

import prCommentsModule from "../../src/tools/pr-comments.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const toolHandlers = new Map<string, (args: Record<string, unknown>) => Promise<unknown>>();

function registerTools() {
  const fakeServer = {
    tool: (name: string, _desc: string, _schema: unknown, handler: (args: Record<string, unknown>) => Promise<unknown>) => {
      toolHandlers.set(name, handler);
    },
  } as unknown as McpServer;
  prCommentsModule.register(fakeServer);
}

describe("pr-comments tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toolHandlers.clear();
    registerTools();
  });

  describe("listPRComments", () => {
    it("should filter activities to comments", async () => {
      mockAxios.get.mockResolvedValueOnce(paginatedResponse([
        { action: "COMMENTED", comment: { id: 1, text: "hello" } },
        { action: "APPROVED", comment: null },
      ]));

      const handler = toolHandlers.get("listPRComments")!;
      const result = await handler({ projectKey: "PROJ", repoSlug: "repo", prId: 1 }) as any;

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].id).toBe(1);
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
});
