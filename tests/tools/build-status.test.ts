import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockAxiosClient, axiosResponse, paginatedResponse } from "../helpers/mock-client.js";

const mockAxios = createMockAxiosClient();
vi.mock("../../src/lib/client.js", () => ({
  getClient: () => mockAxios,
  getConfig: () => ({ enableDangerous: false }),
  repoPath: (p: string, r: string) => `/projects/${p}/repos/${r}`,
}));

import buildStatusModule from "../../src/tools/build-status.js";
import { createFakeServer, type ToolHandler } from "../helpers/fake-server.js";

const toolHandlers = new Map<string, ToolHandler>();

function registerTools() {
  buildStatusModule.register(createFakeServer(toolHandlers));
}

describe("build-status tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toolHandlers.clear();
    registerTools();
  });

  describe("getBuildStatuses", () => {
    it("should list build statuses for a commit", async () => {
      mockAxios.get.mockResolvedValueOnce(paginatedResponse([
        { state: "SUCCESSFUL", key: "build-1", url: "https://ci.example.com/1" },
        { state: "FAILED", key: "build-2", url: "https://ci.example.com/2" },
      ]));

      const handler = toolHandlers.get("getBuildStatuses")!;
      const result = await handler({
        projectKey: "PROJ", repoSlug: "repo", commitId: "abc123def456",
      }) as any;

      expect(mockAxios.get).toHaveBeenCalledWith(
        "/projects/PROJ/repos/repo/commits/abc123def456/builds",
        expect.objectContaining({
          params: expect.objectContaining({ limit: 25 }),
        })
      );
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].state).toBe("SUCCESSFUL");
      expect(parsed[1].state).toBe("FAILED");
    });

    it("should filter by build key", async () => {
      mockAxios.get.mockResolvedValueOnce(paginatedResponse([
        { state: "SUCCESSFUL", key: "build-1", url: "https://ci.example.com/1" },
      ]));

      const handler = toolHandlers.get("getBuildStatuses")!;
      await handler({
        projectKey: "PROJ", repoSlug: "repo", commitId: "abc123def456", key: "build-1",
      });

      expect(mockAxios.get).toHaveBeenCalledWith(
        "/projects/PROJ/repos/repo/commits/abc123def456/builds",
        expect.objectContaining({
          params: expect.objectContaining({ key: "build-1" }),
        })
      );
    });

    it("should return error on failure", async () => {
      mockAxios.get.mockRejectedValueOnce(new Error("Network error"));

      const handler = toolHandlers.get("getBuildStatuses")!;
      const result = await handler({
        projectKey: "PROJ", repoSlug: "repo", commitId: "abc123",
      }) as any;

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Network error");
    });
  });

  describe("getBuildStatusStats", () => {
    it("should get build statistics for a commit", async () => {
      mockAxios.get.mockResolvedValueOnce(axiosResponse({
        successful: 3, failed: 1, inProgress: 0,
      }));

      const handler = toolHandlers.get("getBuildStatusStats")!;
      const result = await handler({ commitId: "abc123def456" }) as any;

      expect(mockAxios.get).toHaveBeenCalledWith(
        "/build-status/latest/commits/stats/abc123def456",
        { params: {} }
      );
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.successful).toBe(3);
      expect(parsed.failed).toBe(1);
    });

    it("should pass includeUnique param", async () => {
      mockAxios.get.mockResolvedValueOnce(axiosResponse({
        successful: 1, failed: 0, inProgress: 0,
      }));

      const handler = toolHandlers.get("getBuildStatusStats")!;
      await handler({ commitId: "abc123", includeUnique: true });

      expect(mockAxios.get).toHaveBeenCalledWith(
        "/build-status/latest/commits/stats/abc123",
        { params: { includeUnique: true } }
      );
    });

    it("should return error on failure", async () => {
      mockAxios.get.mockRejectedValueOnce(new Error("Server error"));

      const handler = toolHandlers.get("getBuildStatusStats")!;
      const result = await handler({ commitId: "abc123" }) as any;

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Server error");
    });
  });
});
