import { expect, test } from "bun:test";
import { AxiosError } from "axios";
import { formatError } from "./errors.js";

test("formats a request timeout as one line that names BITBUCKET_TIMEOUT_MS", () => {
    const err = new AxiosError("timeout of 30000ms exceeded", "ECONNABORTED");
    const text = formatError(err);
    expect(text).toContain("timeout of 30000ms exceeded");
    expect(text).toContain("BITBUCKET_TIMEOUT_MS");
    expect(text).not.toContain("\n");
});
