import { describe, expect, test } from "bun:test";
import { resolveTransport } from "./boot.js";

describe("resolveTransport", () => {
    test("unset env and piped stdin (spawned by an MCP client) gives stdio", () => {
        expect(resolveTransport(undefined, undefined)).toBe("stdio");
        expect(resolveTransport("", false)).toBe("stdio");
    });
    test("unset env and a terminal gives http", () => {
        expect(resolveTransport(undefined, true)).toBe("http");
    });
    test("an explicit value always wins", () => {
        expect(resolveTransport("http", undefined)).toBe("http");
        expect(resolveTransport("stdio", true)).toBe("stdio");
    });
});
