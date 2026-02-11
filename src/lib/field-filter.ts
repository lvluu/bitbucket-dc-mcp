/**
 * Field filtering utilities to reduce API response sizes.
 * Bitbucket DC API doesn't support partial responses, so we filter client-side.
 */

/**
 * Creates a summary of a pull request with only essential fields.
 * Reduces token count by ~80-90% compared to full PR object.
 */
export function summarizePullRequest(pr: Record<string, unknown>): Record<string, unknown> {
  const fromRef = pr.fromRef as Record<string, unknown> | undefined;
  const toRef = pr.toRef as Record<string, unknown> | undefined;
  const author = pr.author as Record<string, unknown> | undefined;
  const authorUser = author?.user as Record<string, unknown> | undefined;

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

function summarizeReviewers(reviewers: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(reviewers) || reviewers.length === 0) {
    return undefined;
  }

  return reviewers.map((r) => {
    const reviewer = r as Record<string, unknown>;
    const user = reviewer.user as Record<string, unknown> | undefined;
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
export function summarizeRepository(repo: Record<string, unknown>): Record<string, unknown> {
  const project = repo.project as Record<string, unknown> | undefined;

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
    defaultBranch: (repo.defaultBranch as Record<string, unknown> | undefined)?.displayId,
    scmId: repo.scmId,
  };
}

/**
 * Creates a summary of a branch with only essential fields.
 */
export function summarizeBranch(branch: Record<string, unknown>): Record<string, unknown> {
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
export function summarizeCommit(commit: Record<string, unknown>): Record<string, unknown> {
  const author = commit.author as Record<string, unknown> | undefined;
  const committer = commit.committer as Record<string, unknown> | undefined;

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
export function summarizeProject(project: Record<string, unknown>): Record<string, unknown> {
  return {
    key: project.key,
    name: project.name,
    description: project.description,
    public: project.public,
    type: project.type,
  };
}

/**
 * Maps an array of items through a summarizer function.
 * Returns undefined if the array is empty.
 */
export function summarizeArray(
  items: unknown[] | undefined,
  summarizer: (item: Record<string, unknown>) => Record<string, unknown>
): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(items) || items.length === 0) {
    return undefined;
  }
  return items.map((item) => summarizer(item as Record<string, unknown>));
}
