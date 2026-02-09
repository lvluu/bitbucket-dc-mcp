import axios from "axios";

function extractAxiosErrorMessage(error: unknown): unknown {
  const responseData = (error as { response?: { data?: unknown } }).response?.data as Record<string, unknown> | undefined;
  const msg = responseData?.message ?? responseData?.errors ?? (error as { message?: string }).message;
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
    const msg = extractAxiosErrorMessage(error);
    const status = formatHttpStatus(error.response?.status);
    return `Bitbucket API error${status}: ${formatMessage(msg)}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function jsonResult(data: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

export function textResult(text: string): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [{ type: "text" as const, text }],
  };
}
