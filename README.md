# Bitbucket DC MCP Server

[![npm version](https://img.shields.io/npm/v/@shibainu16/bitbucket-dc-mcp.svg)](https://www.npmjs.com/package/@shibainu16/bitbucket-dc-mcp)
[![CI](https://github.com/lvluu/bitbucket-dc-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/lvluu/bitbucket-dc-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that exposes **Bitbucket Data Center REST API v1.0** as tools for AI assistants.

## Overview

This server lets MCP-compatible clients (Claude Desktop, VS Code, IDEs, custom apps) interact with a Bitbucket Data Center instance through 55 tools covering:

- **Projects** — list, get, create, update
- **Repositories** — list, get, create, fork, default branch
- **Pull Requests** — CRUD, merge, decline, reopen, approve, reviewers, can-merge
- **PR Comments** — list, add, get, update, delete (inline + general)
- **PR Diff & Changes** — diffs, file changes, conflict markers
- **PR Activity** — activity feed, participants, watchers
- **PR Tasks** — blocker comment tasks
- **Branches & Tags** — list, create, delete
- **Commits** — list, get, changes, diff
- **Files** — browse, read, edit, recursive listing
- **Build Status** — build statuses per commit, build statistics

```mermaid
graph LR
    A[AI Client] <-->|MCP| B[bitbucket-dc-mcp]
    B <-->|REST API v1.0| C[Bitbucket Data Center]
```

### Example Prompts

Once connected, try asking your AI assistant:

- "List all repositories in the PROJ project"
- "Show me open pull requests in repo X"
- "What changed in PR #42? Summarize the diff"
- "Create a branch called feature/login from main in PROJ/my-repo"
- "Add a comment on PR #15 suggesting a fix for the null check on line 23"
- "What's the build status for the latest commit on main?"
- "Show me the last 10 commits on the develop branch"
- "Read the contents of src/index.ts from the main branch"
- "Are there any unresolved tasks blocking PR #8 from merging?"
- "Who approved PR #21 and what comments were left?"

## Installation

### Global install

```bash
npm install -g @shibainu16/bitbucket-dc-mcp
```

### Using npx (no install required)

```bash
BITBUCKET_URL=https://bitbucket.example.com \
BITBUCKET_TOKEN=your-token \
MCP_TRANSPORT=stdio \
npx @shibainu16/bitbucket-dc-mcp
```

## Prerequisites

- Node.js >= 22
- A Bitbucket Data Center instance with API access
- A personal access token or username/password credentials

## Quick Start

### 1. Configure environment

Create a `.env` file (or export variables in your shell):

```env
# Required — your Bitbucket DC base URL
BITBUCKET_URL=https://bitbucket.example.com

# Authentication (choose one)
BITBUCKET_TOKEN=your-personal-access-token
# OR
BITBUCKET_USERNAME=your-username
BITBUCKET_PASSWORD=your-password

# Optional
BITBUCKET_DEFAULT_PROJECT=MYPROJ
BITBUCKET_ENABLE_DANGEROUS=false
MCP_TRANSPORT=http
PORT=3000
```

### 2. Run

```bash
# If installed globally
bitbucket-dc-mcp

# Or via npx
npx @shibainu16/bitbucket-dc-mcp
```

The server starts in HTTP mode by default at `http://localhost:3000/mcp`.

## Configuration

### Environment Variables

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `BITBUCKET_URL` | Yes | Bitbucket DC base URL (auto-appends `/rest/api/1.0`) | — |
| `BITBUCKET_TOKEN` | Yes* | Personal access token (Bearer auth) | — |
| `BITBUCKET_USERNAME` | Yes* | Username for basic auth | — |
| `BITBUCKET_PASSWORD` | Yes* | Password for basic auth | — |
| `BITBUCKET_DEFAULT_PROJECT` | No | Default project key for tools that accept `projectKey` | — |
| `BITBUCKET_ENABLE_DANGEROUS` | No | Enable destructive operations (`deletePRComment`, `deleteBranch`) | `false` |
| `BITBUCKET_VERBOSE` | No | Disable the token squeeze (pretty JSON, no field stripping, no text cap) | `false` |
| `BITBUCKET_MAX_CHARS` | No | Cap per text result (diffs, patches, raw files); appends a truncation note | `60000` |
| `MCP_TRANSPORT` | No | Transport mode: `stdio` or `http` | `http` |
| `PORT` | No | HTTP server port | `3000` |
| `CORS_ORIGIN` | No | CORS allowed origins | `*` |

\* Either `BITBUCKET_TOKEN` or both `BITBUCKET_USERNAME` + `BITBUCKET_PASSWORD` are required.

## Token Squeeze

Every tool result is shrunk before it reaches the model: compact JSON, `links`/`link`/`avatarUrl` and
null/empty fields removed (`false`, `0` and an empty `values` page are kept), and long text capped at
`BITBUCKET_MAX_CHARS`. List tools also return field-trimmed summaries. Set `BITBUCKET_VERBOSE=true` for raw output.

## Transport Modes

### HTTP Mode (Default)

Streamable HTTP transport for web deployments and remote access:

```bash
MCP_TRANSPORT=http bitbucket-dc-mcp
```

Endpoints:
- `GET /mcp` — SSE stream for server-initiated messages
- `POST /mcp` — JSON-RPC requests
- `DELETE /mcp` — Session termination
- `GET /health` — Health check

### Stdio Mode

Traditional stdio transport for local clients like Claude Desktop:

```bash
MCP_TRANSPORT=stdio bitbucket-dc-mcp
```

## Client Integration

### VS Code / GitHub Copilot

Add to your **VS Code settings** (`settings.json`) or workspace `.vscode/mcp.json`:

```json
{
  "servers": {
    "bitbucket-dc-mcp": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@shibainu16/bitbucket-dc-mcp"],
      "env": {
        "BITBUCKET_URL": "https://bitbucket.example.com",
        "BITBUCKET_TOKEN": "your-token",
        "MCP_TRANSPORT": "stdio"
      }
    }
  }
}
```

If using `settings.json` directly, nest it under `"mcp"`:

```jsonc
{
  "mcp": {
    "servers": {
      "bitbucket-dc-mcp": {
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "@shibainu16/bitbucket-dc-mcp"],
        "env": {
          "BITBUCKET_URL": "https://bitbucket.example.com",
          "BITBUCKET_TOKEN": "your-token",
          "MCP_TRANSPORT": "stdio"
        }
      }
    }
  }
}
```

### Claude Code

Add to your project's `.mcp.json`, or configure via the CLI:

```bash
claude mcp add bitbucket-dc-mcp \
  -e BITBUCKET_URL=https://bitbucket.example.com \
  -e BITBUCKET_TOKEN=your-token \
  -e MCP_TRANSPORT=stdio \
  -- npx -y @shibainu16/bitbucket-dc-mcp
```

Or manually create/edit `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "bitbucket-dc-mcp": {
      "command": "npx",
      "args": ["-y", "@shibainu16/bitbucket-dc-mcp"],
      "env": {
        "BITBUCKET_URL": "https://bitbucket.example.com",
        "BITBUCKET_TOKEN": "your-token",
        "MCP_TRANSPORT": "stdio"
      }
    }
  }
}
```

## Development

```bash
git clone https://github.com/lvluu/bitbucket-dc-mcp.git
cd bitbucket-dc-mcp
bun install
bun run build
```

### Testing

Unit tests (`src/**/*.test.ts`):

```bash
just test        # or: bun test src
```

End-to-end tests boot the built server and drive every tool through a real MCP
client against a fake Bitbucket DC REST API (`test/e2e/stub-bitbucket.mjs`):

```bash
just e2e         # or: bun run test:e2e
```

Run the fake Bitbucket DC as a Docker container and test against it:

```bash
just e2e-docker  # or: bun run e2e:docker
```

The stub is a zero-dependency Node HTTP server (`test/e2e/`), so no license or
large Atlassian image is needed. The e2e report is written to
`test/e2e/.last-run.json`.

### Releasing

Releases are automated with [release-please](https://github.com/googleapis/release-please).
On every push to `main`, release-please opens/updates a release PR containing a
generated `CHANGELOG.md` and a version bump derived from
[Conventional Commits](https://www.conventionalcommits.org/). Merging that PR
tags the release and publishes to npm with provenance — no manual `npm publish`.

One-time setup: add an npm automation token as the `NPM_TOKEN` repository secret
(**Settings → Secrets and variables → Actions**).

Agents and contributors: see `CLAUDE.md`.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `BITBUCKET_URL is required` | Set the `BITBUCKET_URL` environment variable or add it to `.env` |
| `Cannot find module` errors | Run `bun run build` before starting the server |
| `401 Unauthorized` | Check your token or username/password credentials |
| `deleteBranch is disabled` | Set `BITBUCKET_ENABLE_DANGEROUS=true` to enable destructive operations |
| Tools not loading | Verify module has a valid default export matching `RegisterableModule` |

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup,
commands, and the Conventional Commits/release workflow, and
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for community expectations. Please
report security issues privately per [SECURITY.md](SECURITY.md).

## License

MIT — see [LICENSE](LICENSE).

## Resources

- [Model Context Protocol Documentation](https://modelcontextprotocol.io)
- [Bitbucket Data Center REST API](https://developer.atlassian.com/server/bitbucket/rest/)
- [MCP Inspector](https://github.com/modelcontextprotocol/inspector)
