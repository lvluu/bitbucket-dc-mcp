import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockAxiosClient, axiosResponse, paginatedResponse } from "../helpers/mock-client.js";

const mockAxios = createMockAxiosClient();
vi.mock("#lib/client.js", () => ({
  getClient: () => mockAxios,
  getConfig: () => ({ enableDangerous: false }),
  repoPath: (p: string, r: string) => `/projects/${p}/repos/${r}`,
  prPath: (p: string, r: string, id: string | number) => `/projects/${p}/repos/${r}/pull-requests/${id}`,
}));

import prDiffModule from "#tools/pr-diff.js";
import { createFakeServer, type ToolHandler } from "../helpers/fake-server.js";

const toolHandlers = new Map<string, ToolHandler>();

function registerTools() {
  prDiffModule.register(createFakeServer(toolHandlers));
}

describe("pr-diff tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toolHandlers.clear();
    registerTools();
  });

  describe("getPullRequestDiff", () => {
    it("should GET the diff endpoint with optional params", async () => {
      const diffData = { diffs: [{ source: "a.ts", destination: "a.ts" }] };
      mockAxios.get.mockResolvedValueOnce(axiosResponse(diffData));

      const handler = toolHandlers.get("getPullRequestDiff")!;
      const result = await handler({
        projectKey: "PROJ",
        repoSlug: "repo",
        prId: 1,
        contextLines: 5,
        withComments: true,
      }) as any;

      expect(mockAxios.get).toHaveBeenCalledWith(
        "/projects/PROJ/repos/repo/pull-requests/1/diff",
        { params: { contextLines: 5, withComments: true } }
      );
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.diffs).toHaveLength(1);
    });

    it("should not pass undefined optional params", async () => {
      mockAxios.get.mockResolvedValueOnce(axiosResponse({ diffs: [] }));

      const handler = toolHandlers.get("getPullRequestDiff")!;
      await handler({ projectKey: "PROJ", repoSlug: "repo", prId: 1 });

      expect(mockAxios.get).toHaveBeenCalledWith(
        "/projects/PROJ/repos/repo/pull-requests/1/diff",
        { params: {} }
      );
    });

    it("should return error on API failure", async () => {
      mockAxios.get.mockRejectedValueOnce(new Error("timeout"));

      const handler = toolHandlers.get("getPullRequestDiff")!;
      const result = await handler({ projectKey: "PROJ", repoSlug: "repo", prId: 1 }) as any;

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("timeout");
    });
  });

  describe("streamPullRequestDiff", () => {
    it("should GET the .diff endpoint as plain text", async () => {
      const rawDiff = "--- a/file.ts\n+++ b/file.ts\n@@ -1,3 +1,4 @@\n+new line\n";
      mockAxios.get.mockResolvedValueOnce(axiosResponse(rawDiff));

      const handler = toolHandlers.get("streamPullRequestDiff")!;
      const result = await handler({ projectKey: "PROJ", repoSlug: "repo", prId: 5 }) as any;

      expect(mockAxios.get).toHaveBeenCalledWith(
        "/projects/PROJ/repos/repo/pull-requests/5.diff",
        { headers: { Accept: "text/plain" }, responseType: "text", maxRedirects: 5 }
      );
      expect(result.content[0].text).toBe(rawDiff);
    });
  });

  describe("getPullRequestPatch", () => {
    it("should GET the .patch endpoint as plain text", async () => {
      const patchContent = "From abc123\nSubject: [PATCH]\n---\n file.ts | 1 +\n";
      mockAxios.get.mockResolvedValueOnce(axiosResponse(patchContent));

      const handler = toolHandlers.get("getPullRequestPatch")!;
      const result = await handler({ projectKey: "PROJ", repoSlug: "repo", prId: 3 }) as any;

      expect(mockAxios.get).toHaveBeenCalledWith(
        "/projects/PROJ/repos/repo/pull-requests/3.patch",
        { headers: { Accept: "text/plain" }, responseType: "text", maxRedirects: 5 }
      );
      expect(result.content[0].text).toBe(patchContent);
    });
  });

  describe("getPullRequestChanges", () => {
    it("should return changed files list via pagination", async () => {
      const changes = [
        { contentId: "abc", path: { toString: "src/app.ts" }, type: "MODIFY" },
      ];
      mockAxios.get.mockResolvedValueOnce(paginatedResponse(changes));

      const handler = toolHandlers.get("getPullRequestChanges")!;
      const result = await handler({ projectKey: "PROJ", repoSlug: "repo", prId: 2 }) as any;

      expect(mockAxios.get).toHaveBeenCalledWith(
        "/projects/PROJ/repos/repo/pull-requests/2/changes",
        expect.objectContaining({ params: expect.objectContaining({ limit: 25 }) })
      );
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toHaveLength(1);
    });

    it("should pass pagination params", async () => {
      mockAxios.get.mockResolvedValueOnce(paginatedResponse([], { isLastPage: true }));

      const handler = toolHandlers.get("getPullRequestChanges")!;
      await handler({ projectKey: "P", repoSlug: "r", prId: 1, limit: 10, start: 5 });

      expect(mockAxios.get).toHaveBeenCalledWith(
        "/projects/P/repos/r/pull-requests/1/changes",
        { params: { limit: 10, start: 5 } }
      );
    });
  });
});
