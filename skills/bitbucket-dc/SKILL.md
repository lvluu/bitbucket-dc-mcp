---
name: bitbucket-dc
description: Work with Bitbucket Data Center through the bitbucket-dc MCP server - pull requests, code review comments, diffs, branches, commits, files and builds. Use when the user mentions Bitbucket (self-hosted / Data Center / Server), a PR on it, reviewing a PR, PR comments or tasks, or a projectKey/repoSlug.
---

# Bitbucket Data Center

Tools come from the `bitbucket-dc-mcp` MCP server. Not installed? Follow
https://github.com/lvluu/bitbucket-dc-mcp/blob/main/docs/agent-install.md

## Addressing

- Every repo tool needs `projectKey` + `repoSlug`. From a clone URL `https://host/scm/PROJ/repo.git` or
  `ssh://git@host:7999/proj/repo.git`: projectKey = `PROJ` (upper case), repoSlug = `repo`.
- From a PR link `.../projects/PROJ/repos/repo/pull-requests/42`: `prId` = 42.
- Branch names: pass the short name (`main`, `feature/x`) to create/delete/PR tools; `listPullRequests.at` wants
  the full ref (`refs/heads/main`).

## Save tokens

- Start small: `getPullRequestChanges` (file list) before `getPullRequestDiff`; `getCommitDiff` with `path`
  for one file.
- Lists are paged: read `isLastPage` / `nextPageStart`; use `all: true` only when you need everything (cap 1000).
- `listPRComments` returns unresolved comments by default; pass `state: ALL` only when asked.
- Large text is cut at `BITBUCKET_MAX_CHARS` with a note; narrow the request instead of retrying.

## Review a PR

1. `getPullRequest`, then `getPullRequestChanges`.
2. Read the diff per file, and `getFileContent` at the source branch when context is needed.
3. `startReview`, then `addPRComment` for each finding (inline: `anchorPath` + `anchorLine` + `anchorLineType`,
   `anchorFileType: TO` for new code). Comments are
   buffered, not posted.
4. Show the user `listPendingReviewComments`. On their go: `finishReview` (optionally `reviewStatus: APPROVED`),
   else `discardReview`.
5. Use `addBlockerComment` only for must-fix items; it creates a task that blocks merge.

## Before you change anything

- Confirm with the user before `mergePullRequest`, `declinePullRequest`, `editFile`, `createBranch`,
  `createTag`, `setDefaultBranch`, or posting comments outside a review session.
- Check `canMergePullRequest` and `getBuildStatuses` (latest commit) before merging.
- `deleteBranch` and `deletePRComment` are off unless the server runs with `BITBUCKET_ENABLE_DANGEROUS=true`.

## Errors

- 401: token wrong or expired. 403: token lacks the permission. 404: wrong projectKey/repoSlug/prId or URL.
- 409: someone changed it first. Comment tools take `version`: `getPRComment` again and retry with the new one.
  PR update/merge/decline read the current version themselves; just retry once.
