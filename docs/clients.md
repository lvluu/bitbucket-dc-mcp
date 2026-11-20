# Client setup

Every client runs the server over stdio with `npx`. Replace the URL and token.

## Claude Code

```bash
claude mcp add bitbucket-dc \
  -e BITBUCKET_URL=https://bitbucket.example.com \
  -e BITBUCKET_TOKEN=your-token \
  -e MCP_TRANSPORT=stdio \
  -- npx -y @shibainu16/bitbucket-dc-mcp
```

Add `--scope user` to use it in every project. Or commit a project `.mcp.json`
(keep the token out of git: Claude Code expands `${VAR}` from your shell):

```json
{
  "mcpServers": {
    "bitbucket-dc": {
      "command": "npx",
      "args": ["-y", "@shibainu16/bitbucket-dc-mcp"],
      "env": {
        "BITBUCKET_URL": "https://bitbucket.example.com",
        "BITBUCKET_TOKEN": "${BITBUCKET_TOKEN}",
        "MCP_TRANSPORT": "stdio"
      }
    }
  }
}
```

Then add the usage skill: `npx skills add lvluu/bitbucket-dc-mcp`.

## Claude Desktop

`claude_desktop_config.json` (Settings → Developer → Edit Config): same `mcpServers` block as above,
with the real token value.

## VS Code / GitHub Copilot

`.vscode/mcp.json` (or under `"mcp"` in `settings.json`):

```json
{
  "servers": {
    "bitbucket-dc": {
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

## Cursor

`~/.cursor/mcp.json` or `.cursor/mcp.json`: same `mcpServers` block as Claude Code.

## Codex CLI

`~/.codex/config.toml`:

```toml
[mcp_servers.bitbucket-dc]
command = "npx"
args = ["-y", "@shibainu16/bitbucket-dc-mcp"]
env = { BITBUCKET_URL = "https://bitbucket.example.com", BITBUCKET_TOKEN = "your-token", MCP_TRANSPORT = "stdio" }
```

## Remote / shared server (HTTP)

Run one server and point clients at it:

```bash
HOST=0.0.0.0 MCP_AUTH_TOKEN=change-me BITBUCKET_URL=... BITBUCKET_TOKEN=... npx -y @shibainu16/bitbucket-dc-mcp
claude mcp add --transport http bitbucket-dc http://server:3000/mcp --header "Authorization: Bearer change-me"
```

See [configuration.md](configuration.md#security) before exposing it.
