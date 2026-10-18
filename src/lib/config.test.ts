import { expect, test } from "bun:test";
import { normalizeBaseUrl, serverRootUrl } from "./config.js";

test("appends /rest/api/1.0 to a bare host", () => {
    expect(normalizeBaseUrl("https://host")).toBe("https://host/rest/api/1.0");
    expect(normalizeBaseUrl("https://host/")).toBe("https://host/rest/api/1.0");
});

test("keeps a reverse-proxy context path", () => {
    expect(normalizeBaseUrl("https://host/bitbucket")).toBe("https://host/bitbucket/rest/api/1.0");
    expect(normalizeBaseUrl("https://host/bitbucket/")).toBe("https://host/bitbucket/rest/api/1.0");
    expect(normalizeBaseUrl("https://host/a/b")).toBe("https://host/a/b/rest/api/1.0");
});

test("keeps an explicit REST API path, with or without context path", () => {
    expect(normalizeBaseUrl("https://host/rest/api/1.0")).toBe("https://host/rest/api/1.0");
    expect(normalizeBaseUrl("https://host/bitbucket/rest/api/latest/")).toBe("https://host/bitbucket/rest/api/latest");
});

test("drops a partial /rest path but keeps the context path", () => {
    expect(normalizeBaseUrl("https://host/bitbucket/rest")).toBe("https://host/bitbucket/rest/api/1.0");
    expect(normalizeBaseUrl("https://host/bitbucket/rest/api")).toBe("https://host/bitbucket/rest/api/1.0");
});

test("does not treat a context path that merely starts with 'rest' as /rest", () => {
    expect(normalizeBaseUrl("https://host/restricted")).toBe("https://host/restricted/rest/api/1.0");
});

test("serverRootUrl keeps the context path and drops /rest/...", () => {
    expect(serverRootUrl("https://host/rest/api/1.0")).toBe("https://host");
    expect(serverRootUrl("https://host/bitbucket/rest/api/1.0")).toBe("https://host/bitbucket");
    expect(serverRootUrl("https://host:8443/bitbucket/rest/api/latest")).toBe("https://host:8443/bitbucket");
});
