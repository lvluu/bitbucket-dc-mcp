import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getClient, initClient } from "#lib/client.js";
import type { ToolResult } from "#lib/errors.js";
import filesModule, { decodeText } from "./files.js";

type Handler = (args: Record<string, unknown>) => ToolResult | Promise<ToolResult>;
const handlers = new Map<string, Handler>();

beforeAll(() => {
    initClient({ baseUrl: "http://bitbucket.invalid/rest/api/latest", token: "t", username: undefined, password: undefined, defaultProject: undefined, enableDangerous: false, timeoutMs: 30_000 });
    const fakeServer = {
        registerTool: (name: string, _config: unknown, handler: Handler) => handlers.set(name, handler),
    } as unknown as McpServer;
    filesModule.register(fakeServer);
});

const client = () => getClient() as unknown as Record<string, unknown>;
const originals: Record<string, unknown> = {};
const stub = (method: "get" | "put") => {
    originals[method] = client()[method];
    const fn = mock(() => Promise.resolve({ data: new ArrayBuffer(0), headers: {} }));
    client()[method] = fn;
    return fn;
};
afterEach(() => {
    for (const [method, fn] of Object.entries(originals)) client()[method] = fn;
});
const run = (name: string, args: Record<string, unknown>) => {
    const handler = handlers.get(name);
    if (handler === undefined) throw new Error(`${name} not registered`);
    return handler(args);
};
const base = { projectKey: "PROJ", repoSlug: "repo" };

describe("files tools URL building", () => {
    test("browseFiles with empty path hits /browse", async () => {
        const get = stub("get");
        await run("browseFiles", { ...base, path: "" });
        expect((get.mock.calls[0] as unknown[])[0]).toBe("/projects/PROJ/repos/repo/browse");
    });
    test("getFileContent encodes space, #, ? and %", async () => {
        const get = stub("get");
        await run("getFileContent", { ...base, path: "dir/a b#c?d%e.txt" });
        expect((get.mock.calls[0] as unknown[])[0]).toBe("/projects/PROJ/repos/repo/raw/dir/a%20b%23c%3Fd%25e.txt");
    });
    test("editFile encodes the path", async () => {
        const put = stub("put");
        await run("editFile", { ...base, path: "a b#1.md", content: "x", message: "m", branch: "main" });
        expect((put.mock.calls[0] as unknown[])[0]).toBe("/projects/PROJ/repos/repo/browse/a%20b%231.md");
    });
    test("encodes project key and repo slug", async () => {
        const get = stub("get");
        await run("browseFiles", { projectKey: "~user", repoSlug: "re/po?", path: "" });
        expect((get.mock.calls[0] as unknown[])[0]).toBe("/projects/~user/repos/re%2Fpo%3F/browse");
    });
    for (const name of ["browseFiles", "getFileContent", "editFile"]) {
        test(`${name} rejects .. segments with a one-line error and no request`, async () => {
            const get = stub("get");
            const put = stub("put");
            const result = await run(name, { ...base, path: "../../../../x", content: "x", message: "m", branch: "main" });
            expect(result.isError).toBe(true);
            expect(result.content[0]?.text).toContain("not allowed");
            expect(result.content[0]?.text).not.toContain("\n");
            expect(get).not.toHaveBeenCalled();
            expect(put).not.toHaveBeenCalled();
        });
    }
});

describe("getFileContent binary detection (#53)", () => {
    test("a PNG returns a one-line note, not its bytes", async () => {
        const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
        originals.get = client().get;
        client().get = mock(() => Promise.resolve({ data: png.buffer, headers: { "content-type": "image/png" } }));
        const result = await run("getFileContent", { ...base, path: "logo.png" });
        expect(result.content[0]?.text).toBe("binary file, 12 bytes, image/png");
    });
    test("UTF-8 text with non-ASCII comes back unchanged", () => {
        const text = "Grüße, 日本語 ✓\nline 2\n";
        expect(decodeText(new TextEncoder().encode(text), "text/plain")).toBe(text);
    });
    test("invalid UTF-8 without NUL is binary too", () => {
        expect(decodeText(new Uint8Array([0xff, 0xfe, 0x41]), "application/octet-stream")).toBe("binary file, 3 bytes, application/octet-stream");
    });
});
