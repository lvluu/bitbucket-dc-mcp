/**
 * In-memory review session state management.
 *
 * When a review is active for a PR, comments added via addPRComment are
 * buffered here instead of being posted immediately. finishReview then
 * posts them all at once.
 *
 * Every session is owned by the MCP server instance (one per MCP session) that started it:
 * other sessions cannot see, buffer into, finish or discard it. A session is dropped when its
 * owner closes, and expires after the idle TTL so a vanished client cannot block the PR.
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
    lastTouched: number;
}

export const DEFAULT_REVIEW_TTL_MS = 30 * 60 * 1000;

function envTtlMs(): number {
    const raw = process.env.MCP_SESSION_IDLE_TTL_MS;
    const n = Number(raw);
    return raw !== undefined && Number.isInteger(n) && n > 0 ? n : DEFAULT_REVIEW_TTL_MS;
}

let ttlMs = envTtlMs();
let now: () => number = Date.now;
const reviewSessions = new Map<string, ReviewSession>();

/** Override the TTL and clock (tests) and drop all sessions; call with no args to restore defaults. */
export function resetReviewState(options: { ttlMs?: number; now?: () => number } = {}): void {
    ttlMs = options.ttlMs ?? envTtlMs();
    now = options.now ?? Date.now;
    reviewSessions.clear();
}

function sweepExpired(): void {
    const cutoff = now() - ttlMs;
    for (const [key, session] of reviewSessions) {
        if (session.lastTouched <= cutoff) {
            reviewSessions.delete(key);
        }
    }
}

function ownedSession(key: string, owner: ReviewOwner): ReviewSession | undefined {
    sweepExpired();
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
    sweepExpired();
    const existing = reviewSessions.get(key);
    if (existing !== undefined) {
        throw new Error(existing.owner === owner
            ? `A review session is already active for ${key}. Finish or discard it first.`
            : `A review session is already active for ${key} in another MCP session; it expires after ${String(Math.round(ttlMs / 1000))}s idle.`);
    }
    reviewSessions.set(key, { owner, comments: [], lastTouched: now() });
}
export function getReviewSession(key: string, owner: ReviewOwner): PendingComment[] | undefined {
    const session = ownedSession(key, owner);
    if (session !== undefined) {
        session.lastTouched = now();
    }
    return session?.comments;
}
export function addPendingComment(key: string, owner: ReviewOwner, comment: PendingComment): number {
    const session = requireSession(key, owner);
    session.lastTouched = now();
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
