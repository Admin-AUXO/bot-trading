#!/usr/bin/env node

const { spawn } = require("node:child_process");

const apiKey = process.env.BIRDEYE_API_KEY?.trim();

if (!apiKey) {
  console.error("[birdeye-mcp] BIRDEYE_API_KEY is missing");
  process.exit(1);
}

const child = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  [
    "-y",
    "mcp-remote@0.1.37",
    "https://mcp.birdeye.so/mcp",
    "--header",
    `x-api-key:${apiKey}`,
  ],
  {
    stdio: "inherit",
    env: process.env,
  },
);

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
