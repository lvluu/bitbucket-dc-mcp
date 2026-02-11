/**
 * Integration test: verifies field-filter summarization against real Bitbucket DC.
 * READ-ONLY operations only — no creates, updates, deletes, or writes.
 *
 * Requires: npm run build (uses stdio transport against built server)
 * Requires: .env with valid BITBUCKET_URL and BITBUCKET_TOKEN
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { TestClient } from "../helpers/test-client.js";
import { config } from "dotenv";

// Load .env so we can check for credentials
config();

const hasCredentials =
  !!process.env.BITBUCKET_URL &&
  (!!process.env.BITBUCKET_TOKEN || (!!process.env.BITBUCKET_USERNAME && !!process.env.BITBUCKET_PASSWORD));

// Fields that should be stripped by summarizers
const STRIPPED_FIELDS = ["links", "avatarUrl", "hierarchyId", "statusMessage"];

function parseToolResult(result: any): unknown {
  expect(result.isError).toBeUndefined();
  expect(result.content).toHaveLength(1);
  return JSON.parse(result.content[0].text);
}

describe.skipIf(!hasCredentials)("field-filter live integration (read-only)", () => {
  const client = new TestClient();

  beforeAll(async () => {
    await client.setup();
  }, 30000);

  afterAll(async () => {
    await client.teardown();
  });

  it("listProjects returns summarized projects", async () => {
    const result = await client.callTool("listProjects", { limit: 5 });
    const data = parseToolResult(result) as Array<Record<string, unknown>>;

    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);

    const project = data[0]!;
    // Should have essential fields
    expect(project).toHaveProperty("key");
    expect(project).toHaveProperty("name");

    // Should NOT have stripped fields
    const json = JSON.stringify(project);
    for (const field of STRIPPED_FIELDS) {
      expect(json).not.toContain(`"${field}"`);
    }
  }, 15000);

  it("listRepositories returns summarized repos", async () => {
    const result = await client.callTool("listRepositories", { limit: 3 });
    const data = parseToolResult(result) as Array<Record<string, unknown>>;

    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);

    const repo = data[0]!;
    // Should have essential fields
    expect(repo).toHaveProperty("slug");
    expect(repo).toHaveProperty("name");

    // Project should be simplified to key+name only
    if (repo.project != null) {
      const proj = repo.project as Record<string, unknown>;
      expect(proj).toHaveProperty("key");
      expect(proj).toHaveProperty("name");
      expect(proj).not.toHaveProperty("links");
      expect(proj).not.toHaveProperty("avatarUrl");
      expect(proj).not.toHaveProperty("id");
    }

    // Should NOT have stripped fields at top level
    expect(repo).not.toHaveProperty("links");
    expect(repo).not.toHaveProperty("hierarchyId");
  }, 15000);

  it("listBranches returns summarized branches", async () => {
    // First get a repo slug to list branches from
    const reposResult = await client.callTool("listRepositories", { limit: 1 });
    const repos = parseToolResult(reposResult) as Array<Record<string, unknown>>;
    expect(repos.length).toBeGreaterThan(0);

    const repoSlug = repos[0]!.slug as string;
    const projectObj = repos[0]!.project as Record<string, unknown>;
    const projectKey = projectObj.key as string;

    const result = await client.callTool("listBranches", {
      projectKey,
      repoSlug,
      limit: 5,
    });
    const data = parseToolResult(result) as Array<Record<string, unknown>>;

    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);

    const branch = data[0]!;
    expect(branch).toHaveProperty("id");
    expect(branch).toHaveProperty("displayId");

    // Should NOT have metadata or other bloat
    expect(branch).not.toHaveProperty("metadata");
    expect(branch).not.toHaveProperty("links");
  }, 20000);

  it("listCommits returns summarized commits", async () => {
    // Get a repo first
    const reposResult = await client.callTool("listRepositories", { limit: 1 });
    const repos = parseToolResult(reposResult) as Array<Record<string, unknown>>;
    expect(repos.length).toBeGreaterThan(0);

    const repoSlug = repos[0]!.slug as string;
    const projectObj = repos[0]!.project as Record<string, unknown>;
    const projectKey = projectObj.key as string;

    const result = await client.callTool("listCommits", {
      projectKey,
      repoSlug,
      limit: 5,
    });
    const data = parseToolResult(result) as Array<Record<string, unknown>>;

    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);

    const commit = data[0]!;
    expect(commit).toHaveProperty("id");
    expect(commit).toHaveProperty("displayId");
    expect(commit).toHaveProperty("message");

    // Author should be name+email only
    if (commit.author != null) {
      const author = commit.author as Record<string, unknown>;
      expect(author).toHaveProperty("name");
      expect(author).toHaveProperty("emailAddress");
      expect(author).not.toHaveProperty("avatarUrl");
    }

    expect(commit).not.toHaveProperty("properties");
  }, 20000);

  it("getProject still returns full details (not summarized)", async () => {
    const result = await client.callTool("getProject", { projectKey: "AIEM" });
    const data = parseToolResult(result) as Record<string, unknown>;

    // Full response should have id and links
    expect(data).toHaveProperty("key", "AIEM");
    expect(data).toHaveProperty("id");
    expect(data).toHaveProperty("links");
  }, 15000);
});
