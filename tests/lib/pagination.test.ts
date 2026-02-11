import { describe, it, expect, vi } from "vitest";
import { fetchPage, DC_DEFAULT_LIMIT, DC_MAX_LIMIT } from "#lib/pagination.js";
import type { AxiosInstance } from "axios";

function mockClient(responses: Array<{ data: Record<string, unknown> }>): AxiosInstance {
  let callIndex = 0;
  return {
    get: vi.fn(async () => {
      const resp = responses[callIndex];
      callIndex++;
      return resp;
    }),
  } as unknown as AxiosInstance;
}

describe("pagination", () => {
  describe("fetchPage - single page", () => {
    it("should fetch a single page with defaults", async () => {
      const client = mockClient([{
        data: {
          values: [{ id: 1 }, { id: 2 }],
          start: 0,
          limit: 25,
          isLastPage: true,
        },
      }]);

      const result = await fetchPage(client, "/projects");

      expect(result.values).toEqual([{ id: 1 }, { id: 2 }]);
      expect(result.totalFetched).toBe(2);
      expect(result.fetchedPages).toBe(1);
      expect(result.isLastPage).toBe(true);
      expect(client.get).toHaveBeenCalledWith("/projects", {
        params: { limit: DC_DEFAULT_LIMIT },
      });
    });

    it("should pass custom limit and start", async () => {
      const client = mockClient([{
        data: { values: [{ id: 1 }], start: 10, limit: 5, isLastPage: false, nextPageStart: 15 },
      }]);

      const result = await fetchPage(client, "/items", { limit: 5, start: 10 });

      expect(result.values).toEqual([{ id: 1 }]);
      expect(result.isLastPage).toBe(false);
      expect(result.nextPageStart).toBe(15);
      expect(client.get).toHaveBeenCalledWith("/items", {
        params: { limit: 5, start: 10 },
      });
    });

    it("should clamp limit to DC_MAX_LIMIT", async () => {
      const client = mockClient([{
        data: { values: [], isLastPage: true },
      }]);

      await fetchPage(client, "/items", { limit: 500 });

      expect(client.get).toHaveBeenCalledWith("/items", {
        params: { limit: DC_MAX_LIMIT },
      });
    });

    it("should default limit when given non-finite value", async () => {
      const client = mockClient([{
        data: { values: [], isLastPage: true },
      }]);

      await fetchPage(client, "/items", { limit: NaN });

      expect(client.get).toHaveBeenCalledWith("/items", {
        params: { limit: DC_DEFAULT_LIMIT },
      });
    });

    it("should pass extra params", async () => {
      const client = mockClient([{
        data: { values: [], isLastPage: true },
      }]);

      await fetchPage(client, "/items", { params: { name: "test" } });

      expect(client.get).toHaveBeenCalledWith("/items", {
        params: { limit: DC_DEFAULT_LIMIT, name: "test" },
      });
    });
  });

  describe("fetchPage - all pages", () => {
    it("should fetch multiple pages when all=true", async () => {
      const client = mockClient([
        { data: { values: [{ id: 1 }], isLastPage: false, nextPageStart: 25, limit: 25 } },
        { data: { values: [{ id: 2 }], isLastPage: true, limit: 25 } },
      ]);

      const result = await fetchPage(client, "/items", { all: true });

      expect(result.values).toEqual([{ id: 1 }, { id: 2 }]);
      expect(result.totalFetched).toBe(2);
      expect(result.fetchedPages).toBe(2);
      expect(result.isLastPage).toBe(true);
    });

    it("should stop when maxItems is reached", async () => {
      const client = mockClient([
        { data: { values: [{ id: 1 }, { id: 2 }, { id: 3 }], isLastPage: false, nextPageStart: 25, limit: 25 } },
      ]);

      const result = await fetchPage(client, "/items", { all: true, maxItems: 2 });

      expect(result.values).toHaveLength(2);
      expect(result.values).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it("should not use all-pages mode when start is provided", async () => {
      const client = mockClient([{
        data: { values: [{ id: 5 }], isLastPage: false, nextPageStart: 30, limit: 25 },
      }]);

      // all=true + start=25 → single page (per implementation)
      const result = await fetchPage(client, "/items", { all: true, start: 25 });

      expect(result.fetchedPages).toBe(1);
      expect(client.get).toHaveBeenCalledTimes(1);
    });

    it("should handle missing nextPageStart gracefully", async () => {
      const client = mockClient([
        { data: { values: [{ id: 1 }], isLastPage: false, limit: 25 } },
      ]);

      const result = await fetchPage(client, "/items", { all: true });

      expect(result.fetchedPages).toBe(1);
      expect(result.values).toEqual([{ id: 1 }]);
    });
  });
});
