import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createHttpApp, positiveInt, type HttpApp, type HttpOptions } from "./http.js";

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
    const before = http.sessionCount();
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
    expect(http.sessionCount()).toBe(before + 2);
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

test("does not keep a session when initialize is rejected", async () => {
    const before = http.sessionCount();
    const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "x", version: "0" } } }),
    });
    expect(res.status).toBe(406);
    expect(http.sessionCount()).toBe(before);
});

test("rejects a non-initialize request without a session id", async () => {
    const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(res.status).toBe(400);
});

async function corsResponse(corsOrigin: string, origin: string): Promise<Response> {
    const app = createHttpApp(() => Promise.resolve(new McpServer({ name: "t", version: "0" })), corsOrigin);
    const srv = app.app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => srv.once("listening", () => { resolve(); }));
    try {
        const port = String((srv.address() as AddressInfo).port);
        return await fetch(`http://127.0.0.1:${port}/health`, { headers: { origin } });
    } finally {
        await app.close();
        srv.close();
    }
}

test("wildcard CORS origin does not allow credentials", async () => {
    const res = await corsResponse("*", "https://a.example");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-credentials")).toBeNull();
});

test("listed CORS origin is echoed with credentials; unlisted gets no ACAO", async () => {
    const ok = await corsResponse("https://a.example, https://b.example", "https://b.example");
    expect(ok.headers.get("access-control-allow-origin")).toBe("https://b.example");
    expect(ok.headers.get("access-control-allow-credentials")).toBe("true");
    const no = await corsResponse("https://a.example", "https://evil.example");
    expect(no.headers.get("access-control-allow-origin")).toBeNull();
});

interface Local { http: HttpApp; url: URL; stop: () => Promise<void>; }

async function localApp(options: HttpOptions): Promise<Local> {
    const http = createHttpApp(() => {
        const server = new McpServer({ name: "t", version: "0" });
        server.registerTool("ping", { description: "ping" }, () => ({ content: [{ type: "text", text: "pong" }] }));
        return Promise.resolve(server);
    }, "*", options);
    const srv = http.app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => srv.once("listening", () => { resolve(); }));
    const u = new URL(`http://127.0.0.1:${String((srv.address() as AddressInfo).port)}/mcp`);
    return { http, url: u, stop: async () => { await http.close(); srv.close(); } };
}

async function connectTo(u: URL): Promise<{ client: Client; transport: StreamableHTTPClientTransport }> {
    const client = new Client({ name: "c", version: "0" });
    const transport = new StreamableHTTPClientTransport(u);
    await client.connect(transport);
    return { client, transport };
}

function listTools(u: URL, sessionId: string): Promise<Response> {
    return fetch(u, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-session-id": sessionId },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
}

function initialize(u: URL): Promise<Response> {
    return fetch(u, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "x", version: "0" } } }),
    });
}

async function rawSession(u: URL): Promise<string> {
    const res = await initialize(u);
    expect(res.status).toBe(200);
    await res.text();
    return res.headers.get("mcp-session-id") as string;
}

test("sweep closes a session idle past the TTL and keeps a recently used one", async () => {
    let t = 1_000;
    const app = await localApp({ idleTtlMs: 100, now: () => t });
    try {
        const idle = await rawSession(app.url);
        t += 80;
        const active = await rawSession(app.url);
        t += 50; // idle: 130 old, active: 50 old
        await app.http.sweep();
        expect(app.http.sessionCount()).toBe(1);
        expect((await listTools(app.url, idle)).status).toBe(404);
        expect((await listTools(app.url, active)).status).toBe(200);
    } finally {
        await app.stop();
    }
});

test("an open SSE stream does not keep an idle session alive", async () => {
    let t = 1_000;
    const app = await localApp({ idleTtlMs: 100, now: () => t });
    try {
        // The SDK client holds a GET SSE stream open after initialize and never sends DELETE here.
        const { client } = await connectTo(app.url);
        await Bun.sleep(100);
        t += 1_000;
        await app.http.sweep();
        expect(app.http.sessionCount()).toBe(0);
        await client.close();
    } finally {
        await app.stop();
    }
});

test("answers 503 when the session cap is reached and recovers after DELETE", async () => {
    const app = await localApp({ maxSessions: 1 });
    try {
        const first = await connectTo(app.url);
        const full = await initialize(app.url);
        expect(full.status).toBe(503);
        expect(full.headers.get("retry-after")).not.toBeNull();
        await first.transport.terminateSession();
        await first.client.close();
        const second = await connectTo(app.url);
        expect(second.transport.sessionId).toBeDefined();
        await second.transport.terminateSession();
        await second.client.close();
    } finally {
        await app.stop();
    }
});

test("a rejected initialize does not leak a slot under the cap", async () => {
    const app = await localApp({ maxSessions: 1 });
    try {
        const bad = await fetch(app.url, {
            method: "POST",
            headers: { "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "x", version: "0" } } }),
        });
        expect(bad.status).toBe(406);
        const ok = await connectTo(app.url);
        expect(ok.transport.sessionId).toBeDefined();
        await ok.transport.terminateSession();
        await ok.client.close();
    } finally {
        await app.stop();
    }
});

test("positiveInt falls back on unset, non-numeric and non-positive values", () => {
    expect(positiveInt(undefined, 5)).toBe(5);
    expect(positiveInt("abc", 5)).toBe(5);
    expect(positiveInt("0", 5)).toBe(5);
    expect(positiveInt("-3", 5)).toBe(5);
    expect(positiveInt("7", 5)).toBe(7);
});
