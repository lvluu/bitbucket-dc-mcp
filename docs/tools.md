# Tools

74 tools, one module per group in `src/tools/`. `BITBUCKET_DEFAULT_PROJECT` fills `projectKey` only in `listRepositories` and `listRepositoryWebhooks`.

| Group | Tools |
|-------|-------|
| My pull requests (dashboard) | `listMyPullRequests`, `listPullRequestsAwaitingMyReview` |
| Projects | `listProjects`, `getProject`, `createProject`, `updateProject` |
| Repositories | `listRepositories`, `getRepository`, `createRepository`, `forkRepository`, `getDefaultBranch`, `setDefaultBranch` |
| Pull requests | `listPullRequests`, `getPullRequest`, `createPullRequest`, `updatePullRequest`, `mergePullRequest`, `declinePullRequest`, `reopenPullRequest`, `approvePullRequest`, `unapprovePullRequest`, `markPullRequestAsDraft`, `canMergePullRequest`, `addPullRequestReviewers`, `removePullRequestReviewer` |
| PR comments | `listPRComments` (unresolved by default), `addPRComment`, `getPRComment`, `updatePRComment`, `resolvePRComment`, `reopenPRComment`, `deletePRComment`† |
| PR review sessions | `startReview`, `listPendingReviewComments`, `finishReview`, `discardReview` |
| PR tasks | `listPRTasks`, `addBlockerComment`, `resolveTask`, `reopenTask` |
| PR diff | `getPullRequestChanges`, `getPullRequestDiff`, `streamPullRequestDiff`, `getPullRequestPatch` |
| PR activity | `getPullRequestActivity`, `getPullRequestCommits`, `getPullRequestParticipants` |
| Branches & tags | `listBranches`, `createBranch`, `deleteBranch`†, `listTags`, `createTag` |
| Commits | `listCommits`, `getCommit`, `getCommitChanges`, `getCommitDiff` (whole commit or one `path`) |
| Compare refs | `compareRefs` |
| Users | `getUser` |
| Files | `browseFiles`, `getFileContent`, `listFiles`, `editFile` |
| Builds | `getBuildStatuses`, `getBuildStatusStats` |
| Merge queue | `enqueuePullRequest`, `getMergeQueue`, `dequeuePullRequest`, `processMergeQueue` |
| Webhooks | `listRepositoryWebhooks` |
| Repository insight | `searchCode`, `getFileBlame`, `getPullRequestSettings`, `getDefaultReviewers`, `getBranchRestrictions` |

† Needs `BITBUCKET_ENABLE_DANGEROUS=true`.

## Token squeeze

Every result is shrunk before it reaches the model: compact JSON, `links`/`link`/`avatarUrl` and null/empty
fields removed (`false`, `0` and an empty `values` page are kept), long text capped at `BITBUCKET_MAX_CHARS`.
List tools return field-trimmed summaries. `BITBUCKET_VERBOSE=true` gives raw output.

## Paging

List tools return `{ values, isLastPage, nextPageStart?, truncated? }`. When `isLastPage` is `false`, pass
`nextPageStart` as `start`. `all: true` pages from `start` (default 0) up to 1000 items and sets
`truncated: true` at that cap.

`listPRComments` and `listPRTasks` filter PR activities: `limit` is the minimum number of matches to collect,
`start`/`nextPageStart` are activity offsets, and one call can return more than `limit` matches.

## Review sessions

`startReview` buffers `addPRComment` calls in memory for that MCP session. `finishReview` posts them in order
and can approve (`reviewStatus: APPROVED`); it skips the approval if every comment failed. `discardReview` drops
the buffer. A session ends on disconnect (HTTP: after `MCP_SESSION_IDLE_TTL_MS` idle), and the buffer with it.

## Merge queue

A per-repository queue held in server memory (not a Bitbucket feature); it is lost when the server restarts. `processMergeQueue` drops PRs that
are no longer open, merges each PR whose merge check passes, and stops at the first that cannot merge.
