#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const mode = process.argv[2] || "host";

if (!["host", "compose"].includes(mode)) {
  console.error("Usage: node ./scripts/bootstrap-new-system.mjs [host|compose]");
  process.exit(1);
}

function commandExists(command) {
  const result = spawnSync(command, ["--version"], {
    stdio: "ignore",
    shell: process.platform === "win32",
  });
  return result.status === 0;
}

function requireCommand(command) {
  if (!commandExists(command)) {
    console.error(`Missing required command: ${command}`);
    process.exit(1);
  }
}

function run(command, args, cwd = rootDir) {
  const result = spawnSync(command, args, {
    cwd,
    env: process.env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function readCommand(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    env: process.env,
    encoding: "utf8",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  return (result.stdout || "").trim();
}

function warnPlaceholderEnv() {
  const envPath = path.join(rootDir, "backend", ".env");
  const envText = fs.readFileSync(envPath, "utf8");
  if (/replace-me|postgres:5432|CONTROL_API_SECRET="replace-me"/.test(envText)) {
    console.log("\nbackend/.env still contains example values.");
    console.log("Fill the provider keys and control secret before expecting the bot to work properly.");
  }
}

function printNextSteps() {
  if (mode === "host") {
    console.log("\nNext steps for host-run app + Docker Postgres:");
    console.log("1. Edit trading_bot/backend/.env");
    console.log("2. Change DATABASE_URL host from postgres to 127.0.0.1 or localhost");
    console.log("3. Start Postgres:");
    console.log("   cd trading_bot && docker compose up -d postgres");
    console.log("4. Set up backend:");
    console.log("   cd trading_bot/backend && npm run db:generate && npm run db:setup && npm run dev");
    console.log("5. Start dashboard:");
    console.log("   cd trading_bot/dashboard && npm run dev");
    return;
  }

  console.log("\nNext steps for full Compose stack:");
  console.log("1. Edit trading_bot/backend/.env");
  console.log("2. Keep DATABASE_URL pointed at postgres");
  console.log("3. Generate service env files:");
  console.log("   cd trading_bot && node ./scripts/sync-compose-env.mjs");
  console.log("4. Start the stack:");
  console.log("   cd trading_bot && docker compose up --build");
}

requireCommand("node");
requireCommand("npm");
requireCommand("docker");
requireCommand("rg");

console.log(`Using Node ${readCommand("node", ["-v"])} and npm ${readCommand("npm", ["-v"])}`);
console.log("Installing backend dependencies...");
run("npm", ["ci"], path.join(rootDir, "backend"));

console.log("Installing dashboard dependencies...");
run("npm", ["ci"], path.join(rootDir, "dashboard"));

const envPath = path.join(rootDir, "backend", ".env");
if (!fs.existsSync(envPath)) {
  fs.copyFileSync(path.join(rootDir, "backend", ".env.example"), envPath);
  console.log("Created trading_bot/backend/.env from example");
}

if (mode === "compose") {
  run("node", [path.join(rootDir, "scripts", "sync-compose-env.mjs")], rootDir);
}

warnPlaceholderEnv();
printNextSteps();
