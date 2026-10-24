/**
 * In-memory review session state management.
 *
 * When a review is active for a PR, comments added via addPRComment are
 * buffered here instead of being posted immediately. finishReview then
 * posts them all at once.
 *
 * Every session is owned by the MCP server instance (one per MCP session) that started it:
 * other sessions cannot see, buffer into, finish or discard it. A review lives exactly as long as
 * its MCP session: it is dropped when the owner closes, which the HTTP idle sweep
 * (MCP_SESSION_IDLE_TTL_MS) does for a vanished client. No separate clock, so a long reading
 * session never loses its buffered comments.
 */
// Key: "projectKey/repoSlug/prId"
export interface PendingComment {
    [key: string]: unknown;
}
/** Identity of the MCP session that owns a review (its McpServer instance). */
export type ReviewOwner = object;

interface ReviewSession {
    owner: ReviewOwner;
    comments: PendingComment[];
}

const reviewSessions = new Map<string, ReviewSession>();

/** Drop all sessions (tests). */
export function resetReviewState(): void {
    reviewSessions.clear();
}

function ownedSession(key: string, owner: ReviewOwner): ReviewSession | undefined {
    const session = reviewSessions.get(key);
    return session?.owner === owner ? session : undefined;
}

function requireSession(key: string, owner: ReviewOwner): ReviewSession {
    const session = ownedSession(key, owner);
    if (session === undefined) {
        throw new Error(`No active review session for ${key}.`);
    }
    return session;
}

export function reviewKey(projectKey: string, repoSlug: string, prId: number | string): string {
    return `${projectKey}/${repoSlug}/${String(prId)}`;
}
/** True only for the owning session; other sessions never buffer into someone else's review. */
export function hasActiveReview(key: string, owner: ReviewOwner): boolean {
    return ownedSession(key, owner) !== undefined;
}
export function startReviewSession(key: string, owner: ReviewOwner): void {
    const existing = reviewSessions.get(key);
    if (existing !== undefined) {
        throw new Error(existing.owner === owner
            ? `A review session is already active for ${key}. Finish or discard it first.`
            : `A review session is already active for ${key} in another MCP session; it is released when that session closes.`);
    }
    reviewSessions.set(key, { owner, comments: [] });
}
export function getReviewSession(key: string, owner: ReviewOwner): PendingComment[] | undefined {
    return ownedSession(key, owner)?.comments;
}
export function addPendingComment(key: string, owner: ReviewOwner, comment: PendingComment): number {
    const session = requireSession(key, owner);
    session.comments.push(comment);
    return session.comments.length - 1;
}
export function clearReviewSession(key: string, owner: ReviewOwner): PendingComment[] {
    const session = requireSession(key, owner);
    reviewSessions.delete(key);
    return session.comments;
}
/** Drop every review the closing MCP session still holds. */
export function releaseReviewOwner(owner: ReviewOwner): void {
    for (const [key, session] of reviewSessions) {
        if (session.owner === owner) {
            reviewSessions.delete(key);
        }
    }
}
