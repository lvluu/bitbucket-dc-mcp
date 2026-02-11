import { describe, it, expect } from "vitest";
import {
  summarizePullRequest,
  summarizeRepository,
  summarizeBranch,
  summarizeCommit,
  summarizeProject,
  summarizeArray,
} from "#lib/field-filter.js";

describe("field-filter", () => {
  describe("summarizePullRequest", () => {
    const fullPR = {
      id: 1,
      title: "Add feature X",
      state: "OPEN",
      draft: false,
      createdDate: 1700000000000,
      updatedDate: 1700001000000,
      author: {
        user: {
          name: "jdoe",
          displayName: "John Doe",
          emailAddress: "jdoe@example.com",
          slug: "jdoe",
          id: 42,
          type: "NORMAL",
          active: true,
          links: { self: [{ href: "http://bb/users/jdoe" }] },
          avatarUrl: "http://bb/avatars/jdoe.png",
        },
        role: "AUTHOR",
        approved: false,
        status: "UNAPPROVED",
      },
      fromRef: {
        id: "refs/heads/feature-x",
        displayId: "feature-x",
        latestCommit: "abc123",
        repository: {
          slug: "my-repo",
          name: "my-repo",
          project: { key: "PROJ", name: "Project", id: 1 },
          links: { self: [{ href: "http://bb/repos" }] },
        },
      },
      toRef: {
        id: "refs/heads/main",
        displayId: "main",
        latestCommit: "def456",
        repository: {
          slug: "my-repo",
          name: "my-repo",
          project: { key: "PROJ", name: "Project", id: 1 },
          links: { self: [{ href: "http://bb/repos" }] },
        },
      },
      reviewers: [
        {
          user: {
            name: "reviewer1",
            displayName: "Reviewer One",
            emailAddress: "r1@example.com",
            id: 99,
            avatarUrl: "http://bb/avatars/r1.png",
          },
          role: "REVIEWER",
          approved: true,
          status: "APPROVED",
          lastReviewedCommit: "abc123",
        },
      ],
      links: { self: [{ href: "http://bb/prs/1" }] },
      properties: { mergeResult: { outcome: "CLEAN" } },
    };

    it("should keep only essential fields", () => {
      const summary = summarizePullRequest(fullPR);

      expect(summary).toEqual({
        id: 1,
        title: "Add feature X",
        state: "OPEN",
        draft: false,
        createdDate: 1700000000000,
        updatedDate: 1700001000000,
        author: { name: "jdoe", displayName: "John Doe" },
        sourceBranch: { id: "refs/heads/feature-x", displayId: "feature-x" },
        targetBranch: { id: "refs/heads/main", displayId: "main" },
        reviewers: [
          { name: "reviewer1", displayName: "Reviewer One", approved: true, status: "APPROVED" },
        ],
      });
    });

    it("should strip avatar URLs, links, nested repo/project objects", () => {
      const summary = summarizePullRequest(fullPR);

      const json = JSON.stringify(summary);
      expect(json).not.toContain("avatarUrl");
      expect(json).not.toContain("links");
      expect(json).not.toContain("repository");
      expect(json).not.toContain("properties");
      expect(json).not.toContain("emailAddress");
      expect(json).not.toContain("slug");
    });

    it("should handle missing optional fields gracefully", () => {
      const minimalPR = { id: 2, title: "Minimal", state: "MERGED" };
      const summary = summarizePullRequest(minimalPR);

      expect(summary.id).toBe(2);
      expect(summary.title).toBe("Minimal");
      expect(summary.author).toBeUndefined();
      expect(summary.sourceBranch).toBeUndefined();
      expect(summary.targetBranch).toBeUndefined();
      expect(summary.reviewers).toBeUndefined();
    });

    it("should handle empty reviewers array", () => {
      const pr = { id: 3, title: "No reviewers", state: "OPEN", reviewers: [] };
      const summary = summarizePullRequest(pr);
      expect(summary.reviewers).toBeUndefined();
    });
  });

  describe("summarizeRepository", () => {
    const fullRepo = {
      slug: "my-repo",
      name: "My Repo",
      description: "A test repo",
      project: {
        key: "PROJ",
        name: "Project",
        id: 1,
        description: "Project desc",
        public: true,
        type: "NORMAL",
        links: { self: [{ href: "http://bb/projects/PROJ" }] },
        avatarUrl: "http://bb/avatars/proj.png",
      },
      public: false,
      forkable: true,
      defaultBranch: { displayId: "main", id: "refs/heads/main", type: "BRANCH" },
      scmId: "git",
      state: "AVAILABLE",
      statusMessage: "Available",
      links: { clone: [{ href: "ssh://git@bb/proj/my-repo.git" }], self: [{ href: "http://bb" }] },
      hierarchyId: "abc123def456",
    };

    it("should keep only essential fields", () => {
      const summary = summarizeRepository(fullRepo);

      expect(summary).toEqual({
        slug: "my-repo",
        name: "My Repo",
        description: "A test repo",
        project: { key: "PROJ", name: "Project" },
        public: false,
        forkable: true,
        defaultBranch: "main",
        scmId: "git",
      });
    });

    it("should strip links, avatars, hierarchy IDs", () => {
      const summary = summarizeRepository(fullRepo);
      const json = JSON.stringify(summary);

      expect(json).not.toContain("links");
      expect(json).not.toContain("avatarUrl");
      expect(json).not.toContain("hierarchyId");
      expect(json).not.toContain("statusMessage");
    });
  });

  describe("summarizeBranch", () => {
    it("should keep only essential fields", () => {
      const fullBranch = {
        id: "refs/heads/feature-x",
        displayId: "feature-x",
        type: "BRANCH",
        latestCommit: "abc123",
        latestChangeset: "abc123",
        isDefault: false,
        metadata: { "com.atlassian.stash.stash-branch-utils": { aheadCount: 3, behindCount: 1 } },
      };

      const summary = summarizeBranch(fullBranch);

      expect(summary).toEqual({
        id: "refs/heads/feature-x",
        displayId: "feature-x",
        type: "BRANCH",
        latestCommit: "abc123",
        latestChangeset: "abc123",
        isDefault: false,
      });
      expect(JSON.stringify(summary)).not.toContain("metadata");
    });
  });

  describe("summarizeCommit", () => {
    const fullCommit = {
      id: "abc123def456789",
      displayId: "abc123d",
      message: "Fix the bug",
      author: {
        name: "John Doe",
        emailAddress: "jdoe@example.com",
        avatarUrl: "http://bb/avatars/jdoe.png",
      },
      authorTimestamp: 1700000000000,
      committer: {
        name: "Jane Smith",
        emailAddress: "jsmith@example.com",
        avatarUrl: "http://bb/avatars/jsmith.png",
      },
      committerTimestamp: 1700001000000,
      parents: [{ id: "parent123", displayId: "parent1" }],
      properties: { "jira-key": ["PROJ-123"] },
    };

    it("should keep only essential fields", () => {
      const summary = summarizeCommit(fullCommit);

      expect(summary).toEqual({
        id: "abc123def456789",
        displayId: "abc123d",
        message: "Fix the bug",
        author: { name: "John Doe", emailAddress: "jdoe@example.com" },
        authorTimestamp: 1700000000000,
        committer: { name: "Jane Smith", emailAddress: "jsmith@example.com" },
        committerTimestamp: 1700001000000,
        parents: [{ id: "parent123", displayId: "parent1" }],
      });
    });

    it("should strip avatar URLs and properties", () => {
      const summary = summarizeCommit(fullCommit);
      const json = JSON.stringify(summary);

      expect(json).not.toContain("avatarUrl");
      expect(json).not.toContain("properties");
      expect(json).not.toContain("jira-key");
    });
  });

  describe("summarizeProject", () => {
    it("should keep only essential fields", () => {
      const fullProject = {
        key: "PROJ",
        name: "My Project",
        description: "A test project",
        public: true,
        type: "NORMAL",
        id: 1,
        links: { self: [{ href: "http://bb/projects/PROJ" }] },
        avatarUrl: "http://bb/avatars/proj.png",
      };

      const summary = summarizeProject(fullProject);

      expect(summary).toEqual({
        key: "PROJ",
        name: "My Project",
        description: "A test project",
        public: true,
        type: "NORMAL",
      });
      expect(JSON.stringify(summary)).not.toContain("avatarUrl");
      expect(JSON.stringify(summary)).not.toContain("links");
    });
  });

  describe("summarizeArray", () => {
    it("should map items through the summarizer", () => {
      const items = [
        { key: "A", name: "Alpha", extra: "junk" },
        { key: "B", name: "Beta", extra: "junk" },
      ];

      const result = summarizeArray(items, summarizeProject);

      expect(result).toEqual([
        { key: "A", name: "Alpha", description: undefined, public: undefined, type: undefined },
        { key: "B", name: "Beta", description: undefined, public: undefined, type: undefined },
      ]);
    });

    it("should return undefined for empty array", () => {
      expect(summarizeArray([], summarizeProject)).toBeUndefined();
    });

    it("should return undefined for undefined input", () => {
      expect(summarizeArray(undefined, summarizeProject)).toBeUndefined();
    });
  });
});
