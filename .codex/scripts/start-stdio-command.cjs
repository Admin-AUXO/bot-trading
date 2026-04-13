#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

function pathCandidates(name) {
  if (process.platform !== "win32") {
    return [name];
  }

  const ext = path.extname(name);
  if (ext) {
    return [name];
  }

  const pathext = (process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM")
    .split(";")
    .filter(Boolean)
    .map((value) => value.toLowerCase());

  return [name, ...pathext.map((value) => `${name}${value.toLowerCase()}`)];
}

function resolveCommand(name) {
  if (name.includes(path.sep) || name.includes("/")) {
    return name;
  }

  const pathDirs = (process.env.PATH || "")
    .split(path.delimiter)
    .filter(Boolean);

  for (const candidate of pathCandidates(name)) {
    for (const dir of pathDirs) {
      const fullPath = path.join(dir, candidate);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }
  }

  return name;
}

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
const [, , commandName, ...args] = process.argv;

if (!commandName) {
  console.error("[mcp-launcher] missing command name");
  process.exit(64);
}

const command = resolveCommand(commandName);
const child = spawn(command, args, {
  cwd: repoRoot,
  env: {
    ...loadRepoEnv(repoRoot),
    ...process.env,
  },
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(`[mcp-launcher] failed to start ${commandName}`, error);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
