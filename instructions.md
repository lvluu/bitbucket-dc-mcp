# Bitbucket DC MCP Server — Setup Instructions

You are helping a user set up the **bitbucket-dc-mcp** MCP server. Your job is to walk them through installing it globally from source, then collect their credentials and output the correct client configuration.

## Step 1 — Clone & Install

```bash
git clone ssh://git@bitbucket.mgm-tp.com:7999/~lvluu/bitbucket-mcp.git
cd bitbucket-mcp
# ci for clean install, then build
npm ci
```

## Step 2 — Build

```bash
npm run build
```

## Step 3 — Install globally via symlink

```bash
npm link
```

## Step 4 — Verify executable works

```bash
# Should print the path to the symlinked binary
which bitbucket-mcp

# Should fail with "BITBUCKET_TOKEN or USERNAME/PASSWORD is required" — that's correct
bitbucket-mcp 2>&1 || true
```

After this, `bitbucket-dc-mcp` is available as a global command.

## Step 5 — Gather information

Ask the user the following questions (skip any they've already answered):

1. **Bitbucket URL** — What is your Bitbucket Data Center base URL? (e.g. `https://bitbucket.yourcompany.com`)
2. **Authentication method** — Do you want to use a **Personal Access Token** (recommended) or **Username + Password**?
   - If token: ask for the token value.
   - If basic auth: ask for username and password.
3. **Default project** *(optional)* — Do you have a default project key you'd like pre-filled? (e.g. `MYPROJ`)
4. **Client** — Which client are you configuring?
   - **VS Code / GitHub Copilot** (workspace `.vscode/mcp.json`)
   - **VS Code settings.json** (user-level `settings.json`)
   - **Claude Code** (`.mcp.json` or CLI command)
   - **Claude Desktop** (`claude_desktop_config.json`)
   - **Other / manual** (environment variables only)

## Step 6 — Build the configuration

Use the answers to produce the correct config block. Since the tool is installed globally, use `bitbucket-dc-mcp` as the command directly (no `node`, no `npx`).

### Environment variables reference

| Variable | Required | Notes |
|----------|----------|-------|
| `BITBUCKET_URL` | Yes | Base URL, e.g. `https://bitbucket.yourcompany.com` |
| `BITBUCKET_TOKEN` | Yes* | Personal access token (Bearer auth) |
| `BITBUCKET_USERNAME` | Yes* | For basic auth |
| `BITBUCKET_PASSWORD` | Yes* | For basic auth |
| `BITBUCKET_DEFAULT_PROJECT` | No | Default project key |
| `MCP_TRANSPORT` | Yes | Must be `stdio` for client integrations |

\* Either `BITBUCKET_TOKEN` **or** both `BITBUCKET_USERNAME` + `BITBUCKET_PASSWORD`.

### VS Code / GitHub Copilot — `.vscode/mcp.json`

```json
{
  "servers": {
    "bitbucket-dc-mcp": {
      "type": "stdio",
      "command": "bitbucket-dc-mcp",
      "env": {
        "BITBUCKET_URL": "{{BITBUCKET_URL}}",
        "BITBUCKET_TOKEN": "{{TOKEN}}",
        "MCP_TRANSPORT": "stdio"
      }
    }
  }
}
```

### VS Code — `settings.json`

```jsonc
{
  "mcp": {
    "servers": {
      "bitbucket-dc-mcp": {
        "type": "stdio",
        "command": "bitbucket-dc-mcp",
        "env": {
          "BITBUCKET_URL": "{{BITBUCKET_URL}}",
          "BITBUCKET_TOKEN": "{{TOKEN}}",
          "MCP_TRANSPORT": "stdio"
        }
      }
    }
  }
}
```

### Claude Code — CLI

```bash
# User-level (available in all projects)
claude mcp add bitbucket-dc-mcp -s user -e BITBUCKET_URL={{BITBUCKET_URL}} -e BITBUCKET_TOKEN={{TOKEN}} -e MCP_TRANSPORT=stdio -- bitbucket-dc-mcp

# Project-level (available only in the current project)
claude mcp add bitbucket-dc-mcp -s project -e BITBUCKET_URL={{BITBUCKET_URL}} -e BITBUCKET_TOKEN={{TOKEN}} -e MCP_TRANSPORT=stdio -- bitbucket-dc-mcp
```

### Claude Code — `.mcp.json`

```json
{
  "mcpServers": {
    "bitbucket-dc-mcp": {
      "command": "bitbucket-dc-mcp",
      "env": {
        "BITBUCKET_URL": "{{BITBUCKET_URL}}",
        "BITBUCKET_TOKEN": "{{TOKEN}}",
        "MCP_TRANSPORT": "stdio"
      }
    }
  }
}
```

### Claude Desktop — `claude_desktop_config.json`

```json
{
  "mcpServers": {
    "bitbucket-dc-mcp": {
      "command": "bitbucket-dc-mcp",
      "env": {
        "BITBUCKET_URL": "{{BITBUCKET_URL}}",
        "BITBUCKET_TOKEN": "{{TOKEN}}",
        "MCP_TRANSPORT": "stdio"
      }
    }
  }
}
```

## Step 7 — Output

1. Replace all `{{...}}` placeholders with the user's actual values.
2. If the user chose basic auth, replace the `BITBUCKET_TOKEN` entry with `BITBUCKET_USERNAME` and `BITBUCKET_PASSWORD`.
3. If the user provided a default project, add `"BITBUCKET_DEFAULT_PROJECT": "{{PROJECT_KEY}}"` to the `env` block.
4. Print the final configuration block ready to copy-paste.
5. Tell the user where the config file lives and how to verify it works.
