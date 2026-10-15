# Task runner. See README.md (Development) and CLAUDE.md.
set shell := ["bash", "-cu"]

default:
    @just --list

# Type-check the TypeScript sources
check:
    bun run typecheck

# Unit tests (src/**/*.test.ts)
test:
    bun test src

# Compile src/ to build/
build:
    bun run build

# Full e2e: build, then drive every tool through a real MCP client
# against the fake Bitbucket DC REST API (spawned in-process).
e2e:
    bun run build
    bun test test/e2e

# Same e2e, but against the stub running as a Docker container.
e2e-docker:
    #!/usr/bin/env bash
    set -euo pipefail
    docker compose -f test/e2e/compose.yaml up -d --build
    trap 'docker compose -f test/e2e/compose.yaml down' EXIT
    E2E_STUB_URL=http://127.0.0.1:7990 bun test test/e2e
