import type { AxiosInstance } from "axios";
export const DC_DEFAULT_LIMIT = 25;
export const DC_MAX_LIMIT = 100;
export const DC_ALL_ITEMS_CAP = 1000;
export interface PageResult<T = unknown> {
    values: T[];
    start: number | undefined;
    limit: number;
    isLastPage: boolean;
    nextPageStart?: number;
    /** True when `all` stopped at the item cap and more items exist from `nextPageStart`. */
    truncated?: boolean;
    totalFetched: number;
    fetchedPages: number;
}
export interface FetchPageOptions {
    limit?: number;
    start?: number;
    all?: boolean;
    params?: Record<string, unknown>;
    maxItems?: number;
}
interface PagedResponse {
    values?: unknown;
    start?: number;
    limit?: number;
    isLastPage?: boolean;
    nextPageStart?: number;
}
function clampLimit(value: number | undefined): number {
    if (value === undefined || !Number.isFinite(value))
        return DC_DEFAULT_LIMIT;
    const n = Math.floor(value);
    if (n < 1)
        return 1;
    return Math.min(n, DC_MAX_LIMIT);
}
// eslint-disable-next-line max-params
async function fetchSinglePage<T>(client: AxiosInstance, path: string, requestParams: Record<string, unknown>, resolvedLimit: number): Promise<PageResult<T>> {
    const response = await client.get<PagedResponse>(path, { params: requestParams });
    const data = response.data;
    const values: T[] = Array.isArray(data.values) ? data.values : [];
    return {
        values,
        start: data.start,
        limit: data.limit ?? resolvedLimit,
        isLastPage: data.isLastPage ?? true,
        nextPageStart: data.nextPageStart,
        totalFetched: values.length,
        fetchedPages: 1,
    };
}
// eslint-disable-next-line max-params
async function fetchAllPages<T>(client: AxiosInstance, path: string, params: Record<string, unknown>, resolvedLimit: number, maxItems: number, startAt: number | undefined): Promise<PageResult<T>> {
    const aggregated: T[] = [];
    let fetchedPages = 0;
    let nextStart = startAt;
    let lastLimit = resolvedLimit;
    let isLastPage = false;
    let nextPageStart: number | undefined;
    while (aggregated.length < maxItems) {
        // Never overshoot the cap, so the server's nextPageStart is a correct continuation point.
        const pageParams: Record<string, unknown> = {
            ...params,
            limit: Math.min(resolvedLimit, maxItems - aggregated.length),
        };
        if (nextStart !== undefined) {
            pageParams.start = nextStart;
        }
        const response = await client.get<PagedResponse>(path, { params: pageParams });
        const data = response.data;
        const values: T[] = Array.isArray(data.values) ? data.values : [];
        aggregated.push(...values);
        fetchedPages++;
        lastLimit = data.limit ?? resolvedLimit;
        isLastPage = data.isLastPage ?? true;
        nextPageStart = isLastPage ? undefined : data.nextPageStart;
        if (isLastPage || nextPageStart === undefined) {
            isLastPage = true;
            break;
        }
        nextStart = nextPageStart;
    }
    return {
        values: aggregated,
        start: startAt ?? 0,
        limit: lastLimit,
        isLastPage,
        nextPageStart,
        truncated: !isLastPage,
        totalFetched: aggregated.length,
        fetchedPages,
    };
}
export async function fetchPage<T = Record<string, unknown>>(client: AxiosInstance, path: string, options: FetchPageOptions = {}): Promise<PageResult<T>> {
    const { limit, start, all = false, params = {}, maxItems = DC_ALL_ITEMS_CAP, } = options;
    const resolvedLimit = clampLimit(limit);
    const requestParams: Record<string, unknown> = {
        ...params,
        limit: resolvedLimit,
    };
    if (start !== undefined) {
        requestParams.start = start;
    }
    // Single page fetch
    if (!all) {
        return await fetchSinglePage<T>(client, path, requestParams, resolvedLimit);
    }
    // Fetch all pages
    return await fetchAllPages<T>(client, path, params, resolvedLimit, maxItems, start);
}

export interface ListPage<R = unknown> {
    isLastPage: boolean;
    nextPageStart?: number;
    truncated?: true;
    values: R[];
}

/**
 * Wrap list values with the paging metadata so callers can tell truncation from completeness.
 * Metadata keys come BEFORE values: a BITBUCKET_MAX_CHARS cut trims the tail, never the metadata.
 */
export function pageResult<R>(page: Pick<PageResult, "isLastPage" | "nextPageStart" | "truncated">, values: R[] | undefined): ListPage<R> {
    return {
        isLastPage: page.isLastPage,
        ...(page.nextPageStart !== undefined && !page.isLastPage ? { nextPageStart: page.nextPageStart } : {}),
        ...(page.truncated === true ? { truncated: true as const } : {}),
        values: values ?? [],
    };
}

/**
 * Page through a feed (e.g. PR activities) and keep only items passing `pick`, until at least
 * `limit` matches, the feed ends, or `maxScan` raw items were scanned. `nextPageStart` is a feed
 * offset, so whole pages are kept (matches may exceed `limit`) to avoid skipping items.
 */
export async function fetchFiltered<T, R>(client: AxiosInstance, path: string, pick: (item: T) => R | undefined, options: FetchPageOptions = {}): Promise<PageResult<R>> {
    const { limit, start, all = false, params = {}, maxItems = DC_ALL_ITEMS_CAP } = options;
    const resolvedLimit = clampLimit(limit);
    const wanted = all ? Number.POSITIVE_INFINITY : resolvedLimit;
    const matches: R[] = [];
    let scanned = 0;
    let fetchedPages = 0;
    let nextStart = start;
    let isLastPage = false;
    let nextPageStart: number | undefined;
    while (matches.length < wanted && scanned < maxItems) {
        const pageParams: Record<string, unknown> = { ...params, limit: Math.min(DC_MAX_LIMIT, maxItems - scanned) };
        if (nextStart !== undefined)
            pageParams.start = nextStart;
        const response = await client.get<PagedResponse>(path, { params: pageParams });
        const values: T[] = Array.isArray(response.data.values) ? response.data.values as T[] : [];
        for (const item of values) {
            const hit = pick(item);
            if (hit !== undefined)
                matches.push(hit);
        }
        scanned += values.length;
        fetchedPages++;
        isLastPage = response.data.isLastPage ?? true;
        nextPageStart = isLastPage ? undefined : response.data.nextPageStart;
        if (nextPageStart === undefined) {
            isLastPage = true;
            break;
        }
        nextStart = nextPageStart;
    }
    return {
        values: matches,
        start: start ?? 0,
        limit: resolvedLimit,
        isLastPage,
        nextPageStart,
        truncated: !isLastPage && matches.length < wanted,
        totalFetched: scanned,
        fetchedPages,
    };
}
