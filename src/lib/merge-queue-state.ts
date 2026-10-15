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
 * Appends a PR ID to the repository's merge queue.
 * @returns 1-based position in the queue
 */
export function enqueuePullRequest(key: string, prId: number): number {
    let queue = mergeQueues.get(key);
    if (!queue) {
        queue = [];
        mergeQueues.set(key, queue);
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
 * Removes and returns the first PR ID from the repository's queue, or undefined if empty.
 */
export function dequeuePullRequest(key: string): number | undefined {
    const queue = mergeQueues.get(key);
    if (!queue || queue.length === 0) {
        return undefined;
    }
    const prId = queue.shift();
    if (queue.length === 0) {
        mergeQueues.delete(key);
    }
    return prId;
}

/**
 * Clears the merge queue for a repository (useful for test resets).
 */
export function clearMergeQueue(key: string): void {
    mergeQueues.delete(key);
}
