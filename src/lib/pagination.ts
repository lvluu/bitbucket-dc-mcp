import type { AxiosInstance } from "axios";

export const DC_DEFAULT_LIMIT = 25;
export const DC_MAX_LIMIT = 100;
export const DC_ALL_ITEMS_CAP = 1000;

export type PaginationOptions = {
  limit?: number;
  start?: number;
  all?: boolean;
  params?: Record<string, unknown>;
  maxItems?: number;
};

export type PaginatedResult<T> = {
  values: Array<T>;
  start?: number;
  limit: number;
  isLastPage: boolean;
  nextPageStart?: number;
  totalFetched: number;
  fetchedPages: number;
};

function clampLimit(value?: number): number {
  if (value === undefined || !Number.isFinite(value)) return DC_DEFAULT_LIMIT;
  const n = Math.floor(value);
  if (n < 1) return 1;
  return Math.min(n, DC_MAX_LIMIT);
}

async function fetchSinglePage<T>(
  client: AxiosInstance,
  path: string,
  requestParams: Record<string, unknown>,
  resolvedLimit: number
): Promise<PaginatedResult<T>> {
  const response = await client.get(path, { params: requestParams });
  const data = response.data as Record<string, unknown>;
  const values = (Array.isArray(data.values) ? data.values : []) as Array<T>;
  return {
    values,
    start: data.start as number | undefined,
    limit: (data.limit as number | undefined) ?? resolvedLimit,
    isLastPage: (data.isLastPage as boolean | undefined) ?? true,
    nextPageStart: data.nextPageStart as number | undefined,
    totalFetched: values.length,
    fetchedPages: 1,
  };
}

async function fetchAllPages<T>(
  client: AxiosInstance,
  path: string,
  params: Record<string, unknown>,
  resolvedLimit: number,
  maxItems: number
): Promise<PaginatedResult<T>> {
  const aggregated: Array<T> = [];
  let fetchedPages = 0;
  let nextStart: number | undefined = undefined;
  let lastLimit = resolvedLimit;

  while (aggregated.length < maxItems) {
    const pageParams: Record<string, unknown> = {
      ...params,
      limit: resolvedLimit,
    };
    if (nextStart !== undefined) {
      pageParams.start = nextStart;
    }

    const response = await client.get(path, { params: pageParams });
    const data = response.data as Record<string, unknown>;
    const values = (Array.isArray(data.values) ? data.values : []) as Array<T>;
    aggregated.push(...values);
    fetchedPages++;
    lastLimit = (data.limit as number | undefined) ?? resolvedLimit;

    const isLastPage = (data.isLastPage as boolean | undefined) ?? true;
    if (isLastPage) break;

    const nps = data.nextPageStart as number | undefined;
    if (nps === undefined) break;
    nextStart = nps;
  }

  if (aggregated.length > maxItems) {
    aggregated.length = maxItems;
  }

  return {
    values: aggregated,
    start: 0,
    limit: lastLimit,
    isLastPage: true,
    totalFetched: aggregated.length,
    fetchedPages,
  };
}

export async function fetchPage<T>(
  client: AxiosInstance,
  path: string,
  options: PaginationOptions = {}
): Promise<PaginatedResult<T>> {
  const {
    limit,
    start,
    all = false,
    params = {},
    maxItems = DC_ALL_ITEMS_CAP,
  } = options;

  const resolvedLimit = clampLimit(limit);
  const requestParams: Record<string, unknown> = {
    ...params,
    limit: resolvedLimit,
  };
  if (start !== undefined) {
    requestParams.start = start;
  }

  // Single page fetch
  if (!all || start !== undefined) {
    return await fetchSinglePage<T>(client, path, requestParams, resolvedLimit);
  }

  // Fetch all pages
  return await fetchAllPages<T>(client, path, params, resolvedLimit, maxItems);
}
