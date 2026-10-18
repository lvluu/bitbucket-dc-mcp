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
    return `/projects/${projectKey}/repos/${repoSlug}`;
}
/** Build the DC API path for a pull request */
export function prPath(projectKey: string, repoSlug: string, prId: number | string): string {
    return `${repoPath(projectKey, repoSlug)}/pull-requests/${String(prId)}`;
}
