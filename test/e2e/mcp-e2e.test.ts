// End-to-end test: boots the *built* MCP server (build/index.js) against a
// fake Bitbucket DC REST API and drives every registered tool through a real
// MCP client over Streamable HTTP.
//
// Default: spawns test/e2e/stub-bitbucket.mjs in-process.
// Docker:  set E2E_STUB_URL to an already-running stub (see compose.yaml).
import { spawn, type ChildProcess } from "node:child_process";
import { afterAll, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const STUB_PORT = Number(process.env.E2E_STUB_PORT ?? 7990);
const MCP_PORT = Number(process.env.E2E_MCP_PORT ?? 3999);
const EXTERNAL_STUB = process.env.E2E_STUB_URL;
const STUB_URL = EXTERNAL_STUB ?? `http://127.0.0.1:${STUB_PORT}`;
const MCP_URL = `http://127.0.0.1:${MCP_PORT}/mcp`;

// The package targets Node (engines >=22). Run under real `node`, not bun:
// bun would honor tsconfig `paths` and load the TS sources instead of build/.
const NODE = process.env.E2E_NODE ?? "node";

const children: ChildProcess[] = [];
function track(child: ChildProcess): ChildProcess {
  children.push(child);
  return child;
}

async function waitFor(url: string, ms = 30_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function startStub(): ChildProcess {
  const child = track(spawn(NODE, ["test/e2e/stub-bitbucket.mjs"], {
    env: { ...process.env, PORT: String(STUB_PORT) },
    stdio: ["ignore", "pipe", "inherit"],
  }));
  return child;
}

function startMcp(): ChildProcess {
  const child = track(spawn(NODE, ["build/index.js"], {
    env: {
      ...process.env,
      BITBUCKET_URL: STUB_URL,
      BITBUCKET_TOKEN: "e2e-token",
      BITBUCKET_DEFAULT_PROJECT: "PROJ",
      BITBUCKET_ENABLE_DANGEROUS: "true",
      MCP_TRANSPORT: "http",
      PORT: String(MCP_PORT),
    },
    stdio: ["ignore", "ignore", "inherit"],
  }));
  return child;
}

afterAll(() => {
  for (const c of children) {
    try {
      c.kill("SIGKILL");
    } catch {
      /* ignore */
    }
  }
});

interface Call {
  name: string;
  args: Record<string, unknown>;
}
interface Row {
  tool: string;
  ok: boolean;
  bytes: number;
  ms: number;
  error?: string;
}

test("every Bitbucket DC tool works end to end", async () => {
  if (!EXTERNAL_STUB) startStub();
  await waitFor(`${STUB_URL}/rest/api/1.0/projects`);

  // Discover a real commit hash from the stub to feed commit/build tools.
  const commitRes = await fetch(`${STUB_URL}/rest/api/1.0/projects/PROJ/repos/awesome-repo/commits?limit=1`);
  const commitId = (await commitRes.json()).values[0].id as string;

  startMcp();
  await waitFor(`http://127.0.0.1:${MCP_PORT}/health`);

  const client = new Client({ name: "e2e", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));
  await client.connect(transport);

  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  expect(names.length).toBeGreaterThanOrEqual(55);

  const repo = "awesome-repo";
  const calls: Call[] = [
    { name: "listProjects", args: { all: true } },
    { name: "getProject", args: { projectKey: "PROJ" } },
    { name: "createProject", args: { key: "NEWP", name: "New Project", description: "created by e2e" } },
    { name: "updateProject", args: { projectKey: "NEWP", description: "updated by e2e" } },

    { name: "listRepositories", args: { projectKey: "PROJ", all: true } },
    { name: "getRepository", args: { projectKey: "PROJ", repoSlug: repo } },
    { name: "createRepository", args: { projectKey: "PROJ", name: "created-repo" } },
    { name: "forkRepository", args: { projectKey: "PROJ", repoSlug: repo, targetProjectKey: "PROJ", name: "awesome-fork" } },
    { name: "getDefaultBranch", args: { projectKey: "PROJ", repoSlug: repo } },
    { name: "setDefaultBranch", args: { projectKey: "PROJ", repoSlug: repo, branchId: "refs/heads/develop" } },

    { name: "listPullRequests", args: { projectKey: "PROJ", repoSlug: repo, all: true } },
    { name: "getPullRequest", args: { projectKey: "PROJ", repoSlug: repo, prId: 1 } },
    { name: "createPullRequest", args: { projectKey: "PROJ", repoSlug: repo, title: "E2E PR", sourceBranch: "feature/login", targetBranch: "main", reviewers: ["alice"], draft: true } },
    { name: "updatePullRequest", args: { projectKey: "PROJ", repoSlug: repo, prId: 1, title: "Updated by e2e" } },
    { name: "approvePullRequest", args: { projectKey: "PROJ", repoSlug: repo, prId: 1 } },
    { name: "unapprovePullRequest", args: { projectKey: "PROJ", repoSlug: repo, prId: 1 } },
    { name: "addPullRequestReviewers", args: { projectKey: "PROJ", repoSlug: repo, prId: 1, reviewers: ["bob", "carol"] } },
    { name: "markPullRequestAsDraft", args: { projectKey: "PROJ", repoSlug: repo, prId: 1, draft: true } },
    { name: "canMergePullRequest", args: { projectKey: "PROJ", repoSlug: repo, prId: 1 } },
    { name: "declinePullRequest", args: { projectKey: "PROJ", repoSlug: repo, prId: 4, message: "not now" } },
    { name: "reopenPullRequest", args: { projectKey: "PROJ", repoSlug: repo, prId: 4 } },

    { name: "listBranches", args: { projectKey: "PROJ", repoSlug: repo, all: true } },
    { name: "createBranch", args: { projectKey: "PROJ", repoSlug: repo, name: "feature/e2e", startPoint: "main" } },
    { name: "deleteBranch", args: { projectKey: "PROJ", repoSlug: repo, name: "feature/e2e", dryRun: false } },
    { name: "listTags", args: { projectKey: "PROJ", repoSlug: repo, all: true } },
    { name: "createTag", args: { projectKey: "PROJ", repoSlug: repo, name: "v9.9.9", startPoint: commitId } },

    { name: "listCommits", args: { projectKey: "PROJ", repoSlug: repo, all: true } },
    { name: "getCommit", args: { projectKey: "PROJ", repoSlug: repo, commitId } },
    { name: "getCommitChanges", args: { projectKey: "PROJ", repoSlug: repo, commitId } },
    { name: "getCommitDiff", args: { projectKey: "PROJ", repoSlug: repo, commitId, contextLines: 2 } },

    { name: "browseFiles", args: { projectKey: "PROJ", repoSlug: repo, path: "src" } },
    { name: "getFileContent", args: { projectKey: "PROJ", repoSlug: repo, path: "README.md" } },
    { name: "editFile", args: { projectKey: "PROJ", repoSlug: repo, path: "src/new.ts", content: "export const x = 1;\n", message: "add file", branch: "main" } },
    { name: "listFiles", args: { projectKey: "PROJ", repoSlug: repo, all: true } },

    { name: "listPRComments", args: { projectKey: "PROJ", repoSlug: repo, prId: 1, state: "ALL" } },
    { name: "addPRComment", args: { projectKey: "PROJ", repoSlug: repo, prId: 3, text: "plain comment" } },
    { name: "getPRComment", args: { projectKey: "PROJ", repoSlug: repo, prId: 1, commentId: 1 } },
    { name: "updatePRComment", args: { projectKey: "PROJ", repoSlug: repo, prId: 1, commentId: 1, text: "edited", version: 0 } },
    { name: "resolvePRComment", args: { projectKey: "PROJ", repoSlug: repo, prId: 1, commentId: 1, version: 1 } },
    { name: "reopenPRComment", args: { projectKey: "PROJ", repoSlug: repo, prId: 1, commentId: 1, version: 2 } },
    { name: "deletePRComment", args: { projectKey: "PROJ", repoSlug: repo, prId: 1, commentId: 3, version: 0 } },

    { name: "getPullRequestDiff", args: { projectKey: "PROJ", repoSlug: repo, prId: 1, contextLines: 3 } },
    { name: "streamPullRequestDiff", args: { projectKey: "PROJ", repoSlug: repo, prId: 1 } },
    { name: "getPullRequestPatch", args: { projectKey: "PROJ", repoSlug: repo, prId: 1 } },
    { name: "getPullRequestChanges", args: { projectKey: "PROJ", repoSlug: repo, prId: 1, all: true } },

    { name: "getPullRequestActivity", args: { projectKey: "PROJ", repoSlug: repo, prId: 1, all: true } },
    { name: "getPullRequestCommits", args: { projectKey: "PROJ", repoSlug: repo, prId: 1, all: true } },
    { name: "getPullRequestParticipants", args: { projectKey: "PROJ", repoSlug: repo, prId: 1 } },

    { name: "startReview", args: { projectKey: "PROJ", repoSlug: repo, prId: 5 } },
    { name: "addPRComment", args: { projectKey: "PROJ", repoSlug: repo, prId: 5, text: "buffered comment" } },
    { name: "listPendingReviewComments", args: { projectKey: "PROJ", repoSlug: repo, prId: 5 } },
    { name: "finishReview", args: { projectKey: "PROJ", repoSlug: repo, prId: 5, reviewStatus: "APPROVED" } },
    { name: "startReview", args: { projectKey: "PROJ", repoSlug: repo, prId: 6 } },
    { name: "discardReview", args: { projectKey: "PROJ", repoSlug: repo, prId: 6 } },

    { name: "listPRTasks", args: { projectKey: "PROJ", repoSlug: repo, prId: 1, all: true } },
    { name: "addBlockerComment", args: { projectKey: "PROJ", repoSlug: repo, prId: 3, text: "must fix", anchorPath: "src/index.ts", anchorLine: 10, anchorFileType: "TO" } },
    { name: "resolveTask", args: { projectKey: "PROJ", repoSlug: repo, prId: 1, commentId: 1, version: 0 } },
    { name: "reopenTask", args: { projectKey: "PROJ", repoSlug: repo, prId: 1, commentId: 1, version: 1 } },

    { name: "getBuildStatuses", args: { commitId, all: true } },
    { name: "getBuildStatusStats", args: { commitId, includeUnique: true } },

    // last: mutates PR 1
    { name: "mergePullRequest", args: { projectKey: "PROJ", repoSlug: repo, prId: 1, message: "merge e2e", strategy: "squash" } },
  ];

  const available = new Set(names);
  const missing = calls.map((c) => c.name).filter((n) => !available.has(n));
  expect(missing).toEqual([]);

  const rows: Row[] = [];
  const failures: string[] = [];

  for (const call of calls) {
    const started = Date.now();
    try {
      const res = (await client.callTool({ name: call.name, arguments: call.args })) as {
        content?: { type: string; text?: string }[];
        isError?: boolean;
      };
      const text = (res.content ?? []).map((c) => c.text ?? "").join("\n");
      const ok = res.isError !== true;
      rows.push({ tool: call.name, ok, bytes: Buffer.byteLength(text), ms: Date.now() - started });
      if (!ok) failures.push(`${call.name}: ${text.slice(0, 200)}`);
    } catch (err) {
      rows.push({ tool: call.name, ok: false, bytes: 0, ms: Date.now() - started, error: String(err) });
      failures.push(`${call.name}: threw ${String(err)}`);
    }
  }

  // Prove the token squeeze is active on the wire: list/get results are compact
  // and noise keys (links/avatarUrl) are stripped.
  const listProjects = rows.find((r) => r.tool === "listProjects");
  const projectRes = (await client.callTool({ name: "listProjects", arguments: { all: true } })) as {
    content: { text: string }[];
  };
  const sampleText = projectRes.content[0]?.text ?? "";
  expect(sampleText).not.toContain('"links"');
  expect(sampleText).not.toContain("avatarUrl");
  expect(typeof listProjects?.bytes).toBe("number");

  await client.close();

  await Bun.write("test/e2e/.last-run.json", JSON.stringify({ when: new Date().toISOString(), total: rows.length, passed: rows.filter((r) => r.ok).length, rows }, null, 2));

  if (failures.length > 0) throw new Error(`Tool failures:\n${failures.join("\n")}`);
  expect(rows.every((r) => r.ok)).toBe(true);
  expect(rows.length).toBe(calls.length);
}, 180_000);
