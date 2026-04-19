#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

function loadRepoEnv(repoRoot) {
  const envFiles = [
    path.join(repoRoot, "trading_bot", "backend", ".env"),
    path.join(repoRoot, ".env"),
  ];
  const repoEnv = {};

  for (const envPath of envFiles) {
    if (!fs.existsSync(envPath)) {
      continue;
    }

    const content = fs.readFileSync(envPath, "utf8").replace(/\r/g, "");
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
      repoEnv[key] =
        (value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith("'") && value.endsWith("'"))
          ? value.slice(1, -1)
          : value;
    }
  }

  return repoEnv;
}

const repoRoot = path.resolve(__dirname, "..", "..");
const mergedEnv = {
  ...loadRepoEnv(repoRoot),
  ...process.env,
  GITHUB_TOOLSETS: process.env.GITHUB_TOOLSETS || "repos,issues,pull_requests,actions",
};

const dockerArgs = ["run", "-i", "--rm", "-e", "GITHUB_TOOLSETS"];
if (mergedEnv.GITHUB_PERSONAL_ACCESS_TOKEN) {
  dockerArgs.push("-e", "GITHUB_PERSONAL_ACCESS_TOKEN");
}
dockerArgs.push("ghcr.io/github/github-mcp-server", "stdio");

const child = spawn("docker", dockerArgs, {
  cwd: repoRoot,
  env: mergedEnv,
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error("[github-mcp] failed to start github-mcp-server", error);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
