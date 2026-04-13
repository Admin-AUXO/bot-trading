#!/usr/bin/env node

import { spawn } from "node:child_process";

const subcommand = process.argv[2] === "start" ? "start" : "dev";
const port = process.env.DASHBOARD_PORT || "3100";
const nextCommand = process.platform === "win32" ? "next.cmd" : "next";

const child = spawn(nextCommand, [subcommand, "--port", port], {
  env: process.env,
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error("[dashboard] failed to start Next.js", error);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
