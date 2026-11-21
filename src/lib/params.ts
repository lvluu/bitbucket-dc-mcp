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
    all: z.boolean().optional().describe("All pages, max 1000"),
};
/** Inline-comment anchor params, shared by addPRComment and addBlockerComment. */
export const anchorArgs = {
    anchorPath: z.string().optional().describe("Inline: file path"),
    anchorLine: z.coerce.number().optional().describe("Inline: line"),
    anchorLineType: z.enum(["ADDED", "REMOVED", "CONTEXT"]).optional(),
    anchorFileType: z.enum(["FROM", "TO"]).optional().describe("FROM=old, TO=new file"),
};
interface AnchorInput {
    anchorPath?: string;
    anchorLine?: number;
    anchorLineType?: string;
    anchorFileType?: string;
}
/** The comment `anchor` body for inline args, or undefined for a general comment. */
export function buildAnchor(args: AnchorInput): Record<string, unknown> | undefined {
    if (args.anchorPath === undefined)
        return undefined;
    return {
        path: args.anchorPath,
        diffType: "EFFECTIVE",
        line: args.anchorLine,
        lineType: args.anchorLineType,
        fileType: args.anchorFileType,
    };
}
