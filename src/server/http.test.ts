import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createHttpApp, type HttpApp } from "./http.js";

let http: HttpApp;
let listener: Server;
let url: URL;

beforeAll(async () => {
    http = createHttpApp(() => {
        const server = new McpServer({ name: "test", version: "0.0.0" });
        server.registerTool("ping", { description: "ping" }, () => ({ content: [{ type: "text", text: "pong" }] }));
        return Promise.resolve(server);
    }, "*");
    listener = http.app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => listener.once("listening", () => { resolve(); }));
    url = new URL(`http://127.0.0.1:${String((listener.address() as AddressInfo).port)}/mcp`);
});

afterAll(async () => {
    await http.close();
    listener.close();
});

async function connect(): Promise<{ client: Client; transport: StreamableHTTPClientTransport }> {
    const client = new Client({ name: "test-client", version: "0.0.0" });
    const transport = new StreamableHTTPClientTransport(url);
    await client.connect(transport);
    return { client, transport };
}

test("serves several clients, each with its own session", async () => {
    const a = await connect();
    const b = await connect();
    expect(a.transport.sessionId).toBeDefined();
    expect(b.transport.sessionId).toBeDefined();
    expect(a.transport.sessionId).not.toBe(b.transport.sessionId);
    const [ra, rb] = await Promise.all([
        a.client.callTool({ name: "ping", arguments: {} }),
        b.client.callTool({ name: "ping", arguments: {} }),
    ]);
    expect(ra.content).toEqual([{ type: "text", text: "pong" }]);
    expect(rb.content).toEqual([{ type: "text", text: "pong" }]);
    expect(http.sessionCount()).toBeGreaterThanOrEqual(2);
    await a.transport.terminateSession();
    await a.client.close();
    await b.transport.terminateSession();
    await b.client.close();
});

test("drops a session on DELETE and rejects its id afterwards", async () => {
    const before = http.sessionCount();
    const { client, transport } = await connect();
    const sessionId = transport.sessionId as string;
    expect(http.sessionCount()).toBe(before + 1);
    await transport.terminateSession();
    expect(http.sessionCount()).toBe(before);
    await client.close();
    const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-session-id": sessionId },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(res.status).toBe(404);
});

test("rejects a non-initialize request without a session id", async () => {
    const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(res.status).toBe(400);
});
