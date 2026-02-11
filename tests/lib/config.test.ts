import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadConfig, getAuthHeaders, getBasicAuth } from "#lib/config.js";

describe("config", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("loadConfig", () => {
    it("should load config with token auth", () => {
      process.env.BITBUCKET_URL = "https://bitbucket.example.com";
      process.env.BITBUCKET_TOKEN = "my-token";

      const config = loadConfig();

      expect(config.baseUrl).toBe("https://bitbucket.example.com/rest/api/1.0");
      expect(config.token).toBe("my-token");
      expect(config.enableDangerous).toBe(false);
    });

    it("should load config with basic auth", () => {
      process.env.BITBUCKET_URL = "https://bitbucket.example.com";
      process.env.BITBUCKET_USERNAME = "user";
      process.env.BITBUCKET_PASSWORD = "pass";

      const config = loadConfig();

      expect(config.username).toBe("user");
      expect(config.password).toBe("pass");
    });

    it("should throw if BITBUCKET_URL is missing", () => {
      delete process.env.BITBUCKET_URL;
      process.env.BITBUCKET_TOKEN = "tok";

      expect(() => loadConfig()).toThrow("BITBUCKET_URL is required");
    });

    it("should throw if no auth is provided", () => {
      process.env.BITBUCKET_URL = "https://bitbucket.example.com";
      delete process.env.BITBUCKET_TOKEN;
      delete process.env.BITBUCKET_USERNAME;
      delete process.env.BITBUCKET_PASSWORD;

      expect(() => loadConfig()).toThrow("Either BITBUCKET_TOKEN or BITBUCKET_USERNAME");
    });

    it("should normalize URL that already has /rest/api/", () => {
      process.env.BITBUCKET_URL = "https://bitbucket.example.com/rest/api/1.0";
      process.env.BITBUCKET_TOKEN = "tok";

      const config = loadConfig();

      expect(config.baseUrl).toBe("https://bitbucket.example.com/rest/api/1.0");
    });

    it("should strip trailing slashes from URL", () => {
      process.env.BITBUCKET_URL = "https://bitbucket.example.com/";
      process.env.BITBUCKET_TOKEN = "tok";

      const config = loadConfig();

      expect(config.baseUrl).toBe("https://bitbucket.example.com/rest/api/1.0");
    });

    it("should parse enableDangerous truthy values", () => {
      process.env.BITBUCKET_URL = "https://bitbucket.example.com";
      process.env.BITBUCKET_TOKEN = "tok";
      process.env.BITBUCKET_ENABLE_DANGEROUS = "true";

      expect(loadConfig().enableDangerous).toBe(true);

      process.env.BITBUCKET_ENABLE_DANGEROUS = "1";
      expect(loadConfig().enableDangerous).toBe(true);

      process.env.BITBUCKET_ENABLE_DANGEROUS = "yes";
      expect(loadConfig().enableDangerous).toBe(true);
    });

    it("should parse enableDangerous falsy values", () => {
      process.env.BITBUCKET_URL = "https://bitbucket.example.com";
      process.env.BITBUCKET_TOKEN = "tok";
      process.env.BITBUCKET_ENABLE_DANGEROUS = "false";

      expect(loadConfig().enableDangerous).toBe(false);

      process.env.BITBUCKET_ENABLE_DANGEROUS = "";
      expect(loadConfig().enableDangerous).toBe(false);
    });

    it("should read BITBUCKET_DEFAULT_PROJECT", () => {
      process.env.BITBUCKET_URL = "https://bitbucket.example.com";
      process.env.BITBUCKET_TOKEN = "tok";
      process.env.BITBUCKET_DEFAULT_PROJECT = "MYPROJ";

      expect(loadConfig().defaultProject).toBe("MYPROJ");
    });
  });

  describe("getAuthHeaders", () => {
    it("should return Bearer header when token is set", () => {
      const headers = getAuthHeaders({ baseUrl: "", token: "abc123", enableDangerous: false });

      expect(headers).toEqual({ Authorization: "Bearer abc123" });
    });

    it("should return empty headers when no token", () => {
      const headers = getAuthHeaders({ baseUrl: "", enableDangerous: false });

      expect(headers).toEqual({});
    });
  });

  describe("getBasicAuth", () => {
    it("should return credentials when username and password are set", () => {
      const auth = getBasicAuth({ baseUrl: "", username: "u", password: "p", enableDangerous: false });

      expect(auth).toEqual({ username: "u", password: "p" });
    });

    it("should return undefined when credentials are missing", () => {
      const auth = getBasicAuth({ baseUrl: "", enableDangerous: false });

      expect(auth).toBeUndefined();
    });
  });
});
