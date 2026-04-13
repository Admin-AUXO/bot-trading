#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

function loadRepoEnv(repoRoot) {
  const envPath = path.join(repoRoot, "trading_bot", "backend", ".env");
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

const repoRoot = path.resolve(__dirname, "..", "..");
const mergedEnv = {
  ...loadRepoEnv(repoRoot),
  ...process.env,
  PUPPETEER_SKIP_DOWNLOAD: process.env.PUPPETEER_SKIP_DOWNLOAD || "1",
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD || "1",
};

const child = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["-y", "@wonderwhy-er/desktop-commander@latest", "--no-onboarding"],
  {
    cwd: repoRoot,
    env: mergedEnv,
    stdio: "inherit",
  },
);

child.on("error", (error) => {
  console.error("[desktop-commander-mcp] failed to start", error);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
