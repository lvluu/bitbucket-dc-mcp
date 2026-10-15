# Contributing

Thanks for helping improve **bitbucket-dc-mcp** — an MCP server that exposes the
Bitbucket Data Center REST API as tools for AI assistants.

## Prerequisites

- **Node.js ≥ 22**
- **Bun** ([bun.sh](https://bun.sh)) — package manager, test runner and build tool
- **Docker** — only needed for the containerized end-to-end test

## Setup

```bash
git clone https://github.com/lvluu/bitbucket-dc-mcp.git
cd bitbucket-dc-mcp
bun install
```

## Common tasks

| Command | Description |
|---------|-------------|
| `just check` | Type-check the sources (`tsc --noEmit`) |
| `just test` | Unit tests (`bun test src`) |
| `just build` | Compile `src/` to `build/` |
| `just e2e` | Build, then drive every tool through a real MCP client against the fake Bitbucket DC API |
| `just e2e-docker` | Same e2e, but against the fake API running as a Docker container |

Equivalent npm scripts exist (`bun run typecheck`, `bun run test:e2e`,
`bun run e2e:docker`, `bun run test:all`). `just --list` shows everything.

## Project layout

- `src/tools/*.ts` — one module per tool group, auto-loaded by `src/registry/`.
- `src/lib/errors.ts` — `jsonResult` / `textResult` / `formatError`; every result goes through here.
- `src/lib/squeeze.ts` — token squeeze (compact JSON, strip noise, cap text).
- `src/lib/field-filter.ts` — per-entity summarizers for list tools.
- `test/e2e/` — zero-dependency fake Bitbucket DC REST API + the e2e harness.
- `build/` is generated — **edit `src/*.ts`, never `build/`**.

## Changing or adding a tool

- Return results via `jsonResult` / `textResult` only; never call
  `JSON.stringify(..., null, 2)` inside a tool.
- New list/entity tool: add a summarizer in `field-filter.ts`.
- New noisy response key: add it to `NOISE_KEYS` in `squeeze.ts`.
- Add a `bun:test` test for any squeeze change; keep error text to one line, no stack traces.
- New environment variable: document it in the `README.md` table only.
- Keep `@modelcontextprotocol/sdk` pinned to `~1.25` — 1.32 + TypeScript 7 breaks
  zod schema typing.

## Tests

- **Unit:** `bun test src` (files matching `src/**/*.test.ts`).
- **End-to-end:** `just e2e`. It boots the *built* server under Node, connects a
  real MCP client over Streamable HTTP, and calls every registered tool against
  `test/e2e/stub-bitbucket.mjs`. Add a call for any new tool in
  `test/e2e/mcp-e2e.test.ts`. Always `just build` first — the e2e runs
  `build/index.js`, not the TypeScript sources.

## Commit messages

This repository uses [Conventional Commits](https://www.conventionalcommits.org/):
[release-please](https://github.com/googleapis/release-please) derives the version
bump and `CHANGELOG.md` from them.

```
feat: add listRepositoryWebhooks tool
fix: correct deleteBranch branch-utils URL
docs: document the BITBUCKET_MAX_CHARS variable
```

- `feat` → minor, `fix`/`perf` → patch, `!` or `BREAKING CHANGE:` → major.
- Use `docs`, `test`, `build`, `ci`, `chore`, `refactor` where they fit.
- **Do not** edit `CHANGELOG.md` or the version in `package.json` by hand —
  release-please owns both.

## Pull requests

1. Branch from `main` and keep the PR focused.
2. Ensure CI passes (type-check, unit tests, build, e2e, Docker e2e).
3. Describe the change and how you verified it.

## Releasing

Maintainers only: merge the release-please PR. Merging tags the release and the
`Release` workflow publishes to npm with provenance. See the README for the
one-time `NPM_TOKEN` setup.

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).
