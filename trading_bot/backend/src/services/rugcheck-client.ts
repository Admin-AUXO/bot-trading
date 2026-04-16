import { asBoolean, asNumber, asRecord, asString } from "../utils/types.js";

type ScalarRecord = Record<string, unknown>;

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  return JSON.parse(text) as unknown;
}

export type RugcheckListedToken = {
  mint: string;
  name: string | null;
  symbol: string | null;
  score: number | null;
  visits: number | null;
  verified: boolean;
};

export type RugcheckTokenSummary = {
  mint: string;
  score: number | null;
  scoreNormalized: number | null;
  lpLockedPercent: number | null;
  topRiskLevel: "danger" | "warning" | "info" | "unknown";
  topRiskName: string | null;
  riskCount: number;
  risks: Array<{
    name: string;
    level: string | null;
    score: number | null;
    description: string | null;
  }>;
};

function normalizeRiskLevel(value: string | null): "danger" | "warning" | "info" | "unknown" {
  const normalized = (value ?? "").toLowerCase();
  if (normalized === "danger" || normalized === "error" || normalized === "critical") {
    return "danger";
  }
  if (normalized === "warn" || normalized === "warning") {
    return "warning";
  }
  if (normalized === "info" || normalized === "notice") {
    return "info";
  }
  return "unknown";
}

function parseListedToken(row: ScalarRecord, verified: boolean): RugcheckListedToken | null {
  const metadata = asRecord(row.metadata);
  const mint = asString(row.mint);
  if (!mint) {
    return null;
  }

  return {
    mint,
    name: asString(row.name) ?? asString(metadata?.name),
    symbol: asString(row.symbol) ?? asString(metadata?.symbol),
    score: asNumber(row.score),
    visits: asNumber(row.visits) ?? asNumber(row.user_visits),
    verified,
  };
}

function parseTokenSummary(mint: string, payload: unknown): RugcheckTokenSummary | null {
  const record = asRecord(payload);
  if (!record) {
    return null;
  }

  const risks = Array.isArray(record.risks) ? record.risks : [];
  const parsedRisks = risks
    .map((entry) => asRecord(entry))
    .filter((entry): entry is ScalarRecord => Boolean(entry))
    .map((entry) => ({
      name: asString(entry.name) ?? "Unknown risk",
      level: asString(entry.level),
      score: asNumber(entry.score),
      description: asString(entry.description),
    }));
  const topRisk = [...parsedRisks].sort((left, right) => (right.score ?? 0) - (left.score ?? 0))[0] ?? null;

  return {
    mint,
    score: asNumber(record.score),
    scoreNormalized: asNumber(record.score_normalised),
    lpLockedPercent: asNumber(record.lpLockedPct),
    topRiskLevel: normalizeRiskLevel(topRisk?.level ?? null),
    topRiskName: topRisk?.name ?? null,
    riskCount: parsedRisks.length,
    risks: parsedRisks,
  };
}

export class RugcheckClient {
  private async request(pathname: string): Promise<unknown> {
    const response = await fetch(`https://api.rugcheck.xyz${pathname}`, {
      headers: { accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Rugcheck ${pathname} failed with ${response.status}`);
    }

    return parseJson(response);
  }

  async getRecentTokens(limit: number): Promise<RugcheckListedToken[]> {
    const payload = await this.request("/v1/stats/recent");
    const rows = Array.isArray(payload) ? payload : [];
    return rows
      .map((entry) => asRecord(entry))
      .map((entry) => (entry ? parseListedToken(entry, false) : null))
      .filter((entry): entry is RugcheckListedToken => Boolean(entry))
      .slice(0, limit);
  }

  async getVerifiedTokens(limit: number): Promise<RugcheckListedToken[]> {
    const payload = await this.request("/v1/stats/verified");
    const rows = Array.isArray(payload) ? payload : [];
    return rows
      .map((entry) => asRecord(entry))
      .map((entry) => (entry ? parseListedToken(entry, true) : null))
      .filter((entry): entry is RugcheckListedToken => Boolean(entry))
      .slice(0, limit);
  }

  async getTokenReportSummary(mint: string): Promise<RugcheckTokenSummary | null> {
    const normalizedMint = mint.trim();
    if (!normalizedMint) {
      return null;
    }

    const response = await fetch(`https://api.rugcheck.xyz/v1/tokens/${normalizedMint}/report/summary`, {
      headers: { accept: "application/json" },
    });
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      const payload = await parseJson(response).catch(() => null);
      const message = asString(asRecord(payload)?.error) ?? `Rugcheck token summary failed with ${response.status}`;
      throw new Error(message);
    }

    const payload = await parseJson(response);
    return parseTokenSummary(normalizedMint, payload);
  }
}
