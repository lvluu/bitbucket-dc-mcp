import axios, { type AxiosInstance } from "axios";
import { getAuthHeaders, getBasicAuth, serverRootUrl, type BitbucketConfig } from "./config.js";
let client: AxiosInstance | undefined;
let config: BitbucketConfig | undefined;
let userSlug: string | undefined;
export function initClient(cfg: BitbucketConfig): void {
    config = cfg;
    userSlug = undefined;
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
/** The given project key, else BITBUCKET_DEFAULT_PROJECT; throws one line when neither is set. */
export function resolveProject(projectKey: string | undefined): string {
    const key = projectKey !== undefined && projectKey !== "" ? projectKey : getConfig().defaultProject;
    if (key === undefined || key === "") {
        throw new Error("projectKey is required (or set BITBUCKET_DEFAULT_PROJECT)");
    }
    return key;
}
/** Full ref for a branch: `feature/x` and `refs/heads/feature/x` both give `refs/heads/feature/x`. */
export function branchRef(name: string): string {
    return name.startsWith("refs/") ? name : `refs/heads/${name}`;
}
/** Slug of the token's user (X-AUSERNAME header, then /users lookup); cached until initClient. */
export async function currentUserSlug(): Promise<string> {
    if (userSlug !== undefined)
        return userSlug;
    const props = await getClient().get("/application-properties");
    const name: unknown = props.headers["x-ausername"];
    if (typeof name !== "string" || name === "") {
        throw new Error("Cannot tell the token's user: Bitbucket sent no X-AUSERNAME header");
    }
    const users = await getClient().get<{ values?: { name?: string; slug?: string }[] }>("/users", { params: { filter: name } });
    userSlug = users.data.values?.find((u) => u.name === name)?.slug ?? name;
    return userSlug;
}
/** Build the DC API path for a project */
export function projectPath(projectKey: string | undefined): string {
    return `/projects/${encodeURIComponent(resolveProject(projectKey))}`;
}
/** Build the DC API path for a project's repository */
export function repoPath(projectKey: string | undefined, repoSlug: string): string {
    return `${projectPath(projectKey)}/repos/${encodeURIComponent(repoSlug)}`;
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
export function repoFilePath(projectKey: string | undefined, repoSlug: string, resource: string, path: string): string {
    const filePath = encodePath(path);
    const base = `${repoPath(projectKey, repoSlug)}/${resource}`;
    return filePath !== "" ? `${base}/${filePath}` : base;
}
/** `<base>/<encoded path>`, or `<base>` when path is empty or omitted */
function withFilePath(base: string, path: string | undefined): string {
    const filePath = path !== undefined ? encodePath(path) : "";
    return filePath !== "" ? `${base}/${filePath}` : base;
}
/** Build the DC API path for a commit diff: whole commit, or a single file when `path` is given */
export function commitDiffPath(projectKey: string | undefined, repoSlug: string, commitId: string, path?: string): string {
    return withFilePath(`${repoPath(projectKey, repoSlug)}/commits/${encodeURIComponent(commitId)}/diff`, path);
}
/** Build the DC API path for a pull request diff: whole PR, or a single file when `path` is given */
export function prDiffPath(projectKey: string | undefined, repoSlug: string, prId: number, path?: string): string {
    return withFilePath(`${prPath(projectKey, repoSlug, prId)}/diff`, path);
}
/** Build the DC API path for a pull request */
export function prPath(projectKey: string | undefined, repoSlug: string, prId: number | string): string {
    return `${repoPath(projectKey, repoSlug)}/pull-requests/${String(prId)}`;
}
