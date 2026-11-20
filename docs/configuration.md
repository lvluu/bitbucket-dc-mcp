# Configuration

Set variables in the client's `env` block, your shell, or a `.env` file in the working directory.

## Environment variables

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `BITBUCKET_URL` | Yes | Bitbucket DC base URL, incl. any context path (e.g. `https://host/bitbucket`); auto-appends `/rest/api/1.0` | — |
| `BITBUCKET_TOKEN` | Yes* | Personal access token (Bearer auth) | — |
| `BITBUCKET_USERNAME` | Yes* | Username for basic auth | — |
| `BITBUCKET_PASSWORD` | Yes* | Password for basic auth | — |
| `BITBUCKET_DEFAULT_PROJECT` | No | Default project key for tools that accept `projectKey` | — |
| `BITBUCKET_ENABLE_DANGEROUS` | No | Enable destructive operations (`deletePRComment`, `deleteBranch`) | `false` |
| `BITBUCKET_TIMEOUT_MS` | No | Per-request timeout in milliseconds; a request exceeding it fails instead of hanging | `30000` |
| `BITBUCKET_VERBOSE` | No | Disable the token squeeze (pretty JSON, no field stripping, no text cap) | `false` |
| `BITBUCKET_MAX_CHARS` | No | Cap per text result (diffs, patches, raw files); appends a truncation note | `60000` |
| `MCP_TRANSPORT` | No | Transport mode: `stdio` or `http` | `http` |
| `PORT` | No | HTTP server port | `3000` |
| `HOST` | No | HTTP bind address; set `0.0.0.0` in containers. A warning is logged when non-loopback and `MCP_AUTH_TOKEN` is unset | `127.0.0.1` |
| `MCP_AUTH_TOKEN` | No | HTTP mode: when set, `/mcp` requires `Authorization: Bearer <token>` (401 otherwise); `/health` stays open | — |
| `MCP_SESSION_IDLE_TTL_MS` | No | HTTP mode: close an MCP session after this many ms without requests (swept every minute) | `1800000` |
| `MCP_MAX_SESSIONS` | No | HTTP mode: max concurrent MCP sessions; further `initialize` requests get 503 | `100` |
| `CORS_ORIGIN` | No | CORS allowed origins, comma-separated; credentials are only allowed when this is not `*` | `*` |

\* Either `BITBUCKET_TOKEN` or both `BITBUCKET_USERNAME` + `BITBUCKET_PASSWORD`.

## Transports

**stdio** (`MCP_TRANSPORT=stdio`): the client starts the server as a child process. Use this for Claude Code,
Claude Desktop, VS Code, Cursor and Codex. The default is `http`, so set it explicitly in client configs.

**HTTP** (default): Streamable HTTP at `http://127.0.0.1:3000/mcp`.

| Endpoint | Purpose |
|----------|---------|
| `POST /mcp` | JSON-RPC requests |
| `GET /mcp` | SSE stream for server-initiated messages |
| `DELETE /mcp` | End the session |
| `GET /health` | Health check |

Each client gets its own session (`mcp-session-id` header). Sessions with no POST/DELETE for
`MCP_SESSION_IDLE_TTL_MS` expire (an open SSE stream does not keep them alive; clients re-initialize on 404).
At `MCP_MAX_SESSIONS`, new `initialize` requests get 503 with `Retry-After`.

## Security

The server holds your Bitbucket credentials and every tool runs with them.

- It binds to `127.0.0.1` by default. To expose it (Docker, LAN), set `HOST=0.0.0.0` **and** `MCP_AUTH_TOKEN`.
- Without a token on a loopback bind, requests whose `Host` is not `localhost`/`127.0.0.1`/`[::1]` get 403
  (DNS-rebinding guard).
- `CORS_ORIGIN` defaults to `*`: any web page can call a tokenless loopback server. Set `CORS_ORIGIN` or
  `MCP_AUTH_TOKEN` if that matters.
- Destructive tools stay off until `BITBUCKET_ENABLE_DANGEROUS=true`.

```bash
docker run -p 3000:3000 \
  -e HOST=0.0.0.0 -e MCP_AUTH_TOKEN="$(openssl rand -hex 32)" \
  -e BITBUCKET_URL=https://bitbucket.example.com -e BITBUCKET_TOKEN=your-token \
  your-image-with-bitbucket-dc-mcp
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `BITBUCKET_URL is required` | Set `BITBUCKET_URL` in the client `env` block or `.env` |
| Client shows no tools / hangs on start | Add `MCP_TRANSPORT=stdio` to the client `env` block |
| `401 Unauthorized` | Check the token, or username + password |
| `404` on every call | `BITBUCKET_URL` must include the context path, e.g. `https://host/bitbucket` |
| `deleteBranch is disabled` | Set `BITBUCKET_ENABLE_DANGEROUS=true` |
| `Cannot find module` (from source) | Run `bun run build` first |
