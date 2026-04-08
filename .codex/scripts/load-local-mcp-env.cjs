const fs = require("node:fs");
const path = require("node:path");

function parseEnvFile(source) {
  const env = {};

  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    env[key] = value;
  }

  return env;
}

function loadLocalMcpEnv() {
  const repoRoot = path.resolve(__dirname, "..", "..");
  const localEnvPath = path.join(repoRoot, ".codex", "mcp-secrets.env");

  if (!fs.existsSync(localEnvPath)) {
    return { repoRoot, env: { ...process.env }, localEnvPath };
  }

  const source = fs.readFileSync(localEnvPath, "utf8");
  return {
    repoRoot,
    localEnvPath,
    env: {
      ...process.env,
      ...parseEnvFile(source),
    },
  };
}

module.exports = { loadLocalMcpEnv };
