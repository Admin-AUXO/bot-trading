#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const sourceEnvPath = path.resolve(process.argv[2] || path.join(repoRoot, "backend", ".env"));

if (!fs.existsSync(sourceEnvPath)) {
  console.error(`[compose-env] Missing source env: ${sourceEnvPath}`);
  console.error("[compose-env] Copy backend/.env.example to backend/.env first, or pass a different env file path.");
  process.exit(1);
}

function parseEnvFile(filePath) {
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

const env = parseEnvFile(sourceEnvPath);
const dashboardEnvPath = path.join(repoRoot, "dashboard", "compose.env");
const grafanaEnvPath = path.join(repoRoot, "grafana", "compose.env");
const n8nEnvPath = path.join(repoRoot, "n8n", "compose.env");

fs.mkdirSync(path.dirname(dashboardEnvPath), { recursive: true });
fs.mkdirSync(path.dirname(grafanaEnvPath), { recursive: true });
fs.mkdirSync(path.dirname(n8nEnvPath), { recursive: true });

const dashboardEnv = `
CONTROL_API_SECRET=${env.CONTROL_API_SECRET || ""}
API_URL=${env.API_URL || "http://127.0.0.1:3101"}
GRAFANA_BASE_URL=${env.GRAFANA_BASE_URL || "http://127.0.0.1:3400"}
GRAFANA_EXECUTIVE_DASHBOARD_UID=${env.GRAFANA_EXECUTIVE_DASHBOARD_UID || "bot-executive-scorecard"}
GRAFANA_ANALYST_DASHBOARD_UID=${env.GRAFANA_ANALYST_DASHBOARD_UID || "bot-analyst-insights"}
GRAFANA_LIVE_DASHBOARD_UID=${env.GRAFANA_LIVE_DASHBOARD_UID || "bot-live-trade-monitor"}
GRAFANA_TELEMETRY_DASHBOARD_UID=${env.GRAFANA_TELEMETRY_DASHBOARD_UID || "bot-telemetry-provider"}
GRAFANA_CANDIDATE_DASHBOARD_UID=${env.GRAFANA_CANDIDATE_DASHBOARD_UID || "bot-candidate-funnel"}
GRAFANA_POSITION_DASHBOARD_UID=${env.GRAFANA_POSITION_DASHBOARD_UID || "bot-position-pnl"}
GRAFANA_CONFIG_DASHBOARD_UID=${env.GRAFANA_CONFIG_DASHBOARD_UID || "bot-config-impact"}
GRAFANA_SOURCE_DASHBOARD_UID=${env.GRAFANA_SOURCE_DASHBOARD_UID || "bot-source-cohorts"}
GRAFANA_RESEARCH_DASHBOARD_UID=${env.GRAFANA_RESEARCH_DASHBOARD_UID || "bot-research-dry-run"}
`;

const grafanaEnv = `
GF_SECURITY_ADMIN_USER=${env.GRAFANA_ADMIN_USER || "admin"}
GF_SECURITY_ADMIN_PASSWORD=${env.GRAFANA_ADMIN_PASSWORD || "admin"}
GF_SERVER_ROOT_URL=${env.GRAFANA_BASE_URL || "http://127.0.0.1:3400"}
POSTGRES_HOST=postgres:5432
POSTGRES_DB=${env.POSTGRES_DB || "trading_bot"}
POSTGRES_USER=${env.POSTGRES_USER || "botuser"}
POSTGRES_PASSWORD=${env.POSTGRES_PASSWORD || "botpass"}
`;

const n8nPort = env.N8N_PORT || "5678";
const n8nProtocol = env.N8N_PROTOCOL || "http";
const n8nHost = env.N8N_HOST || "127.0.0.1";
const n8nBaseUrl = env.N8N_EDITOR_BASE_URL || `${n8nProtocol}://${n8nHost}:${n8nPort}`;
const n8nWebhookUrl = env.WEBHOOK_URL || `${n8nBaseUrl}/`;
const n8nTimezone = env.N8N_TIMEZONE || env.US_HOURS_TIMEZONE || "America/New_York";

const n8nEnv = `
N8N_PORT=5678
N8N_PROTOCOL=${n8nProtocol}
N8N_HOST=${n8nHost}
N8N_EDITOR_BASE_URL=${n8nBaseUrl}
WEBHOOK_URL=${n8nWebhookUrl}
GENERIC_TIMEZONE=${n8nTimezone}
TZ=${n8nTimezone}
N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS=true
N8N_RUNNERS_ENABLED=${env.N8N_RUNNERS_ENABLED || "true"}
`;

fs.writeFileSync(dashboardEnvPath, dashboardEnv, "utf8");
fs.writeFileSync(grafanaEnvPath, grafanaEnv, "utf8");
fs.writeFileSync(n8nEnvPath, n8nEnv, "utf8");

console.log(`[compose-env] Wrote ${dashboardEnvPath}`);
console.log(`[compose-env] Wrote ${grafanaEnvPath}`);
console.log(`[compose-env] Wrote ${n8nEnvPath}`);
