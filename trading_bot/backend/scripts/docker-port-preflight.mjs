import { execSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendDir = path.resolve(__dirname, "..");
const envPath = path.join(backendDir, ".env.docker");
const composePath = path.resolve(backendDir, "..", "docker-compose.prod.yml");

const PORT_RULES = {
  POSTGRES_PORT: {
    service: "postgres",
    fallbackStart: 55432,
    fallbackEnd: 55499,
    preferred: 5432,
  },
  REDIS_PORT: {
    service: "redis",
    fallbackStart: 56379,
    fallbackEnd: 56499,
    preferred: 6379,
  },
  BOT_PORT: {
    service: "bot",
    fallbackStart: 3001,
    fallbackEnd: 3099,
    preferred: 3001,
  },
  DASHBOARD_PORT: {
    service: "dashboard",
    fallbackStart: 3000,
    fallbackEnd: 3099,
    preferred: 3000,
  },
};

main().catch((error) => {
  console.error(`docker port preflight failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

async function main() {
  if (!fs.existsSync(envPath)) {
    throw new Error(`missing ${envPath}; copy .env.docker.example first`);
  }

  const envSource = fs.readFileSync(envPath, "utf8");
  const envMap = parseEnv(envSource);
  const composePorts = getRunningComposePorts();
  const chosenPorts = new Map();
  const updates = [];

  for (const [key, rule] of Object.entries(PORT_RULES)) {
    const configuredValue = parsePort(envMap.get(key));
    const desiredPort = configuredValue ?? rule.preferred;
    const port = await choosePort({
      key,
      desiredPort,
      chosenPorts,
      allowedComposePorts: composePorts.get(rule.service) ?? new Set(),
      rule,
    });

    chosenPorts.set(key, port);

    if (configuredValue !== port) {
      updates.push({ key, port, previous: configuredValue });
    }
  }

  if (updates.length === 0) {
    console.log(
      `docker port preflight: no changes (${formatAssignment("POSTGRES_PORT", chosenPorts.get("POSTGRES_PORT"))}, ` +
        `${formatAssignment("REDIS_PORT", chosenPorts.get("REDIS_PORT"))}, ` +
        `${formatAssignment("BOT_PORT", chosenPorts.get("BOT_PORT"))}, ` +
        `${formatAssignment("DASHBOARD_PORT", chosenPorts.get("DASHBOARD_PORT"))})`,
    );
    return;
  }

  let updatedSource = envSource;

  for (const update of updates) {
    const assignment = `${update.key}=${update.port}`;
    const pattern = new RegExp(`^${update.key}=.*$`, "m");

    if (pattern.test(updatedSource)) {
      updatedSource = updatedSource.replace(pattern, assignment);
    } else {
      updatedSource = `${updatedSource.trimEnd()}\n${assignment}\n`;
    }
  }

  fs.writeFileSync(envPath, updatedSource);

  for (const update of updates) {
    const previous = update.previous === null ? "unset" : String(update.previous);
    console.log(`docker port preflight: ${update.key} ${previous} -> ${update.port}`);
  }
}

function parseEnv(source) {
  const env = new Map();

  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = line.indexOf("=");

    if (separator === -1) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    env.set(key, value);
  }

  return env;
}

function parsePort(rawValue) {
  if (!rawValue) {
    return null;
  }

  const value = Number.parseInt(rawValue, 10);

  if (!Number.isInteger(value) || value <= 0 || value > 65535) {
    return null;
  }

  return value;
}

function getRunningComposePorts() {
  const portsByService = new Map();

  try {
    const output = execSync(
      `docker compose --env-file "${envPath}" -f "${composePath}" ps --format json`,
      { cwd: backendDir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();

    if (!output) {
      return portsByService;
    }

    for (const line of output.split(/\r?\n/)) {
      const row = JSON.parse(line);
      const service = row.Service;

      if (!service || !Array.isArray(row.Publishers)) {
        continue;
      }

      const servicePorts = portsByService.get(service) ?? new Set();

      for (const publisher of row.Publishers) {
        if (Number.isInteger(publisher.PublishedPort)) {
          servicePorts.add(publisher.PublishedPort);
        }
      }

      portsByService.set(service, servicePorts);
    }
  } catch {
    return portsByService;
  }

  return portsByService;
}

async function choosePort({ key, desiredPort, chosenPorts, allowedComposePorts, rule }) {
  const candidates = unique([
    desiredPort,
    rule.preferred,
    ...range(rule.fallbackStart, rule.fallbackEnd),
  ]);

  for (const port of candidates) {
    if ([...chosenPorts.values()].includes(port)) {
      continue;
    }

    if (allowedComposePorts.has(port)) {
      return port;
    }

    if (await isPortFree(port)) {
      return port;
    }
  }

  throw new Error(`unable to find a free host port for ${key}`);
}

function unique(values) {
  return [...new Set(values.filter((value) => Number.isInteger(value) && value > 0 && value <= 65535))];
}

function range(start, end) {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });

    server.listen(port, "127.0.0.1");
  });
}

function formatAssignment(key, value) {
  return `${key}=${value}`;
}
