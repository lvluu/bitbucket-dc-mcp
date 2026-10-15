import { describe, expect, it } from "bun:test";
import {
    summarizeArray,
    summarizeBranch,
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
        it("extracts essential fields and nested author/committer objects", () => {
            const fullCommit = {
                id: "commit-hash-full",
                displayId: "commit-hash",
                message: "Commit message",
                author: {
                    name: "Author Person",
                    emailAddress: "author@example.com",
                    avatarUrl: "http://avatar",
                },
                authorTimestamp: 1610000000000,
                committer: {
                    name: "Committer Person",
                    emailAddress: "committer@example.com",
                    avatarUrl: "http://avatar",
                },
                committerTimestamp: 1610000005000,
                parents: [{ id: "parent-hash", displayId: "parent" }],
                properties: { jiraKeys: ["KEY-1"] },
            };

            const summary = summarizeCommit(fullCommit);

            expect(summary).toEqual({
                id: "commit-hash-full",
                displayId: "commit-hash",
                message: "Commit message",
                author: {
                    name: "Author Person",
                    emailAddress: "author@example.com",
                },
                authorTimestamp: 1610000000000,
                committer: {
                    name: "Committer Person",
                    emailAddress: "committer@example.com",
                },
                committerTimestamp: 1610000005000,
                parents: [{ id: "parent-hash", displayId: "parent" }],
            });

            expect(summary.properties).toBeUndefined();
        });

        it("handles missing author and committer gracefully", () => {
            const minimalCommit = {
                id: "commit-hash-full",
                displayId: "commit-hash",
                message: "Initial commit",
            };

            const summary = summarizeCommit(minimalCommit);

            expect(summary).toEqual({
                id: "commit-hash-full",
                displayId: "commit-hash",
                message: "Initial commit",
                author: undefined,
                authorTimestamp: undefined,
                committer: undefined,
                committerTimestamp: undefined,
                parents: undefined,
            });
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
});
