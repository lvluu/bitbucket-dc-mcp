# Security Policy

## Supported Versions

The latest published release of `@shibainu16/bitbucket-dc-mcp` receives security
updates. Please reproduce issues on the latest version before reporting.

## Reporting a Vulnerability

**Please do not open a public issue for security problems.**

Report vulnerabilities privately via GitHub's
[Security Advisories](https://github.com/lvluu/bitbucket-dc-mcp/security/advisories/new).
Include:

- the affected version(s),
- a description of the issue and its impact,
- reproduction steps or a proof of concept,
- any suggested remediation.

You can expect an initial acknowledgement within a few days. Please give us a
reasonable window to release a fix before any public disclosure.

## Handling Credentials

This server authenticates to Bitbucket Data Center with a personal access token
(`BITBUCKET_TOKEN`) or username/password (`BITBUCKET_USERNAME` +
`BITBUCKET_PASSWORD`), read from the environment or a local `.env` file:

- Never commit tokens or a `.env` file — both are covered by `.gitignore`.
- Prefer a token scoped to the least privilege the workflow needs.
- Destructive tools (`deleteBranch`, `deletePRComment`) are disabled unless
  `BITBUCKET_ENABLE_DANGEROUS=true`.
