# Refactor Plan: HTTP MCP Server for Bitbucket Data Center Only

## Goal

Transform `bitbucket-mcp` from a stdio-based MCP server (Cloud + Server) into a **Streamable HTTP MCP server** targeting **Bitbucket Data Center REST API v1.0 only**.

---

## Current State

| Aspect | Current |
|--------|---------|
| Source | `src/index.ts` (~5,166 lines), `src/pagination.ts` (250 lines) |
| Transport | stdio (`StdioServerTransport`) |
| API target | Bitbucket Cloud + Server/DC (dual, via `isServer` flag) |
| MCP SDK | `@modelcontextprotocol/sdk` v1.1.1 |
| Tools | 48 MCP tools |
| Auth | Bearer token or username:password basic auth |
| Architecture | Single monolithic class `BitbucketServer` |

## Target State

| Aspect | Target |
|--------|--------|
| Source | Modular multi-file structure |
| Transport | Streamable HTTP (`StreamableHTTPServerTransport`) |
| API target | Bitbucket Data Center REST API v1.0 **only** |
| MCP SDK | `@modelcontextprotocol/sdk` ^1.12+ (Streamable HTTP support) |
| Tools | ~60-80 MCP tools (expanded DC coverage) |
| Auth | Bearer token or username:password for BB DC; optional API key for MCP endpoint |
| Architecture | Domain-based modules |

---

## Phase 1: Foundation (Infra + SDK Upgrade)

### 1.1 Upgrade MCP SDK
- Upgrade `@modelcontextprotocol/sdk` from `1.1.1` to latest (`^1.12+`)
- Streamable HTTP transport was added in ~1.6+
- Update imports: `StreamableHTTPServerTransport` from `@modelcontextprotocol/sdk/server/streamableHttp.js`

### 1.2 Add Express dependency
- Add `express` as a production dependency (HTTP layer)
- The Streamable HTTP transport needs an HTTP server to bind to

### 1.3 Create HTTP server entry point
- New `src/server.ts` - Express app setup with:
  - `POST /mcp` - main MCP endpoint (Streamable HTTP)
  - `GET /mcp` - SSE endpoint for server-initiated messages
  - `DELETE /mcp` - session termination
  - `GET /health` - health check
- Environment config:
  - `PORT` (default: 3000)
  - `MCP_API_KEY` (optional, for MCP client auth)

### 1.4 Remove stdio transport
- Remove `StdioServerTransport` usage
- Remove shebang (`#!/usr/bin/env node`) from entry point
- Update `package.json` bin entry to point to HTTP server

### 1.5 Simplify configuration
- **Keep**: `BITBUCKET_URL`, `BITBUCKET_TOKEN`, `BITBUCKET_USERNAME`, `BITBUCKET_PASSWORD`
- **Remove**: `BITBUCKET_WORKSPACE` (DC uses projectKey, not workspace)
- **Remove**: All Cloud URL normalization logic (`bitbucket.org`, `api.bitbucket.org`)
- **Remove**: `BITBUCKET_IS_SERVER` flag (always DC)
- **Add**: `PORT`, `MCP_API_KEY`, `BITBUCKET_DEFAULT_PROJECT`
- Base URL always expected as: `https://<your-dc-host>` → normalized to `https://<your-dc-host>/rest/api/1.0`

---

## Phase 2: Strip Cloud, Go DC-Only

### 2.1 Remove all Cloud code paths
- Remove `isServer` flag and all `if (this.config.isServer)` branches
- Remove Cloud URL normalization (`bitbucket.org`, `api.bitbucket.org/2.0`)
- Remove Cloud pagination mode from `BitbucketPaginator` (keep only `limit/start/isLastPage`)
- Remove Cloud-specific types (`BitbucketWorkspace`, Cloud-style `BitbucketBranchingModel`, etc.)

### 2.2 Redefine types for DC API
- DC uses `projectKey` + `repositorySlug` (not `workspace` + `repo_slug`)
- DC pagination: `{ values, start, limit, size, isLastPage, nextPageStart }`
- DC PR state: `OPEN`, `MERGED`, `DECLINED` (no `SUPERSEDED`)
- DC user model: `{ name, emailAddress, id, displayName, active, slug, type }` (not `account_id/uuid`)
- DC links: `{ self: [{href}], clone: [{href, name}] }` (slightly different structure)

### 2.3 Update API URL patterns
All DC endpoints follow: `/rest/api/1.0/...`
- Projects: `/rest/api/1.0/projects`
- Repos: `/rest/api/1.0/projects/{projectKey}/repos/{repoSlug}`
- PRs: `/rest/api/1.0/projects/{projectKey}/repos/{repoSlug}/pull-requests`
- Branches: `/rest/api/1.0/projects/{projectKey}/repos/{repoSlug}/branches`
- Commits: `/rest/api/1.0/projects/{projectKey}/repos/{repoSlug}/commits`

Non-core APIs use different base paths:
- Build status: `/rest/build-status/1.0/commits/{commitId}`
- Code Insights: `/rest/insights/1.0/projects/{projectKey}/repos/{repoSlug}/commits/{commitId}/reports`
- SSH keys: `/rest/keys/1.0/...`
- Access tokens: `/rest/access-tokens/1.0/...`

---

## Phase 3: Modularize Architecture

### 3.1 New file structure

```
src/
├── server.ts                  # Express HTTP server + MCP setup (entry point)
├── config.ts                  # Environment config, validation
├── logger.ts                  # Winston logger setup
├── client.ts                  # Axios client factory (auth, base URL)
├── pagination.ts              # DC-only paginator (simplified)
├── types/
│   ├── index.ts               # Re-exports
│   ├── project.ts             # Project types
│   ├── repository.ts          # Repository types
│   ├── pull-request.ts        # PR types
│   ├── branch.ts              # Branch/tag types
│   ├── commit.ts              # Commit types
│   ├── comment.ts             # Comment types
│   ├── user.ts                # User/participant types
│   ├── build.ts               # Build status, Code Insights types
│   └── common.ts              # Pagination, links, shared types
├── tools/
│   ├── index.ts               # Tool registry (aggregates all tool defs)
│   ├── projects.ts            # Project tools (list, get, create, update)
│   ├── repositories.ts        # Repo tools (list, get, create, fork, branches, tags)
│   ├── pull-requests.ts       # PR tools (CRUD, merge, decline, approve, etc.)
│   ├── comments.ts            # PR comment tools (add, update, delete, resolve)
│   ├── tasks.ts               # PR task tools
│   ├── commits.ts             # Commit tools (list, get, diff, changes)
│   ├── branches.ts            # Branch/tag tools (create, delete, find)
│   ├── files.ts               # File content tools (browse, raw content)
│   ├── builds.ts              # Build status + Code Insights tools
│   ├── webhooks.ts            # Webhook tools
│   └── permissions.ts         # Permission tools (optional/nice-to-have)
├── handlers/
│   └── tool-router.ts         # CallTool dispatcher (switch → map-based routing)
└── utils/
    ├── errors.ts              # Error handling utilities
    └── response.ts            # MCP response formatters
```

### 3.2 Tool registration pattern
Instead of a giant switch statement, use a **map-based router**:

```typescript
// Each tools/*.ts exports: { definitions: ToolDef[], handlers: Map<string, Handler> }
// tool-router.ts aggregates them all
const allTools = [...projectTools, ...repoTools, ...prTools, ...];
const handlerMap = new Map([...projectHandlers, ...repoHandlers, ...]);
```

---

## Phase 4: Implement DC Tool Coverage

### 4.1 MUST-HAVE tools (Priority 1)

#### Projects
| Tool | DC Endpoint | Method |
|------|------------|--------|
| `listProjects` | `/rest/api/1.0/projects` | GET |
| `getProject` | `/rest/api/1.0/projects/{projectKey}` | GET |
| `createProject` | `/rest/api/1.0/projects` | POST |
| `updateProject` | `/rest/api/1.0/projects/{projectKey}` | PUT |

#### Repositories
| Tool | DC Endpoint | Method |
|------|------------|--------|
| `listRepositories` | `/rest/api/1.0/projects/{projectKey}/repos` | GET |
| `getRepository` | `/rest/api/1.0/projects/{projectKey}/repos/{repoSlug}` | GET |
| `createRepository` | `/rest/api/1.0/projects/{projectKey}/repos` | POST |
| `forkRepository` | `/rest/api/1.0/projects/{projectKey}/repos/{repoSlug}` | POST |
| `getDefaultBranch` | `/rest/api/1.0/projects/{projectKey}/repos/{repoSlug}/default-branch` | GET |
| `setDefaultBranch` | `/rest/api/1.0/projects/{projectKey}/repos/{repoSlug}/default-branch` | PUT |

#### Branches & Tags
| Tool | DC Endpoint | Method |
|------|------------|--------|
| `listBranches` | `/rest/api/1.0/projects/{projectKey}/repos/{repoSlug}/branches` | GET |
| `createBranch` | `/rest/api/1.0/projects/{projectKey}/repos/{repoSlug}/branches` | POST |
| `deleteBranch` | `/rest/branch-utils/1.0/projects/{projectKey}/repos/{repoSlug}/branches` | DELETE |
| `listTags` | `/rest/api/1.0/projects/{projectKey}/repos/{repoSlug}/tags` | GET |
| `createTag` | `/rest/api/1.0/projects/{projectKey}/repos/{repoSlug}/tags` | POST |

#### Pull Requests
| Tool | DC Endpoint | Method |
|------|------------|--------|
| `listPullRequests` | `.../pull-requests` | GET |
| `getPullRequest` | `.../pull-requests/{prId}` | GET |
| `createPullRequest` | `.../pull-requests` | POST |
| `updatePullRequest` | `.../pull-requests/{prId}` | PUT |
| `mergePullRequest` | `.../pull-requests/{prId}/merge` | POST |
| `declinePullRequest` | `.../pull-requests/{prId}/decline` | POST |
| `reopenPullRequest` | `.../pull-requests/{prId}/reopen` | POST |
| `approvePullRequest` | `.../pull-requests/{prId}/approve` | POST |
| `unaprovePullRequest` | `.../pull-requests/{prId}/approve` | DELETE |
| `canMergePullRequest` | `.../pull-requests/{prId}/merge` | GET |
| `getPullRequestDiff` | `.../pull-requests/{prId}/diff` | GET |
| `getPullRequestPatch` | `.../pull-requests/{prId}.patch` | GET |
| `getPullRequestChanges` | `.../pull-requests/{prId}/changes` | GET |
| `getPullRequestCommits` | `.../pull-requests/{prId}/commits` | GET |
| `getPullRequestActivity` | `.../pull-requests/{prId}/activities` | GET |
| `getPullRequestParticipants` | `.../pull-requests/{prId}/participants` | GET |

#### PR Comments
| Tool | DC Endpoint | Method |
|------|------------|--------|
| `listPRComments` | `.../pull-requests/{prId}/comments` | GET |
| `addPRComment` | `.../pull-requests/{prId}/comments` | POST |
| `getPRComment` | `.../pull-requests/{prId}/comments/{commentId}` | GET |
| `updatePRComment` | `.../pull-requests/{prId}/comments/{commentId}` | PUT |
| `deletePRComment` | `.../pull-requests/{prId}/comments/{commentId}` | DELETE |

#### PR Tasks
| Tool | DC Endpoint | Method |
|------|------------|--------|
| `listPRTasks` | `.../pull-requests/{prId}/blocker-comments` | GET |
| `addBlockerComment` | `.../pull-requests/{prId}/blocker-comments` | POST |

#### Commits
| Tool | DC Endpoint | Method |
|------|------------|--------|
| `listCommits` | `.../commits` | GET |
| `getCommit` | `.../commits/{commitId}` | GET |
| `getCommitChanges` | `.../commits/{commitId}/changes` | GET |
| `getCommitDiff` | `.../commits/{commitId}/diff` | GET |

#### Files
| Tool | DC Endpoint | Method |
|------|------------|--------|
| `browseFiles` | `.../browse/{path}` | GET |
| `getFileContent` | `.../raw/{path}` | GET |
| `editFile` | `.../browse/{path}` | PUT |

### 4.2 SHOULD-HAVE tools (Priority 2)

#### Builds & Code Insights
| Tool | DC Endpoint | Method |
|------|------------|--------|
| `getBuildStatuses` | `/rest/build-status/1.0/commits/{commitId}` | GET |
| `addBuildStatus` | `/rest/build-status/1.0/commits/{commitId}` | POST |
| `getCodeInsightsReports` | `/rest/insights/1.0/.../reports` | GET |
| `createCodeInsightsReport` | `/rest/insights/1.0/.../reports/{key}` | PUT |
| `getCodeInsightsAnnotations` | `/rest/insights/1.0/.../annotations` | GET |

#### Webhooks
| Tool | DC Endpoint | Method |
|------|------------|--------|
| `listWebhooks` | `.../webhooks` | GET |
| `createWebhook` | `.../webhooks` | POST |
| `getWebhook` | `.../webhooks/{webhookId}` | GET |
| `updateWebhook` | `.../webhooks/{webhookId}` | PUT |
| `deleteWebhook` | `.../webhooks/{webhookId}` | DELETE |

#### Default Reviewers & Reviewer Groups
| Tool | DC Endpoint | Method |
|------|------------|--------|
| `getDefaultReviewerConditions` | `.../conditions` | GET |
| `listReviewerGroups` | `.../reviewer-groups` | GET |

#### Repo Settings
| Tool | DC Endpoint | Method |
|------|------------|--------|
| `getMergeStrategies` | `.../settings/pull-requests` | GET |
| `getRepoHooks` | `.../settings/hooks` | GET |
| `enableRepoHook` | `.../settings/hooks/{hookKey}/enabled` | PUT |

### 4.3 NICE-TO-HAVE tools (Priority 3)

- Permission management (group/user repo/project permissions)
- Search (repo indexing)
- Jira integration (issue linking)
- Secret scanning rules
- System admin operations

---

## Phase 5: Update Package & Build

### 5.1 Package.json changes
```json
{
  "name": "bitbucket-dc-mcp",
  "description": "HTTP MCP server for Bitbucket Data Center API",
  "scripts": {
    "build": "tsc",
    "start": "node dist/server.js",
    "dev": "tsx watch src/server.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0",
    "axios": "^1.6.5",
    "express": "^4.18.0",
    "winston": "^3.11.0"
  }
}
```

### 5.2 Docker update
- Expose port (default 3000)
- `CMD ["node", "dist/server.js"]`

### 5.3 Configuration documentation
```env
# Required
BITBUCKET_URL=https://bitbucket.yourcompany.com
BITBUCKET_TOKEN=your-personal-access-token
# OR
BITBUCKET_USERNAME=your-username
BITBUCKET_PASSWORD=your-password

# Optional
BITBUCKET_DEFAULT_PROJECT=MYPROJ
PORT=3000
MCP_API_KEY=optional-key-to-protect-mcp-endpoint
```

---

## Phase 6: Testing & Validation

### 6.1 Add test infrastructure
- Unit tests for each tool module (mock axios responses with DC-shaped data)
- Integration test for HTTP transport (start server, make MCP requests)
- Test pagination with DC `isLastPage/nextPageStart` format

### 6.2 MCP Inspector validation
- Use `npx @modelcontextprotocol/inspector` against the HTTP endpoint
- Verify all tools register correctly and accept/return proper schemas

---

## Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| MCP SDK version gap (1.1.1 → 1.12+) | High | Medium | Test SDK upgrade in isolation first |
| Breaking all existing stdio users | High | Certain | Major semver bump, clear migration docs; consider keeping stdio as option |
| Postman collection has 500+ endpoints, scope creep | Medium | High | Strict priority tiers, MVP = Priority 1 only |
| DC API response shape differences from Cloud types | Medium | High | Redefine all types from actual DC API responses |
| No existing tests to catch regressions | High | High | Add tests for existing functionality BEFORE refactoring |
| HTTP server deployment complexity | Medium | Medium | Good defaults, Docker support, health check endpoint |

---

## Execution Order Summary

1. **Phase 1** - SDK upgrade + HTTP transport setup (foundation)
2. **Phase 2** - Strip Cloud code, simplify to DC-only
3. **Phase 3** - Break monolith into modules
4. **Phase 4.1** - Implement Priority 1 tools (MVP)
5. **Phase 5** - Package/build/Docker updates
6. **Phase 6** - Testing
7. **Phase 4.2** - Priority 2 tools (post-MVP)
8. **Phase 4.3** - Priority 3 tools (as needed)

Estimated scope: ~60-80 tools for full Priority 1+2 coverage.
