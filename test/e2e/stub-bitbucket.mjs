// Zero-dependency fake Bitbucket Data Center REST API for e2e testing.
// Implements the /rest/api/1.0 and /rest/build-status/1.0 endpoints that the
// MCP server's tools call. State is in-memory and mutable so create/update/
// delete flows can be exercised end to end.
//
// Run standalone:  PORT=7990 node stub-bitbucket.mjs
// Prints "STUB_READY <port>" on stdout once listening.
import http from "node:http";
import crypto from "node:crypto";

const PORT = Number(process.env.PORT ?? 7990);

const sha = (s) => crypto.createHash("sha1").update(s).digest("hex");
const now = Date.UTC(2024, 0, 1);

function user(name) {
  return {
    name,
    displayName: name[0].toUpperCase() + name.slice(1),
    emailAddress: `${name}@example.com`,
    id: 1000 + name.length,
    // noise the squeeze should strip:
    links: { self: [{ href: `/users/${name}` }] },
    avatarUrl: `/avatar/${name}`,
  };
}

// ---- commits ---------------------------------------------------------------
function makeCommits(count) {
  const out = [];
  let prev = null;
  for (let i = count; i >= 1; i--) {
    const id = sha(`commit-${i}`);
    out.push({
      id,
      displayId: id.slice(0, 7),
      message: `Commit ${i}: change number ${i}\n\nBody line`,
      author: user("alice"),
      authorTimestamp: now + i * 60_000,
      committer: user("alice"),
      committerTimestamp: now + i * 60_000 + 5_000,
      parents: prev ? [{ id: prev, displayId: prev.slice(0, 7) }] : [],
      links: { self: [{ href: `/commits/${id}` }] },
    });
    prev = id;
  }
  return out;
}

const COMMITS = makeCommits(30);
const HEAD = COMMITS[COMMITS.length - 1].id;
const HEAD2 = COMMITS[COMMITS.length - 2].id;

// ---- branches / tags -------------------------------------------------------
function branch(displayId, isDefault) {
  const id = `refs/heads/${displayId}`;
  return {
    id,
    displayId,
    type: "BRANCH",
    latestCommit: HEAD,
    latestChangeset: HEAD,
    isDefault,
    links: { self: [{ href: `/branches/${displayId}` }] },
  };
}
function makeBranches() {
  return [branch("main", true), branch("develop", false), branch("feature/login", false)];
}
function tag(displayId) {
  return {
    id: `refs/tags/${displayId}`,
    displayId,
    type: "TAG",
    latestCommit: HEAD,
    latestChangeset: HEAD,
    isDefault: false,
  };
}

// ---- comments / activities -------------------------------------------------
let commentSeq = 1;
function makeComment({ text, severity = "NORMAL", resolved = false, state = "OPEN" }) {
  const id = commentSeq++;
  return {
    id,
    version: 0,
    text,
    author: user("bob"),
    createdDate: now,
    updatedDate: now,
    severity,
    state,
    threadResolved: resolved,
    comments: [],
    tasks: [],
    links: { self: [{ href: `/comments/${id}` }] },
  };
}

function makeActivities() {
  const c1 = makeComment({ text: "Please add a null check here.", severity: "BLOCKER" });
  const c2 = makeComment({ text: "Looks good to me.", resolved: true, state: "RESOLVED" });
  const c3 = makeComment({ text: "nit: rename this variable." });
  return [
    { id: 1, action: "OPENED", createdDate: now, user: user("admin") },
    { id: 2, action: "REVIEWER_ADDED", createdDate: now, user: user("alice") },
    { id: 3, action: "COMMENTED", createdDate: now, user: user("bob"), comment: c1 },
    { id: 4, action: "COMMENTED", createdDate: now, user: user("alice"), comment: c2 },
    { id: 5, action: "COMMENTED", createdDate: now, user: user("carol"), comment: c3 },
    { id: 6, action: "APPROVED", createdDate: now, user: user("alice") },
  ];
}

// ---- pull requests ---------------------------------------------------------
function ref(displayId, isDefault) {
  return {
    id: `refs/heads/${displayId}`,
    displayId,
    type: "BRANCH",
    latestCommit: isDefault && displayId === "main" ? HEAD : HEAD2,
    repository: {
      slug: "awesome-repo",
      name: "awesome-repo",
      project: { key: "PROJ", name: "Project One" },
    },
  };
}

let prSeq = 100;
function makePR({ id, title, state, draft = false, source = "feature/login", target = "main" }) {
  return {
    id,
    version: 1,
    title,
    description: `${title} description`,
    state,
    open: state === "OPEN",
    closed: state !== "OPEN",
    draft,
    locked: false,
    createdDate: now,
    updatedDate: now,
    fromRef: ref(source),
    toRef: ref(target, true),
    author: { ...user("admin"), role: "AUTHOR", approved: false, status: "UNAPPROVED" },
    reviewers: [{ ...user("alice"), role: "REVIEWER", approved: state === "MERGED", status: state === "MERGED" ? "APPROVED" : "UNAPPROVED" }],
    participants: [],
    links: { self: [{ href: `/pull-requests/${id}` }] },
  };
}

const PRS = [
  makePR({ id: 1, title: "Add login flow", state: "OPEN" }),
  makePR({ id: 2, title: "Refactor config loader", state: "MERGED" }),
  makePR({ id: 3, title: "Bump dependency", state: "DECLINED" }),
  makePR({ id: 4, title: "WIP: new dashboard", state: "OPEN", draft: true }),
];

// ---- projects / repositories ----------------------------------------------
const state = {
  projects: [
    { key: "PROJ", id: 1, name: "Project One", description: "First project", public: false, type: "NORMAL", links: {} },
    { key: "DEMO", id: 2, name: "Demo Project", description: "Demo", public: true, type: "NORMAL", links: {} },
  ],
  repos: {
    PROJ: [
      mkRepo("awesome-repo", "awesome-repo", false),
      mkRepo("second-repo", "Second Repo", true),
    ],
    DEMO: [mkRepo("demo-repo", "demo-repo", false)],
  },
  branches: { PROJ: { "awesome-repo": makeBranches(), "second-repo": makeBranches() }, DEMO: { "demo-repo": makeBranches() } },
  tags: { PROJ: { "awesome-repo": [tag("v1.0.0"), tag("v1.0.1")] } },
  prs: { PROJ: { "awesome-repo": PRS } },
  comments: { "PROJ/awesome-repo/1": makeActivities() },
};

function mkRepo(slug, name, isPublic) {
  return {
    slug,
    id: 100 + slug.length,
    name,
    description: `${name} description`,
    public: isPublic,
    forkable: true,
    scmId: "git",
    state: "AVAILABLE",
    defaultBranch: { id: "refs/heads/main", displayId: "main" },
    project: { key: slug === "demo-repo" ? "DEMO" : "PROJ", name: "Project" },
    links: { self: [{ href: `/repos/${slug}` }], clone: [] },
  };
}

// ---- helpers ---------------------------------------------------------------
function paged(items, url) {
  const q = url.searchParams;
  let start = Number.parseInt(q.get("start") ?? "0", 10);
  if (!Number.isFinite(start) || start < 0) start = 0;
  let limit = Number.parseInt(q.get("limit") ?? "25", 10);
  if (!Number.isFinite(limit) || limit < 1) limit = 25;
  limit = Math.min(limit, 100);
  const slice = items.slice(start, start + limit);
  const body = {
    values: slice,
    size: slice.length,
    limit,
    isLastPage: start + limit >= items.length,
    start,
  };
  if (start + limit < items.length) body.nextPageStart = start + limit;
  return body;
}

function filterBy(items, value, field = "name") {
  if (!value) return items;
  const needle = value.toLowerCase();
  return items.filter((i) => String(i[field] ?? "").toLowerCase().includes(needle));
}

function json(res, code, body) {
  const text = JSON.stringify(body);
  res.writeHead(code, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(text) });
  res.end(text);
}
function text(res, code, body) {
  res.writeHead(code, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(body);
}
function noContent(res) {
  res.writeHead(204);
  res.end();
}
function notFound(res, path) {
  json(res, 404, { errors: [{ message: `Not found: ${path}` }] });
}
function readingBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
}
async function readJSON(req) {
  const raw = await readingBody(req);
  if (!raw.length) return {};
  try {
    return JSON.parse(raw.toString("utf8"));
  } catch {
    return {};
  }
}

function findProject(key) {
  return state.projects.find((p) => p.key === key);
}
function findRepo(key, slug) {
  return (state.repos[key] ?? []).find((r) => r.slug === slug);
}
function findPR(key, slug, id) {
  return (state.prs[key]?.[slug] ?? []).find((p) => p.id === Number(id));
}
function activitiesFor(key, slug, id) {
  const k = `${key}/${slug}/${id}`;
  if (!state.comments[k]) state.comments[k] = makeActivities();
  return state.comments[k];
}

// ---- routes ----------------------------------------------------------------
const R = [];
const on = (method, re, handler) => R.push({ method, re, handler });

// projects
on("GET", /^\/rest\/api\/1\.0\/projects$/, (req, res, url) => {
  const name = url.searchParams.get("name");
  json(res, 200, paged(filterBy(state.projects, name), url));
});
on("POST", /^\/rest\/api\/1\.0\/projects$/, async (req, res) => {
  const body = await readJSON(req);
  const project = { key: body.key, id: state.projects.length + 1, name: body.name, description: body.description ?? "", public: false, type: "NORMAL", links: {} };
  state.projects.push(project);
  state.repos[project.key] = [];
  json(res, 201, project);
});
on("GET", /^\/rest\/api\/1\.0\/projects\/([^/]+)$/, (req, res, url, m) => {
  const p = findProject(decodeURIComponent(m[1]));
  return p ? json(res, 200, p) : notFound(res, url.pathname);
});
on("PUT", /^\/rest\/api\/1\.0\/projects\/([^/]+)$/, async (req, res, url, m) => {
  const p = findProject(decodeURIComponent(m[1]));
  if (!p) return notFound(res, url.pathname);
  const body = await readJSON(req);
  if (body.name !== undefined) p.name = body.name;
  if (body.description !== undefined) p.description = body.description;
  json(res, 200, p);
});

// repositories
on("GET", /^\/rest\/api\/1\.0\/projects\/([^/]+)\/repos$/, (req, res, url, m) => {
  const list = state.repos[decodeURIComponent(m[1])] ?? [];
  json(res, 200, paged(filterBy(list, url.searchParams.get("name")), url));
});
on("POST", /^\/rest\/api\/1\.0\/projects\/([^/]+)\/repos$/, async (req, res, url, m) => {
  const key = decodeURIComponent(m[1]);
  const body = await readJSON(req);
  const slug = (body.name ?? "repo").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const repo = mkRepo(slug, body.name ?? slug, false);
  repo.scmId = body.scmId ?? "git";
  if (body.defaultBranch) repo.defaultBranch = { id: `refs/heads/${body.defaultBranch}`, displayId: body.defaultBranch };
  (state.repos[key] ??= []).push(repo);
  json(res, 201, repo);
});
on("GET", /^\/rest\/api\/1\.0\/projects\/([^/]+)\/repos\/([^/]+)$/, (req, res, url, m) => {
  const repo = findRepo(decodeURIComponent(m[1]), decodeURIComponent(m[2]));
  return repo ? json(res, 200, repo) : notFound(res, url.pathname);
});
on("POST", /^\/rest\/api\/1\.0\/projects\/([^/]+)\/repos\/([^/]+)$/, async (req, res, url, m) => {
  const srcKey = decodeURIComponent(m[1]);
  const slug = decodeURIComponent(m[2]);
  const src = findRepo(srcKey, slug);
  if (!src) return notFound(res, url.pathname);
  const body = await readJSON(req);
  const targetKey = body.project?.key ?? srcKey;
  const newSlug = (body.name ?? slug).toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const fork = mkRepo(newSlug, body.name ?? slug, false);
  (state.repos[targetKey] ??= []).push(fork);
  json(res, 201, fork);
});
on("GET", /^\/rest\/api\/1\.0\/projects\/([^/]+)\/repos\/([^/]+)\/default-branch$/, (req, res, url, m) => {
  const repo = findRepo(decodeURIComponent(m[1]), decodeURIComponent(m[2]));
  return repo ? json(res, 200, repo.defaultBranch) : notFound(res, url.pathname);
});
on("PUT", /^\/rest\/api\/1\.0\/projects\/([^/]+)\/repos\/([^/]+)\/default-branch$/, async (req, res, url, m) => {
  const repo = findRepo(decodeURIComponent(m[1]), decodeURIComponent(m[2]));
  if (!repo) return notFound(res, url.pathname);
  const body = await readJSON(req);
  repo.defaultBranch = { id: body.id, displayId: String(body.id).replace(/^refs\/heads\//, "") };
  json(res, 200, repo.defaultBranch);
});

// pull requests
on("GET", /^\/rest\/api\/1\.0\/projects\/([^/]+)\/repos\/([^/]+)\/pull-requests$/, (req, res, url, m) => {
  const list = state.prs[decodeURIComponent(m[1])]?.[decodeURIComponent(m[2])] ?? [];
  const st = url.searchParams.get("state");
  const filtered = !st || st === "ALL" ? list : list.filter((p) => p.state === st);
  json(res, 200, paged(filtered, url));
});
on("POST", /^\/rest\/api\/1\.0\/projects\/([^/]+)\/repos\/([^/]+)\/pull-requests$/, async (req, res, url, m) => {
  const key = decodeURIComponent(m[1]);
  const slug = decodeURIComponent(m[2]);
  const body = await readJSON(req);
  const pr = makePR({
    id: ++prSeq,
    title: body.title ?? "Untitled",
    state: "OPEN",
    draft: body.draft === true,
    source: String(body.fromRef?.id ?? "refs/heads/feature").replace(/^refs\/heads\//, ""),
    target: String(body.toRef?.id ?? "refs/heads/main").replace(/^refs\/heads\//, ""),
  });
  pr.description = body.description ?? "";
  if (Array.isArray(body.reviewers)) pr.reviewers = body.reviewers.map((r) => ({ ...user(r.user?.name ?? "reviewer"), role: "REVIEWER", approved: false, status: "UNAPPROVED" }));
  (state.prs[key] ??= {})[slug] ??= [];
  state.prs[key][slug].push(pr);
  json(res, 201, pr);
});
// .diff / .patch must be matched before the numeric /diff route
on("GET", /^\/rest\/api\/1\.0\/projects\/([^/]+)\/repos\/([^/]+)\/pull-requests\/(\d+)\.diff$/, (req, res, url, m) => {
  text(res, 200, `diff --git a/src/index.ts b/src/index.ts\n--- a/src/index.ts\n+++ b/src/index.ts\n@@ -1,2 +1,3 @@\n line\n+added for PR ${m[3]}\n`);
});
on("GET", /^\/rest\/api\/1\.0\/projects\/([^/]+)\/repos\/([^/]+)\/pull-requests\/(\d+)\.patch$/, (req, res, url, m) => {
  text(res, 200, `From ${sha("patch" + m[3])} Mon Sep 17 00:00:00 2001\nSubject: PR ${m[3]}\n\n---\n src/index.ts | 1 +\n`);
});
on("GET", /^\/rest\/api\/1\.0\/projects\/([^/]+)\/repos\/([^/]+)\/pull-requests\/(\d+)\/diff$/, (req, res, url, m) => {
  json(res, 200, { diffs: [{ source: { toString: "index.ts" }, destination: { toString: "index.ts" }, hunks: [{ segments: [{ lines: [{ type: "ADDED", line: "added" }] }] }], truncated: false }] });
});
on("GET", /^\/rest\/api\/1\.0\/projects\/([^/]+)\/repos\/([^/]+)\/pull-requests\/(\d+)\/changes$/, (req, res, url, m) => {
  json(res, 200, paged([{ path: { toString: "src/index.ts" }, srcPath: { toString: "src/index.ts" }, type: "MODIFY" }], url));
});
on("POST", /^\/rest\/api\/1\.0\/projects\/([^/]+)\/repos\/([^/]+)\/pull-requests\/(\d+)\/merge$/, async (req, res, url, m) => {
  const pr = findPR(decodeURIComponent(m[1]), decodeURIComponent(m[2]), m[3]);
  if (!pr) return notFound(res, url.pathname);
  pr.state = "MERGED"; pr.open = false; pr.closed = true; pr.version++;
  json(res, 200, pr);
});
on("GET", /^\/rest\/api\/1\.0\/projects\/([^/]+)\/repos\/([^/]+)\/pull-requests\/(\d+)\/merge$/, (req, res, url, m) => {
  const pr = findPR(decodeURIComponent(m[1]), decodeURIComponent(m[2]), m[3]);
  if (!pr) return notFound(res, url.pathname);
  json(res, 200, { canMerge: pr.state === "OPEN", conflicted: false, outcome: pr.state === "OPEN" ? "CLEAN" : "CONFLICTED", vetoes: [] });
});
on("POST", /^\/rest\/api\/1\.0\/projects\/([^/]+)\/repos\/([^/]+)\/pull-requests\/(\d+)\/decline$/, async (req, res, url, m) => {
  const pr = findPR(decodeURIComponent(m[1]), decodeURIComponent(m[2]), m[3]);
  if (!pr) return notFound(res, url.pathname);
  pr.state = "DECLINED"; pr.open = false; pr.closed = true; pr.version++;
  json(res, 200, pr);
});
on("POST", /^\/rest\/api\/1\.0\/projects\/([^/]+)\/repos\/([^/]+)\/pull-requests\/(\d+)\/reopen$/, async (req, res, url, m) => {
  const pr = findPR(decodeURIComponent(m[1]), decodeURIComponent(m[2]), m[3]);
  if (!pr) return notFound(res, url.pathname);
  pr.state = "OPEN"; pr.open = true; pr.closed = false; pr.version++;
  json(res, 200, pr);
});
on("POST", /^\/rest\/api\/1\.0\/projects\/([^/]+)\/repos\/([^/]+)\/pull-requests\/(\d+)\/approve$/, async (req, res, url, m) => {
  const pr = findPR(decodeURIComponent(m[1]), decodeURIComponent(m[2]), m[3]);
  if (!pr) return notFound(res, url.pathname);
  json(res, 200, { ...user("admin"), role: "REVIEWER", approved: true, status: "APPROVED" });
});
on("DELETE", /^\/rest\/api\/1\.0\/projects\/([^/]+)\/repos\/([^/]+)\/pull-requests\/(\d+)\/approve$/, (req, res) => noContent(res));
on("POST", /^\/rest\/api\/1\.0\/projects\/([^/]+)\/repos\/([^/]+)\/pull-requests\/(\d+)\/participants$/, async (req, res, url, m) => {
  const pr = findPR(decodeURIComponent(m[1]), decodeURIComponent(m[2]), m[3]);
  if (!pr) return notFound(res, url.pathname);
  const body = await readJSON(req);
  const name = body.user?.name ?? "reviewer";
  const role = body.role ?? "REVIEWER";
  const participant = { ...user(name), role, approved: false, status: "UNAPPROVED" };
  pr.reviewers = (pr.reviewers ?? []).filter((r) => r.name !== name).concat({ ...participant, user: undefined });
  json(res, 200, participant);
});
on("GET", /^\/rest\/api\/1\.0\/projects\/([^/]+)\/repos\/([^/]+)\/pull-requests\/(\d+)\/participants$/, (req, res, url, m) => {
  const pr = findPR(decodeURIComponent(m[1]), decodeURIComponent(m[2]), m[3]);
  if (!pr) return notFound(res, url.pathname);
  json(res, 200, { values: [pr.author, ...pr.reviewers], size: 1 + pr.reviewers.length, limit: 25, isLastPage: true });
});
on("GET", /^\/rest\/api\/1\.0\/projects\/([^/]+)\/repos\/([^/]+)\/pull-requests\/(\d+)\/activities$/, (req, res, url, m) => {
  json(res, 200, paged(activitiesFor(decodeURIComponent(m[1]), decodeURIComponent(m[2]), m[3]), url));
});
on("GET", /^\/rest\/api\/1\.0\/projects\/([^/]+)\/repos\/([^/]+)\/pull-requests\/(\d+)\/commits$/, (req, res, url) => {
  json(res, 200, paged(COMMITS.slice(0, 5), url));
});
on("POST", /^\/rest\/api\/1\.0\/projects\/([^/]+)\/repos\/([^/]+)\/pull-requests\/(\d+)\/comments$/, async (req, res, url, m) => {
  const acts = activitiesFor(decodeURIComponent(m[1]), decodeURIComponent(m[2]), m[3]);
  const body = await readJSON(req);
  const comment = makeComment({ text: body.text ?? "", severity: body.severity ?? "NORMAL", state: "OPEN" });
  if (body.anchor) comment.anchor = body.anchor;
  acts.push({ id: acts.length + 1, action: "COMMENTED", createdDate: now, user: user("admin"), comment });
  json(res, 201, comment);
});
on("GET", /^\/rest\/api\/1\.0\/projects\/([^/]+)\/repos\/([^/]+)\/pull-requests\/(\d+)\/comments\/(\d+)$/, (req, res, url, m) => {
  const acts = activitiesFor(decodeURIComponent(m[1]), decodeURIComponent(m[2]), m[3]);
  const c = acts.map((a) => a.comment).find((c) => c && c.id === Number(m[4]));
  return c ? json(res, 200, c) : notFound(res, url.pathname);
});
on("PUT", /^\/rest\/api\/1\.0\/projects\/([^/]+)\/repos\/([^/]+)\/pull-requests\/(\d+)\/comments\/(\d+)$/, async (req, res, url, m) => {
  const acts = activitiesFor(decodeURIComponent(m[1]), decodeURIComponent(m[2]), m[3]);
  const c = acts.map((a) => a.comment).find((c) => c && c.id === Number(m[4]));
  if (!c) return notFound(res, url.pathname);
  const body = await readJSON(req);
  if (body.text !== undefined) c.text = body.text;
  if (body.threadResolved !== undefined) c.threadResolved = body.threadResolved;
  if (body.state !== undefined) c.state = body.state;
  c.version++;
  json(res, 200, c);
});
on("DELETE", /^\/rest\/api\/1\.0\/projects\/([^/]+)\/repos\/([^/]+)\/pull-requests\/(\d+)\/comments\/(\d+)$/, (req, res) => noContent(res));
// get single PR (kept after the more specific /... routes above)
on("PUT", /^\/rest\/api\/1\.0\/projects\/([^/]+)\/repos\/([^/]+)\/pull-requests\/(\d+)$/, async (req, res, url, m) => {
  const pr = findPR(decodeURIComponent(m[1]), decodeURIComponent(m[2]), m[3]);
  if (!pr) return notFound(res, url.pathname);
  const body = await readJSON(req);
  if (body.title !== undefined) pr.title = body.title;
  if (body.description !== undefined) pr.description = body.description;
  if (body.draft !== undefined) pr.draft = body.draft;
  pr.version++;
  json(res, 200, pr);
});
on("GET", /^\/rest\/api\/1\.0\/projects\/([^/]+)\/repos\/([^/]+)\/pull-requests\/(\d+)$/, (req, res, url, m) => {
  const pr = findPR(decodeURIComponent(m[1]), decodeURIComponent(m[2]), m[3]);
  return pr ? json(res, 200, pr) : notFound(res, url.pathname);
});

// branches / tags
on("GET", /^\/rest\/api\/1\.0\/projects\/([^/]+)\/repos\/([^/]+)\/branches$/, (req, res, url, m) => {
  const list = state.branches[decodeURIComponent(m[1])]?.[decodeURIComponent(m[2])] ?? [];
  json(res, 200, paged(filterBy(list, url.searchParams.get("filterText"), "displayId"), url));
});
on("POST", /^\/rest\/api\/1\.0\/projects\/([^/]+)\/repos\/([^/]+)\/branches$/, async (req, res, url, m) => {
  const key = decodeURIComponent(m[1]);
  const slug = decodeURIComponent(m[2]);
  const body = await readJSON(req);
  const b = branch(body.name, false);
  b.latestCommit = body.startPoint ?? HEAD;
  ((state.branches[key] ??= {})[slug] ??= []).push(b);
  json(res, 201, b);
});
on("GET", /^\/rest\/api\/1\.0\/projects\/([^/]+)\/repos\/([^/]+)\/tags$/, (req, res, url, m) => {
  const list = state.tags[decodeURIComponent(m[1])]?.[decodeURIComponent(m[2])] ?? [];
  json(res, 200, paged(filterBy(list, url.searchParams.get("filterText"), "displayId"), url));
});
on("POST", /^\/rest\/api\/1\.0\/projects\/([^/]+)\/repos\/([^/]+)\/tags$/, async (req, res, url, m) => {
  const key = decodeURIComponent(m[1]);
  const slug = decodeURIComponent(m[2]);
  const body = await readJSON(req);
  const t = tag(body.name);
  ((state.tags[key] ??= {})[slug] ??= []).push(t);
  json(res, 201, t);
});
// branch-utils is its own REST module, outside /rest/api/1.0
on("DELETE", /^\/rest\/branch-utils\/latest\/projects\/([^/]+)\/repos\/([^/]+)\/branches$/, (req, res) => noContent(res));

// commits
on("GET", /^\/rest\/api\/1\.0\/projects\/([^/]+)\/repos\/([^/]+)\/commits$/, (req, res, url) => {
  json(res, 200, paged(COMMITS, url));
});
on("GET", /^\/rest\/api\/1\.0\/projects\/([^/]+)\/repos\/([^/]+)\/commits\/([^/]+)\/changes$/, (req, res, url) => {
  json(res, 200, paged([{ path: { toString: "src/index.ts" }, srcPath: { toString: "src/index.ts" }, type: "MODIFY" }], url));
});
// GET .../commits/{commitId}/diff/{path}: {path} is optional (whole commit when omitted)
on("GET", /^\/rest\/api\/1\.0\/projects\/([^/]+)\/repos\/([^/]+)\/commits\/([^/]+)\/diff(?:\/(.+))?$/, (req, res, url, m) => {
  const file = m[4] ? decodeURIComponent(m[4]) : "index.ts";
  json(res, 200, { diffs: [{ source: { toString: file }, destination: { toString: file }, hunks: [], truncated: false }], commit: m[3], path: m[4] ? file : null });
});
on("GET", /^\/rest\/api\/1\.0\/projects\/([^/]+)\/repos\/([^/]+)\/commits\/([^/]+)$/, (req, res, url, m) => {
  const c = COMMITS.find((x) => x.id === m[3] || x.displayId === m[3]);
  return c ? json(res, 200, c) : notFound(res, url.pathname);
});

// files
on("GET", /^\/rest\/api\/1\.0\/projects\/([^/]+)\/repos\/([^/]+)\/files$/, (req, res, url) => {
  json(res, 200, paged(["README.md", "package.json", "src/index.ts", "src/lib/util.ts", "test/e2e/x.ts"], url));
});
on("GET", /^\/rest\/api\/1\.0\/projects\/([^/]+)\/repos\/([^/]+)\/raw\/(.+)$/, (req, res, url, m) => {
  text(res, 200, `// raw contents of ${decodeURIComponent(m[3])}\nexport const x = 1;\n`);
});
on("PUT", /^\/rest\/api\/1\.0\/projects\/([^/]+)\/repos\/([^/]+)\/browse\/(.+)$/, async (req, res, url, m) => {
  await readingBody(req); // consume multipart body
  json(res, 200, { id: sha("edit" + m[3]), displayId: sha("edit" + m[3]).slice(0, 7), message: `Edited ${decodeURIComponent(m[3])}` });
});
on("GET", /^\/rest\/api\/1\.0\/projects\/([^/]+)\/repos\/([^/]+)\/browse(\/.*)?$/, (req, res, url, m) => {
  const p = m[3] ? decodeURIComponent(m[3]) : "";
  const children = p === ""
    ? [{ path: { toString: "README.md" }, type: "FILE", size: 120 }, { path: { toString: "src" }, type: "DIRECTORY" }]
    : [{ path: { toString: `${p}/index.ts` }, type: "FILE", size: 42 }];
  json(res, 200, { path: { toString: p }, children, size: children.length, limit: 25, isLastPage: true });
});

// build status
on("GET", /^\/rest\/build-status\/1\.0\/commits\/stats\/([^/]+)$/, (req, res) => {
  json(res, 200, { successful: 3, failed: 1, inProgress: 0 });
});
on("GET", /^\/rest\/build-status\/1\.0\/commits\/([^/]+)$/, (req, res, url) => {
  const all = [
    { key: "ci/unit", state: "SUCCESSFUL", name: "Unit Tests", url: "http://ci/1", description: "passed", dateAdded: now },
    { key: "ci/lint", state: "SUCCESSFUL", name: "Lint", url: "http://ci/2", description: "passed", dateAdded: now },
    { key: "ci/e2e", state: "FAILED", name: "E2E", url: "http://ci/3", description: "1 failing", dateAdded: now },
    { key: "ci/build", state: "INPROGRESS", name: "Build", url: "http://ci/4", description: "running", dateAdded: now },
  ];
  const key = url.searchParams.get("key");
  json(res, 200, paged(key ? all.filter((b) => b.key === key) : all, url));
});

// webhooks
on("GET", /^\/rest\/webhooks\/1\.0\/projects\/([^/]+)\/repos\/([^/]+)\/webhooks$/, (req, res, url, m) => {
  const hooks = [
    {
      id: 1,
      name: "CI webhook",
      url: "https://ci.example.com/webhook",
      events: ["repo:refs_changed"],
      active: true,
      createdDate: now,
      updatedDate: now,
    },
  ];
  json(res, 200, paged(hooks, url));
});

// ---- server ----------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  for (const route of R) {
    if (route.method !== req.method) continue;
    const m = route.re.exec(url.pathname);
    if (!m) continue;
    try {
      await route.handler(req, res, url, m);
    } catch (err) {
      json(res, 500, { errors: [{ message: String(err?.message ?? err) }] });
    }
    return;
  }
  notFound(res, url.pathname);
});

server.listen(PORT, "0.0.0.0", () => {
  const addr = server.address();
  const actual = typeof addr === "object" && addr ? addr.port : PORT;
  console.log(`STUB_READY ${actual}`);
});
