import axios, { type AxiosInstance } from "axios";
import { getAuthHeaders, getBasicAuth, serverRootUrl, type BitbucketConfig } from "./config.js";
let client: AxiosInstance | undefined;
let config: BitbucketConfig | undefined;
export function initClient(cfg: BitbucketConfig): void {
    config = cfg;
    client = axios.create({
        baseURL: cfg.baseUrl,
        headers: {
            ...getAuthHeaders(cfg),
            "Content-Type": "application/json",
            Accept: "application/json",
        },
        auth: getBasicAuth(cfg),
        timeout: cfg.timeoutMs,
    });
}
export function getClient(): AxiosInstance {
    if (client === undefined) {
        throw new Error("Bitbucket client not initialized. Call initClient() first.");
    }
    return client;
}
export function getConfig(): BitbucketConfig {
    if (config === undefined) {
        throw new Error("Config not initialized. Call initClient() first.");
    }
    return config;
}
/** Get the Bitbucket server root incl. any context path (e.g. https://host/bitbucket), for non-/rest/api endpoints */
export function getOriginUrl(): string {
    const cfg = getConfig();
    return serverRootUrl(cfg.baseUrl);
}
/** Build the DC API path for a project's repository */
export function repoPath(projectKey: string, repoSlug: string): string {
    return `/projects/${encodeURIComponent(projectKey)}/repos/${encodeURIComponent(repoSlug)}`;
}
/** URL-encode each segment of a repository file path, keeping the "/" separators */
export function encodePath(path: string): string {
    const segments = path.split("/").filter((segment) => segment !== "");
    if (segments.some((segment) => segment === "." || segment === "..")) {
        throw new Error(`Invalid file path "${path}": "." and ".." segments are not allowed`);
    }
    return segments.map(encodeURIComponent).join("/");
}
/** Build a repository path with an encoded file path appended: `<repo>/<resource>[/<path>]` */
export function repoFilePath(projectKey: string, repoSlug: string, resource: string, path: string): string {
    const filePath = encodePath(path);
    const base = `${repoPath(projectKey, repoSlug)}/${resource}`;
    return filePath !== "" ? `${base}/${filePath}` : base;
}
/** Build the DC API path for a commit diff: whole commit, or a single file when `path` is given */
export function commitDiffPath(projectKey: string, repoSlug: string, commitId: string, path?: string): string {
    const base = `${repoPath(projectKey, repoSlug)}/commits/${encodeURIComponent(commitId)}/diff`;
    const filePath = path ? encodePath(path) : "";
    return filePath !== "" ? `${base}/${filePath}` : base;
}
/** Build the DC API path for a pull request */
export function prPath(projectKey: string, repoSlug: string, prId: number | string): string {
    return `${repoPath(projectKey, repoSlug)}/pull-requests/${String(prId)}`;
}
