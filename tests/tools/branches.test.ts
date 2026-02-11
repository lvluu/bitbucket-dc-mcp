import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockAxiosClient, axiosResponse, paginatedResponse } from "../helpers/mock-client.js";

const mockAxios = createMockAxiosClient();
vi.mock("#lib/client.js", () => ({
  getClient: () => mockAxios,
  getConfig: () => ({ enableDangerous: false }),
  repoPath: (p: string, r: string) => `/projects/${p}/repos/${r}`,
  prPath: (p: string, r: string, id: string | number) => `/projects/${p}/repos/${r}/pull-requests/${id}`,
}));

import branchesModule from "#tools/branches.js";
import { createFakeServer, type ToolHandler } from "../helpers/fake-server.js";

const toolHandlers = new Map<string, ToolHandler>();

function registerTools() {
  branchesModule.register(createFakeServer(toolHandlers));
}

describe("branches tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toolHandlers.clear();
    registerTools();
  });

  describe("listBranches", () => {
    it("should list branches with filter", async () => {
      mockAxios.get.mockResolvedValueOnce(paginatedResponse([
        { displayId: "main", isDefault: true },
        { displayId: "develop", isDefault: false },
      ]));

      const handler = toolHandlers.get("listBranches")!;
      const result = await handler({
        projectKey: "PROJ", repoSlug: "repo", filterText: "main",
      }) as any;

      expect(mockAxios.get).toHaveBeenCalledWith(
        "/projects/PROJ/repos/repo/branches",
        expect.objectContaining({
          params: expect.objectContaining({ filterText: "main" }),
        })
      );
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toHaveLength(2);
    });
  });

  describe("createBranch", () => {
    it("should POST to create a branch", async () => {
      mockAxios.post.mockResolvedValueOnce(axiosResponse({
        displayId: "feature/new", latestCommit: "abc123",
      }));

      const handler = toolHandlers.get("createBranch")!;
      const result = await handler({
        projectKey: "PROJ", repoSlug: "repo",
        name: "feature/new", startPoint: "main",
      }) as any;

      expect(mockAxios.post).toHaveBeenCalledWith(
        "/projects/PROJ/repos/repo/branches",
        { name: "feature/new", startPoint: "main" }
      );
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.displayId).toBe("feature/new");
    });
  });

  describe("deleteBranch", () => {
    it("should block when enableDangerous is false", async () => {
      const handler = toolHandlers.get("deleteBranch")!;
      const result = await handler({
        projectKey: "PROJ", repoSlug: "repo", name: "old-branch",
      }) as any;

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("disabled");
      expect(mockAxios.delete).not.toHaveBeenCalled();
    });
  });

  describe("listTags", () => {
    it("should list tags", async () => {
      mockAxios.get.mockResolvedValueOnce(paginatedResponse([
        { displayId: "v1.0.0", latestCommit: "abc" },
      ]));

      const handler = toolHandlers.get("listTags")!;
      const result = await handler({ projectKey: "PROJ", repoSlug: "repo" }) as any;

      expect(mockAxios.get).toHaveBeenCalledWith(
        "/projects/PROJ/repos/repo/tags",
        expect.any(Object)
      );
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed[0].displayId).toBe("v1.0.0");
    });
  });

  describe("createTag", () => {
    it("should POST to create a tag with message", async () => {
      mockAxios.post.mockResolvedValueOnce(axiosResponse({
        displayId: "v2.0.0", latestCommit: "def456",
      }));

      const handler = toolHandlers.get("createTag")!;
      const result = await handler({
        projectKey: "PROJ", repoSlug: "repo",
        name: "v2.0.0", startPoint: "def456", message: "Release 2.0",
      }) as any;

      expect(mockAxios.post).toHaveBeenCalledWith(
        "/projects/PROJ/repos/repo/tags",
        { name: "v2.0.0", startPoint: "def456", message: "Release 2.0" }
      );
    });
  });
});
