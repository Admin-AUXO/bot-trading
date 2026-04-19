#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const defaultEnvPath = path.join(repoRoot, "backend", ".env");

const options = {
  envPath: defaultEnvPath,
  syncEnv: true,
  skipBuild: false,
  buildOnly: false,
  forceRecreateMode: "auto",
  fullStack: false,
  validateConfig: false,
  servicesExplicit: false,
  services: [],
  profiles: [],
};

function usage() {
  console.log(`Usage: node ./scripts/update-compose-stack.mjs [options]

Fast Docker Compose refresh with minimal rebuild and recreate scope.

Default services: bot dashboard

Options:
  --env PATH          Use a different backend env file for compose env sync.
  --skip-env-sync     Skip the env-sync step.
  --skip-build        Skip the build step entirely.
  --build-only        Build services but do not docker compose up.
  --validate-config   Run 'docker compose config' before build/up.
  --force-recreate    Always recreate requested containers.
  --no-force-recreate Never force-recreate containers.
  --full-stack        Also refresh grafana with the default app services.
  --service NAME      Refresh only the named service. Repeat as needed.
  --help              Show this message.
`);
}

function fail(message) {
  console.error(`[compose-refresh] ${message}`);
  process.exit(1);
}

function run(command, args, extra = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: false,
    ...extra,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function addUnique(list, value) {
  if (!list.includes(value)) {
    list.push(value);
  }
}

function fileHash(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function statMtimeMs(targetPath) {
  try {
    return fs.statSync(targetPath).mtimeMs;
  } catch {
    return 0;
  }
}

function collectFiles(targetPath, sink) {
  if (!fs.existsSync(targetPath)) {
    return;
  }
  const stats = fs.statSync(targetPath);
  if (stats.isFile()) {
    sink.push(targetPath);
    return;
  }
  if (!stats.isDirectory()) {
    return;
  }
  for (const entry of fs.readdirSync(targetPath)) {
    collectFiles(path.join(targetPath, entry), sink);
  }
}

function anyFileNewerThan(paths, markerMs) {
  const files = [];
  for (const targetPath of paths) {
    collectFiles(targetPath, files);
  }
  return files.some((filePath) => statMtimeMs(filePath) > markerMs);
}

for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  switch (arg) {
    case "--env":
      index += 1;
      options.envPath = path.resolve(repoRoot, process.argv[index] ?? "");
      break;
    case "--skip-env-sync":
      options.syncEnv = false;
      break;
    case "--skip-build":
      options.skipBuild = true;
      break;
    case "--build-only":
      options.buildOnly = true;
      break;
    case "--validate-config":
      options.validateConfig = true;
      break;
    case "--force-recreate":
      options.forceRecreateMode = "always";
      break;
    case "--no-force-recreate":
      options.forceRecreateMode = "never";
      break;
    case "--full-stack":
      options.fullStack = true;
      break;
    case "--service": {
      const service = process.argv[index + 1];
      if (!service) {
        fail("Missing service name after --service");
      }
      options.servicesExplicit = true;
      addUnique(options.services, service);
      if (service === "n8n") {
        addUnique(options.profiles, "automation");
      }
      if (service === "obsidian") {
        addUnique(options.profiles, "notes");
      }
      index += 1;
      break;
    }
    case "--help":
    case "-h":
      usage();
      process.exit(0);
    default:
      fail(`Unknown option: ${arg}`);
  }
}

if (!fs.existsSync(options.envPath)) {
  fail(`Missing env source: ${options.envPath}`);
}

if (!options.servicesExplicit) {
  options.services = ["bot", "dashboard"];
}
if (options.fullStack) {
  addUnique(options.services, "grafana");
}

console.log(`[compose-refresh] Repo root : ${repoRoot}`);
console.log(`[compose-refresh] Env source: ${options.envPath}`);
console.log(`[compose-refresh] Services  : ${options.services.join(" ")}`);

const envHashMarker = path.join(repoRoot, ".compose-env-source.sha256");
const dockerMarker = path.join(repoRoot, ".docker-mtime");
const previousEnvHash = fs.existsSync(envHashMarker)
  ? fs.readFileSync(envHashMarker, "utf8").trim()
  : "";
const currentEnvHash = fileHash(options.envPath);
const envSourceChanged = options.syncEnv && currentEnvHash !== previousEnvHash;

const beforeComposeEnvMtimes = {
  dashboard: statMtimeMs(path.join(repoRoot, "dashboard", "compose.env")),
  grafana: statMtimeMs(path.join(repoRoot, "grafana", "compose.env")),
  n8n: statMtimeMs(path.join(repoRoot, "n8n", "compose.env")),
};

if (options.syncEnv) {
  console.log("[compose-refresh] Syncing compose env files");
  run(process.execPath, [path.join(repoRoot, "scripts", "sync-compose-env.mjs"), options.envPath]);
  fs.writeFileSync(envHashMarker, `${currentEnvHash}\n`, "utf8");
} else {
  console.log("[compose-refresh] Skipping env sync");
}

const afterComposeEnvMtimes = {
  dashboard: statMtimeMs(path.join(repoRoot, "dashboard", "compose.env")),
  grafana: statMtimeMs(path.join(repoRoot, "grafana", "compose.env")),
  n8n: statMtimeMs(path.join(repoRoot, "n8n", "compose.env")),
};

const composeArgs = ["compose"];
for (const profile of options.profiles) {
  composeArgs.push("--profile", profile);
}

if (options.validateConfig) {
  console.log("[compose-refresh] Validating compose config");
  run("docker", [...composeArgs, "config"], { stdio: "ignore" });
}

const markerMs = statMtimeMs(dockerMarker);
const markerExists = markerMs > 0;
const prismaChanged =
  !markerExists ||
  anyFileNewerThan([path.join(repoRoot, "backend", "prisma")], markerMs);

if (prismaChanged && options.services.some((service) => service === "bot" || service === "grafana")) {
  addUnique(options.services, "db-setup");
}

const rebuildChecks = {
  dashboard: [
    path.join(repoRoot, "dashboard", "Dockerfile"),
    path.join(repoRoot, "dashboard", ".dockerignore"),
    path.join(repoRoot, "dashboard", "app"),
    path.join(repoRoot, "dashboard", "components"),
    path.join(repoRoot, "dashboard", "lib"),
    path.join(repoRoot, "dashboard", "next.config.ts"),
    path.join(repoRoot, "dashboard", "public"),
    path.join(repoRoot, "dashboard", "scripts"),
    path.join(repoRoot, "dashboard", "package.json"),
    path.join(repoRoot, "dashboard", "package-lock.json"),
    path.join(repoRoot, "dashboard", "tsconfig.json"),
    path.join(repoRoot, "dashboard", "postcss.config.mjs"),
  ],
  bot: [
    path.join(repoRoot, "backend", "Dockerfile"),
    path.join(repoRoot, "backend", ".dockerignore"),
    path.join(repoRoot, "backend", "src"),
    path.join(repoRoot, "backend", "prisma"),
    path.join(repoRoot, "backend", "scripts"),
    path.join(repoRoot, "backend", "package.json"),
    path.join(repoRoot, "backend", "package-lock.json"),
  ],
  "db-setup": [path.join(repoRoot, "backend", "prisma")],
};

const needsRebuild = [];
if (options.skipBuild) {
  console.log("[compose-refresh] Skipping build (--skip-build)");
} else {
  for (const service of options.services) {
    if (service === "db-setup") {
      if (prismaChanged) {
        needsRebuild.push(service);
      } else {
        console.log("[compose-refresh] db-setup: no prisma changes, skipping rebuild");
      }
      continue;
    }
    const inputs = rebuildChecks[service];
    if (!inputs) {
      continue;
    }
    if (!markerExists || anyFileNewerThan(inputs, markerMs)) {
      needsRebuild.push(service);
    } else {
      console.log(`[compose-refresh] ${service}: no build-input changes, skipping rebuild`);
    }
  }

  if (needsRebuild.length > 0) {
    console.log(`[compose-refresh] Building: ${needsRebuild.join(" ")}`);
    run("docker", [...composeArgs, "build", ...needsRebuild]);
    fs.writeFileSync(dockerMarker, `${new Date().toISOString()}\n`, "utf8");
  } else {
    console.log("[compose-refresh] No services need rebuilding");
  }
}

if (options.buildOnly) {
  console.log("[compose-refresh] Build-only finished");
  process.exit(0);
}

const needsRecreate = new Set(needsRebuild);
for (const service of options.services) {
  if ((service === "bot" || service === "db-setup") && envSourceChanged) {
    needsRecreate.add(service);
  }
  if (service === "dashboard" && afterComposeEnvMtimes.dashboard > beforeComposeEnvMtimes.dashboard) {
    needsRecreate.add(service);
  }
  if (service === "grafana" && afterComposeEnvMtimes.grafana > beforeComposeEnvMtimes.grafana) {
    needsRecreate.add(service);
  }
  if (service === "n8n" && afterComposeEnvMtimes.n8n > beforeComposeEnvMtimes.n8n) {
    needsRecreate.add(service);
  }
}

const upArgs = [...composeArgs, "up", "-d"];
if (options.servicesExplicit && !options.services.includes("db-setup")) {
  upArgs.push("--no-deps");
}
if (
  options.forceRecreateMode === "always" ||
  (options.forceRecreateMode === "auto" && needsRecreate.size > 0)
) {
  upArgs.push("--force-recreate");
} else if (options.forceRecreateMode === "auto") {
  console.log("[compose-refresh] Reusing unchanged containers when possible");
}
upArgs.push(...options.services);

console.log(`[compose-refresh] Bringing up: ${options.services.join(" ")}`);
run("docker", upArgs);

console.log("[compose-refresh] Current status");
run("docker", [...composeArgs, "ps", ...options.services]);
