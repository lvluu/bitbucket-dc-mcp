import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getClient, initClient } from "#lib/client.js";
import type { ToolResult } from "#lib/errors.js";
import filesModule from "./files.js";

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
    const fn = mock(() => Promise.resolve({ data: {} }));
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
