import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { getClient, initClient } from "#lib/client.js";
import { resetReviewState } from "#lib/review-state.js";
import { createHttpApp } from "#server/http.js";
import prCommentsModule from "./pr-comments.js";
import prReviewModule from "./pr-review.js";

const PR = { projectKey: "PROJ", repoSlug: "repo", prId: 7 };

beforeAll(() => {
    initClient({ baseUrl: "http://bitbucket.invalid/rest/api/latest", token: "t", username: undefined, password: undefined, defaultProject: undefined, enableDangerous: false, timeoutMs: 30_000 });
    originalPost = (getClient() as unknown as Record<string, unknown>).post;
});

interface Peer {
    client: Client;
    server: McpServer;
}
const peers: Peer[] = [];

/** One real McpServer + client pair, like one MCP session, with the real tool modules registered. */
async function connectPeer(): Promise<Peer> {
    const server = new McpServer({ name: "t", version: "0" });
    prReviewModule.register(server);
    prCommentsModule.register(server);
    const client = new Client({ name: "c", version: "0" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);
    const peer = { client, server };
    peers.push(peer);
    return peer;
}

let originalPost: unknown;
afterEach(async () => {
    (getClient() as unknown as Record<string, unknown>).post = originalPost;
    await Promise.all(peers.splice(0).map((p) => p.client.close()));
    resetReviewState();
});

function stubPost() {
    const post = mock(() => Promise.resolve({ data: { id: 1 } }));
    (getClient() as unknown as Record<string, unknown>).post = post;
    return post;
}
const call = (peer: Peer, name: string, args: Record<string, unknown> = {}) =>
    peer.client.callTool({ name, arguments: { ...PR, ...args } });
const firstText = (result: Awaited<ReturnType<typeof call>>) => (result.content as { text: string }[])[0]?.text ?? "";

describe("review sessions across MCP sessions", () => {
    test("the owner's comments are buffered, another session's comment is posted immediately", async () => {
        const post = stubPost();
        const owner = await connectPeer();
        const other = await connectPeer();
        await call(owner, "startReview");

        const buffered = await call(owner, "addPRComment", { text: "mine" });
        expect(JSON.parse(firstText(buffered))).toMatchObject({ state: "PENDING" });
        expect(post).not.toHaveBeenCalled();

        const posted = await call(other, "addPRComment", { text: "theirs" });
        expect(JSON.parse(firstText(posted))).toEqual({ id: 1 });
        expect(post).toHaveBeenCalledTimes(1);

        expect(JSON.parse(firstText(await call(owner, "listPendingReviewComments")))).toHaveLength(1);
        expect((await call(other, "listPendingReviewComments")).isError).toBe(true);
        expect((await call(other, "discardReview")).isError).toBe(true);
    });

    test("startReview from another session is refused while the owner is connected", async () => {
        const owner = await connectPeer();
        const other = await connectPeer();
        await call(owner, "startReview");
        const refused = await call(other, "startReview");
        expect(refused.isError).toBe(true);
        expect(firstText(refused)).toContain("another MCP session");
    });

    test("closing the owning session frees the PR for a new review", async () => {
        const owner = await connectPeer();
        const other = await connectPeer();
        await call(owner, "startReview");
        await owner.client.close();
        await owner.server.close();
        expect((await call(other, "startReview")).isError).toBeFalsy();
    });

    test("a vanished HTTP client's review is released by the idle session sweep", async () => {
        let t = 0;
        const http = createHttpApp(() => {
            const server = new McpServer({ name: "t", version: "0" });
            prReviewModule.register(server);
            prCommentsModule.register(server);
            return Promise.resolve(server);
        }, "*", { idleTtlMs: 100, now: () => t });
        const listener = http.app.listen(0, "127.0.0.1");
        await new Promise<void>((resolve) => listener.once("listening", () => { resolve(); }));
        const url = new URL(`http://127.0.0.1:${String((listener.address() as AddressInfo).port)}/mcp`);
        const connect = async (): Promise<Peer> => {
            const client = new Client({ name: "c", version: "0" });
            await client.connect(new StreamableHTTPClientTransport(url));
            const peer = { client, server: undefined as unknown as McpServer };
            peers.push(peer);
            return peer;
        };
        try {
            const vanished = await connect();
            await call(vanished, "startReview");
            t += 1000;
            await http.sweep();
            expect(http.sessionCount()).toBe(0);
            const fresh = await connect();
            expect((await call(fresh, "startReview")).isError).toBeFalsy();
        } finally {
            await Promise.all(peers.splice(0).map((p) => p.client.close()));
            await http.close();
            listener.close();
        }
    });
});
