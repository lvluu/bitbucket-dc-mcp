import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globals: false,
  },
  resolve: {
    alias: {
      "#lib/": path.resolve(__dirname, "src/lib") + "/",
      "#registry/": path.resolve(__dirname, "src/registry") + "/",
      "#server/": path.resolve(__dirname, "src/server") + "/",
      "#tools/": path.resolve(__dirname, "src/tools") + "/",
    },
  },
});
