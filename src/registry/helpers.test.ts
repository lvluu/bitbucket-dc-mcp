import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { findModuleFiles, getModuleName, getRootDir } from "./helpers.js";

function makeTree(files: string[]): string {
    const root = mkdtempSync(path.join(tmpdir(), "registry-"));
    for (const file of files) {
        mkdirSync(path.join(root, path.dirname(file)), { recursive: true });
        writeFileSync(path.join(root, file), "");
    }
    return root;
}

describe("getModuleName", () => {
    test("strips .js and .ts extensions", () => {
        expect(getModuleName("/x/tools/branches.js")).toBe("branches");
        expect(getModuleName("/x/tools/branches.ts")).toBe("branches");
    });
});

describe("findModuleFiles", () => {
    test("finds .ts sources so bun run dev registers tools", async () => {
        const root = makeTree(["tools/a.ts", "resources/b.ts", "prompts/c.ts"]);
        const names = (await findModuleFiles(root)).map(f => path.relative(root, f)).sort();
        expect(names).toEqual(["prompts/c.ts", "resources/b.ts", "tools/a.ts"]);
    });

    test("finds built .js output", async () => {
        const root = makeTree(["tools/a.js", "tools/a.js.map"]);
        const names = (await findModuleFiles(root)).map(f => path.relative(root, f));
        expect(names).toEqual(["tools/a.js"]);
    });

    test("skips tests and declaration files", async () => {
        const root = makeTree(["tools/a.ts", "tools/a.test.ts", "tools/a.test.js", "tools/a.d.ts"]);
        const names = (await findModuleFiles(root)).map(f => path.relative(root, f));
        expect(names).toEqual(["tools/a.ts"]);
    });

    test("discovers every tool module under src", async () => {
        const srcRoot = getRootDir(import.meta.url);
        const files = await findModuleFiles(srcRoot);
        expect(files.length).toBeGreaterThan(0);
        expect(files.every(f => f.endsWith(".ts") && !f.endsWith(".test.ts"))).toBe(true);
    });
});
