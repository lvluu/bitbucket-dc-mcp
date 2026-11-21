/**
 * Renders a Bitbucket DC JSON diff (`{ diffs: [...] }`) as unified diff text. The JSON form repeats
 * source/destination objects and line metadata per hunk; the text form carries the same content in far fewer tokens.
 */
interface DiffLine { line?: string }
interface DiffSegment { type?: string; lines?: DiffLine[] }
interface DiffHunk { sourceLine?: number; sourceSpan?: number; destinationLine?: number; destinationSpan?: number; segments?: DiffSegment[]; truncated?: boolean }
interface FileDiff { source?: { toString?: string } | null; destination?: { toString?: string } | null; hunks?: DiffHunk[]; binary?: boolean; truncated?: boolean }
interface DiffBody { diffs?: FileDiff[]; truncated?: boolean }

const PREFIX: Record<string, string> = { ADDED: "+", REMOVED: "-", CONTEXT: " " };

function renderHunk(hunk: DiffHunk): string[] {
    const header = `@@ -${String(hunk.sourceLine ?? 0)},${String(hunk.sourceSpan ?? 0)} +${String(hunk.destinationLine ?? 0)},${String(hunk.destinationSpan ?? 0)} @@`;
    const lines = (hunk.segments ?? []).flatMap((seg) => (seg.lines ?? []).map((l) => `${PREFIX[seg.type ?? ""] ?? " "}${l.line ?? ""}`));
    return hunk.truncated === true ? [header, ...lines, "[hunk truncated by Bitbucket]"] : [header, ...lines];
}

function renderFile(file: FileDiff): string[] {
    const src = file.source?.toString;
    const dst = file.destination?.toString;
    const head = [`--- ${src !== undefined ? `a/${src}` : "/dev/null"}`, `+++ ${dst !== undefined ? `b/${dst}` : "/dev/null"}`];
    if (file.binary === true)
        return [...head, "Binary file"];
    const body = (file.hunks ?? []).flatMap(renderHunk);
    return file.truncated === true ? [...head, ...body, "[file diff truncated by Bitbucket]"] : [...head, ...body];
}

export function diffToText(data: DiffBody): string {
    const files = (data.diffs ?? []).flatMap(renderFile);
    if (files.length === 0)
        return "No changes.";
    return data.truncated === true ? [...files, "[diff truncated by Bitbucket]"].join("\n") : files.join("\n");
}
