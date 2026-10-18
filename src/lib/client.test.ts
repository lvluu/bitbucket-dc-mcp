import { describe, expect, test } from "bun:test";
import { commitDiffPath, encodePath, getClient, initClient } from "./client.js";

describe("encodePath", () => {
    test("keeps slashes between segments and encodes each segment", () => {
        expect(encodePath("src/my file#1.ts")).toBe("src/my%20file%231.ts");
    });
    test("drops leading, trailing and duplicate slashes", () => {
        expect(encodePath("/src//index.ts/")).toBe("src/index.ts");
    });
    test("rejects . and .. segments so the request cannot leave the diff resource", () => {
        expect(() => encodePath("src/../../rest/api")).toThrow("not allowed");
        expect(() => encodePath("./src")).toThrow("not allowed");
    });
});

describe("commitDiffPath", () => {
    test("returns the whole-commit diff path when no file path is given", () => {
        expect(commitDiffPath("PROJ", "repo", "abc123")).toBe("/projects/PROJ/repos/repo/commits/abc123/diff");
    });
    test("treats an empty file path like no path", () => {
        expect(commitDiffPath("PROJ", "repo", "abc123", "")).toBe("/projects/PROJ/repos/repo/commits/abc123/diff");
    });
    test("appends the encoded {path} segment for a single file", () => {
        expect(commitDiffPath("PROJ", "repo", "abc123", "src/my file.ts")).toBe("/projects/PROJ/repos/repo/commits/abc123/diff/src/my%20file.ts");
    });
});

describe("initClient timeout", () => {
    test("applies the configured timeout to the axios instance", () => {
        initClient({ baseUrl: "http://bitbucket.invalid/rest/api/1.0", token: "t", username: undefined, password: undefined, defaultProject: undefined, enableDangerous: false, timeoutMs: 1234 });
        expect(getClient().defaults.timeout).toBe(1234);
    });
});
