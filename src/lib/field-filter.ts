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
 * Creates a summary of a commit with only essential fields.
 */
export function summarizeCommit(commit: Loose): Loose {
    const author = commit.author as UserLike | undefined;
    const committer = commit.committer as UserLike | undefined;
    return {
        id: commit.id,
        displayId: commit.displayId,
        message: commit.message,
        author: author
            ? {
                name: author.name,
                emailAddress: author.emailAddress,
            }
            : undefined,
        authorTimestamp: commit.authorTimestamp,
        committer: committer
            ? {
                name: committer.name,
                emailAddress: committer.emailAddress,
            }
            : undefined,
        committerTimestamp: commit.committerTimestamp,
        parents: commit.parents,
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
 * Maps an array of items through a summarizer function.
 * Returns undefined if the array is empty.
 */
export function summarizeArray<T = Loose, R = unknown>(items: unknown, summarizer: (item: T) => R): R[] | undefined {
    if (!Array.isArray(items) || items.length === 0) {
        return undefined;
    }
    return items.map((item: T) => summarizer(item));
}
