import { vi } from "vitest";

/**
 * Creates a mock Axios client with vi.fn() stubs for get/post/put/delete.
 * Use mockResolvedValueOnce on the individual methods to set up responses.
 */
export function createMockAxiosClient() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
  };
}

/**
 * Wraps data in an Axios-like response shape.
 */
export function axiosResponse(data: unknown) {
  return { data, status: 200, statusText: "OK", headers: {}, config: {} };
}

/**
 * Wraps values in a Bitbucket DC paginated response shape.
 */
export function paginatedResponse(
  values: unknown[],
  opts: { isLastPage?: boolean; nextPageStart?: number; start?: number; limit?: number } = {}
) {
  return axiosResponse({
    values,
    start: opts.start ?? 0,
    limit: opts.limit ?? 25,
    isLastPage: opts.isLastPage ?? true,
    nextPageStart: opts.nextPageStart,
  });
}
