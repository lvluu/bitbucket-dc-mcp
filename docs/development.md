# Development

```bash
git clone https://github.com/lvluu/bitbucket-dc-mcp.git
cd bitbucket-dc-mcp
bun install
bun run build
```

Run from source without a build: `bun run dev` (stdio). Inspect tools: `bun run inspect`.
Edit `src/*.ts`, never `build/`. Rules for tool changes: [CLAUDE.md](../CLAUDE.md) and [CONTRIBUTING.md](../CONTRIBUTING.md).

## Tests

| Command | What |
|---------|------|
| `just test` / `bun test src` | Unit tests (`src/**/*.test.ts`) |
| `just e2e` / `bun run test:e2e` | Build, then call every tool through a real MCP client against a fake Bitbucket DC API (`test/e2e/stub-bitbucket.mjs`) |
| `just e2e-docker` / `bun run e2e:docker` | Same e2e, fake API in a Docker container |
| `bun run test:all` | Type-check, unit, build, e2e |

The stub is a zero-dependency Node HTTP server, so no Atlassian license or image is needed.
The e2e report is written to `test/e2e/.last-run.json`.

## Releasing

[release-please](https://github.com/googleapis/release-please) opens a release PR on every push to `main`, with
`CHANGELOG.md` and a version bump from [Conventional Commits](https://www.conventionalcommits.org/). Merging it
tags the release, and the `Release` workflow publishes to npm through trusted publishing (OIDC, with provenance):
no npm token secret. To republish an existing tag, run the `Release` workflow manually with `ref: vX.Y.Z`.
