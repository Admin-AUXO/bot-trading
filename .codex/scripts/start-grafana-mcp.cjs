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

function toDockerReachableGrafanaUrl(baseUrl) {
  if (!baseUrl) {
    return "http://host.docker.internal:3400";
  }

  return baseUrl
    .replace("://127.0.0.1", "://host.docker.internal")
    .replace("://localhost", "://host.docker.internal");
}

const repoRoot = path.resolve(__dirname, "..", "..");
const repoEnv = loadRepoEnv(repoRoot);
const mergedEnv = {
  ...repoEnv,
  ...process.env,
};

mergedEnv.GRAFANA_URL = toDockerReachableGrafanaUrl(
  mergedEnv.GRAFANA_URL || mergedEnv.GRAFANA_BASE_URL,
);
mergedEnv.GRAFANA_USERNAME =
  mergedEnv.GRAFANA_USERNAME || mergedEnv.GRAFANA_ADMIN_USER || "admin";
mergedEnv.GRAFANA_PASSWORD =
  mergedEnv.GRAFANA_PASSWORD || mergedEnv.GRAFANA_ADMIN_PASSWORD || "admin";
mergedEnv.GRAFANA_ORG_ID = mergedEnv.GRAFANA_ORG_ID || "1";

const child = spawn(
  "docker",
  [
    "run",
    "-i",
    "--rm",
    "-e",
    "GRAFANA_URL",
    "-e",
    "GRAFANA_USERNAME",
    "-e",
    "GRAFANA_PASSWORD",
    "-e",
    "GRAFANA_ORG_ID",
    "grafana/mcp-grafana",
    "-t",
    "stdio",
  ],
  {
    cwd: repoRoot,
    env: mergedEnv,
    stdio: "inherit",
  },
);

child.on("error", (error) => {
  console.error("[grafana-mcp] failed to start grafana/mcp-grafana", error);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
