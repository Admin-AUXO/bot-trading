export const datasource = { type: "postgres", uid: "trading-bot-postgres" };

export const dashboardMeta = {
  executive: { uid: "bot-executive-scorecard", title: "Executive Scorecard", folder: "scorecards", refresh: "15m", from: "now-7d" },
  analyst: { uid: "bot-analyst-insights", title: "Analyst Insights Overview", folder: "analytics", refresh: "15m", from: "now-14d" },
  live: { uid: "bot-live-trade-monitor", title: "Live Trade Monitor", folder: "operations", refresh: "30s", from: "now-6h" },
  telemetry: { uid: "bot-telemetry-provider", title: "Telemetry & Provider Analytics", folder: "operations", refresh: "30s", from: "now-24h" },
  candidate: { uid: "bot-candidate-funnel", title: "Candidate & Funnel Analytics", folder: "analytics", refresh: "5m", from: "now-14d" },
  position: { uid: "bot-position-pnl", title: "Position & PnL Analytics", folder: "analytics", refresh: "5m", from: "now-14d" },
  config: { uid: "bot-config-impact", title: "Config Change Impact & RCA", folder: "analytics", refresh: "5m", from: "now-30d" },
  source: { uid: "bot-source-cohorts", title: "Source & Cohort Performance", folder: "analytics", refresh: "15m", from: "now-30d" },
  research: { uid: "bot-research-dry-run", title: "Research & Dry-Run Analysis", folder: "research", refresh: "15m", from: "now-30d" },
  sessionOverview: { uid: "bot-session-overview", title: "Session Overview", folder: "operations", refresh: "30s", from: "now-24h" },
  packLeaderboard: { uid: "bot-pack-leaderboard", title: "Pack Leaderboard", folder: "analytics", refresh: "5m", from: "now-30d" },
  candidateFunnel: { uid: "bot-candidate-funnel-rca", title: "Candidate Funnel", folder: "analytics", refresh: "5m", from: "now-14d" },
  exitReasonRca: { uid: "bot-exit-reason-rca", title: "Exit Reason RCA", folder: "analytics", refresh: "5m", from: "now-30d" },
  creditBurn: { uid: "bot-credit-burn", title: "Credit Burn", folder: "operations", refresh: "1m", from: "now-30d" },
  adaptiveTelemetry: { uid: "bot-adaptive-telemetry", title: "Adaptive Telemetry", folder: "operations", refresh: "5m", from: "now-30d" },
  enrichmentQuality: { uid: "bot-enrichment-quality", title: "Enrichment Quality", folder: "operations", refresh: "5m", from: "now-14d" },
};

export const allRegex = ".*";
export const varRef = (name, format = "") => `\${${name}${format ? `:${format}` : ""}}`;
export const asSqlText = (value) => `'${value}'`;
export const timeFilter = (column) => `${column} >= $__timeFrom() AND ${column} <= $__timeTo()`;
export const dateTimeColumn = (column) => `${column}::timestamp`;
export const filterRegex = (column, name) => `COALESCE(${column}::text, '') ~* '^(${varRef(name, "regex")})$'`;
export const filterContains = (column, name) => `(${asSqlText(varRef(name))} = '' OR COALESCE(${column}::text, '') ILIKE '%' || ${asSqlText(varRef(name))} || '%')`;

export function queryTarget(rawSql, format = "table", refId = "A") {
  return {
    datasource,
    editorMode: "code",
    format,
    rawQuery: true,
    rawSql,
    refId,
  };
}

function withDescription(panel, description) {
  return description ? { ...panel, description } : panel;
}

export function statPanel(id, title, gridPos, rawSql, unit = "none", description) {
  return withDescription({
    id,
    title,
    type: "stat",
    datasource,
    gridPos,
    targets: [queryTarget(rawSql, "table")],
    fieldConfig: {
      defaults: {
        unit,
        color: { mode: "palette-classic" },
        thresholds: { mode: "absolute", steps: [{ color: "green", value: null }, { color: "red", value: 0 }] },
      },
      overrides: [],
    },
    options: {
      colorMode: "value",
      graphMode: "area",
      justifyMode: "center",
      orientation: "auto",
      reduceOptions: {
        calcs: ["lastNotNull"],
        fields: "",
        values: false,
      },
      textMode: "auto",
    },
  }, description);
}

export function timeseriesPanel(id, title, gridPos, rawSql, unit = "none", description) {
  return withDescription({
    id,
    title,
    type: "timeseries",
    datasource,
    gridPos,
    targets: [queryTarget(rawSql, "time_series")],
    fieldConfig: {
      defaults: {
        unit,
        color: { mode: "palette-classic" },
        custom: {
          axisBorderShow: false,
          axisCenteredZero: false,
          axisColorMode: "text",
          axisLabel: "",
          axisPlacement: "auto",
          barAlignment: 0,
          drawStyle: "line",
          fillOpacity: 10,
          gradientMode: "none",
          hideFrom: { legend: false, tooltip: false, viz: false },
          lineInterpolation: "linear",
          lineWidth: 2,
          pointSize: 4,
          scaleDistribution: { type: "linear" },
          showPoints: "never",
          spanNulls: false,
          stacking: { group: "A", mode: "none" },
          thresholdsStyle: { mode: "off" },
        },
      },
      overrides: [],
    },
    options: {
      legend: { displayMode: "list", placement: "bottom", showLegend: true },
      tooltip: { mode: "multi", sort: "desc" },
    },
  }, description);
}

export function tablePanel(id, title, gridPos, rawSql, sortBy, description) {
  const options = {
    cellHeight: "sm",
    footer: { enablePagination: false, reducer: [], show: false },
    showHeader: true,
  };

  if (sortBy) {
    options.sortBy = [sortBy];
  }

  return withDescription({
    id,
    title,
    type: "table",
    datasource,
    gridPos,
    targets: [queryTarget(rawSql, "table")],
    fieldConfig: { defaults: {}, overrides: [] },
    options,
  }, description);
}

export function queryVariable(name, label, query, { includeAll = true, multi = true, allValue = allRegex } = {}) {
  return {
    allValue: includeAll ? allValue : undefined,
    current: { selected: false, text: includeAll ? "All" : "", value: includeAll ? allValue : "" },
    datasource,
    definition: query,
    hide: 0,
    includeAll,
    label,
    multi,
    name,
    options: [],
    query,
    refresh: 2,
    sort: 1,
    type: "query",
  };
}

export function sharedPackVariable() {
  return queryVariable(
    "pack",
    "Pack",
    'SELECT id::text AS __value, COALESCE(name, id)::text AS __text FROM "StrategyPack" WHERE status <> \'RETIRED\' ORDER BY 2',
  );
}

export function sharedConfigVersionVariable() {
  return queryVariable(
    "configVer",
    "Config Version",
    'SELECT DISTINCT config_version::text AS __text, config_version::text AS __value FROM "ConfigSnapshot" ORDER BY config_version::int DESC',
  );
}

export function textboxVariable(name, label) {
  return {
    current: { selected: false, text: "", value: "" },
    hide: 0,
    label,
    name,
    options: [],
    query: "",
    skipUrlSync: false,
    type: "textbox",
  };
}

export function dashboardLink(title, uid) {
  return {
    asDropdown: false,
    icon: "external link",
    includeVars: true,
    keepTime: true,
    tags: [],
    targetBlank: false,
    title,
    tooltip: "",
    type: "link",
    url: `/d/${uid}`,
  };
}

export function buildDashboard(kind, description, variables, panels, links) {
  const meta = dashboardMeta[kind];
  return {
    annotations: { list: [] },
    description,
    editable: false,
    fiscalYearStartMonth: 0,
    graphTooltip: 1,
    id: null,
    links,
    panels,
    refresh: meta.refresh,
    schemaVersion: 41,
    style: "dark",
    tags: ["bot-trading", meta.folder, kind],
    templating: { list: variables },
    time: { from: meta.from, to: "now" },
    timepicker: {},
    timezone: "browser",
    title: meta.title,
    uid: meta.uid,
    version: 1,
    weekStart: "monday",
  };
}
