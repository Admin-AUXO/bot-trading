import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { buildDashboardScreenshotManifest } from "./dashboard-screenshot-manifest.mjs";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value = "true"] = arg.split("=");
    return [key, value];
  }),
);

const dashboardUrl = (args.get("--dashboard-url") ?? process.env.DASHBOARD_URL ?? "http://127.0.0.1:3100").replace(/\/$/, "");
const apiUrl = (args.get("--api-url") ?? process.env.API_URL ?? "http://127.0.0.1:3101").replace(/\/$/, "");
const outputDir = path.resolve(
  args.get("--output-dir")
    ?? process.env.SMOKE_OUTPUT_DIR
    ?? path.join("artifacts", "dashboard-smoke", timestampSlug(new Date())),
);

await fs.mkdir(outputDir, { recursive: true });

const manifest = await buildDashboardScreenshotManifest({ apiUrl });
const runId = await resolveRunId(apiUrl);

const pageRoutes = [
  { name: "root", path: "/" },
  { name: "grader", path: "/workbench/grader" },
  ...manifest.routes,
  ...(runId
    ? [
        { name: "run-detail", path: `/workbench/runs/${runId}` },
        { name: "grader-detail", path: `/workbench/grader/${runId}` },
      ]
    : []),
];

const apiChecks = [
  { name: "status", path: "/api/status" },
  { name: "desk-home", path: "/api/desk/home" },
  { name: "desk-shell", path: "/api/desk/shell" },
  { name: "candidates-ready", path: "/api/operator/candidates?bucket=ready" },
  { name: "positions-open", path: "/api/operator/positions?book=open" },
  { name: "packs", path: "/api/operator/packs" },
  { name: "runs", path: "/api/operator/runs?limit=5" },
  { name: "sessions", path: "/api/operator/sessions?limit=5" },
  { name: "market-trending", path: "/api/operator/market/trending?limit=5" },
  { name: "market-ideas", path: "/api/operator/market/strategy-suggestions" },
];

const pageResults = [];
for (const route of pageRoutes) {
  const targetUrl = new URL(route.path, dashboardUrl).toString();
  const response = await fetch(targetUrl, { redirect: "manual" });
  pageResults.push({
    ...route,
    url: targetUrl,
    status: response.status,
    location: response.headers.get("location"),
    ok: response.status >= 200 && response.status < 400,
  });
  process.stdout.write(`page ${route.name} -> ${response.status}${response.headers.get("location") ? ` ${response.headers.get("location")}` : ""}\n`);
}

const apiResults = [];
for (const check of apiChecks) {
  const dashboardResponse = await fetch(`${dashboardUrl}${check.path}`, { redirect: "manual" });
  const backendResponse = await fetch(`${apiUrl}${check.path}`, { redirect: "manual" });
  const dashboardJson = await tryJson(dashboardResponse);
  const backendJson = await tryJson(backendResponse);
  const dashboardKeys = topLevelKeys(dashboardJson);
  const backendKeys = topLevelKeys(backendJson);
  apiResults.push({
    ...check,
    dashboardStatus: dashboardResponse.status,
    backendStatus: backendResponse.status,
    ok: dashboardResponse.ok && backendResponse.ok && sameStringArray(dashboardKeys, backendKeys),
    dashboardKeys,
    backendKeys,
  });
  process.stdout.write(`api ${check.name} -> dashboard ${dashboardResponse.status} / backend ${backendResponse.status}\n`);
}

const report = {
  generatedAt: new Date().toISOString(),
  dashboardUrl,
  apiUrl,
  pageResults,
  apiResults,
};

const reportPath = path.join(outputDir, "report.json");
await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
process.stdout.write(`wrote ${reportPath}\n`);

async function resolveRunId(apiBaseUrl) {
  const payload = await tryJson(await fetch(`${apiBaseUrl}/api/operator/runs?limit=1`));
  const nextRunId = payload?.runs?.[0]?.id;
  return typeof nextRunId === "string" && nextRunId.length > 0 ? nextRunId : null;
}

async function tryJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function topLevelKeys(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  return Object.keys(value).sort();
}

function sameStringArray(left, right) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function timestampSlug(value) {
  return value.toISOString().replaceAll(":", "-");
}
