import "dotenv/config";
import { z } from "zod";

const IST_TIMEZONE = "Asia/Kolkata";
const PACK_ID = "scalp-tape-structure";
const PACK_NAME = "Scalp tape + structure";
const WINDOW_START_MINUTES = 19 * 60;
const WINDOW_END_MINUTES = 90;
const booleanFlag = z.preprocess((value) => {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "off", ""].includes(normalized)) {
      return false;
    }
  }
  return value;
}, z.boolean());

const envSchema = z.object({
  BOT_PORT: z.coerce.number().int().positive().default(3101),
  TELEGRAM_BOT_TOKEN: z.string().trim().min(1),
  TELEGRAM_CHAT_ID: z.string().trim().min(1),
  DISCOVERY_LAB_ALERT_API_URL: z.string().url().optional(),
  DISCOVERY_LAB_ALERT_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5_000),
  DISCOVERY_LAB_ALERT_MAX_WAIT_MS: z.coerce.number().int().positive().default(510_000),
  DISCOVERY_LAB_ALERT_FORCE_WINDOW: booleanFlag.default(false),
  TELEGRAM_API_BASE_URL: z.string().url().default("https://api.telegram.org"),
});

const args = new Set(process.argv.slice(2));
const parsedEnv = envSchema.safeParse({
  ...process.env,
  DISCOVERY_LAB_ALERT_FORCE_WINDOW: args.has("--force-window")
    ? "true"
    : process.env.DISCOVERY_LAB_ALERT_FORCE_WINDOW,
});

if (!parsedEnv.success) {
  const issues = parsedEnv.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  throw new Error(`Invalid discovery lab alert environment:\n${issues}`);
}

const env = parsedEnv.data;
const apiBaseUrl = env.DISCOVERY_LAB_ALERT_API_URL ?? `http://127.0.0.1:${env.BOT_PORT}`;

type DiscoveryLabRunStatus = "RUNNING" | "COMPLETED" | "FAILED" | "INTERRUPTED";

type DiscoveryLabRunSummary = {
  id: string;
  status: DiscoveryLabRunStatus;
  createdAt: string;
  startedAt: string;
  completedAt: string | null;
  packId: string;
  packName: string;
  profile: string;
  sources: string[];
  queryCount: number | null;
  winnerCount: number | null;
  evaluationCount: number | null;
  errorMessage: string | null;
};

type WinnerSummary = {
  tokenName: string;
  address: string;
  score: number;
  volume5mUsd: number | null;
  timeSinceGraduationMin: number | null;
};

type QuerySummary = {
  recipeName: string;
  source: string;
  goodCount: number;
  returnedCount: number;
  winnerHitRatePercent: number;
};

type DiscoveryLabRunDetail = DiscoveryLabRunSummary & {
  report: {
    queryCount: number;
    winners: WinnerSummary[];
    querySummaries: QuerySummary[];
    deepEvaluations: Array<{
      mint: string;
      symbol: string;
    }>;
  } | null;
  strategyCalibration: {
    winnerCohorts?: Array<{
      label: string;
      winnerCount: number;
      tokenCount: number;
      avgWinnerScore: number | null;
    }>;
  } | null;
  stdout: string;
  stderr: string;
};

async function main(): Promise<void> {
  if (!env.DISCOVERY_LAB_ALERT_FORCE_WINDOW && !isWithinIstWindow(new Date())) {
    console.log(`Outside IST alert window for ${PACK_NAME}; skipping.`);
    return;
  }

  const existing = await fetchJson<DiscoveryLabRunSummary[]>("/api/operator/discovery-lab/runs");
  const activeRun = existing.find((run) => run.status === "RUNNING");
  if (activeRun) {
    console.log(`Discovery lab run ${activeRun.id} already active for ${activeRun.packName}; skipping.`);
    return;
  }

  const started = await postJson<DiscoveryLabRunDetail>("/api/operator/discovery-lab/run", {
    packId: PACK_ID,
  }, { skipConflict: true });
  if (!started) {
    console.log("Discovery lab run was already active at start; skipping.");
    return;
  }

  const completed = await waitForRun(started.id);
  if (completed.status !== "COMPLETED") {
    throw new Error(completed.errorMessage ?? summarizeOutput(completed.stderr, completed.stdout) ?? `discovery lab run ${completed.id} ${completed.status.toLowerCase()}`);
  }

  const winners = completed.report?.winners ?? [];
  if (winners.length === 0) {
    console.log(`Discovery lab run ${completed.id} completed with 0 winners; no Telegram alert sent.`);
    return;
  }

  const message = formatTelegramMessage(completed);
  await sendTelegramMessage(truncateMessage(message));

  console.log(`Sent Telegram alert for discovery lab run ${completed.id} with ${winners.length} winner${winners.length === 1 ? "" : "s"}.`);
}

async function waitForRun(runId: string): Promise<DiscoveryLabRunDetail> {
  const deadline = Date.now() + env.DISCOVERY_LAB_ALERT_MAX_WAIT_MS;
  while (Date.now() <= deadline) {
    const detail = await fetchJson<DiscoveryLabRunDetail>(`/api/operator/discovery-lab/runs/${runId}`);
    if (detail.status !== "RUNNING") {
      return detail;
    }
    await sleep(env.DISCOVERY_LAB_ALERT_POLL_INTERVAL_MS);
  }
  throw new Error(`Timed out waiting for discovery lab run ${runId} to finish.`);
}

async function fetchJson<T>(path: string, options?: {
  method?: "GET" | "POST";
  body?: unknown;
  baseUrl?: string;
  skipConflict?: boolean;
}): Promise<T> {
  const response = await fetch(`${options?.baseUrl ?? apiBaseUrl}${path}`, {
    method: options?.method ?? "GET",
    headers: options?.body ? { "content-type": "application/json" } : undefined,
    body: options?.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });

  if (options?.skipConflict && response.status === 409) {
    return null as T;
  }

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

async function postJson<T>(path: string, body: unknown, options?: {
  baseUrl?: string;
  skipConflict?: boolean;
}): Promise<T> {
  return fetchJson<T>(path, {
    method: "POST",
    body,
    baseUrl: options?.baseUrl,
    skipConflict: options?.skipConflict,
  });
}

async function sendTelegramMessage(text: string): Promise<void> {
  const response = await fetch(`${env.TELEGRAM_API_BASE_URL}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: env.TELEGRAM_CHAT_ID,
      text,
      disable_web_page_preview: true,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  const payload = await response.json().catch(() => null) as { ok?: boolean; description?: string } | null;
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.description ?? `${response.status} ${response.statusText}`);
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = await response.json() as { error?: string; description?: string };
    return payload.error ?? payload.description ?? `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
}

function isWithinIstWindow(now: Date): boolean {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST_TIMEZONE,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  const totalMinutes = (hour * 60) + minute;
  return totalMinutes >= WINDOW_START_MINUTES || totalMinutes < WINDOW_END_MINUTES;
}

function formatTelegramMessage(run: DiscoveryLabRunDetail): string {
  const generatedAt = run.completedAt ?? run.startedAt;
  const symbolByMint = new Map((run.report?.deepEvaluations ?? []).map((item) => [item.mint, item.symbol]));
  const winners = (run.report?.winners ?? [])
    .slice(0, 5)
    .map((winner, index) => {
      const symbol = symbolByMint.get(winner.address);
      const label = symbol && symbol !== winner.tokenName
        ? `${symbol} (${winner.tokenName})`
        : (symbol ?? winner.tokenName);
      return [
        `${index + 1}. ${label}`,
        `score ${formatNumber(winner.score, 2)} | vol5m ${formatUsd(winner.volume5mUsd)} | grad ${formatMinutes(winner.timeSinceGraduationMin)}`,
      ].join("\n");
    });

  const bestCohort = pickBestCohort(run);
  const bestQuery = pickBestQuery(run.report?.querySummaries ?? []);

  const lines = [
    `${PACK_NAME} winners`,
    formatIstDateTime(generatedAt),
    `Winners ${run.winnerCount ?? run.report?.winners.length ?? 0} | Evaluations ${run.evaluationCount ?? run.report?.deepEvaluations.length ?? 0} | Queries ${run.queryCount ?? run.report?.queryCount ?? 0}`,
  ];

  if (bestCohort) {
    lines.push(`Best cohort ${bestCohort.label} (${bestCohort.winnerCount} winners / ${bestCohort.tokenCount} tokens${bestCohort.avgWinnerScore !== null ? `, avg score ${formatNumber(bestCohort.avgWinnerScore, 2)}` : ""})`);
  } else if (bestQuery) {
    lines.push(`Best query ${bestQuery.recipeName} @ ${bestQuery.source} (${bestQuery.goodCount} good / ${bestQuery.returnedCount} returned, ${formatNumber(bestQuery.winnerHitRatePercent, 1)}% winner hit)`);
  }

  lines.push("", ...winners);
  return lines.join("\n");
}

function pickBestCohort(run: DiscoveryLabRunDetail): {
  label: string;
  winnerCount: number;
  tokenCount: number;
  avgWinnerScore: number | null;
} | null {
  const cohorts = run.strategyCalibration?.winnerCohorts ?? [];
  if (cohorts.length === 0) {
    return null;
  }
  return [...cohorts]
    .sort((left, right) => right.winnerCount - left.winnerCount || right.tokenCount - left.tokenCount)
    [0] ?? null;
}

function pickBestQuery(queries: QuerySummary[]): QuerySummary | null {
  if (queries.length === 0) {
    return null;
  }
  return [...queries]
    .sort((left, right) => right.goodCount - left.goodCount || right.winnerHitRatePercent - left.winnerHitRatePercent)
    [0] ?? null;
}

function formatIstDateTime(value: string): string {
  const date = new Date(value);
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TIMEZONE,
    dateStyle: "medium",
    timeStyle: "short",
    hour12: true,
  }).format(date);
}

function formatUsd(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "n/a";
  }
  if (Math.abs(value) >= 1_000_000) {
    return `$${formatNumber(value / 1_000_000, 2)}m`;
  }
  if (Math.abs(value) >= 1_000) {
    return `$${formatNumber(value / 1_000, 1)}k`;
  }
  return `$${formatNumber(value, value >= 100 ? 0 : 2)}`;
}

function formatMinutes(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "n/a";
  }
  return `${formatNumber(value, value >= 100 ? 0 : 1)}m`;
}

function formatNumber(value: number, fractionDigits: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

function truncateMessage(value: string): string {
  if (value.length <= 3_800) {
    return value;
  }
  return `${value.slice(0, 3_760)}\n...`;
}

function summarizeOutput(stderr: string, stdout: string): string | null {
  const combined = `${stderr}\n${stdout}`
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return combined.length > 0 ? combined[combined.length - 1] : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

await main();
