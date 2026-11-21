/**
 * Field filtering utilities to reduce API response sizes.
 * Bitbucket DC API doesn't support partial responses, so we filter client-side.
 */
/**
 * Creates a summary of a pull request with only essential fields.
 * Reduces token count by ~80-90% compared to full PR object.
 */
type Loose = Record<string, unknown>;
interface UserLike {
    name?: unknown;
    displayName?: unknown;
    emailAddress?: unknown;
}
interface RefLike {
    id?: unknown;
    displayId?: unknown;
}
export function summarizePullRequest(pr: Loose): Loose {
    const fromRef = pr.fromRef as RefLike | undefined;
    const toRef = pr.toRef as RefLike | undefined;
    const author = pr.author as { user?: UserLike } | undefined;
    const authorUser = author?.user;
    return {
        id: pr.id,
        title: pr.title,
        state: pr.state,
        draft: pr.draft,
        createdDate: pr.createdDate,
        updatedDate: pr.updatedDate,
        author: authorUser
            ? {
                name: authorUser.name,
                displayName: authorUser.displayName,
            }
            : undefined,
        sourceBranch: fromRef
            ? {
                id: fromRef.id,
                displayId: fromRef.displayId,
            }
            : undefined,
        targetBranch: toRef
            ? {
                id: toRef.id,
                displayId: toRef.displayId,
            }
            : undefined,
        reviewers: summarizeReviewers(pr.reviewers),
    };
}
function summarizeReviewers(reviewers: unknown): Loose[] | undefined {
    if (!Array.isArray(reviewers) || reviewers.length === 0) {
        return undefined;
    }
    return reviewers.map((r: Loose) => {
        const reviewer = r;
        const user = reviewer.user as UserLike | undefined;
        return {
            name: user?.name,
            displayName: user?.displayName,
            approved: reviewer.approved,
            status: reviewer.status,
        };
    });
}
/**
 * Creates a summary of a repository with only essential fields.
 */
export function summarizeRepository(repo: Loose): Loose {
    const project = repo.project as { key?: unknown; name?: unknown } | undefined;
    return {
        slug: repo.slug,
        name: repo.name,
        description: repo.description,
        project: project
            ? {
                key: project.key,
                name: project.name,
            }
            : undefined,
        public: repo.public,
        forkable: repo.forkable,
        defaultBranch: (repo.defaultBranch as RefLike | undefined)?.displayId,
        scmId: repo.scmId,
    };
}
/**
 * Creates a summary of a branch with only essential fields.
 */
export function summarizeBranch(branch: Loose): Loose {
    return {
        id: branch.id,
        displayId: branch.displayId,
        type: branch.type,
        latestCommit: branch.latestCommit,
        latestChangeset: branch.latestChangeset,
        isDefault: branch.isDefault,
    };
}
/**
 * Summarizes a commit for list results: full id (build-status needs it), first message line,
 * author name and date; committer only when it differs from the author; parents as ids.
 */
export function summarizeCommit(commit: Loose): Loose {
    const author = (commit.author as UserLike | undefined)?.name;
    const committer = (commit.committer as UserLike | undefined)?.name;
    const parents = Array.isArray(commit.parents) ? commit.parents.map((p: Loose) => p.id) : undefined;
    return {
        id: commit.id,
        message: typeof commit.message === "string" ? commit.message.split("\n", 1)[0] : commit.message,
        author,
        date: commit.authorTimestamp,
        committer: committer !== author ? committer : undefined,
        parents,
    };
}
/**
 * Summarizes a changed file (PR or commit changes): path, change type, and srcPath only for moves/copies.
 */
export function summarizeChange(change: Loose): Loose {
    const path = (change.path as { toString?: unknown } | undefined)?.toString;
    const srcPath = (change.srcPath as { toString?: unknown } | undefined)?.toString;
    return {
        path,
        type: change.type,
        srcPath: srcPath !== path ? srcPath : undefined,
    };
}
/**
 * Creates a summary of a project with only essential fields.
 */
export function summarizeProject(project: Loose): Loose {
    return {
        key: project.key,
        name: project.name,
        description: project.description,
        public: project.public,
        type: project.type,
    };
}
/**
 * Creates a summary of a webhook with only essential fields.
 */
export function summarizeWebhook(webhook: Loose): Loose {
    return {
        id: webhook.id,
        name: webhook.name,
        url: webhook.url,
        events: webhook.events,
        active: webhook.active,
        createdDate: webhook.createdDate,
        updatedDate: webhook.updatedDate,
    };
}
/**
 * Summarizes a default-reviewer pull request condition.
 */
export function summarizePullRequestCondition(condition: Loose): Loose {
    const reviewers = Array.isArray(condition.reviewers)
        ? condition.reviewers.map((r: Loose) => {
            const user = r.user as UserLike | undefined;
            return { name: user?.name, displayName: user?.displayName };
        })
        : undefined;
    return {
        id: condition.id,
        sourceMatcher: condition.sourceMatcher,
        targetMatcher: condition.targetMatcher,
        reviewers,
        requiredApprovals: condition.requiredApprovals,
    };
}
/**
 * Summarizes a branch restriction (branch permission).
 */
export function summarizeRestriction(restriction: Loose): Loose {
    return {
        id: restriction.id,
        type: restriction.type,
        matcher: restriction.matcher,
        users: restriction.users,
        groups: restriction.groups,
        inherited: restriction.inherited,
    };
}
/**
 * Summarizes a code-search result hit.
 */
export function summarizeCodeSearchResult(hit: Loose): Loose {
    const file = hit.file as { path?: unknown } | undefined;
    return {
        path: file?.path ?? hit.path,
        line: hit.line,
        context: hit.context,
        text: hit.text,
    };
}
/**
 * Summarizes a pull request comment (top-level or reply) with only essential fields.
 * Keeps enough thread context to understand the conversation without the heavy raw object.
 */
export function summarizeComment(comment: Loose): Loose {
    const author = comment.author as UserLike | undefined;
    const replies = Array.isArray(comment.comments)
        ? comment.comments.map((reply: Loose) => summarizeComment(reply))
        : undefined;
    return {
        id: comment.id,
        version: comment.version,
        text: comment.text,
        author: author
            ? {
                name: author.name,
                displayName: author.displayName,
            }
            : undefined,
        createdDate: comment.createdDate,
        updatedDate: comment.updatedDate,
        threadResolved: comment.threadResolved,
        severity: comment.severity,
        state: comment.state,
        comments: replies,
    };
}

/**
 * Summarizes a pull request activity feed entry (comment, approve, merge, etc.) with only
 * the essential fields. Comments inside the entry go through summarizeComment.
 */
export function summarizeActivity(activity: Loose): Loose {
    const user = activity.user as UserLike | undefined;
    const commit = activity.commit as { id?: unknown; displayId?: unknown } | undefined;
    return {
        id: activity.id,
        action: activity.action,
        actionStatus: activity.actionStatus,
        createdDate: activity.createdDate,
        user: user
            ? {
                name: user.name,
                displayName: user.displayName,
            }
            : undefined,
        comment: activity.comment ? summarizeComment(activity.comment as Loose) : undefined,
        commit: commit
            ? {
                id: commit.id,
                displayId: commit.displayId,
            }
            : undefined,
        fromHash: activity.fromHash,
        toHash: activity.toHash,
    };
}

/**
 * Maps an array of items through a summarizer function.
 * Returns undefined if the array is empty.
 */
export function summarizeArray<T = Loose, R = unknown>(items: unknown, summarizer: (item: T) => R): R[] | undefined {
    if (!Array.isArray(items) || items.length === 0) {
        return undefined;
    }
    return items.map((item: T) => summarizer(item));
}
