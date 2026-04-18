#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

function readEnvValue(filePath, key) {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const name = line.slice(0, separatorIndex).trim();
    if (name !== key) {
      continue;
    }

    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return value.trim();
  }

  return undefined;
}

const repoRoot = path.resolve(__dirname, "..", "..");
const envCandidates = [
  path.join(repoRoot, "trading_bot", "backend", ".env"),
  path.join(repoRoot, ".env"),
];
const apiKey =
  process.env.BIRDEYE_API_KEY?.trim() ||
  envCandidates
    .map((filePath) => readEnvValue(filePath, "BIRDEYE_API_KEY"))
    .find(Boolean);

if (!apiKey) {
  console.error(
    "[birdeye-mcp] BIRDEYE_API_KEY is missing from the environment and repo env files",
  );
  process.exit(1);
}

const serverArgs = [
  "-y",
  "mcp-remote@latest",
  "https://mcp.birdeye.so/mcp",
  "--transport",
  "http-only",
  "--header",
  `x-api-key:${apiKey}`,
  "--silent",
];
const spawnOptions = {
  stdio: "inherit",
  cwd: repoRoot,
  env: process.env,
};
const child =
  process.platform === "win32"
    ? spawn(
        `npx ${serverArgs
          .map((arg) => `"${String(arg).replace(/"/g, '\\"')}"`)
          .join(" ")}`,
        { ...spawnOptions, shell: true },
      )
    : spawn("npx", serverArgs, spawnOptions);

child.on("error", (error) => {
  console.error("[birdeye-mcp] failed to start mcp-remote", error);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
