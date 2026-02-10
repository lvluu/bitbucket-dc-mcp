import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockAxiosClient, axiosResponse, paginatedResponse } from "../helpers/mock-client.js";

const mockAxios = createMockAxiosClient();
vi.mock("../../src/lib/client.js", () => ({
  getClient: () => mockAxios,
  getConfig: () => ({ enableDangerous: false }),
  repoPath: (p: string, r: string) => `/projects/${p}/repos/${r}`,
  prPath: (p: string, r: string, id: string | number) => `/projects/${p}/repos/${r}/pull-requests/${id}`,
}));

import prTasksModule from "../../src/tools/pr-tasks.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const toolHandlers = new Map<string, (args: Record<string, unknown>) => Promise<unknown>>();

function registerTools() {
  const fakeServer = {
    tool: (name: string, _desc: string, _schema: unknown, handler: (args: Record<string, unknown>) => Promise<unknown>) => {
      toolHandlers.set(name, handler);
    },
  } as unknown as McpServer;
  prTasksModule.register(fakeServer);
}

describe("pr-tasks tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toolHandlers.clear();
    registerTools();
  });

  describe("listPRTasks", () => {
    it("should filter activities to blocker comments only", async () => {
      mockAxios.get.mockResolvedValueOnce(paginatedResponse([
        { action: "COMMENTED", comment: { id: 1, severity: "BLOCKER", text: "Fix this" } },
        { action: "COMMENTED", comment: { id: 2, severity: "NORMAL", text: "Just a note" } },
        { action: "APPROVED", comment: null },
      ]));

      const handler = toolHandlers.get("listPRTasks")!;
      const result = await handler({ projectKey: "PROJ", repoSlug: "repo", prId: 1 }) as any;

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].id).toBe(1);
      expect(parsed[0].severity).toBe("BLOCKER");
    });
  });

  describe("addBlockerComment", () => {
    it("should POST with severity BLOCKER", async () => {
      mockAxios.post.mockResolvedValueOnce(axiosResponse({ id: 10, text: "Do this", severity: "BLOCKER" }));

      const handler = toolHandlers.get("addBlockerComment")!;
      const result = await handler({ projectKey: "PROJ", repoSlug: "repo", prId: 1, text: "Do this" }) as any;

      expect(mockAxios.post).toHaveBeenCalledWith(
        "/projects/PROJ/repos/repo/pull-requests/1/comments",
        { text: "Do this", severity: "BLOCKER" }
      );
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.severity).toBe("BLOCKER");
    });
  });

  describe("resolveTask", () => {
    it("should PUT with state RESOLVED (not severity NORMAL)", async () => {
      mockAxios.put.mockResolvedValueOnce(axiosResponse({ id: 10, state: "RESOLVED", version: 2 }));

      const handler = toolHandlers.get("resolveTask")!;
      const result = await handler({ projectKey: "PROJ", repoSlug: "repo", prId: 1, commentId: 10, version: 1 }) as any;

      expect(mockAxios.put).toHaveBeenCalledWith(
        "/projects/PROJ/repos/repo/pull-requests/1/comments/10",
        { state: "RESOLVED", version: 1 }
      );
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.state).toBe("RESOLVED");
    });

    it("should return error on failure", async () => {
      mockAxios.put.mockRejectedValueOnce(new Error("Not found"));

      const handler = toolHandlers.get("resolveTask")!;
      const result = await handler({ projectKey: "PROJ", repoSlug: "repo", prId: 1, commentId: 99, version: 0 }) as any;

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Not found");
    });
  });

  describe("reopenTask", () => {
    it("should PUT with state OPEN", async () => {
      mockAxios.put.mockResolvedValueOnce(axiosResponse({ id: 10, state: "OPEN", version: 3 }));

      const handler = toolHandlers.get("reopenTask")!;
      const result = await handler({ projectKey: "PROJ", repoSlug: "repo", prId: 1, commentId: 10, version: 2 }) as any;

      expect(mockAxios.put).toHaveBeenCalledWith(
        "/projects/PROJ/repos/repo/pull-requests/1/comments/10",
        { state: "OPEN", version: 2 }
      );
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.state).toBe("OPEN");
    });
  });
});
