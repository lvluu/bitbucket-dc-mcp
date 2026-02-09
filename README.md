# Bitbucket DC MCP Server

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that exposes **Bitbucket Data Center REST API v1.0** as tools for AI assistants.

</div>

## Overview

This server lets MCP-compatible clients (Claude Desktop, VS Code, IDEs, custom apps) interact with a Bitbucket Data Center instance — browsing projects, managing repositories, creating and reviewing pull requests, and more — through 48 tools.

```mermaid
graph LR
    A[AI Client] <-->|MCP| B[bitbucket-dc-mcp]
    B <-->|REST API v1.0| C[Bitbucket Data Center]
```

## Prerequisites

- Node.js >= 20.11.0
- A Bitbucket Data Center instance with API access
- A personal access token or username/password credentials

## Quick Start

### Using npx (no install required)

```bash
BITBUCKET_URL=https://bitbucket.yourcompany.com \
BITBUCKET_TOKEN=your-token \
MCP_TRANSPORT=stdio \
npx bitbucket-dc-mcp
```

### From source

#### 1. Install dependencies

```bash
pnpm install
```

#### 2. Configure environment

Create a `.env` file (or export variables in your shell):

```env
# Required — your Bitbucket DC base URL
BITBUCKET_URL=https://bitbucket.yourcompany.com

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

#### 3. Build and run

```bash
pnpm run build
node build/index.js
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
| `MCP_TRANSPORT` | No | Transport mode: `stdio` or `http` | `http` |
| `PORT` | No | HTTP server port | `3000` |
| `CORS_ORIGIN` | No | CORS allowed origins | `*` |

\* Either `BITBUCKET_TOKEN` or both `BITBUCKET_USERNAME` + `BITBUCKET_PASSWORD` are required.

## Transport Modes

### HTTP Mode (Default)

Streamable HTTP transport for web deployments and remote access:

```bash
pnpm run serve:http
```

Endpoints:
- `GET /mcp` — SSE stream for server-initiated messages
- `POST /mcp` — JSON-RPC requests
- `DELETE /mcp` — Session termination
- `GET /health` — Health check

### Stdio Mode

Traditional stdio transport for local clients like Claude Desktop:

```bash
pnpm run serve:stdio
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
      "args": ["-y", "bitbucket-dc-mcp"],
      "env": {
        "BITBUCKET_URL": "https://bitbucket.yourcompany.com",
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
        "args": ["-y", "bitbucket-dc-mcp"],
        "env": {
          "BITBUCKET_URL": "https://bitbucket.yourcompany.com",
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
  -e BITBUCKET_URL=https://bitbucket.yourcompany.com \
  -e BITBUCKET_TOKEN=your-token \
  -e MCP_TRANSPORT=stdio \
  -- npx -y bitbucket-dc-mcp
```

Or manually create/edit `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "bitbucket-dc-mcp": {
      "command": "npx",
      "args": ["-y", "bitbucket-dc-mcp"],
      "env": {
        "BITBUCKET_URL": "https://bitbucket.yourcompany.com",
        "BITBUCKET_TOKEN": "your-token",
        "MCP_TRANSPORT": "stdio"
      }
    }
  }
}
```

### Claude Desktop

Add to your Claude Desktop configuration (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "bitbucket-dc-mcp": {
      "command": "npx",
      "args": ["-y", "bitbucket-dc-mcp"],
      "env": {
        "BITBUCKET_URL": "https://bitbucket.yourcompany.com",
        "BITBUCKET_TOKEN": "your-token",
        "MCP_TRANSPORT": "stdio"
      }
    }
  }
}
```

## Sharing & Installation

The recommended way to share and run this MCP server internally is via `npx` (no install required):

```bash
BITBUCKET_URL=https://bitbucket.yourcompany.com \
BITBUCKET_TOKEN=your-token \
MCP_TRANSPORT=stdio \
npx bitbucket-dc-mcp
```

Share this command and the configuration instructions with your coworkers.

## Development

### Commands

| Command | Description |
|---------|-------------|
| `pnpm run build` | Compile TypeScript to `build/` |
| `pnpm run typecheck` | Type-check without emitting |
| `pnpm run lint` | Run ESLint |
| `pnpm run lint:fix` | Auto-fix ESLint issues |
| `pnpm test` | Run all tests |
| `pnpm run test:watch` | Run tests in watch mode |
| `pnpm run inspect` | Build + launch MCP Inspector (stdio) |
| `pnpm run inspect:http` | MCP Inspector against HTTP endpoint |
| `pnpm run dev` | Build + interactive JSON-RPC REPL |
| `pnpm run knip` | Find unused exports/dependencies |
| `pnpm run gen:tool` | Generate a new tool module with test |

### Testing with MCP Inspector

```bash
# Stdio mode
pnpm run inspect

# HTTP mode (start server first, then in another terminal)
pnpm run inspect:http
```

The MCP Inspector provides an interactive UI to browse and test all registered tools.

### Adding a New Tool

1. Create `src/tools/my-domain.ts` (or add to an existing domain file)
2. Export a default `RegisterableModule` that registers tools in its `register()` function
3. The auto-loader discovers it automatically on next build
4. Or use the generator: `pnpm run gen:tool`

See existing files in `src/tools/` for examples.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `BITBUCKET_URL is required` | Set the `BITBUCKET_URL` environment variable or add it to `.env` |
| `Cannot find module` errors | Run `pnpm run build` before starting the server |
| `401 Unauthorized` | Check your token or username/password credentials |
| `deleteBranch is disabled` | Set `BITBUCKET_ENABLE_DANGEROUS=true` to enable destructive operations |
| Tools not loading | Verify module has a valid default export matching `RegisterableModule` |

## License

MIT — see [LICENSE](LICENSE).

## Resources

- [Model Context Protocol Documentation](https://modelcontextprotocol.io)
- [Bitbucket Data Center REST API](https://developer.atlassian.com/server/bitbucket/rest/)
- [MCP Inspector](https://github.com/modelcontextprotocol/inspector)
