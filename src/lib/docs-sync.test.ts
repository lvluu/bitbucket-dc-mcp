import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Same relative layout from src/lib and build/lib.
const root = join(import.meta.dir, "../..");
const toolsDir = join(import.meta.dir, "../tools");

const registered = readdirSync(toolsDir)
    .filter((f) => /\.(ts|js)$/.test(f) && !f.includes(".test."))
    .flatMap((f) => [...readFileSync(join(toolsDir, f), "utf8").matchAll(/registerTool\("(\w+)"/g)].map((m) => m[1]));

describe("docs stay in sync with registered tools", () => {
    test("docs/tools.md names every tool", () => {
        const doc = readFileSync(join(root, "docs/tools.md"), "utf8");
        expect(registered.filter((name) => !doc.includes(`\`${name}\``))).toEqual([]);
    });

    test("README and docs/tools.md state the tool count", () => {
        const count = `${registered.length} tools`;
        expect(readFileSync(join(root, "README.md"), "utf8")).toContain(count);
        expect(readFileSync(join(root, "docs/tools.md"), "utf8")).toContain(count);
    });
});
