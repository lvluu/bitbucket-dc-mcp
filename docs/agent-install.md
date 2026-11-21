# Install guide for AI agents

You are an AI coding agent installing the Bitbucket Data Center MCP server for your user. Follow the steps in
order. Do not print the token back to the user or write it into a file under version control.

## 1. Collect two values

Ask the user only for what is missing:

- `BITBUCKET_URL`: base URL of their Bitbucket Data Center, including any context path
  (`https://bitbucket.example.com` or `https://host/bitbucket`). Not `bitbucket.org` (Cloud is not supported).
- `BITBUCKET_TOKEN`: a personal access token (Bitbucket → Profile → Manage account → HTTP access tokens).
  Read permission is enough to browse; write permission is needed to comment, approve, merge or create branches.

Check `node --version` is 22 or newer.

## 2. Verify the credentials

```bash
curl -fsS -H "Authorization: Bearer $BITBUCKET_TOKEN" "$BITBUCKET_URL/rest/api/1.0/projects?limit=1"
```

A JSON body means it works. 401 = bad token. 404 = wrong URL or missing context path.

## 3. Register the server with your client

Claude Code:

```bash
claude mcp add --scope user bitbucket-dc \
  -e BITBUCKET_URL="$BITBUCKET_URL" \
  -e BITBUCKET_TOKEN="$BITBUCKET_TOKEN" \
  -- npx -y @shibainu16/bitbucket-dc-mcp
```

Other clients: use the matching block in [clients.md](clients.md).

## 4. Install the usage skill

```bash
npx skills add lvluu/bitbucket-dc-mcp
```

## 5. Check it

Claude Code: `claude mcp list` shows `bitbucket-dc` as connected. Then call `listProjects` with `limit: 1`.
Tell the user it is ready and that destructive tools stay off unless they set `BITBUCKET_ENABLE_DANGEROUS=true`.
