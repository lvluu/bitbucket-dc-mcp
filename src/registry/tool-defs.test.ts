import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { autoRegisterModules } from "./auto-loader.js";

// tools/list is sent on every session start, so its size is a per-session token cost (#61).
// Budget: 46,155 bytes before #61, minus 25 %. Raise it only with a reason in the PR.
const TOOLS_LIST_BUDGET = 34_700;
const MAX_DESCRIPTION = 200;

const client = new Client({ name: "tool-defs", version: "1" });
let tools: { name: string; description?: string }[] = [];

beforeAll(async () => {
    const server = new McpServer({ name: "t", version: "1" });
    await autoRegisterModules(server);
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(a);
    await client.connect(b);
    tools = (await client.listTools()).tools;
});
afterAll(() => client.close());

describe("tool definitions stay small", () => {
    test(`every tool description is at most ${String(MAX_DESCRIPTION)} chars (details go in skills/bitbucket-dc/SKILL.md)`, () => {
        expect(tools.filter((t) => (t.description ?? "").length > MAX_DESCRIPTION).map((t) => t.name)).toEqual([]);
    });
    test(`tools/list JSON stays under ${String(TOOLS_LIST_BUDGET)} bytes`, () => {
        expect(tools.length).toBeGreaterThan(60);
        expect(JSON.stringify({ tools }).length).toBeLessThanOrEqual(TOOLS_LIST_BUDGET);
    });
});
