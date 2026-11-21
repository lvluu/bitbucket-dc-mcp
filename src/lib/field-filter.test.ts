import { describe, expect, it } from "bun:test";
import {
    summarizeActivity,
    summarizeArray,
    summarizeBranch,
    summarizeComment,
    summarizeChange,
    summarizeCommit,
    summarizeProject,
    summarizePullRequest,
    summarizeRepository,
} from "./field-filter.js";

describe("field-filter summarizers", () => {
    describe("summarizePullRequest", () => {
        it("extracts essential fields and nested objects (author, reviewers, sourceBranch, targetBranch)", () => {
            const fullPr = {
                id: 101,
                title: "Feature PR",
                state: "OPEN",
                draft: false,
                createdDate: 1600000000000,
                updatedDate: 1600000005000,
                description: "Full description that should be dropped",
                version: 1,
                closed: false,
                author: {
                    user: {
                        name: "john_doe",
                        displayName: "John Doe",
                        emailAddress: "john@example.com",
                        avatarUrl: "https://avatar.example.com",
                    },
                    role: "AUTHOR",
                    approved: false,
                },
                fromRef: {
                    id: "refs/heads/feature-branch",
                    displayId: "feature-branch",
                    latestCommit: "abcdef123456",
                    repository: { slug: "repo-slug" },
                },
                toRef: {
                    id: "refs/heads/main",
                    displayId: "main",
                    latestCommit: "123456abcdef",
                    repository: { slug: "repo-slug" },
                },
                reviewers: [
                    {
                        user: {
                            name: "jane_reviewer",
                            displayName: "Jane Reviewer",
                            emailAddress: "jane@example.com",
                        },
                        role: "REVIEWER",
                        approved: true,
                        status: "APPROVED",
                        lastReviewedCommit: "abcdef123456",
                    },
                ],
                links: { self: [{ href: "http://example.com" }] },
            };

            const summary = summarizePullRequest(fullPr);

            expect(summary).toEqual({
                id: 101,
                title: "Feature PR",
                state: "OPEN",
                draft: false,
                createdDate: 1600000000000,
                updatedDate: 1600000005000,
                author: {
                    name: "john_doe",
                    displayName: "John Doe",
                },
                sourceBranch: {
                    id: "refs/heads/feature-branch",
                    displayId: "feature-branch",
                },
                targetBranch: {
                    id: "refs/heads/main",
                    displayId: "main",
                },
                reviewers: [
                    {
                        name: "jane_reviewer",
                        displayName: "Jane Reviewer",
                        approved: true,
                        status: "APPROVED",
                    },
                ],
            });

            expect(summary.description).toBeUndefined();
            expect(summary.version).toBeUndefined();
            expect(summary.closed).toBeUndefined();
            expect(summary.links).toBeUndefined();
        });

        it("handles missing nested fields gracefully", () => {
            const minimalPr = {
                id: 102,
                title: "Minimal PR",
            };

            const summary = summarizePullRequest(minimalPr);

            expect(summary).toEqual({
                id: 102,
                title: "Minimal PR",
                state: undefined,
                draft: undefined,
                createdDate: undefined,
                updatedDate: undefined,
                author: undefined,
                sourceBranch: undefined,
                targetBranch: undefined,
                reviewers: undefined,
            });
        });
    });

    describe("summarizeRepository", () => {
        it("extracts essential fields and drops unsummarized fields", () => {
            const fullRepo = {
                slug: "my-repo",
                name: "My Repo",
                description: "A test repository",
                project: {
                    key: "PROJ",
                    name: "Project Name",
                    id: 42,
                    description: "Extra project info",
                },
                public: true,
                forkable: false,
                defaultBranch: {
                    id: "refs/heads/main",
                    displayId: "main",
                },
                scmId: "git",
                hierarchyId: "abc-123",
                links: { self: [] },
            };

            const summary = summarizeRepository(fullRepo);

            expect(summary).toEqual({
                slug: "my-repo",
                name: "My Repo",
                description: "A test repository",
                project: {
                    key: "PROJ",
                    name: "Project Name",
                },
                public: true,
                forkable: false,
                defaultBranch: "main",
                scmId: "git",
            });

            expect(summary.hierarchyId).toBeUndefined();
            expect(summary.links).toBeUndefined();
        });

        it("handles missing project or defaultBranch", () => {
            const minimalRepo = {
                slug: "bare-repo",
                name: "Bare Repo",
            };

            const summary = summarizeRepository(minimalRepo);

            expect(summary).toEqual({
                slug: "bare-repo",
                name: "Bare Repo",
                description: undefined,
                project: undefined,
                public: undefined,
                forkable: undefined,
                defaultBranch: undefined,
                scmId: undefined,
            });
        });
    });

    describe("summarizeBranch", () => {
        it("extracts essential fields and drops extra fields", () => {
            const fullBranch = {
                id: "refs/heads/feature",
                displayId: "feature",
                type: "BRANCH",
                latestCommit: "commit123",
                latestChangeset: "cs123",
                isDefault: true,
                metadata: { ahead: 0, behind: 2 },
            };

            const summary = summarizeBranch(fullBranch);

            expect(summary).toEqual({
                id: "refs/heads/feature",
                displayId: "feature",
                type: "BRANCH",
                latestCommit: "commit123",
                latestChangeset: "cs123",
                isDefault: true,
            });
            expect(summary.metadata).toBeUndefined();
        });
    });

    describe("summarizeCommit", () => {
        it("keeps full id, first message line, author name and date; drops committer equal to author", () => {
            const summary = summarizeCommit({
                id: "commit-hash-full",
                displayId: "commit-hash",
                message: "Subject line\n\nLong body",
                author: { name: "Author Person", emailAddress: "author@example.com", avatarUrl: "http://avatar" },
                authorTimestamp: 1610000000000,
                committer: { name: "Author Person", emailAddress: "author@example.com" },
                committerTimestamp: 1610000005000,
                parents: [{ id: "parent-hash", displayId: "parent" }],
                properties: { jiraKeys: ["KEY-1"] },
            });
            expect(summary).toEqual({
                id: "commit-hash-full",
                message: "Subject line",
                author: "Author Person",
                date: 1610000000000,
                committer: undefined,
                parents: ["parent-hash"],
            });
        });

        it("keeps a committer that differs from the author", () => {
            expect(summarizeCommit({ id: "x", author: { name: "a" }, committer: { name: "b" } }).committer).toBe("b");
        });

        it("handles missing author and committer gracefully", () => {
            expect(summarizeCommit({ id: "commit-hash-full", message: "Initial commit" })).toEqual({
                id: "commit-hash-full",
                message: "Initial commit",
                author: undefined,
                date: undefined,
                committer: undefined,
                parents: undefined,
            });
        });
    });

    describe("summarizeChange", () => {
        it("keeps path and type, srcPath only for moves", () => {
            expect(summarizeChange({ contentId: "c1", fromContentId: "c0", path: { toString: "a.ts", components: ["a.ts"] }, srcPath: { toString: "a.ts" }, type: "MODIFY", properties: { gitChangeType: "MODIFY" } }))
                .toEqual({ path: "a.ts", type: "MODIFY", srcPath: undefined });
            expect(summarizeChange({ path: { toString: "b.ts" }, srcPath: { toString: "a.ts" }, type: "MOVE" }))
                .toEqual({ path: "b.ts", type: "MOVE", srcPath: "a.ts" });
        });
    });

    describe("summarizeProject", () => {
        it("extracts essential fields and drops unsummarized fields", () => {
            const fullProject = {
                key: "MYPROJ",
                name: "My Project",
                description: "Project Description",
                public: false,
                type: "NORMAL",
                id: 1234,
                links: { self: [] },
                avatarUrl: "http://avatar.example.com",
            };

            const summary = summarizeProject(fullProject);

            expect(summary).toEqual({
                key: "MYPROJ",
                name: "My Project",
                description: "Project Description",
                public: false,
                type: "NORMAL",
            });

            expect(summary.id).toBeUndefined();
            expect(summary.links).toBeUndefined();
            expect(summary.avatarUrl).toBeUndefined();
        });
    });

    describe("summarizeArray", () => {
        it("returns undefined for empty array or non-array input", () => {
            const dummySummarizer = (item: { val: number }) => ({ doubled: item.val * 2 });

            expect(summarizeArray([], dummySummarizer)).toBeUndefined();
            expect(summarizeArray(null, dummySummarizer)).toBeUndefined();
            expect(summarizeArray(undefined, dummySummarizer)).toBeUndefined();
            expect(summarizeArray("not an array", dummySummarizer)).toBeUndefined();
            expect(summarizeArray(123, dummySummarizer)).toBeUndefined();
            expect(summarizeArray({}, dummySummarizer)).toBeUndefined();
        });

        it("maps an array of items through the provided summarizer function", () => {
            const items = [{ val: 1 }, { val: 2 }, { val: 3 }];
            const summarizer = (item: { val: number }) => ({ doubled: item.val * 2 });

            const result = summarizeArray(items, summarizer);

            expect(result).toEqual([
                { doubled: 2 },
                { doubled: 4 },
                { doubled: 6 },
            ]);
        });
    });

    describe("summarizeComment", () => {
        it("extracts essential fields and drops noisy ones", () => {
            const fullComment = {
                id: 42,
                version: 3,
                text: "Please fix this line",
                author: {
                    name: "john_doe",
                    displayName: "John Doe",
                    emailAddress: "john@example.com",
                    avatarUrl: "https://avatar",
                },
                createdDate: 1600000000000,
                updatedDate: 1600000005000,
                threadResolved: false,
                severity: "NORMAL",
                state: "OPEN",
                properties: { jiraKeys: ["KEY-1"] },
                links: { self: [] },
            };

            const summary = summarizeComment(fullComment);

            expect(summary).toEqual({
                id: 42,
                version: 3,
                text: "Please fix this line",
                author: {
                    name: "john_doe",
                    displayName: "John Doe",
                },
                createdDate: 1600000000000,
                updatedDate: 1600000005000,
                threadResolved: false,
                severity: "NORMAL",
                state: "OPEN",
                comments: undefined,
            });
            expect(summary.properties).toBeUndefined();
            expect(summary.links).toBeUndefined();
        });

        it("recursively summarizes reply threads", () => {
            const parent = {
                id: 1,
                text: "parent",
                author: { name: "alice", displayName: "Alice" },
                comments: [
                    { id: 2, text: "reply", author: { name: "bob", displayName: "Bob", emailAddress: "b@x" } },
                ],
            };

            const summary = summarizeComment(parent);

            expect(summary.comments).toEqual([
                {
                    id: 2,
                    version: undefined,
                    text: "reply",
                    author: { name: "bob", displayName: "Bob" },
                    createdDate: undefined,
                    updatedDate: undefined,
                    threadResolved: undefined,
                    severity: undefined,
                    state: undefined,
                    comments: undefined,
                },
            ]);
        });
    });

    describe("summarizeActivity", () => {
        it("extracts essential activity fields and summarizes embedded comment", () => {
            const activity = {
                id: 9,
                action: "COMMENTED",
                actionStatus: "EFFECTIVE",
                createdDate: 1600000000000,
                user: {
                    name: "jane",
                    displayName: "Jane",
                    emailAddress: "jane@example.com",
                },
                comment: {
                    id: 7,
                    text: "nice work",
                    author: { name: "jane", displayName: "Jane" },
                },
                commit: {
                    id: "full-hash",
                    displayId: "abc1234",
                },
                fromHash: "old-hash",
                toHash: "new-hash",
                properties: { foo: "bar" },
            };

            const summary = summarizeActivity(activity);

            expect(summary).toEqual({
                id: 9,
                action: "COMMENTED",
                actionStatus: "EFFECTIVE",
                createdDate: 1600000000000,
                user: { name: "jane", displayName: "Jane" },
                comment: {
                    id: 7,
                    version: undefined,
                    text: "nice work",
                    author: { name: "jane", displayName: "Jane" },
                    createdDate: undefined,
                    updatedDate: undefined,
                    threadResolved: undefined,
                    severity: undefined,
                    state: undefined,
                    comments: undefined,
                },
                commit: { id: "full-hash", displayId: "abc1234" },
                fromHash: "old-hash",
                toHash: "new-hash",
            });
            expect(summary.properties).toBeUndefined();
        });
    });
});
