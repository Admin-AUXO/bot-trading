#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const graphPath = path.join(repoRoot, "graphify-out", "graph.json");

if (!fs.existsSync(graphPath)) {
  console.error(`[graphify] ${graphPath} is missing. Build the graph first with 'node ./.codex/scripts/graphify.mjs build-local .' or the repo $graphify skill.`);
  process.exit(0);
}

const ensureEnv = spawnSync("node", [path.join(repoRoot, ".codex", "scripts", "graphify.mjs"), "ensure-env"], {
  cwd: repoRoot,
  env: process.env,
  encoding: "utf8",
});

if (ensureEnv.status !== 0) {
  process.exit(ensureEnv.status ?? 1);
}

const pythonBin = ensureEnv.stdout.trim();
const child = spawn(
  pythonBin,
  ["-c", "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"],
  {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

child.on("error", (error) => {
  console.error("[graphify] failed to rebuild graph", error);
  process.exit(1);
});
