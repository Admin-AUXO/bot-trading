type LinkOptions = {
  from?: string | number | Date | null;
  to?: string | number | Date | null;
  vars?: Record<string, string | number | boolean | null | undefined>;
};

const DASHBOARD_UIDS = {
  executive: process.env.GRAFANA_EXECUTIVE_DASHBOARD_UID ?? "bot-executive-scorecard",
  analyst: process.env.GRAFANA_ANALYST_DASHBOARD_UID ?? "bot-analyst-insights",
  live: process.env.GRAFANA_LIVE_DASHBOARD_UID ?? "bot-live-trade-monitor",
  telemetry: process.env.GRAFANA_TELEMETRY_DASHBOARD_UID ?? "bot-telemetry-provider",
  candidate: process.env.GRAFANA_CANDIDATE_DASHBOARD_UID ?? "bot-candidate-funnel",
  position: process.env.GRAFANA_POSITION_DASHBOARD_UID ?? "bot-position-pnl",
  config: process.env.GRAFANA_CONFIG_DASHBOARD_UID ?? "bot-config-impact",
  source: process.env.GRAFANA_SOURCE_DASHBOARD_UID ?? "bot-source-cohorts",
  research: process.env.GRAFANA_RESEARCH_DASHBOARD_UID ?? "bot-research-dry-run",
} as const;

type DashboardKind = "control" | "executive" | "analyst" | "live" | "telemetry" | "candidate" | "position" | "config" | "source" | "research";

function dashboardUid(kind: DashboardKind) {
  switch (kind) {
    case "control":
    case "live":
      return DASHBOARD_UIDS.live;
    case "executive":
      return DASHBOARD_UIDS.executive;
    case "analyst":
      return DASHBOARD_UIDS.analyst;
    case "telemetry":
      return DASHBOARD_UIDS.telemetry;
    case "candidate":
      return DASHBOARD_UIDS.candidate;
    case "position":
      return DASHBOARD_UIDS.position;
    case "config":
      return DASHBOARD_UIDS.config;
    case "source":
      return DASHBOARD_UIDS.source;
    case "research":
      return DASHBOARD_UIDS.research;
  }
}

function normalizeTime(value: string | number | Date | null | undefined) {
  if (value == null) return null;
  if (typeof value === "number") return String(value);
  if (value instanceof Date) return String(value.getTime());
  if (/^now([+-].+)?$/.test(value)) return value;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? String(timestamp) : value;
}

export function buildGrafanaDashboardLink(
  kind: DashboardKind,
  options: LinkOptions = {},
) {
  const baseUrl = process.env.GRAFANA_BASE_URL ?? process.env.NEXT_PUBLIC_GRAFANA_BASE_URL ?? null;
  const uid = dashboardUid(kind);
  if (!baseUrl || !uid) return null;

  const url = new URL(`/d/${uid}`, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  const from = normalizeTime(options.from ?? "now-24h");
  const to = normalizeTime(options.to ?? "now");
  if (from) url.searchParams.set("from", from);
  if (to) url.searchParams.set("to", to);

  for (const [key, value] of Object.entries(options.vars ?? {})) {
    if (value == null || value === "") continue;
    url.searchParams.set(`var-${key}`, String(value));
  }

  return url.toString();
}
