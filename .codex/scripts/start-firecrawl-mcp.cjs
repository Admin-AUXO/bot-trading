#!/usr/bin/env node

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function loadRepoEnv() {
  const envPath = path.resolve(__dirname, "..", "..", "trading_bot", "backend", ".env");
  if (!fs.existsSync(envPath)) {
    return {};
  }

  const content = fs.readFileSync(envPath, "utf8").replace(/\r/g, "");
  const repoEnv = {};

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    const value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      repoEnv[key] = value.slice(1, -1);
    } else {
      repoEnv[key] = value;
    }
  }

  return repoEnv;
}

const mergedEnv = {
  ...loadRepoEnv(),
  ...process.env,
};

if (!mergedEnv.FIRECRAWL_API_URL) {
  mergedEnv.FIRECRAWL_API_URL = "http://127.0.0.1:3002";
}

const child = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["-y", "firecrawl-mcp"],
  {
    stdio: "inherit",
    env: mergedEnv,
  },
);

child.on("error", (error) => {
  console.error("[firecrawl-mcp] failed to start firecrawl-mcp", error);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
