#!/usr/bin/env node
import { createRequire } from "node:module";
import { boot } from "./server/boot.js";

if (process.argv.includes("--version") || process.argv.includes("-v")) {
  const require = createRequire(import.meta.url);
  const pkg = require("../package.json") as { version: string };
  console.log(pkg.version);
  process.exit(0);
}

boot().catch((error: unknown) => {
  console.error("Fatal error in boot():", error);
  process.exit(1);
});