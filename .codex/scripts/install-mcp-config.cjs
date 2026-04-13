#!/usr/bin/env node

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");
const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
const targetConfigPath = path.join(codexHome, "config.toml");
const launcherPath = path.join(repoRoot, ".codex", "scripts", "start-stdio-command.cjs");
const birdeyeLauncherPath = path.join(repoRoot, ".codex", "scripts", "start-birdeye-mcp.cjs");
const desktopCommanderLauncherPath = path.join(repoRoot, ".codex", "scripts", "start-desktop-commander.cjs");
const filesystemLauncherPath = path.join(repoRoot, ".codex", "scripts", "start-filesystem-mcp.cjs");
const backendEnvPath = path.join(repoRoot, "trading_bot", "backend", ".env");

const blockStart = "# >>> bot-trading managed MCP begin >>>";
const blockEnd = "# <<< bot-trading managed MCP end <<<";
const profileArgIndex = process.argv.indexOf("--profile");
const profile = profileArgIndex >= 0 ? process.argv[profileArgIndex + 1] : "compact";
const validProfiles = new Set(["compact", "db", "full"]);

if (!validProfiles.has(profile)) {
  console.error(`[mcp-install] invalid profile: ${profile}`);
  console.error("[mcp-install] valid profiles: compact, db, full");
  process.exit(1);
}

function tomlString(value) {
  return JSON.stringify(value);
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const content = fs.readFileSync(filePath, "utf8").replace(/\r/g, "");
  const env = {};

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
      env[key] = value.slice(1, -1);
    } else {
      env[key] = value;
    }
  }

  return env;
}

function hasRealValue(value) {
  return Boolean(value && value !== "replace-me");
}

function renderCommandServer(name, args, extra = []) {
  const lines = [
    `[mcp_servers.${name}]`,
    `command = "node"`,
    `args = [${args.map(tomlString).join(", ")}]`,
    ...extra,
    "",
  ];
  return lines.join("\n");
}

function isEnabled(serverName, backendEnv) {
  const birdeyeEnabled = hasRealValue(backendEnv.BIRDEYE_API_KEY);
  const heliusEnabled = hasRealValue(backendEnv.HELIUS_API_KEY) || hasRealValue(backendEnv.HELIUS_RPC_URL);

  if (profile === "full") {
    return {
      browsermcp: false,
      "birdeye-mcp": birdeyeEnabled,
      chrome_devtools: true,
      context7: true,
      desktop_commander: true,
      fetch: true,
      github: false,
      filesystem: false,
      memory: false,
      postgres: true,
      helius: heliusEnabled,
      sequential_thinking: true,
      time: true,
    }[serverName] ?? false;
  }

  if (profile === "db") {
    return {
      browsermcp: false,
      "birdeye-mcp": false,
      chrome_devtools: false,
      context7: false,
      desktop_commander: true,
      fetch: false,
      github: false,
      filesystem: false,
      memory: false,
      postgres: true,
      helius: false,
      sequential_thinking: false,
      time: false,
    }[serverName] ?? false;
  }

  return {
    browsermcp: false,
    "birdeye-mcp": false,
    chrome_devtools: false,
    context7: false,
    desktop_commander: true,
    fetch: false,
    github: false,
    filesystem: false,
    memory: false,
    postgres: false,
    helius: false,
    sequential_thinking: false,
    time: false,
  }[serverName] ?? false;
}

function renderManagedBlock() {
  const backendEnv = parseEnvFile(backendEnvPath);
  const launcherArgs = [launcherPath];
  const postgresUser = backendEnv.POSTGRES_USER || "botuser";
  const postgresPassword = backendEnv.POSTGRES_PASSWORD || "botpass";
  const postgresDb = backendEnv.POSTGRES_DB || "trading_bot";
  const postgresPort = backendEnv.POSTGRES_PORT || "56432";
  const postgresDsn = `postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:${postgresPort}/${postgresDb}`;
  const block = [
    blockStart,
    "# Install source: repo-local bot-trading MCP profile",
    "# Refresh this block by rerunning:",
    "#   node ./.codex/scripts/install-mcp-config.cjs [--profile compact|db|full]",
    `# Current profile: ${profile}`,
    "",
    renderCommandServer("browsermcp", [...launcherArgs, "npx", "-y", "@browsermcp/mcp"], [
      `enabled = ${isEnabled("browsermcp", backendEnv) ? "true" : "false"}`,
      "required = false",
      "startup_timeout_ms = 20000",
      "tool_timeout_sec = 90",
    ]),
    renderCommandServer("birdeye-mcp", [birdeyeLauncherPath], [
      `enabled = ${isEnabled("birdeye-mcp", backendEnv) ? "true" : "false"}`,
      "required = false",
      "startup_timeout_sec = 30",
      "tool_timeout_sec = 45",
    ]),
    renderCommandServer("chrome_devtools", [...launcherArgs, "npx", "-y", "chrome-devtools-mcp@latest"], [
      `enabled = ${isEnabled("chrome_devtools", backendEnv) ? "true" : "false"}`,
      "required = false",
      "startup_timeout_sec = 45",
      "tool_timeout_sec = 90",
    ]),
    `[mcp_servers.context7]
enabled = ${isEnabled("context7", backendEnv) ? "true" : "false"}
required = false
startup_timeout_ms = 20000
url = "https://mcp.context7.com/mcp"
`,
    renderCommandServer("desktop_commander", [desktopCommanderLauncherPath], [
      `enabled = ${isEnabled("desktop_commander", backendEnv) ? "true" : "false"}`,
      "required = false",
      "startup_timeout_ms = 90000",
      "tool_timeout_sec = 120",
    ]),
    renderCommandServer("fetch", [...launcherArgs, "uvx", "mcp-server-fetch"], [
      `enabled = ${isEnabled("fetch", backendEnv) ? "true" : "false"}`,
      "required = false",
      "startup_timeout_ms = 20000",
    ]),
    renderCommandServer("github", [...launcherArgs, "docker", "run", "-i", "--rm", "-e", "GITHUB_PERSONAL_ACCESS_TOKEN", "ghcr.io/github/github-mcp-server", "stdio", "--toolsets", "repos,issues,pull_requests,actions"], [
      `enabled = ${isEnabled("github", backendEnv) ? "true" : "false"}`,
      "required = false",
    ]),
    renderCommandServer("filesystem", [filesystemLauncherPath], [
      `enabled = ${isEnabled("filesystem", backendEnv) ? "true" : "false"}`,
      "required = false",
    ]),
    renderCommandServer("memory", [...launcherArgs, "npx", "-y", "@modelcontextprotocol/server-memory"], [
      `enabled = ${isEnabled("memory", backendEnv) ? "true" : "false"}`,
      "required = false",
      "startup_timeout_ms = 20000",
    ]),
    renderCommandServer("postgres", [...launcherArgs, "npx", "-y", "@modelcontextprotocol/server-postgres", postgresDsn], [
      `enabled = ${isEnabled("postgres", backendEnv) ? "true" : "false"}`,
      "required = false",
      "startup_timeout_ms = 20000",
    ]),
    renderCommandServer("helius", [...launcherArgs, "npx", "-y", "helius-mcp@latest"], [
      `enabled = ${isEnabled("helius", backendEnv) ? "true" : "false"}`,
      "required = false",
      "startup_timeout_ms = 30000",
    ]),
    renderCommandServer("sequential_thinking", [...launcherArgs, "npx", "-y", "@modelcontextprotocol/server-sequential-thinking"], [
      `enabled = ${isEnabled("sequential_thinking", backendEnv) ? "true" : "false"}`,
      "required = false",
      "startup_timeout_ms = 20000",
    ]),
    renderCommandServer("time", [...launcherArgs, "uvx", "mcp-server-time"], [
      `enabled = ${isEnabled("time", backendEnv) ? "true" : "false"}`,
      "required = false",
      "startup_timeout_ms = 20000",
    ]),
    blockEnd,
    "",
  ];

  return block.join("\n");
}

fs.mkdirSync(codexHome, { recursive: true });

const managedBlock = renderManagedBlock();
const existing = fs.existsSync(targetConfigPath) ? fs.readFileSync(targetConfigPath, "utf8") : "";
const managedPattern = new RegExp(`${blockStart}[\\s\\S]*?${blockEnd}\\n?`, "m");

const updated = managedPattern.test(existing)
  ? existing.replace(managedPattern, managedBlock)
  : `${existing.replace(/\s*$/, "")}${existing.trim() ? "\n\n" : ""}${managedBlock}`;

fs.writeFileSync(targetConfigPath, updated, "utf8");

console.log(`[mcp-install] wrote managed repo MCP block to ${targetConfigPath}`);
console.log(`[mcp-install] active profile: ${profile}`);
console.log("[mcp-install] restart Codex sessions to load the refreshed MCP registry");
