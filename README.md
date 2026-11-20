# Bitbucket DC MCP Server

[![npm version](https://img.shields.io/npm/v/@shibainu16/bitbucket-dc-mcp.svg)](https://www.npmjs.com/package/@shibainu16/bitbucket-dc-mcp)
[![CI](https://github.com/lvluu/bitbucket-dc-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/lvluu/bitbucket-dc-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[MCP](https://modelcontextprotocol.io) server for the **Bitbucket Data Center REST API**: 64 tools for projects,
repositories, pull requests, review comments, diffs, branches, commits, files, builds and merge queues.
Results are squeezed to save tokens.

## Install

Needs Node.js 22+ and a Bitbucket DC personal access token.

**Claude Code**

```bash
claude mcp add bitbucket-dc \
  -e BITBUCKET_URL=https://bitbucket.example.com \
  -e BITBUCKET_TOKEN=your-token \
  -e MCP_TRANSPORT=stdio \
  -- npx -y @shibainu16/bitbucket-dc-mcp
```

**Agent skill** (teaches Claude Code, Codex, Cursor and other agents how to use the tools well):

```bash
npx skills add lvluu/bitbucket-dc-mcp
```

**Any other MCP client** (Claude Desktop, VS Code, Cursor, Codex): see [docs/clients.md](docs/clients.md).

**Let your agent install it:** paste this into your coding agent:

> Install the Bitbucket DC MCP server by following
> https://github.com/lvluu/bitbucket-dc-mcp/blob/main/docs/agent-install.md

## Try it

- "Show open pull requests in PROJ/my-repo"
- "Summarize the diff of PR #42 and list unresolved comments"
- "Review PR #15: start a review, add inline comments, then publish them and approve"
- "What is the build status of the latest commit on main?"

## Docs

| Doc | For |
|-----|-----|
| [docs/configuration.md](docs/configuration.md) | Environment variables, HTTP vs stdio, security, troubleshooting |
| [docs/clients.md](docs/clients.md) | Config snippets for each MCP client |
| [docs/tools.md](docs/tools.md) | All tools, paging, token squeeze, review sessions |
| [docs/agent-install.md](docs/agent-install.md) | Step-by-step install written for AI agents |
| [docs/development.md](docs/development.md) | Build, test, release |
| [skills/bitbucket-dc/SKILL.md](skills/bitbucket-dc/SKILL.md) | Agent skill installed by `npx skills add` |

Contributing: [CONTRIBUTING.md](CONTRIBUTING.md). Security: [SECURITY.md](SECURITY.md). License: [MIT](LICENSE).
