import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value = "true"] = arg.split("=");
    return [key, value];
  }),
);

const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const backendEnvPath = path.resolve(repoRoot, "trading_bot", "backend", ".env");
const dashboardEnvPath = path.resolve(repoRoot, "trading_bot", "dashboard", "compose.env");
const reportPath = path.resolve(
  args.get("--report") ?? path.join(repoRoot, "output", "route-api-test-report.json"),
);
const requestTimeoutMs = Number(args.get("--request-timeout-ms") ?? "20000");
const includeRuntimeActions = args.get("--include-runtime-actions") === "true";
const includeDangerousWrites = args.get("--include-dangerous-writes") === "true";

const backendEnv = await readEnvFile(backendEnvPath);
const dashboardEnv = await readEnvFile(dashboardEnvPath);

const apiBaseUrl = args.get("--api-base-url") ?? `http://127.0.0.1:${backendEnv.BOT_PORT ?? "3101"}`;
const dashboardBaseUrl = args.get("--dashboard-base-url") ?? `http://127.0.0.1:${backendEnv.DASHBOARD_PORT ?? "3100"}`;

const report = {
  generatedAt: new Date().toISOString(),
  apiBaseUrl,
  dashboardBaseUrl,
  requestTimeoutMs,
  backendEnvSummary: {
    botPort: backendEnv.BOT_PORT ?? null,
    dashboardPort: backendEnv.DASHBOARD_PORT ?? null,
    apiUrl: dashboardEnv.API_URL ?? null,
  },
  dynamicContext: {},
  dashboardRoutes: [],
  apiEndpoints: [],
  skippedMutations: [],
  summary: {
    passed: 0,
    failed: 0,
    skipped: 0,
  },
};

function pushResult(collection, result) {
  collection.push(result);
  if (result.status === "passed") report.summary.passed += 1;
  else if (result.status === "failed") report.summary.failed += 1;
  else report.summary.skipped += 1;
}

function okResult(name, detail, extra = {}) {
  return { name, status: "passed", detail, ...extra };
}

function failResult(name, detail, extra = {}) {
  return { name, status: "failed", detail, ...extra };
}

function skipResult(name, detail, extra = {}) {
  return { name, status: "skipped", detail, ...extra };
}

async function requestUrl(targetUrl, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(`request timed out after ${requestTimeoutMs}ms`), requestTimeoutMs);
  try {
    const response = await fetch(targetUrl, {
      redirect: options.redirect ?? "follow",
      headers: options.headers,
      method: options.method ?? "GET",
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    const text = await response.text();
    let json = null;
    try {
      json = text.length > 0 ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { response, text, json };
  } finally {
    clearTimeout(timeout);
  }
}

function dashboardUrl(route) {
  return new URL(route, dashboardBaseUrl).toString();
}

function backendUrl(route) {
  return new URL(route, apiBaseUrl).toString();
}

async function testDashboardRoute(route, expectedStatus = 200) {
  const targetUrl = dashboardUrl(route);
  try {
    const { response, text } = await requestUrl(targetUrl);
    if (response.status !== expectedStatus) {
      pushResult(report.dashboardRoutes, failResult(route, `expected ${expectedStatus}, got ${response.status}`));
      return;
    }
    pushResult(report.dashboardRoutes, okResult(route, `status ${response.status}; body ${Math.min(text.length, 4000)} chars`));
  } catch (error) {
    pushResult(report.dashboardRoutes, failResult(route, error instanceof Error ? error.message : String(error)));
  }
}

async function testEndpoint({
  name,
  route,
  method = "GET",
  body,
  target = "dashboard",
  expectedStatuses = [200],
  skipReason,
}) {
  if (skipReason) {
    pushResult(report.apiEndpoints, skipResult(name, skipReason, { route, method, target }));
    return null;
  }

  const targetUrl = target === "backend" ? backendUrl(route) : dashboardUrl(route);

  try {
    const { response, text, json } = await requestUrl(targetUrl, {
      method,
      body,
      headers: body ? { "Content-Type": "application/json" } : undefined,
    });

    if (!expectedStatuses.includes(response.status)) {
      pushResult(
        report.apiEndpoints,
        failResult(name, `${method} ${route} -> ${response.status} ${response.statusText}: ${text.slice(0, 400)}`, {
          route,
          method,
          target,
        }),
      );
      return null;
    }

    pushResult(
      report.apiEndpoints,
      okResult(name, `${method} ${route} -> ${response.status}`, { route, method, target }),
    );
    return json;
  } catch (error) {
    pushResult(
      report.apiEndpoints,
      failResult(name, error instanceof Error ? error.message : String(error), { route, method, target }),
    );
    return null;
  }
}

function skipMutation(name, route, reason) {
  pushResult(report.skippedMutations, skipResult(name, reason, { route }));
}

await testDashboardRoute("/");
await testDashboardRoute("/operational-desk/overview");
await testDashboardRoute("/operational-desk/trading");
await testDashboardRoute("/operational-desk/settings");
await testDashboardRoute("/workbench/packs");
await testDashboardRoute("/workbench/editor");
await testDashboardRoute("/workbench/sandbox");
await testDashboardRoute("/workbench/grader");
await testDashboardRoute("/workbench/sessions");
await testDashboardRoute("/market/trending");
await testDashboardRoute("/market/watchlist");

await testEndpoint({ name: "health", route: "/health", target: "backend" });
const statusPayload = await testEndpoint({ name: "status-public", route: "/api/status", target: "backend" });
const settingsPayload = await testEndpoint({ name: "settings-public", route: "/api/settings", target: "backend" });

await testEndpoint({ name: "desk-shell", route: "/api/desk/shell" });
await testEndpoint({ name: "desk-home", route: "/api/desk/home" });
await testEndpoint({ name: "desk-events", route: "/api/desk/events?limit=5" });
await testEndpoint({ name: "operator-shell", route: "/api/operator/shell" });
await testEndpoint({ name: "operator-home", route: "/api/operator/home" });
await testEndpoint({ name: "operator-events", route: "/api/operator/events?limit=5" });
await testEndpoint({ name: "operator-diagnostics", route: "/api/operator/diagnostics" });
await testEndpoint({ name: "adaptive-activity", route: "/api/operator/adaptive/activity?limit=5" });
await testEndpoint({ name: "sessions-list", route: "/api/operator/sessions?limit=5" });
await testEndpoint({ name: "sessions-current", route: "/api/operator/sessions/current" });

const candidateBuckets = ["ready", "risk", "provider", "data"];
const candidateIds = new Map();
for (const bucket of candidateBuckets) {
  const payload = await testEndpoint({
    name: `candidate-queue-${bucket}`,
    route: `/api/operator/candidates?bucket=${bucket}`,
  });
  const candidateId = payload?.rows?.[0]?.id;
  if (typeof candidateId === "string" && candidateId.length > 0) {
    candidateIds.set(bucket, candidateId);
  }
}

const openPositions = await testEndpoint({ name: "positions-open", route: "/api/operator/positions?book=open" });
const closedPositions = await testEndpoint({ name: "positions-closed", route: "/api/operator/positions?book=closed" });
const firstPositionId = openPositions?.rows?.[0]?.id ?? closedPositions?.rows?.[0]?.id ?? null;

const packsPayload = await testEndpoint({ name: "packs-list", route: "/api/operator/packs?limit=5" });
const firstPackId = packsPayload?.packs?.[0]?.id ?? null;
const packDetail = firstPackId
  ? await testEndpoint({ name: "pack-detail", route: `/api/operator/packs/${encodeURIComponent(firstPackId)}` })
  : null;
if (firstPackId) {
  await testEndpoint({ name: "pack-runs", route: `/api/operator/packs/${encodeURIComponent(firstPackId)}/runs?limit=5` });
  await testEndpoint({
    name: "pack-validate",
    route: "/api/operator/packs/validate",
    method: "POST",
    body: {
      draft: packDetail?.pack?.draft ?? {},
      allowOverfiltered: false,
    },
  });
}

const runsPayload = await testEndpoint({ name: "runs-list", route: "/api/operator/runs?limit=20" });
const runIds = Array.isArray(runsPayload?.runs)
  ? runsPayload.runs.map((run) => run?.id).filter((id) => typeof id === "string" && id.length > 0)
  : [];
let firstRunId = runIds[0] ?? null;
let runDetail = null;
let runTokenMint = null;

for (const [index, runId] of runIds.entries()) {
  const detail = await testEndpoint({
    name: index === 0 ? "run-detail" : `run-detail-${index + 1}`,
    route: `/api/operator/runs/${encodeURIComponent(runId)}`,
  });
  if (index === 0) {
    runDetail = detail;
  }
  const candidateMint = detail?.report?.deepEvaluations?.[0]?.mint ?? detail?.report?.winners?.[0]?.address ?? null;
  if (typeof candidateMint === "string" && candidateMint.length > 0) {
    firstRunId = runId;
    runDetail = detail;
    runTokenMint = candidateMint;
    break;
  }
}

await testEndpoint({ name: "market-trending", route: "/api/operator/market/trending?limit=5&refresh=false" });
await testEndpoint({ name: "market-suggestions", route: "/api/operator/market/strategy-suggestions?refresh=false" });

const tokenMint =
  runTokenMint
  ?? statusPayload?.latestCandidates?.[0]?.mint
  ?? openPositions?.rows?.[0]?.mint
  ?? packsPayload?.currentSession?.mint
  ?? null;

if (firstRunId) {
  await testEndpoint({ name: "run-market-regime", route: `/api/operator/runs/${encodeURIComponent(firstRunId)}/market-regime` });
  await testEndpoint({
    name: "run-grade-preview",
    route: `/api/operator/runs/${encodeURIComponent(firstRunId)}/grade`,
    method: "POST",
    body: { persist: false },
  });
  await testEndpoint({
    name: "run-suggest-tuning-preview",
    route: `/api/operator/runs/${encodeURIComponent(firstRunId)}/suggest-tuning`,
    method: "POST",
    body: { apply: false },
  });
  await testEndpoint({
    name: "run-token-insight",
    route: tokenMint
      ? `/api/operator/runs/${encodeURIComponent(firstRunId)}/token-insight?mint=${encodeURIComponent(tokenMint)}`
      : `/api/operator/runs/${encodeURIComponent(firstRunId)}/token-insight`,
    expectedStatuses: tokenMint ? [200] : [400],
  });
}

if (tokenMint) {
  await testEndpoint({
    name: "market-trending-focus",
    route: `/api/operator/market/trending?limit=5&mint=${encodeURIComponent(tokenMint)}&focusOnly=true`,
  });
  await testEndpoint({ name: "market-token-stats", route: `/api/operator/market/stats/${encodeURIComponent(tokenMint)}` });
  await testEndpoint({
    name: "market-smart-wallet-events",
    route: `/api/operator/market/smart-wallet-events?limit=5&mints=${encodeURIComponent(tokenMint)}`,
  });
  await testEndpoint({ name: "market-enrichment", route: `/api/operator/enrichment/${encodeURIComponent(tokenMint)}` });
  await testDashboardRoute(`/market/token/${encodeURIComponent(tokenMint)}`);
}

for (const [bucket, candidateId] of candidateIds.entries()) {
  await testEndpoint({
    name: `candidate-detail-${bucket}`,
    route: `/api/operator/candidates/${encodeURIComponent(candidateId)}`,
  });
  await testDashboardRoute(`/candidates/${encodeURIComponent(candidateId)}?bucket=${bucket}`);
}

if (firstPositionId) {
  await testEndpoint({ name: "position-detail", route: `/api/operator/positions/${encodeURIComponent(firstPositionId)}` });
  await testDashboardRoute(`/positions/${encodeURIComponent(firstPositionId)}?book=open`);
}

await testEndpoint({ name: "legacy-candidates", route: "/api/candidates?limit=5" });
await testEndpoint({ name: "legacy-positions", route: "/api/positions?limit=5" });
await testEndpoint({ name: "legacy-fills", route: "/api/fills?limit=5" });
await testEndpoint({ name: "legacy-provider-usage", route: "/api/provider-usage" });
await testEndpoint({ name: "legacy-provider-payloads", route: "/api/provider-payloads?limit=5" });
await testEndpoint({ name: "legacy-snapshots", route: "/api/snapshots?limit=5" });
await testEndpoint({ name: "view-runtime-overview", route: "/api/views/v_runtime_overview" });
await testEndpoint({ name: "settings-apply-noop", route: "/api/settings", method: "POST", body: settingsPayload ?? {} });

if (includeRuntimeActions) {
  await testEndpoint({ name: "control-pause", route: "/api/control/pause", method: "POST", body: {} });
  await testEndpoint({ name: "control-resume", route: "/api/control/resume", method: "POST", body: {} });
  await testEndpoint({ name: "control-discover-now", route: "/api/control/discover-now", method: "POST", body: {} });
  await testEndpoint({ name: "control-evaluate-now", route: "/api/control/evaluate-now", method: "POST", body: {} });
  await testEndpoint({ name: "control-exit-check-now", route: "/api/control/exit-check-now", method: "POST", body: {} });
} else {
  skipMutation("control-pause", "/api/control/pause", "runtime mutation skipped by default; pass --include-runtime-actions=true");
  skipMutation("control-resume", "/api/control/resume", "runtime mutation skipped by default; pass --include-runtime-actions=true");
  skipMutation("control-discover-now", "/api/control/discover-now", "runtime mutation skipped by default; pass --include-runtime-actions=true");
  skipMutation("control-evaluate-now", "/api/control/evaluate-now", "runtime mutation skipped by default; pass --include-runtime-actions=true");
  skipMutation("control-exit-check-now", "/api/control/exit-check-now", "runtime mutation skipped by default; pass --include-runtime-actions=true");
}

if (includeDangerousWrites) {
  if (firstPackId) {
    await testEndpoint({
      name: "pack-start-run",
      route: `/api/operator/packs/${encodeURIComponent(firstPackId)}/runs`,
      method: "POST",
      body: {},
    });
  }
} else {
  skipMutation("pack-save", "/api/operator/packs", "pack write skipped by default; destructive or stateful");
  skipMutation("pack-update", `/api/operator/packs/${firstPackId ?? ":id"}`, "pack write skipped by default; destructive or stateful");
  skipMutation("pack-delete", `/api/operator/packs/${firstPackId ?? ":id"}`, "pack delete skipped by default");
  skipMutation("pack-start-run", `/api/operator/packs/${firstPackId ?? ":id"}/runs`, "run creation skipped by default");
  skipMutation("operator-manual-entry", "/api/operator/manual-entry", "manual trade skipped by default");
  skipMutation("run-apply-live", `/api/operator/runs/${firstRunId ?? ":id"}/apply-live`, "deployment skipped by default");
  skipMutation("run-manual-entry", `/api/operator/runs/${firstRunId ?? ":id"}/manual-entry`, "manual trade skipped by default");
  skipMutation("session-start", "/api/operator/sessions", "session mutation skipped by default");
  skipMutation("session-patch", `/api/operator/sessions/${runDetail?.session?.id ?? ":id"}`, "session mutation skipped by default");
}

report.dynamicContext = {
  candidateIds: Object.fromEntries(candidateIds.entries()),
  firstPackId,
  firstRunId,
  firstPositionId,
  tokenMint,
};

await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

const summaryLine = [
  `[dashboard-api-test] passed=${report.summary.passed}`,
  `failed=${report.summary.failed}`,
  `skipped=${report.summary.skipped}`,
  `report=${reportPath}`,
].join(" ");

console.log(summaryLine);
if (report.summary.failed > 0) {
  process.exitCode = 1;
}

async function readEnvFile(filePath) {
  try {
    const content = (await fs.readFile(filePath, "utf8")).replace(/\r/g, "");
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
      env[key] =
        (value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))
          ? value.slice(1, -1)
          : value;
    }

    return env;
  } catch {
    return {};
  }
}
