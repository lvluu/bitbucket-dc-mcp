import { describe, it, expect } from "vitest";
import { repoPath, prPath } from "#lib/client.js";

describe("client", () => {
  describe("repoPath", () => {
    it("should build a repository path", () => {
      expect(repoPath("PROJ", "my-repo")).toBe("/projects/PROJ/repos/my-repo");
    });

    it("should handle special characters in slug", () => {
      expect(repoPath("KEY", "repo-with-dashes")).toBe("/projects/KEY/repos/repo-with-dashes");
    });
  });

  describe("prPath", () => {
    it("should build a pull request path with numeric ID", () => {
      expect(prPath("PROJ", "repo", 42)).toBe("/projects/PROJ/repos/repo/pull-requests/42");
    });

    it("should build a pull request path with string ID", () => {
      expect(prPath("PROJ", "repo", "7")).toBe("/projects/PROJ/repos/repo/pull-requests/7");
    });
  });
});
