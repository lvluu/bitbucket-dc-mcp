import { describe, it, expect } from "vitest";
import axios, { AxiosError } from "axios";
import { formatError, jsonResult, textResult } from "../../src/lib/errors.js";

describe("errors", () => {
  describe("formatError", () => {
    it("should format a plain Error", () => {
      const result = formatError(new Error("something broke"));
      expect(result).toBe("something broke");
    });

    it("should format an Axios error with status and message", () => {
      const error = new AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, undefined, {
        status: 404,
        statusText: "Not Found",
        headers: {},
        config: { headers: {} } as any,
        data: { message: "Project not found" },
      });

      const result = formatError(error);

      expect(result).toContain("Bitbucket API error");
      expect(result).toContain("404");
      expect(result).toContain("Project not found");
    });

    it("should format an Axios error with errors array", () => {
      const error = new AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, undefined, {
        status: 400,
        statusText: "Bad Request",
        headers: {},
        config: { headers: {} } as any,
        data: { errors: [{ message: "field required" }] },
      });

      const result = formatError(error);

      expect(result).toContain("Bitbucket API error");
      expect(result).toContain("400");
    });

    it("should format a string error", () => {
      const result = formatError("raw string error");
      expect(result).toBe("raw string error");
    });

    it("should format an Axios error without response", () => {
      const error = new AxiosError("Network Error");

      const result = formatError(error);

      expect(result).toContain("Bitbucket API error");
      expect(result).toContain("Network Error");
    });
  });

  describe("jsonResult", () => {
    it("should wrap data as JSON text content", () => {
      const result = jsonResult({ foo: "bar" });

      expect(result.content).toHaveLength(1);
      expect(result.content[0]!.type).toBe("text");
      expect(JSON.parse(result.content[0]!.text)).toEqual({ foo: "bar" });
    });

    it("should handle arrays", () => {
      const result = jsonResult([1, 2, 3]);

      expect(JSON.parse(result.content[0]!.text)).toEqual([1, 2, 3]);
    });

    it("should handle null", () => {
      const result = jsonResult(null);

      expect(result.content[0]!.text).toBe("null");
    });
  });

  describe("textResult", () => {
    it("should wrap text as content", () => {
      const result = textResult("hello");

      expect(result.content).toHaveLength(1);
      expect(result.content[0]!.type).toBe("text");
      expect(result.content[0]!.text).toBe("hello");
    });
  });
});
