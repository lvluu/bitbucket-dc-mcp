# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

An MCP (Model Context Protocol) server that exposes Bitbucket Data Center REST API v1.0 operations as tools. It connects to a Bitbucket DC instance and allows AI assistants to interact with projects, repositories, pull requests, branches, commits, and files.

## Essential Commands

```bash
npm run build          # Compile TypeScript → build/ (required before running)
npm run typecheck      # Type-check without emitting
npm run lint           # ESLint
npm run lint:fix       # ESLint with auto-fix
npm test               # Run all tests (Node.js native test runner)
npm run test:watch     # Tests in watch mode
node --test tests/echo.test.ts  # Run a single test file
npm run inspect        # Build + launch MCP Inspector (stdio)
npm run inspect:http   # MCP Inspector against HTTP endpoint
npm run dev            # Build + interactive JSON-RPC REPL
npm run knip           # Find unused exports/dependencies
```

## Environment Variables

Required (set in `.env` or shell):
- `BITBUCKET_URL` — Bitbucket DC base URL (e.g. `https://bitbucket.example.com`), auto-normalized to append `/rest/api/1.0`
- `BITBUCKET_TOKEN` — Personal access token (Bearer auth), **OR**
- `BITBUCKET_USERNAME` + `BITBUCKET_PASSWORD` — Basic auth

Optional:
- `BITBUCKET_DEFAULT_PROJECT` — Default project key
- `BITBUCKET_ENABLE_DANGEROUS` — Set to `true`/`1` to enable destructive operations (e.g. `deletePRComment`)
- `MCP_TRANSPORT` — `stdio` or `http` (defaults to `http`)
- `PORT` — HTTP server port (default 3000)
- `CORS_ORIGIN` — CORS allowed origins (default `*`)

## Architecture

### Boot sequence (`src/server/boot.ts`)
1. Loads `.env` via dotenv
2. `loadConfig()` reads env vars into `BitbucketDCConfig`
3. `initClient()` creates a singleton Axios instance with auth headers and base URL
4. `autoRegisterModules()` discovers and registers all tools/resources/prompts
5. Starts either stdio or HTTP (Express + StreamableHTTPServerTransport) based on `MCP_TRANSPORT`

### Auto-loading registry (`src/registry/`)
Modules in `src/tools/`, `src/resources/`, and `src/prompts/` are auto-discovered at startup by scanning the compiled `build/` directory for `*.js` files. Each file must `export default` a `RegisterableModule` object:

```typescript
const myModule: RegisterableModule = {
  type: "tool",
  name: "my-module",
  description: "...",
  register(server: McpServer) {
    server.tool("toolName", "description", { /* zod schema */ }, async (args) => { ... });
  },
};
export default myModule;
```

A single module file can register multiple tools in its `register()` function (e.g. `projects.ts` registers `listProjects`, `getProject`, `createProject`, `updateProject`).

### Shared library (`src/lib/`)
- **`client.ts`** — Singleton Axios client (`getClient()`) and path builders (`repoPath()`, `prPath()`)
- **`config.ts`** — Env var loading, URL normalization, auth header/basic-auth helpers
- **`pagination.ts`** — DC-style pagination (`fetchPage<T>()`) using `start`/`limit`/`isLastPage`/`nextPageStart`. Supports single-page and fetch-all (capped at 1000 items)
- **`errors.ts`** — `formatError()` for Axios errors, `jsonResult()`/`textResult()` response helpers

### Tool modules (`src/tools/`)
Each file is a domain module grouping related tools:
- `projects.ts` — listProjects, getProject, createProject, updateProject
- `repositories.ts` — listRepositories, getRepository, createRepository, forkRepository, getDefaultBranch, setDefaultBranch
- `pull-requests.ts` — CRUD, merge, decline, reopen, approve, unapprove, canMerge
- `pr-comments.ts` — list/add/get/update/delete PR comments (inline + general)
- `pr-diff.ts` — PR diff and changes
- `pr-activity.ts` — PR activity feed
- `pr-tasks.ts` — PR blocker comment tasks
- `branches.ts` — list/create/delete branches, list/create tags
- `commits.ts` — list commits, get commit, commit changes, commit diff
- `files.ts` — browse files, get file content, edit file, list files recursively

### Tool implementation pattern
Every tool handler follows the same pattern:
1. Get the singleton Axios client via `getClient()`
2. Build the API path using `repoPath()` or `prPath()` helpers
3. For paginated endpoints, use `fetchPage<T>(client, path, options)`
4. Return `jsonResult(data)` or `textResult(text)` on success
5. Catch errors and return `{ content: [{ type: "text", text: formatError(error) }], isError: true }`

Destructive operations check `getConfig().enableDangerous` before executing.

### Testing (`tests/`)
- Uses Node.js native test runner (`node:test` + `node:assert`)
- `tests/helpers/test-client.ts` provides `TestClient` class that spawns the built server as a child process via stdio transport
- Existing tests are from the starter template and need updating for Bitbucket DC tools
- Tests require `npm run build` first (they run the compiled JS)

## Adding a New Tool

1. Create `src/tools/my-domain.ts` (or add to an existing domain file)
2. Export default a `RegisterableModule` with `type: "tool"`
3. Register one or more tools inside the `register()` function using Zod schemas for params
4. Build and test: `npm run build && npm run inspect`
5. Or use the generator: `npm run gen:tool`

## Key Conventions

- ES modules with `.js` extensions in all imports (even for `.ts` source files)
- Zod for all tool parameter validation
- TypeScript strict mode with `noUncheckedIndexedAccess`
- Bitbucket DC API uses optimistic locking — PR updates/merges must fetch current `version` first
- Pagination params (`limit`, `start`, `all`) are standardized across all list tools
