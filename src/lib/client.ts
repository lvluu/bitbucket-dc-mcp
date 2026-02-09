import axios, { type AxiosInstance } from "axios";
import { type BitbucketDCConfig, getAuthHeaders, getBasicAuth } from "./config.js";

let client: AxiosInstance | undefined;
let config: BitbucketDCConfig | undefined;

export function initClient(cfg: BitbucketDCConfig): void {
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

export function getConfig(): BitbucketDCConfig {
  if (config === undefined) {
    throw new Error("Config not initialized. Call initClient() first.");
  }
  return config;
}

/** Build the DC API path for a project's repository */
export function repoPath(projectKey: string, repoSlug: string): string {
  return `/projects/${projectKey}/repos/${repoSlug}`;
}

/** Build the DC API path for a pull request */
export function prPath(projectKey: string, repoSlug: string, prId: string | number): string {
  return `${repoPath(projectKey, repoSlug)}/pull-requests/${String(prId)}`;
}
