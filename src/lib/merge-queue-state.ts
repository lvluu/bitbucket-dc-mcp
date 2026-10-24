/**
 * In-memory merge queue state management.
 *
 * Tracks per-repository queues of pull request IDs.
 */

// Key: `${projectKey}/${repoSlug}` -> array of PR IDs in queue order
const mergeQueues = new Map<string, number[]>();

export function mergeQueueKey(projectKey: string, repoSlug: string): string {
    return `${projectKey}/${repoSlug}`;
}

/**
 * Appends a PR ID to the repository's merge queue. A PR already queued keeps its position.
 * @returns 1-based position in the queue
 */
export function enqueuePullRequest(key: string, prId: number): number {
    let queue = mergeQueues.get(key);
    if (!queue) {
        queue = [];
        mergeQueues.set(key, queue);
    }
    const existing = queue.indexOf(prId);
    if (existing !== -1) {
        return existing + 1;
    }
    queue.push(prId);
    return queue.length;
}

/**
 * Returns the list of queued PR IDs in order for a repository.
 */
export function getMergeQueue(key: string): number[] {
    return [...(mergeQueues.get(key) ?? [])];
}

/**
 * Removes a PR from the repository's queue and returns it. With no `prId` the head is removed.
 * Returns undefined (and changes nothing) when the queue is empty or `prId` is not queued.
 */
export function dequeuePullRequest(key: string, prId?: number): number | undefined {
    const queue = mergeQueues.get(key);
    if (!queue || queue.length === 0) {
        return undefined;
    }
    const index = prId === undefined ? 0 : queue.indexOf(prId);
    if (index === -1) {
        return undefined;
    }
    const [removed] = queue.splice(index, 1);
    if (queue.length === 0) {
        mergeQueues.delete(key);
    }
    return removed;
}

const processing = new Set<string>();

/**
 * Marks a repository's queue as being processed.
 * @returns false when another processing run already holds it
 */
export function tryAcquireProcessing(key: string): boolean {
    if (processing.has(key)) {
        return false;
    }
    processing.add(key);
    return true;
}

export function releaseProcessing(key: string): void {
    processing.delete(key);
}

/**
 * Clears the merge queue for a repository (useful for test resets).
 */
export function clearMergeQueue(key: string): void {
    mergeQueues.delete(key);
}
