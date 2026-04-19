#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";

const subcommand = process.argv[2] === "start" ? "start" : "dev";
const port = process.env.DASHBOARD_PORT || "3100";
const nextBin = path.join(import.meta.dirname, "..", "node_modules", "next", "dist", "bin", "next");

const child = spawn(process.execPath, [nextBin, subcommand, "--port", port], {
  cwd: path.join(import.meta.dirname, ".."),
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
