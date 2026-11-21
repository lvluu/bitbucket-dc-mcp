import { z } from "zod";
/**
 * Tool params shared by every repo/PR tool. Kept terse on purpose: every tools/list carries them.
 * projectKey is optional everywhere; repoPath() falls back to BITBUCKET_DEFAULT_PROJECT.
 */
export const repoArgs = { projectKey: z.string().optional(), repoSlug: z.string() };
export const prArgs = { ...repoArgs, prId: z.coerce.number() };
export const pageArgs = {
    limit: z.coerce.number().optional(),
    start: z.coerce.number().optional(),
    all: z.boolean().optional().describe("Fetch all pages (max 1000 items)"),
};
