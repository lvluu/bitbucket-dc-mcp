export interface BitbucketConfig {
    baseUrl: string;
    token: string | undefined;
    username: string | undefined;
    password: string | undefined;
    defaultProject: string | undefined;
    enableDangerous: boolean;
}
/** Path before the first `/rest` segment, i.e. the reverse-proxy context path ("" or e.g. "/bitbucket"). */
function contextPath(pathname: string): string {
    const restIndex = pathname.search(/\/rest(\/|$)/);
    const prefix = restIndex === -1 ? pathname : pathname.slice(0, restIndex);
    return prefix.replace(/\/+$/, "");
}
/** Normalize BITBUCKET_URL to the REST API base, keeping any context path (https://host/bitbucket → https://host/bitbucket/rest/api/1.0). */
export function normalizeBaseUrl(raw: string): string {
    try {
        const parsed = new URL(raw);
        const pathname = parsed.pathname.replace(/\/+$/, "");
        if (!pathname.includes("/rest/api/")) {
            return `${parsed.origin}${contextPath(pathname)}/rest/api/1.0`;
        }
        return `${parsed.origin}${pathname}`;
    }
    catch {
        return raw;
    }
}
/** Server root including context path (https://host/bitbucket/rest/api/1.0 → https://host/bitbucket). */
export function serverRootUrl(baseUrl: string): string {
    const parsed = new URL(baseUrl);
    return `${parsed.origin}${contextPath(parsed.pathname)}`;
}
function isTruthy(value: string | undefined): boolean {
    if (value === undefined || value === '')
        return false;
    return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}
export function loadConfig(): BitbucketConfig {
    const rawUrl = process.env.BITBUCKET_URL;
    if (rawUrl === undefined || rawUrl === '') {
        throw new Error("BITBUCKET_URL is required (e.g. https://bitbucket.example.com)");
    }
    const token = process.env.BITBUCKET_TOKEN;
    const username = process.env.BITBUCKET_USERNAME;
    const password = process.env.BITBUCKET_PASSWORD;
    if ((token === undefined || token === '') && !((username !== undefined && username !== '') && (password !== undefined && password !== ''))) {
        throw new Error("Either BITBUCKET_TOKEN or BITBUCKET_USERNAME + BITBUCKET_PASSWORD is required");
    }
    return {
        baseUrl: normalizeBaseUrl(rawUrl),
        token,
        username,
        password,
        defaultProject: process.env.BITBUCKET_DEFAULT_PROJECT,
        enableDangerous: isTruthy(process.env.BITBUCKET_ENABLE_DANGEROUS),
    };
}
export function getAuthHeaders(config: BitbucketConfig): Record<string, string> {
    if (config.token !== undefined && config.token !== '') {
        return { Authorization: `Bearer ${config.token}` };
    }
    return {};
}
export function getBasicAuth(config: BitbucketConfig): { username: string; password: string } | undefined {
    if ((config.username !== undefined && config.username !== '') && (config.password !== undefined && config.password !== '')) {
        return { username: config.username, password: config.password };
    }
    return undefined;
}
