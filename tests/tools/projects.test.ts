import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockAxiosClient, axiosResponse, paginatedResponse } from "../helpers/mock-client.js";

// Mock the client module before importing the tool module
const mockAxios = createMockAxiosClient();
vi.mock("../../src/lib/client.js", () => ({
  getClient: () => mockAxios,
  getConfig: () => ({ enableDangerous: false }),
  repoPath: (p: string, r: string) => `/projects/${p}/repos/${r}`,
  prPath: (p: string, r: string, id: string | number) => `/projects/${p}/repos/${r}/pull-requests/${id}`,
}));

import projectsModule from "../../src/tools/projects.js";
import { createFakeServer, type ToolHandler } from "../helpers/fake-server.js";

const toolHandlers = new Map<string, ToolHandler>();

function registerTools() {
  projectsModule.register(createFakeServer(toolHandlers));
}

describe("projects tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toolHandlers.clear();
    registerTools();
  });

  describe("listProjects", () => {
    it("should call GET /projects and return values", async () => {
      mockAxios.get.mockResolvedValueOnce(paginatedResponse([
        { key: "PROJ", name: "Project" },
      ]));

      const handler = toolHandlers.get("listProjects")!;
      const result = await handler({}) as any;

      expect(mockAxios.get).toHaveBeenCalledWith("/projects", expect.objectContaining({
        params: expect.objectContaining({ limit: 25 }),
      }));
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toEqual([{ key: "PROJ", name: "Project" }]);
    });

    it("should pass name filter param", async () => {
      mockAxios.get.mockResolvedValueOnce(paginatedResponse([]));

      const handler = toolHandlers.get("listProjects")!;
      await handler({ name: "test" });

      expect(mockAxios.get).toHaveBeenCalledWith("/projects", expect.objectContaining({
        params: expect.objectContaining({ name: "test" }),
      }));
    });

    it("should return error on failure", async () => {
      mockAxios.get.mockRejectedValueOnce(new Error("Connection refused"));

      const handler = toolHandlers.get("listProjects")!;
      const result = await handler({}) as any;

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Connection refused");
    });
  });

  describe("getProject", () => {
    it("should call GET /projects/:key", async () => {
      mockAxios.get.mockResolvedValueOnce(axiosResponse({ key: "PROJ", name: "My Project" }));

      const handler = toolHandlers.get("getProject")!;
      const result = await handler({ projectKey: "PROJ" }) as any;

      expect(mockAxios.get).toHaveBeenCalledWith("/projects/PROJ");
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.key).toBe("PROJ");
    });
  });

  describe("createProject", () => {
    it("should POST to /projects with payload", async () => {
      mockAxios.post.mockResolvedValueOnce(axiosResponse({ key: "NEW", name: "New Project" }));

      const handler = toolHandlers.get("createProject")!;
      const result = await handler({ key: "NEW", name: "New Project", description: "desc" }) as any;

      expect(mockAxios.post).toHaveBeenCalledWith("/projects", {
        key: "NEW",
        name: "New Project",
        description: "desc",
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.key).toBe("NEW");
    });
  });

  describe("updateProject", () => {
    it("should PUT to /projects/:key with partial data", async () => {
      mockAxios.put.mockResolvedValueOnce(axiosResponse({ key: "PROJ", name: "Updated" }));

      const handler = toolHandlers.get("updateProject")!;
      const result = await handler({ projectKey: "PROJ", name: "Updated" }) as any;

      expect(mockAxios.put).toHaveBeenCalledWith("/projects/PROJ", { name: "Updated" });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.name).toBe("Updated");
    });
  });
});
