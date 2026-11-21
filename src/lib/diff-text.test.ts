import { describe, expect, test } from "bun:test";
import { diffToText } from "./diff-text.js";
import { serialize } from "./squeeze.js";

// Shape of GET .../pull-requests/{id}/diff and .../commits/{id}/diff on Bitbucket DC.
const path = (p: string) => ({ components: p.split("/"), parent: p.split("/").slice(0, -1).join("/"), name: p.split("/").at(-1), extension: "ts", toString: p });
const line = (n: number, text: string) => ({ source: n, destination: n, line: text, truncated: false });
const dcDiff = {
    fromHash: "a".repeat(40), toHash: "b".repeat(40), contextLines: 3, whitespace: "SHOW",
    diffs: [
        {
            source: path("src/a.ts"), destination: path("src/a.ts"), truncated: false,
            hunks: [{
                context: "function f()", sourceLine: 1, sourceSpan: 3, destinationLine: 1, destinationSpan: 3, truncated: false,
                segments: [
                    { type: "CONTEXT", lines: [line(1, "const a = 1;")], truncated: false },
                    { type: "REMOVED", lines: [line(2, "const b = 2;")], truncated: false },
                    { type: "ADDED", lines: [line(2, "const b = 3;")], truncated: false },
                    { type: "CONTEXT", lines: [line(3, "export { a, b };")], truncated: false },
                ],
            }],
        },
        { source: null, destination: path("img/logo.png"), binary: true, hunks: [] },
    ],
    truncated: false,
};

describe("diffToText", () => {
    test("renders files, hunks and +/-/space lines as a unified diff", () => {
        expect(diffToText(dcDiff)).toBe([
            "--- a/src/a.ts",
            "+++ b/src/a.ts",
            "@@ -1,3 +1,3 @@",
            " const a = 1;",
            "-const b = 2;",
            "+const b = 3;",
            " export { a, b };",
            "--- /dev/null",
            "+++ b/img/logo.png",
            "Binary file",
        ].join("\n"));
    });
    test("notes truncation and empty diffs", () => {
        expect(diffToText({ diffs: [], truncated: false })).toBe("No changes.");
        expect(diffToText({ ...dcDiff, truncated: true }).endsWith("[diff truncated by Bitbucket]")).toBe(true);
    });
    test("is far smaller than the squeezed JSON it replaces", () => {
        expect(diffToText(dcDiff).length * 3).toBeLessThan(serialize(dcDiff).length);
    });
});
