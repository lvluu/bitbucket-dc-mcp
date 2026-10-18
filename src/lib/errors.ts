import axios, { type AxiosError } from "axios";
import { capText, serialize } from "#lib/squeeze.js";
export interface ToolResult {
    [key: string]: unknown;
    content: { type: "text"; text: string }[];
    isError?: boolean;
}
interface BitbucketErrorBody {
    message?: unknown;
    errors?: unknown;
}
function extractAxiosErrorMessage(error: AxiosError): unknown {
    const responseData = error.response?.data as BitbucketErrorBody | undefined;
    const msg = responseData?.message ?? responseData?.errors ?? error.message;
    return msg ?? "";
}
function formatHttpStatus(status: number | undefined): string {
    return status !== undefined ? ` (HTTP ${String(status)})` : "";
}
function formatMessage(msg: unknown): string {
    return typeof msg === "string" ? msg : JSON.stringify(msg);
}
export function formatError(error: unknown): string {
    if (axios.isAxiosError(error)) {
        if (error.response === undefined && (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT")) {
            return `Bitbucket API error: ${error.message} (raise BITBUCKET_TIMEOUT_MS to wait longer)`;
        }
        const msg = extractAxiosErrorMessage(error);
        const status = formatHttpStatus(error.response?.status);
        return `Bitbucket API error${status}: ${formatMessage(msg)}`;
    }
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}
export function jsonResult(data: unknown): ToolResult {
    return {
        content: [{ type: "text", text: capText(serialize(data)) }],
    };
}
export function textResult(text: string): ToolResult {
    return {
        content: [{ type: "text", text: capText(text) }],
    };
}
