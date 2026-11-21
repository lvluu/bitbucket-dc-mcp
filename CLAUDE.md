# CLAUDE.md

Setup, env vars, tools and client config: `README.md` (short) and `docs/*.md`. Not repeated here.

## Commands

`bun install` | `bun run build` (tsc 7 → `build/`) | `bun test` | `bun run typecheck` | `bun run dev` (stdio, no build). Edit `src/*.ts`, never `build/`.
History: sources were recovered from the npm package, see `RECOVERY.md`.

## Layout

- `src/tools/*.ts` — one module per tool group, auto-loaded by `src/registry/`.
- `src/lib/errors.ts` — `jsonResult`/`textResult`/`formatError`: every result goes through here.
- `src/lib/squeeze.ts` — token squeeze (behaviour in `docs/tools.md` "Token squeeze").
- `src/lib/field-filter.ts` — per-entity summarizers for list tools.

## Rules for tool changes

- Return via `jsonResult`/`textResult` only; never `JSON.stringify(..., null, 2)` in a tool.
- Reuse the shared params in `src/lib/params.ts` (`repoArgs`, `prArgs`, `pageArgs`, `diffArgs`, `anchorArgs`); `projectKey` stays optional (falls back to `BITBUCKET_DEFAULT_PROJECT` via `repoPath`).
- Keep tool descriptions to one short sentence: `src/registry/tool-defs.test.ts` caps them at 200 chars and caps `tools/list` with a byte budget. Over budget: trim text elsewhere, do not raise it.
- A PR `PUT` must re-send `reviewers`: Bitbucket DC clears them when the field is absent.
- New list/entity tool: add a summarizer in `field-filter.js`; new noisy key: add to `NOISE_KEYS` in `squeeze.js`.
- Add a `bun:test` test (`src/**/*.test.ts`) for any squeeze change; keep error text one line, no stack traces.
- New env var: document it in the `docs/configuration.md` table only.
- New/renamed tool: update `docs/tools.md` and the tool count in `README.md`; agent usage hints go in `skills/bitbucket-dc/SKILL.md`.
- Keep `README.md` short (install + links); details go in `docs/`.
- Keep `@modelcontextprotocol/sdk` on `~1.25`: 1.32 + tsc 7 breaks zod schema typing (TS2589/TS2322).
