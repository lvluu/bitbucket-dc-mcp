import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { getClient, initClient } from "#lib/client.js";
import { resetReviewState } from "#lib/review-state.js";
import prCommentsModule from "./pr-comments.js";
import prReviewModule from "./pr-review.js";

const PR = { projectKey: "PROJ", repoSlug: "repo", prId: 7 };

beforeAll(() => {
    initClient({ baseUrl: "http://bitbucket.invalid/rest/api/latest", token: "t", username: undefined, password: undefined, defaultProject: undefined, enableDangerous: false, timeoutMs: 30_000 });
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

const originalPost = (getClient() as unknown as Record<string, unknown>).post;
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

    test("an idle review expires after the TTL", async () => {
        let t = 0;
        resetReviewState({ ttlMs: 1000, now: () => t });
        const post = stubPost();
        const owner = await connectPeer();
        const other = await connectPeer();
        await call(owner, "startReview");
        t += 1001;
        expect((await call(other, "startReview")).isError).toBeFalsy();
        await call(owner, "addPRComment", { text: "late" });
        expect(post).toHaveBeenCalledTimes(1);
    });
});
