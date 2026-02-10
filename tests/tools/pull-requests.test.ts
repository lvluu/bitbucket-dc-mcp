import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockAxiosClient, axiosResponse, paginatedResponse } from "../helpers/mock-client.js";

const mockAxios = createMockAxiosClient();
vi.mock("../../src/lib/client.js", () => ({
  getClient: () => mockAxios,
  getConfig: () => ({ enableDangerous: false }),
  repoPath: (p: string, r: string) => `/projects/${p}/repos/${r}`,
  prPath: (p: string, r: string, id: string | number) => `/projects/${p}/repos/${r}/pull-requests/${id}`,
}));

import pullRequestsModule from "../../src/tools/pull-requests.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const toolHandlers = new Map<string, (args: Record<string, unknown>) => Promise<unknown>>();

function registerTools() {
  const fakeServer = {
    tool: (name: string, _desc: string, _schema: unknown, handler: (args: Record<string, unknown>) => Promise<unknown>) => {
      toolHandlers.set(name, handler);
    },
  } as unknown as McpServer;
  pullRequestsModule.register(fakeServer);
}

describe("pull-requests tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toolHandlers.clear();
    registerTools();
  });

  describe("listPullRequests", () => {
    it("should list PRs with state filter", async () => {
      mockAxios.get.mockResolvedValueOnce(paginatedResponse([
        { id: 1, title: "Fix bug", state: "OPEN" },
      ]));

      const handler = toolHandlers.get("listPullRequests")!;
      const result = await handler({
        projectKey: "PROJ", repoSlug: "repo", state: "OPEN",
      }) as any;

      expect(mockAxios.get).toHaveBeenCalledWith(
        "/projects/PROJ/repos/repo/pull-requests",
        expect.objectContaining({
          params: expect.objectContaining({ state: "OPEN", limit: 25 }),
        })
      );
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed[0].title).toBe("Fix bug");
    });
  });

  describe("getPullRequest", () => {
    it("should get a single PR by ID", async () => {
      mockAxios.get.mockResolvedValueOnce(axiosResponse({
        id: 42, title: "My PR", state: "OPEN", version: 3,
      }));

      const handler = toolHandlers.get("getPullRequest")!;
      const result = await handler({ projectKey: "PROJ", repoSlug: "repo", prId: 42 }) as any;

      expect(mockAxios.get).toHaveBeenCalledWith("/projects/PROJ/repos/repo/pull-requests/42");
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.id).toBe(42);
    });
  });

  describe("createPullRequest", () => {
    it("should POST a new PR with reviewers", async () => {
      mockAxios.post.mockResolvedValueOnce(axiosResponse({ id: 10, title: "New Feature" }));

      const handler = toolHandlers.get("createPullRequest")!;
      const result = await handler({
        projectKey: "PROJ",
        repoSlug: "repo",
        title: "New Feature",
        description: "A feature",
        sourceBranch: "feature/xyz",
        targetBranch: "main",
        reviewers: ["alice", "bob"],
      }) as any;

      expect(mockAxios.post).toHaveBeenCalledWith(
        "/projects/PROJ/repos/repo/pull-requests",
        expect.objectContaining({
          title: "New Feature",
          description: "A feature",
          reviewers: [
            { user: { name: "alice" } },
            { user: { name: "bob" } },
          ],
          fromRef: expect.objectContaining({
            id: "refs/heads/feature/xyz",
          }),
          toRef: expect.objectContaining({
            id: "refs/heads/main",
          }),
        })
      );
    });

    it("should create a draft PR", async () => {
      mockAxios.post.mockResolvedValueOnce(axiosResponse({ id: 11, draft: true }));

      const handler = toolHandlers.get("createPullRequest")!;
      await handler({
        projectKey: "PROJ", repoSlug: "repo",
        title: "Draft", sourceBranch: "feat", targetBranch: "main",
        draft: true,
      });

      expect(mockAxios.post).toHaveBeenCalledWith(
        "/projects/PROJ/repos/repo/pull-requests",
        expect.objectContaining({ draft: true })
      );
    });
  });

  describe("updatePullRequest", () => {
    it("should fetch current version then PUT preserving all fields", async () => {
      const currentPR = {
        id: 1, version: 5, title: "Old", description: "desc",
        toRef: { id: "refs/heads/main" },
        reviewers: [{ user: { name: "alice" } }],
      };
      mockAxios.get.mockResolvedValueOnce(axiosResponse(currentPR));
      mockAxios.put.mockResolvedValueOnce(axiosResponse({ id: 1, version: 6, title: "New Title" }));

      const handler = toolHandlers.get("updatePullRequest")!;
      const result = await handler({
        projectKey: "PROJ", repoSlug: "repo", prId: 1, title: "New Title",
      }) as any;

      expect(mockAxios.get).toHaveBeenCalledWith("/projects/PROJ/repos/repo/pull-requests/1");
      expect(mockAxios.put).toHaveBeenCalledWith(
        "/projects/PROJ/repos/repo/pull-requests/1",
        {
          title: "New Title",
          description: "desc",
          version: 5,
          toRef: { id: "refs/heads/main" },
          reviewers: [{ user: { name: "alice" } }],
        }
      );
    });
  });

  describe("mergePullRequest", () => {
    it("should fetch version then POST merge with strategy", async () => {
      mockAxios.get.mockResolvedValueOnce(axiosResponse({ id: 1, version: 2 }));
      mockAxios.post.mockResolvedValueOnce(axiosResponse({ id: 1, state: "MERGED" }));

      const handler = toolHandlers.get("mergePullRequest")!;
      const result = await handler({
        projectKey: "PROJ", repoSlug: "repo", prId: 1,
        message: "Merge it", strategy: "squash",
      }) as any;

      expect(mockAxios.post).toHaveBeenCalledWith(
        "/projects/PROJ/repos/repo/pull-requests/1/merge",
        { version: 2, message: "Merge it", strategyId: "squash" }
      );
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.state).toBe("MERGED");
    });

    it("should map merge-commit strategy to no-ff", async () => {
      mockAxios.get.mockResolvedValueOnce(axiosResponse({ id: 1, version: 0 }));
      mockAxios.post.mockResolvedValueOnce(axiosResponse({ id: 1 }));

      const handler = toolHandlers.get("mergePullRequest")!;
      await handler({
        projectKey: "P", repoSlug: "r", prId: 1, strategy: "merge-commit",
      });

      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ strategyId: "no-ff" })
      );
    });
  });

  describe("declinePullRequest", () => {
    it("should POST decline with message", async () => {
      mockAxios.get.mockResolvedValueOnce(axiosResponse({ id: 1, version: 1 }));
      mockAxios.post.mockResolvedValueOnce(axiosResponse({ id: 1, state: "DECLINED" }));

      const handler = toolHandlers.get("declinePullRequest")!;
      const result = await handler({
        projectKey: "P", repoSlug: "r", prId: 1, message: "Not ready",
      }) as any;

      expect(mockAxios.post).toHaveBeenCalledWith(
        "/projects/P/repos/r/pull-requests/1/decline",
        { version: 1, comment: { text: "Not ready" } }
      );
    });
  });

  describe("approvePullRequest", () => {
    it("should POST approve", async () => {
      mockAxios.post.mockResolvedValueOnce(axiosResponse({ approved: true }));

      const handler = toolHandlers.get("approvePullRequest")!;
      await handler({ projectKey: "P", repoSlug: "r", prId: 5 });

      expect(mockAxios.post).toHaveBeenCalledWith("/projects/P/repos/r/pull-requests/5/approve");
    });
  });

  describe("unapprovePullRequest", () => {
    it("should DELETE approve and return success text", async () => {
      mockAxios.delete.mockResolvedValueOnce(axiosResponse({}));

      const handler = toolHandlers.get("unapprovePullRequest")!;
      const result = await handler({ projectKey: "P", repoSlug: "r", prId: 5 }) as any;

      expect(mockAxios.delete).toHaveBeenCalledWith("/projects/P/repos/r/pull-requests/5/approve");
      expect(result.content[0].text).toContain("approval removed");
    });
  });

  describe("markPullRequestAsDraft", () => {
    it("should fetch current PR then PUT with draft true, preserving all fields", async () => {
      const currentPR = {
        id: 1, version: 3, title: "My PR", description: "desc", draft: false,
        toRef: { id: "refs/heads/main" },
        reviewers: [{ user: { name: "denise" } }],
      };
      mockAxios.get.mockResolvedValueOnce(axiosResponse(currentPR));
      mockAxios.put.mockResolvedValueOnce(axiosResponse({ id: 1, version: 4, title: "My PR", draft: true }));

      const handler = toolHandlers.get("markPullRequestAsDraft")!;
      const result = await handler({ projectKey: "PROJ", repoSlug: "repo", prId: 1, draft: true }) as any;

      expect(mockAxios.get).toHaveBeenCalledWith("/projects/PROJ/repos/repo/pull-requests/1");
      expect(mockAxios.put).toHaveBeenCalledWith(
        "/projects/PROJ/repos/repo/pull-requests/1",
        {
          title: "My PR",
          description: "desc",
          version: 3,
          toRef: { id: "refs/heads/main" },
          reviewers: [{ user: { name: "denise" } }],
          draft: true,
        }
      );
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.draft).toBe(true);
    });

    it("should remove draft status with draft false, preserving reviewers", async () => {
      const currentPR = {
        id: 1, version: 4, title: "My PR", description: "desc", draft: true,
        toRef: { id: "refs/heads/main" },
        reviewers: [{ user: { name: "denise" } }, { user: { name: "alice" } }],
      };
      mockAxios.get.mockResolvedValueOnce(axiosResponse(currentPR));
      mockAxios.put.mockResolvedValueOnce(axiosResponse({ id: 1, version: 5, title: "My PR", draft: false }));

      const handler = toolHandlers.get("markPullRequestAsDraft")!;
      const result = await handler({ projectKey: "PROJ", repoSlug: "repo", prId: 1, draft: false }) as any;

      expect(mockAxios.put).toHaveBeenCalledWith(
        "/projects/PROJ/repos/repo/pull-requests/1",
        {
          title: "My PR",
          description: "desc",
          version: 4,
          toRef: { id: "refs/heads/main" },
          reviewers: [{ user: { name: "denise" } }, { user: { name: "alice" } }],
          draft: false,
        }
      );
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.draft).toBe(false);
    });
  });

  describe("canMergePullRequest", () => {
    it("should GET merge check", async () => {
      mockAxios.get.mockResolvedValueOnce(axiosResponse({ canMerge: true, vetoes: [] }));

      const handler = toolHandlers.get("canMergePullRequest")!;
      const result = await handler({ projectKey: "P", repoSlug: "r", prId: 1 }) as any;

      expect(mockAxios.get).toHaveBeenCalledWith("/projects/P/repos/r/pull-requests/1/merge");
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.canMerge).toBe(true);
    });
  });
});
