import fs from "node:fs/promises";
import path from "node:path";

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const dashboardsDir = path.join(rootDir, "dashboards");

const datasource = { type: "postgres", uid: "trading-bot-postgres" };

const dashboardMeta = {
  executive: { uid: "bot-executive-scorecard", title: "Executive Scorecard", folder: "scorecards", refresh: "15m", from: "now-7d" },
  analyst: { uid: "bot-analyst-insights", title: "Analyst Insights Overview", folder: "analytics", refresh: "15m", from: "now-14d" },
  live: { uid: "bot-live-trade-monitor", title: "Live Trade Monitor", folder: "operations", refresh: "30s", from: "now-6h" },
  telemetry: { uid: "bot-telemetry-provider", title: "Telemetry & Provider Analytics", folder: "operations", refresh: "30s", from: "now-24h" },
  candidate: { uid: "bot-candidate-funnel", title: "Candidate & Funnel Analytics", folder: "analytics", refresh: "5m", from: "now-14d" },
  position: { uid: "bot-position-pnl", title: "Position & PnL Analytics", folder: "analytics", refresh: "5m", from: "now-14d" },
  config: { uid: "bot-config-impact", title: "Config Change Impact & RCA", folder: "analytics", refresh: "5m", from: "now-30d" },
  source: { uid: "bot-source-cohorts", title: "Source & Cohort Performance", folder: "analytics", refresh: "15m", from: "now-30d" },
  research: { uid: "bot-research-dry-run", title: "Research & Dry-Run Analysis", folder: "research", refresh: "15m", from: "now-30d" },
};

const allRef = "__all";
const varRef = (name) => `\${${name}}`;
const asSqlText = (value) => `'${value}'`;
const timeFilter = (column) => `${column} >= $__timeFrom() AND ${column} <= $__timeTo()`;
const dateTimeColumn = (column) => `${column}::timestamp`;
const filterEq = (column, name) => `(${asSqlText(varRef(name))} = '${allRef}' OR ${column} = ${asSqlText(varRef(name))})`;
const filterInt = (column, name) => `(${asSqlText(varRef(name))} = '${allRef}' OR ${column} = CAST(${asSqlText(varRef(name))} AS integer))`;
const filterText = (column, name) => `(${asSqlText(varRef(name))} = '' OR ${column} = ${asSqlText(varRef(name))})`;

function queryTarget(rawSql, format = "table", refId = "A") {
  return {
    datasource,
    editorMode: "code",
    format,
    rawQuery: true,
    rawSql,
    refId,
  };
}

function statPanel(id, title, gridPos, rawSql, unit = "none") {
  return {
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
  };
}

function timeseriesPanel(id, title, gridPos, rawSql, unit = "none") {
  return {
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
  };
}

function tablePanel(id, title, gridPos, rawSql, sortBy) {
  const options = {
    cellHeight: "sm",
    footer: { enablePagination: false, reducer: [], show: false },
    showHeader: true,
  };

  if (sortBy) {
    options.sortBy = [sortBy];
  }

  return {
    id,
    title,
    type: "table",
    datasource,
    gridPos,
    targets: [queryTarget(rawSql, "table")],
    fieldConfig: { defaults: {}, overrides: [] },
    options,
  };
}

function textPanel(id, title, gridPos, content) {
  return {
    id,
    title,
    type: "text",
    datasource: { type: "grafana", uid: "-- Grafana --" },
    gridPos,
    options: {
      content,
      mode: "markdown",
    },
  };
}

function queryVariable(name, label, query, { includeAll = true } = {}) {
  return {
    allValue: includeAll ? allRef : undefined,
    current: { selected: false, text: includeAll ? "All" : "", value: includeAll ? allRef : "" },
    datasource,
    definition: query,
    hide: 0,
    includeAll,
    label,
    multi: false,
    name,
    options: [],
    query,
    refresh: 2,
    sort: 1,
    type: "query",
  };
}

function textboxVariable(name, label) {
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

function dashboardLink(title, uid) {
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

function buildDashboard(kind, description, variables, panels, links) {
  const meta = dashboardMeta[kind];
  return {
    annotations: { list: [] },
    description,
    editable: false,
    fiscalYearStartMonth: 0,
    graphTooltip: 0,
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
    weekStart: "",
  };
}

function executiveDashboard() {
  const source = queryVariable("source", "Source", "SELECT DISTINCT source AS __text, source AS __value FROM v_source_outcome_daily ORDER BY 1");
  const config = queryVariable("configVersion", "Config Version", "SELECT config_version::text AS __text, config_version AS __value FROM v_config_change_log ORDER BY config_version DESC");
  const panels = [
    textPanel(1, "Purpose", { h: 4, w: 24, x: 0, y: 0 }, "Top-line health, productivity, and config sensitivity. If this looks good while the underlying analytics do not, the scorecard is lying."),
    statPanel(2, "Realized PnL", { h: 4, w: 6, x: 0, y: 4 }, `SELECT COALESCE(SUM(realized_pnl_usd), 0) AS value FROM v_fill_pnl_daily WHERE ${timeFilter(dateTimeColumn("session_date"))} AND ${filterEq("source", "source")} AND ${filterInt("config_version", "configVersion")}`, "currencyUSD"),
    statPanel(3, "Win Rate", { h: 4, w: 6, x: 6, y: 4 }, `SELECT COALESCE((SUM(wins)::numeric / NULLIF(SUM(wins + losses), 0)) * 100, 0) AS value FROM v_source_outcome_daily WHERE ${timeFilter(dateTimeColumn("session_date"))} AND ${filterEq("source", "source")} AND ${filterInt("config_version", "configVersion")}`, "percent"),
    statPanel(4, "Candidates Discovered", { h: 4, w: 6, x: 12, y: 4 }, `SELECT COALESCE(SUM(candidates_discovered), 0) AS value FROM v_source_outcome_daily WHERE ${timeFilter(dateTimeColumn("session_date"))} AND ${filterEq("source", "source")} AND ${filterInt("config_version", "configVersion")}`),
    statPanel(5, "Provider Error Rate", { h: 4, w: 6, x: 18, y: 4 }, `SELECT COALESCE((SUM(error_count)::numeric / NULLIF(SUM(total_calls), 0)) * 100, 0) AS value FROM v_api_provider_daily WHERE ${timeFilter(dateTimeColumn("session_date"))}`, "percent"),
    timeseriesPanel(6, "Daily Realized PnL", { h: 8, w: 12, x: 0, y: 8 }, `SELECT session_date::timestamp AS "time", source AS metric, realized_pnl_usd AS value FROM v_source_outcome_daily WHERE ${timeFilter(dateTimeColumn("session_date"))} AND ${filterEq("source", "source")} AND ${filterInt("config_version", "configVersion")} ORDER BY 1, 2`, "currencyUSD"),
    timeseriesPanel(7, "Daily Candidate Funnel", { h: 8, w: 12, x: 12, y: 8 }, `SELECT session_date::timestamp AS "time", status AS metric, candidate_count AS value FROM v_candidate_funnel_daily_source WHERE ${timeFilter(dateTimeColumn("session_date"))} AND ${filterEq("source", "source")} ORDER BY 1, 2`),
    tablePanel(8, "Source Outcome Leaderboard", { h: 8, w: 12, x: 0, y: 16 }, `SELECT session_date, source, candidates_discovered, candidates_accepted, positions_closed, wins, losses, realized_pnl_usd, acceptance_rate_pct FROM v_source_outcome_daily WHERE ${timeFilter(dateTimeColumn("session_date"))} AND ${filterEq("source", "source")} AND ${filterInt("config_version", "configVersion")} ORDER BY session_date DESC, realized_pnl_usd DESC LIMIT 50`),
    tablePanel(9, "Config Window KPI Delta", { h: 8, w: 12, x: 12, y: 16 }, `SELECT config_version, window_start_at, window_end_at, candidates_discovered, candidates_accepted, positions_opened, positions_closed, realized_pnl_usd, win_rate * 100 AS win_rate_pct, provider_units, provider_errors, acceptance_rate_pct, conversion_rate_pct FROM v_kpi_by_config_window ORDER BY config_version DESC LIMIT 20`),
  ];
  return buildDashboard("executive", "Executive scorecard for health, throughput, and config-aware trend review.", [source, config], panels, [
    dashboardLink("Live Trade Monitor", dashboardMeta.live.uid),
    dashboardLink("Telemetry & Provider Analytics", dashboardMeta.telemetry.uid),
    dashboardLink("Candidate & Funnel Analytics", dashboardMeta.candidate.uid),
    dashboardLink("Config Change Impact & RCA", dashboardMeta.config.uid),
  ]);
}

function analystDashboard() {
  const source = queryVariable("source", "Source", "SELECT DISTINCT source AS __text, source AS __value FROM v_source_outcome_daily ORDER BY 1");
  const provider = queryVariable("provider", "Provider", "SELECT DISTINCT provider AS __text, provider AS __value FROM v_api_provider_daily ORDER BY 1");
  const config = queryVariable("configVersion", "Config Version", "SELECT config_version::text AS __text, config_version AS __value FROM v_config_change_log ORDER BY config_version DESC");
  const daypart = queryVariable("daypart", "Daypart", "SELECT DISTINCT daypart AS __text, daypart AS __value FROM v_candidate_cohort_daily ORDER BY 1");
  const exitProfile = queryVariable("exitProfile", "Exit Profile", "SELECT DISTINCT exit_profile AS __text, exit_profile AS __value FROM v_position_cohort_daily ORDER BY 1");
  const securityRisk = queryVariable("securityRisk", "Security Risk", "SELECT DISTINCT security_risk AS __text, security_risk AS __value FROM v_candidate_cohort_daily ORDER BY 1");
  const panels = [
    textPanel(1, "Purpose", { h: 4, w: 24, x: 0, y: 0 }, "Cross-cutting pattern view. Cohorts, config windows, and provider behavior belong here because they change the conclusion, not because they look pretty in a heatmap."),
    statPanel(2, "Best Source PnL", { h: 4, w: 6, x: 0, y: 4 }, `SELECT COALESCE(MAX(realized_pnl_usd), 0) AS value FROM v_source_outcome_daily WHERE ${timeFilter(dateTimeColumn("session_date"))} AND ${filterEq("source", "source")} AND ${filterInt("config_version", "configVersion")}`, "currencyUSD"),
    statPanel(3, "Worst Reject Share", { h: 4, w: 6, x: 6, y: 4 }, `SELECT COALESCE(MAX(100 - acceptance_rate_pct), 0) AS value FROM v_source_outcome_daily WHERE ${timeFilter(dateTimeColumn("session_date"))} AND ${filterEq("source", "source")}`, "percent"),
    statPanel(4, "Provider Cost / Accepted", { h: 4, w: 6, x: 12, y: 4 }, `SELECT COALESCE(SUM(provider_units)::numeric / NULLIF(SUM(candidates_accepted), 0), 0) AS value FROM v_kpi_by_config_window`, "none"),
    statPanel(5, "Best Config Delta", { h: 4, w: 6, x: 18, y: 4 }, `SELECT COALESCE(MAX(realized_pnl_usd), 0) AS value FROM v_kpi_by_config_window`, "currencyUSD"),
    timeseriesPanel(6, "Source PnL Trend", { h: 8, w: 12, x: 0, y: 8 }, `SELECT session_date::timestamp AS "time", source AS metric, realized_pnl_usd AS value FROM v_source_outcome_daily WHERE ${timeFilter(dateTimeColumn("session_date"))} AND ${filterEq("source", "source")} AND ${filterInt("config_version", "configVersion")} ORDER BY 1, 2`, "currencyUSD"),
    timeseriesPanel(7, "Reject Share Trend", { h: 8, w: 12, x: 12, y: 8 }, `SELECT session_date::timestamp AS "time", source AS metric, (100 - acceptance_rate_pct) AS value FROM v_source_outcome_daily WHERE ${timeFilter(dateTimeColumn("session_date"))} AND ${filterEq("source", "source")} ORDER BY 1, 2`, "percent"),
    tablePanel(8, "Candidate Cohort Matrix", { h: 8, w: 12, x: 0, y: 16 }, `SELECT session_date, source, daypart, security_risk, liquidity_band, volume_band, candidate_count, accepted_count, bought_count, win_count, loss_count, realized_pnl_usd FROM v_candidate_cohort_daily WHERE ${timeFilter(dateTimeColumn("session_date"))} AND ${filterEq("source", "source")} AND ${filterEq("daypart", "daypart")} AND ${filterEq("security_risk", "securityRisk")} AND ${filterInt("config_version", "configVersion")} ORDER BY session_date DESC, realized_pnl_usd DESC LIMIT 60`),
    tablePanel(9, "Position Cohort Matrix", { h: 8, w: 12, x: 12, y: 16 }, `SELECT session_date, source, daypart, exit_profile, security_risk, outcome, position_count, avg_return_pct, avg_hold_minutes, win_rate * 100 AS win_rate_pct, realized_pnl_usd FROM v_position_cohort_daily WHERE ${timeFilter(dateTimeColumn("session_date"))} AND ${filterEq("source", "source")} AND ${filterEq("daypart", "daypart")} AND ${filterEq("exit_profile", "exitProfile")} AND ${filterEq("security_risk", "securityRisk")} AND ${filterInt("config_version", "configVersion")} ORDER BY session_date DESC, realized_pnl_usd DESC LIMIT 60`),
    tablePanel(10, "Provider Pressure by Endpoint", { h: 8, w: 24, x: 0, y: 24 }, `SELECT bucket_at, provider, endpoint, total_calls, total_units, avg_latency_ms, error_count FROM v_api_endpoint_hourly WHERE ${timeFilter("bucket_at")} AND ${filterEq("provider", "provider")} ORDER BY bucket_at DESC, total_units DESC LIMIT 80`),
  ];
  return buildDashboard("analyst", "Analyst-first cohort and config view across sources, providers, and outcome patterns.", [source, provider, config, daypart, exitProfile, securityRisk], panels, [
    dashboardLink("Source & Cohort Performance", dashboardMeta.source.uid),
    dashboardLink("Config Change Impact & RCA", dashboardMeta.config.uid),
    dashboardLink("Telemetry & Provider Analytics", dashboardMeta.telemetry.uid),
  ]);
}

function liveDashboard() {
  const mint = textboxVariable("mint", "Mint");
  const symbol = textboxVariable("symbol", "Symbol");
  const positionId = textboxVariable("positionId", "Position ID");
  const panels = [
    textPanel(1, "Purpose", { h: 4, w: 24, x: 0, y: 0 }, "What is open now, what just traded, and what needs intervention first. If this refreshes and still hides the dangerous row, that is a dashboard defect."),
    statPanel(2, "Open Positions", { h: 4, w: 5, x: 0, y: 4 }, `SELECT COALESCE(open_positions, 0) AS value FROM v_runtime_live_status`),
    statPanel(3, "Current Capital", { h: 4, w: 5, x: 5, y: 4 }, `SELECT COALESCE(capital_usd, 0) AS value FROM v_runtime_live_status`, "currencyUSD"),
    statPanel(4, "Current Cash", { h: 4, w: 5, x: 10, y: 4 }, `SELECT COALESCE(cash_usd, 0) AS value FROM v_runtime_live_status`, "currencyUSD"),
    statPanel(5, "Recent Fills", { h: 4, w: 5, x: 15, y: 4 }, `SELECT COALESCE(recent_fills, 0) AS value FROM v_runtime_live_status`),
    statPanel(6, "Stale Positions", { h: 4, w: 4, x: 20, y: 4 }, `SELECT COALESCE(stale_positions, 0) AS value FROM v_runtime_live_status`),
    tablePanel(7, "Open Position Monitor", { h: 10, w: 16, x: 0, y: 8 }, `SELECT position_id, mint, symbol, source, exit_profile, tp_stage, live_price_usd, stop_distance_pct, return_pct, stale_minutes, intervention_priority, intervention_band, liquidity_usd, volume_5m_usd, buy_sell_ratio FROM v_open_position_monitor WHERE ${filterText("mint", "mint")} AND ${filterText("symbol", "symbol")} AND ${filterText("position_id", "positionId")} ORDER BY intervention_priority DESC, stale_minutes DESC`),
    tablePanel(8, "Lane Health", { h: 10, w: 8, x: 16, y: 8 }, `SELECT lane, status, detail, trade_mode, pause_reason, last_run_at, age_minutes, stale_after_minutes FROM v_runtime_lane_health ORDER BY lane`),
    timeseriesPanel(9, "Recent Fill Activity", { h: 8, w: 12, x: 0, y: 18 }, `SELECT created_at AS "time", side AS metric, amount_usd AS value FROM v_recent_fill_activity WHERE ${timeFilter("created_at")} AND ${filterText("mint", "mint")} AND ${filterText("symbol", "symbol")} AND ${filterText("position_id", "positionId")} ORDER BY 1, 2`, "currencyUSD"),
    tablePanel(10, "Recent Fill Trail", { h: 8, w: 12, x: 12, y: 18 }, `SELECT created_at, side, position_id, mint, symbol, source, exit_profile, price_usd, amount_usd, pnl_usd, tx_signature FROM v_recent_fill_activity WHERE ${timeFilter("created_at")} AND ${filterText("mint", "mint")} AND ${filterText("symbol", "symbol")} AND ${filterText("position_id", "positionId")} ORDER BY created_at DESC LIMIT 100`),
  ];
  return buildDashboard("live", "Live risk, recent executions, and intervention priority.", [mint, symbol, positionId], panels, [
    dashboardLink("Position & PnL Analytics", dashboardMeta.position.uid),
    dashboardLink("Telemetry & Provider Analytics", dashboardMeta.telemetry.uid),
  ]);
}

function telemetryDashboard() {
  const provider = queryVariable("provider", "Provider", "SELECT DISTINCT provider AS __text, provider AS __value FROM v_api_provider_daily ORDER BY 1");
  const endpoint = queryVariable("endpoint", "Endpoint", "SELECT DISTINCT endpoint AS __text, endpoint AS __value FROM v_api_endpoint_efficiency ORDER BY 1");
  const panels = [
    textPanel(1, "Purpose", { h: 4, w: 24, x: 0, y: 0 }, "Provider health, cost, and payload failure RCA. If a panel needs ten Grafana transformations to explain one broken endpoint, the SQL is still wrong."),
    statPanel(2, "Total Calls", { h: 4, w: 5, x: 0, y: 4 }, `SELECT COALESCE(SUM(total_calls), 0) AS value FROM v_api_provider_hourly WHERE ${timeFilter("bucket_at")} AND ${filterEq("provider", "provider")}`),
    statPanel(3, "Total Units", { h: 4, w: 5, x: 5, y: 4 }, `SELECT COALESCE(SUM(total_units), 0) AS value FROM v_api_provider_hourly WHERE ${timeFilter("bucket_at")} AND ${filterEq("provider", "provider")}`),
    statPanel(4, "Error Rate", { h: 4, w: 5, x: 10, y: 4 }, `SELECT COALESCE((SUM(error_count)::numeric / NULLIF(SUM(total_calls), 0)) * 100, 0) AS value FROM v_api_provider_hourly WHERE ${timeFilter("bucket_at")} AND ${filterEq("provider", "provider")}`, "percent"),
    statPanel(5, "Avg Latency", { h: 4, w: 5, x: 15, y: 4 }, `SELECT COALESCE(SUM(avg_latency_ms * total_calls)::numeric / NULLIF(SUM(total_calls), 0), 0) AS value FROM v_api_provider_hourly WHERE ${timeFilter("bucket_at")} AND ${filterEq("provider", "provider")}`, "ms"),
    statPanel(6, "Payload Failures", { h: 4, w: 4, x: 20, y: 4 }, `SELECT COALESCE(SUM(failure_count), 0) AS value FROM v_payload_failure_hourly WHERE ${timeFilter("bucket_at")} AND ${filterEq("provider", "provider")} AND ${filterEq("endpoint", "endpoint")}`),
    timeseriesPanel(7, "Provider Calls & Errors", { h: 8, w: 12, x: 0, y: 8 }, `SELECT bucket_at AS "time", provider || ' calls' AS metric, total_calls AS value FROM v_api_provider_hourly WHERE ${timeFilter("bucket_at")} AND ${filterEq("provider", "provider")} UNION ALL SELECT bucket_at AS "time", provider || ' errors' AS metric, error_count AS value FROM v_api_provider_hourly WHERE ${timeFilter("bucket_at")} AND ${filterEq("provider", "provider")} ORDER BY 1, 2`),
    timeseriesPanel(8, "Endpoint Latency Trend", { h: 8, w: 12, x: 12, y: 8 }, `SELECT bucket_at AS "time", endpoint AS metric, avg_latency_ms AS value FROM v_api_endpoint_hourly WHERE ${timeFilter("bucket_at")} AND ${filterEq("provider", "provider")} AND ${filterEq("endpoint", "endpoint")} ORDER BY 1, 2`, "ms"),
    tablePanel(9, "Top Endpoint Burn", { h: 8, w: 12, x: 0, y: 16 }, `SELECT provider, endpoint, total_calls, total_units, avg_latency_ms, error_count, error_rate_pct, last_called_at FROM v_api_endpoint_efficiency WHERE ${filterEq("provider", "provider")} AND ${filterEq("endpoint", "endpoint")} ORDER BY total_units DESC, total_calls DESC LIMIT 50`),
    tablePanel(10, "Recent Failed Payloads", { h: 8, w: 12, x: 12, y: 16 }, `SELECT captured_at, provider, endpoint, status_code, error_family, entity_key, latency_ms, error_message FROM v_raw_api_payload_recent WHERE success = FALSE AND ${timeFilter("captured_at")} AND ${filterEq("provider", "provider")} AND ${filterEq("endpoint", "endpoint")} ORDER BY captured_at DESC LIMIT 100`),
    tablePanel(11, "Lane Health", { h: 8, w: 24, x: 0, y: 24 }, `SELECT lane, status, detail, last_run_at, age_minutes, stale_after_minutes, trade_mode, pause_reason FROM v_runtime_lane_health ORDER BY lane`),
  ];
  return buildDashboard("telemetry", "Provider burn, latency, and payload-failure RCA.", [provider, endpoint], panels, [
    dashboardLink("Config Change Impact & RCA", dashboardMeta.config.uid),
    dashboardLink("Live Trade Monitor", dashboardMeta.live.uid),
  ]);
}

function candidateDashboard() {
  const source = queryVariable("source", "Source", "SELECT DISTINCT source AS __text, source AS __value FROM v_candidate_decision_facts ORDER BY 1");
  const mint = textboxVariable("mint", "Mint");
  const symbol = textboxVariable("symbol", "Symbol");
  const candidateStatus = queryVariable("candidateStatus", "Candidate Status", "SELECT DISTINCT status AS __text, status AS __value FROM v_candidate_decision_facts ORDER BY 1");
  const rejectReason = queryVariable("rejectReason", "Reject Reason", "SELECT DISTINCT COALESCE(reject_reason, 'accepted_or_unknown') AS __text, COALESCE(reject_reason, 'accepted_or_unknown') AS __value FROM v_candidate_decision_facts ORDER BY 1");
  const trigger = queryVariable("trigger", "Trigger", "SELECT DISTINCT trigger AS __text, trigger AS __value FROM v_snapshot_trigger_daily ORDER BY 1");
  const securityRisk = queryVariable("securityRisk", "Security Risk", "SELECT DISTINCT security_risk AS __text, security_risk AS __value FROM v_candidate_decision_facts ORDER BY 1");
  const daypart = queryVariable("daypart", "Daypart", "SELECT DISTINCT daypart AS __text, daypart AS __value FROM v_candidate_decision_facts ORDER BY 1");
  const candidateScopeFilter = `${filterEq("source", "source")} AND ${filterEq("security_risk", "securityRisk")} AND ${filterEq("daypart", "daypart")} AND ${filterText("mint", "mint")} AND ${filterText("symbol", "symbol")}`;
  const panels = [
    textPanel(1, "Purpose", { h: 4, w: 24, x: 0, y: 0 }, "Discovery quality, decision quality, and raw evidence. This dashboard should answer why a token was blocked without sending you spelunking through arbitrary JSON."),
    statPanel(2, "Discovered", { h: 4, w: 4, x: 0, y: 4 }, `SELECT COUNT(candidate_id) AS value FROM v_candidate_decision_facts WHERE ${timeFilter("discovered_at")} AND ${candidateScopeFilter} AND ${filterEq("status", "candidateStatus")}`),
    statPanel(3, "Accepted", { h: 4, w: 4, x: 4, y: 4 }, `SELECT COUNT(candidate_id) AS value FROM v_candidate_decision_facts WHERE ${timeFilter("decision_at")} AND accepted = TRUE AND ${candidateScopeFilter}`),
    statPanel(4, "Rejected", { h: 4, w: 4, x: 8, y: 4 }, `SELECT COUNT(candidate_id) AS value FROM v_candidate_decision_facts WHERE ${timeFilter("decision_at")} AND status = 'REJECTED' AND ${candidateScopeFilter}`),
    statPanel(5, "Bought", { h: 4, w: 4, x: 12, y: 4 }, `SELECT COUNT(candidate_id) AS value FROM v_candidate_decision_facts WHERE ${timeFilter("decision_at")} AND bought = TRUE AND ${candidateScopeFilter}`),
    statPanel(6, "Avg Entry Score", { h: 4, w: 4, x: 16, y: 4 }, `SELECT COALESCE(AVG(entry_score), 0) AS value FROM v_candidate_decision_facts WHERE ${timeFilter("decision_at")} AND ${candidateScopeFilter}`, "none"),
    statPanel(7, "Downstream Wins", { h: 4, w: 4, x: 20, y: 4 }, `SELECT COUNT(candidate_id) AS value FROM v_candidate_decision_facts WHERE ${timeFilter("decision_at")} AND downstream_outcome = 'win' AND ${candidateScopeFilter}`),
    timeseriesPanel(8, "Funnel Trend by Source", { h: 8, w: 12, x: 0, y: 8 }, `SELECT DATE_TRUNC('day', decision_at)::timestamp AS "time", status AS metric, COUNT(candidate_id)::int AS value FROM v_candidate_decision_facts WHERE ${timeFilter("decision_at")} AND ${candidateScopeFilter} AND ${filterEq("status", "candidateStatus")} GROUP BY 1, 2 ORDER BY 1, 2`),
    timeseriesPanel(9, "Reject Reason Trend", { h: 8, w: 12, x: 12, y: 8 }, `SELECT DATE_TRUNC('day', decision_at)::timestamp AS "time", COALESCE(reject_reason, 'accepted_or_unknown') AS metric, COUNT(candidate_id)::int AS value FROM v_candidate_decision_facts WHERE ${timeFilter("decision_at")} AND ${candidateScopeFilter} AND ${filterEq("COALESCE(reject_reason, 'accepted_or_unknown')", "rejectReason")} GROUP BY 1, 2 ORDER BY 1, 2`),
    tablePanel(10, "Current Candidate Leaderboard", { h: 8, w: 12, x: 0, y: 16 }, `SELECT candidate_id, mint, symbol, source, status, reject_reason, entry_score, exit_profile, daypart, security_risk, liquidity_band, volume_band, downstream_outcome, realized_pnl_usd FROM v_candidate_decision_facts WHERE ${timeFilter("decision_at")} AND ${candidateScopeFilter} AND ${filterEq("status", "candidateStatus")} AND ${filterEq("COALESCE(reject_reason, 'accepted_or_unknown')", "rejectReason")} ORDER BY decision_at DESC LIMIT 100`),
    tablePanel(11, "Latest Filter State", { h: 8, w: 12, x: 12, y: 16 }, `SELECT mint, symbol, source, status, reject_reason, security_risk, liquidity_usd, volume_5m_usd, buy_sell_ratio, top10_holder_percent, largest_holder_percent, price_usd, market_cap_usd, last_snapshot_at FROM v_candidate_latest_filter_state WHERE ${filterEq("source", "source")} AND ${filterText("mint", "mint")} AND ${filterText("symbol", "symbol")} ORDER BY discovered_at DESC LIMIT 100`),
    tablePanel(12, "Snapshot Evidence", { h: 8, w: 12, x: 0, y: 24 }, `SELECT captured_at, mint, symbol, trigger, source, config_version, price_usd, liquidity_usd, volume_5m_usd, buy_sell_ratio, top10_holder_percent, security_risk FROM v_token_snapshot_enriched WHERE ${timeFilter("captured_at")} AND ${filterEq("source", "source")} AND ${filterText("mint", "mint")} AND ${filterText("symbol", "symbol")} AND ${filterEq("trigger", "trigger")} ORDER BY captured_at DESC LIMIT 100`),
    tablePanel(13, "Provider Payload Evidence", { h: 8, w: 12, x: 12, y: 24 }, `SELECT captured_at, provider, endpoint, status_code, error_family, entity_key, latency_ms, error_message FROM v_raw_api_payload_recent WHERE ${timeFilter("captured_at")} AND (${asSqlText(varRef("mint"))} = '' OR entity_key = ${asSqlText(varRef("mint"))}) ORDER BY captured_at DESC LIMIT 100`),
  ];
  return buildDashboard("candidate", "Candidate funnel, decision evidence, and downstream outcome trace.", [source, mint, symbol, candidateStatus, rejectReason, trigger, securityRisk, daypart], panels, [
    dashboardLink("Source & Cohort Performance", dashboardMeta.source.uid),
    dashboardLink("Config Change Impact & RCA", dashboardMeta.config.uid),
  ]);
}

function positionDashboard() {
  const source = queryVariable("source", "Source", "SELECT DISTINCT source AS __text, source AS __value FROM v_position_pnl_daily ORDER BY 1");
  const positionId = textboxVariable("positionId", "Position ID");
  const mint = textboxVariable("mint", "Mint");
  const symbol = textboxVariable("symbol", "Symbol");
  const exitReason = queryVariable("exitReason", "Exit Reason", "SELECT DISTINCT exit_reason AS __text, exit_reason AS __value FROM v_position_exit_reason_daily ORDER BY 1");
  const exitProfile = queryVariable("exitProfile", "Exit Profile", "SELECT DISTINCT exit_profile AS __text, exit_profile AS __value FROM v_position_pnl_daily ORDER BY 1");
  const config = queryVariable("configVersion", "Config Version", "SELECT config_version::text AS __text, config_version AS __value FROM v_config_change_log ORDER BY config_version DESC");
  const positionScopeFilter = `${filterEq("source", "source")} AND ${filterEq("exit_profile", "exitProfile")} AND ${filterInt("config_version", "configVersion")} AND ${filterText("id", "positionId")} AND ${filterText("mint", "mint")} AND ${filterText("symbol", "symbol")}`;
  const panels = [
    textPanel(1, "Purpose", { h: 4, w: 24, x: 0, y: 0 }, "Realized outcomes, execution trace, and position-level evidence. If a position loses and this dashboard can’t tell you whether it was config, source, or execution, it failed."),
    statPanel(2, "Realized PnL", { h: 4, w: 4, x: 0, y: 4 }, `SELECT COALESCE(SUM(realized_pnl_usd), 0) AS value FROM v_position_performance WHERE ${timeFilter("COALESCE(closed_at, opened_at)")} AND ${positionScopeFilter}`, "currencyUSD"),
    statPanel(3, "Win Rate", { h: 4, w: 4, x: 4, y: 4 }, `SELECT COALESCE((SUM(CASE WHEN status = 'CLOSED' AND realized_pnl_usd > 0 THEN 1 ELSE 0 END)::numeric / NULLIF(SUM(CASE WHEN status = 'CLOSED' THEN 1 ELSE 0 END), 0)) * 100, 0) AS value FROM v_position_performance WHERE ${timeFilter("COALESCE(closed_at, opened_at)")} AND ${positionScopeFilter}`, "percent"),
    statPanel(4, "Avg Hold Minutes", { h: 4, w: 4, x: 8, y: 4 }, `SELECT COALESCE(AVG(hold_minutes), 0) AS value FROM v_position_performance WHERE ${timeFilter("COALESCE(closed_at, opened_at)")} AND ${positionScopeFilter}`),
    statPanel(5, "Avg Return %", { h: 4, w: 4, x: 12, y: 4 }, `SELECT COALESCE(AVG(realized_pnl_pct), 0) AS value FROM v_position_performance WHERE ${timeFilter("COALESCE(closed_at, opened_at)")} AND ${positionScopeFilter}`, "percent"),
    statPanel(6, "Closed Positions", { h: 4, w: 4, x: 16, y: 4 }, `SELECT COUNT(*) AS value FROM v_position_performance WHERE ${timeFilter("COALESCE(closed_at, opened_at)")} AND status = 'CLOSED' AND ${positionScopeFilter}`),
    statPanel(7, "Open Positions", { h: 4, w: 4, x: 20, y: 4 }, `SELECT COALESCE(open_positions, 0) AS value FROM v_runtime_live_status`),
    timeseriesPanel(8, "Daily Realized PnL", { h: 8, w: 12, x: 0, y: 8 }, `SELECT session_date::timestamp AS "time", exit_profile AS metric, realized_pnl_usd AS value FROM v_position_pnl_daily WHERE ${timeFilter(dateTimeColumn("session_date"))} AND ${filterEq("source", "source")} AND ${filterEq("exit_profile", "exitProfile")} AND ${filterInt("config_version", "configVersion")} ORDER BY 1, 2`, "currencyUSD"),
    timeseriesPanel(9, "Exit Reason Trend", { h: 8, w: 12, x: 12, y: 8 }, `SELECT session_date::timestamp AS "time", exit_reason AS metric, position_count AS value FROM v_position_exit_reason_daily WHERE ${timeFilter(dateTimeColumn("session_date"))} AND ${filterEq("source", "source")} AND ${filterEq("exit_reason", "exitReason")} AND ${filterInt("config_version", "configVersion")} ORDER BY 1, 2`),
    tablePanel(10, "Position Performance", { h: 8, w: 12, x: 0, y: 16 }, `SELECT id, mint, symbol, source, config_version, exit_profile, status, exit_reason, opened_at, closed_at, amount_usd, gross_exit_usd, realized_pnl_usd, realized_pnl_pct, hold_minutes FROM v_position_performance WHERE ${timeFilter("COALESCE(closed_at, opened_at)")} AND ${positionScopeFilter} ORDER BY opened_at DESC LIMIT 100`),
    tablePanel(11, "Fill Trail", { h: 8, w: 12, x: 12, y: 16 }, `SELECT created_at, side, position_id, mint, symbol, source, config_version, exit_profile, price_usd, amount_usd, pnl_usd, tx_signature FROM v_recent_fill_activity WHERE ${timeFilter("created_at")} AND ${filterText("position_id", "positionId")} AND ${filterText("mint", "mint")} AND ${filterText("symbol", "symbol")} ORDER BY created_at DESC LIMIT 100`),
    tablePanel(12, "Snapshot Evidence", { h: 8, w: 24, x: 0, y: 24 }, `SELECT captured_at, mint, symbol, trigger, source, config_version, price_usd, liquidity_usd, volume_5m_usd, buy_sell_ratio, top10_holder_percent, security_risk, position_status, position_exit_reason FROM v_token_snapshot_enriched WHERE ${timeFilter("captured_at")} AND ${filterText("mint", "mint")} AND ${filterText("symbol", "symbol")} ORDER BY captured_at DESC LIMIT 100`),
  ];
  return buildDashboard("position", "Position outcomes, execution history, and raw trade evidence.", [source, positionId, mint, symbol, exitReason, exitProfile, config], panels, [
    dashboardLink("Config Change Impact & RCA", dashboardMeta.config.uid),
    dashboardLink("Source & Cohort Performance", dashboardMeta.source.uid),
  ]);
}

function configDashboard() {
  const config = queryVariable("configVersion", "Config Version", "SELECT config_version::text AS __text, config_version AS __value FROM v_config_change_log ORDER BY config_version DESC");
  const source = queryVariable("source", "Source", "SELECT DISTINCT source AS __text, source AS __value FROM v_source_outcome_daily ORDER BY 1");
  const exitProfile = queryVariable("exitProfile", "Exit Profile", "SELECT DISTINCT exit_profile AS __text, exit_profile AS __value FROM v_position_pnl_daily ORDER BY 1");
  const panels = [
    textPanel(1, "Purpose", { h: 4, w: 24, x: 0, y: 0 }, "Config versions, field-level diffs, and the KPI windows they produced. If the config changed and the only evidence is a singleton row, the model is broken."),
    statPanel(2, "Config Window PnL", { h: 4, w: 6, x: 0, y: 4 }, `SELECT COALESCE(realized_pnl_usd, 0) AS value FROM v_kpi_by_config_window WHERE ${filterInt("config_version", "configVersion")} ORDER BY config_version DESC LIMIT 1`, "currencyUSD"),
    statPanel(3, "Config Window Win Rate", { h: 4, w: 6, x: 6, y: 4 }, `SELECT COALESCE(win_rate * 100, 0) AS value FROM v_kpi_by_config_window WHERE ${filterInt("config_version", "configVersion")} ORDER BY config_version DESC LIMIT 1`, "percent"),
    statPanel(4, "Provider Burn", { h: 4, w: 6, x: 12, y: 4 }, `SELECT COALESCE(provider_units, 0) AS value FROM v_kpi_by_config_window WHERE ${filterInt("config_version", "configVersion")} ORDER BY config_version DESC LIMIT 1`),
    statPanel(5, "Acceptance Rate", { h: 4, w: 6, x: 18, y: 4 }, `SELECT COALESCE(acceptance_rate_pct, 0) AS value FROM v_kpi_by_config_window WHERE ${filterInt("config_version", "configVersion")} ORDER BY config_version DESC LIMIT 1`, "percent"),
    timeseriesPanel(6, "PnL by Config Window", { h: 8, w: 12, x: 0, y: 8 }, `SELECT window_start_at AS "time", 'config ' || config_version::text AS metric, realized_pnl_usd AS value FROM v_kpi_by_config_window ORDER BY 1, 2`, "currencyUSD"),
    timeseriesPanel(7, "Acceptance Rate by Config Window", { h: 8, w: 12, x: 12, y: 8 }, `SELECT window_start_at AS "time", 'config ' || config_version::text AS metric, acceptance_rate_pct AS value FROM v_kpi_by_config_window ORDER BY 1, 2`, "percent"),
    tablePanel(8, "Config Change Log", { h: 8, w: 12, x: 0, y: 16 }, `SELECT config_version, previous_config_version, activated_at, next_activated_at, applied_by, changed_path_count, live_affecting_path_count, trade_mode, capital_usd, position_size_usd, min_liquidity_usd, min_volume_5m_usd, stop_loss_percent, tp1_multiplier, tp2_multiplier FROM v_config_change_log ORDER BY config_version DESC LIMIT 50`),
    tablePanel(9, "Field-Level Change Trace", { h: 8, w: 12, x: 12, y: 16 }, `SELECT config_version, activated_at, field_path, previous_value, current_value FROM v_config_field_change WHERE ${filterInt("config_version", "configVersion")} ORDER BY config_version DESC, field_path ASC LIMIT 200`),
    tablePanel(10, "Source / Exit Profile Delta", { h: 8, w: 24, x: 0, y: 24 }, `SELECT p.session_date, p.source, p.exit_profile, p.config_version, p.position_count, p.closed_count, p.realized_pnl_usd, p.avg_return_pct, p.win_rate * 100 AS win_rate_pct FROM v_position_pnl_daily p WHERE ${timeFilter(dateTimeColumn("session_date"))} AND ${filterEq("source", "source")} AND ${filterEq("exit_profile", "exitProfile")} AND ${filterInt("config_version", "configVersion")} ORDER BY p.session_date DESC, p.realized_pnl_usd DESC LIMIT 80`),
  ];
  return buildDashboard("config", "Config history, field-level diffs, and KPI windows.", [config, source, exitProfile], panels, [
    dashboardLink("Candidate & Funnel Analytics", dashboardMeta.candidate.uid),
    dashboardLink("Position & PnL Analytics", dashboardMeta.position.uid),
    dashboardLink("Telemetry & Provider Analytics", dashboardMeta.telemetry.uid),
  ]);
}

function sourceDashboard() {
  const source = queryVariable("source", "Source", "SELECT DISTINCT source AS __text, source AS __value FROM v_source_outcome_daily ORDER BY 1");
  const daypart = queryVariable("daypart", "Daypart", "SELECT DISTINCT daypart AS __text, daypart AS __value FROM v_candidate_cohort_daily ORDER BY 1");
  const securityRisk = queryVariable("securityRisk", "Security Risk", "SELECT DISTINCT security_risk AS __text, security_risk AS __value FROM v_candidate_cohort_daily ORDER BY 1");
  const exitProfile = queryVariable("exitProfile", "Exit Profile", "SELECT DISTINCT exit_profile AS __text, exit_profile AS __value FROM v_position_cohort_daily ORDER BY 1");
  const config = queryVariable("configVersion", "Config Version", "SELECT config_version::text AS __text, config_version AS __value FROM v_config_change_log ORDER BY config_version DESC");
  const panels = [
    textPanel(1, "Purpose", { h: 4, w: 24, x: 0, y: 0 }, "Which sources and cohorts generate trades worth keeping versus expensive noise worth killing."),
    statPanel(2, "Best Source PnL", { h: 4, w: 6, x: 0, y: 4 }, `SELECT COALESCE(MAX(realized_pnl_usd), 0) AS value FROM v_source_outcome_daily WHERE ${timeFilter(dateTimeColumn("session_date"))} AND ${filterInt("config_version", "configVersion")}`, "currencyUSD"),
    statPanel(3, "Worst Source PnL", { h: 4, w: 6, x: 6, y: 4 }, `SELECT COALESCE(MIN(realized_pnl_usd), 0) AS value FROM v_source_outcome_daily WHERE ${timeFilter(dateTimeColumn("session_date"))} AND ${filterInt("config_version", "configVersion")}`, "currencyUSD"),
    statPanel(4, "Best Cohort Return", { h: 4, w: 6, x: 12, y: 4 }, `SELECT COALESCE(MAX(avg_return_pct), 0) AS value FROM v_position_cohort_daily WHERE ${timeFilter(dateTimeColumn("session_date"))} AND ${filterInt("config_version", "configVersion")}`, "percent"),
    statPanel(5, "Worst Cohort Return", { h: 4, w: 6, x: 18, y: 4 }, `SELECT COALESCE(MIN(avg_return_pct), 0) AS value FROM v_position_cohort_daily WHERE ${timeFilter(dateTimeColumn("session_date"))} AND ${filterInt("config_version", "configVersion")}`, "percent"),
    timeseriesPanel(6, "Source PnL Trend", { h: 8, w: 12, x: 0, y: 8 }, `SELECT session_date::timestamp AS "time", source AS metric, realized_pnl_usd AS value FROM v_source_outcome_daily WHERE ${timeFilter(dateTimeColumn("session_date"))} AND ${filterEq("source", "source")} AND ${filterInt("config_version", "configVersion")} ORDER BY 1, 2`, "currencyUSD"),
    timeseriesPanel(7, "Source Acceptance Trend", { h: 8, w: 12, x: 12, y: 8 }, `SELECT session_date::timestamp AS "time", source AS metric, acceptance_rate_pct AS value FROM v_source_outcome_daily WHERE ${timeFilter(dateTimeColumn("session_date"))} AND ${filterEq("source", "source")} AND ${filterInt("config_version", "configVersion")} ORDER BY 1, 2`, "percent"),
    tablePanel(8, "Candidate Cohort Leaderboard", { h: 8, w: 12, x: 0, y: 16 }, `SELECT session_date, source, config_version, daypart, security_risk, liquidity_band, volume_band, candidate_count, accepted_count, bought_count, avg_entry_score, win_count, loss_count, realized_pnl_usd FROM v_candidate_cohort_daily WHERE ${timeFilter(dateTimeColumn("session_date"))} AND ${filterEq("source", "source")} AND ${filterEq("daypart", "daypart")} AND ${filterEq("security_risk", "securityRisk")} AND ${filterInt("config_version", "configVersion")} ORDER BY session_date DESC, realized_pnl_usd DESC LIMIT 80`),
    tablePanel(9, "Position Cohort Leaderboard", { h: 8, w: 12, x: 12, y: 16 }, `SELECT session_date, source, config_version, daypart, exit_profile, security_risk, outcome, position_count, avg_return_pct, avg_hold_minutes, win_rate * 100 AS win_rate_pct, realized_pnl_usd FROM v_position_cohort_daily WHERE ${timeFilter(dateTimeColumn("session_date"))} AND ${filterEq("source", "source")} AND ${filterEq("daypart", "daypart")} AND ${filterEq("exit_profile", "exitProfile")} AND ${filterEq("security_risk", "securityRisk")} AND ${filterInt("config_version", "configVersion")} ORDER BY session_date DESC, realized_pnl_usd DESC LIMIT 80`),
  ];
  return buildDashboard("source", "Source-level and cohort-level performance review.", [source, daypart, securityRisk, exitProfile, config], panels, [
    dashboardLink("Analyst Insights Overview", dashboardMeta.analyst.uid),
    dashboardLink("Candidate & Funnel Analytics", dashboardMeta.candidate.uid),
    dashboardLink("Position & PnL Analytics", dashboardMeta.position.uid),
  ]);
}

function researchDashboard() {
  const runId = textboxVariable("runId", "Research Run ID");
  const source = queryVariable("source", "Source", `SELECT DISTINCT source AS __text, source AS __value FROM "ResearchToken" ORDER BY 1`);
  const panels = [
    textPanel(1, "Purpose", { h: 4, w: 24, x: 0, y: 0 }, "Bounded dry-run review. Research should be auditable enough to compare sessions without pretending the mock lane is the live lane."),
    statPanel(2, "Latest Run PnL", { h: 4, w: 6, x: 0, y: 4 }, `SELECT COALESCE("realizedPnlUsd", 0)::numeric AS value FROM "ResearchRun" WHERE status = 'COMPLETED' AND ${timeFilter('"startedAt"')} ORDER BY "startedAt" DESC LIMIT 1`, "currencyUSD"),
    statPanel(3, "Latest Win Rate", { h: 4, w: 6, x: 6, y: 4 }, `SELECT COALESCE("winRatePercent", 0)::numeric AS value FROM "ResearchRun" WHERE status = 'COMPLETED' AND ${timeFilter('"startedAt"')} ORDER BY "startedAt" DESC LIMIT 1`, "percent"),
    statPanel(4, "Latest Discovered", { h: 4, w: 6, x: 12, y: 4 }, `SELECT COALESCE("totalDiscovered", 0) AS value FROM "ResearchRun" WHERE ${timeFilter('"startedAt"')} ORDER BY "startedAt" DESC LIMIT 1`),
    statPanel(5, "Strategy Passed", { h: 4, w: 6, x: 18, y: 4 }, `SELECT COALESCE("totalStrategyPassed", 0) AS value FROM "ResearchRun" WHERE ${timeFilter('"startedAt"')} ORDER BY "startedAt" DESC LIMIT 1`),
    tablePanel(6, "Run History", { h: 8, w: 24, x: 0, y: 8 }, `SELECT id, status, "startedAt" AS started_at, "completedAt" AS completed_at, "totalDiscovered" AS total_discovered, "totalStrategyPassed" AS total_strategy_passed, "totalMockOpened" AS total_mock_opened, "totalMockClosed" AS total_mock_closed, "realizedPnlUsd"::numeric AS realized_pnl_usd, "winRatePercent"::numeric AS win_rate_percent, "averageHoldMinutes"::numeric AS average_hold_minutes FROM "ResearchRun" WHERE ${timeFilter('"startedAt"')} AND (${asSqlText(varRef("runId"))} = '' OR id = ${asSqlText(varRef("runId"))}) ORDER BY "startedAt" DESC LIMIT 50`),
    tablePanel(7, "Research Token Funnel", { h: 8, w: 12, x: 0, y: 16 }, `SELECT rt."runId" AS run_id, rt.mint, rt.symbol, rt.source, rt.shortlisted, rt."fullEvaluationDone" AS full_evaluation_done, rt."strategyPassed" AS strategy_passed, rt."strategyRejectReason" AS strategy_reject_reason, rt."evaluationDeferReason" AS evaluation_defer_reason, rt."liveTradable" AS live_tradable, rt."researchTradable" AS research_tradable, rt."entryScore"::numeric AS entry_score, rt."exitProfile" AS exit_profile FROM "ResearchToken" rt WHERE (${asSqlText(varRef("runId"))} = '' OR rt."runId" = ${asSqlText(varRef("runId"))}) AND (${asSqlText(varRef("source"))} = '${allRef}' OR rt.source = ${asSqlText(varRef("source"))}) ORDER BY rt."createdAt" DESC LIMIT 100`),
    tablePanel(8, "Research Position Outcomes", { h: 8, w: 12, x: 12, y: 16 }, `SELECT rp."runId" AS run_id, rp.id AS position_id, rp.mint, rp.symbol, rp.status, rp."openedAt" AS opened_at, rp."closedAt" AS closed_at, rp."entryPriceUsd"::numeric AS entry_price_usd, rp."currentPriceUsd"::numeric AS current_price_usd, rp."amountUsd"::numeric AS amount_usd, rp."remainingToken"::numeric AS remaining_token, rp."exitReason" AS exit_reason FROM "ResearchPosition" rp WHERE (${asSqlText(varRef("runId"))} = '' OR rp."runId" = ${asSqlText(varRef("runId"))}) ORDER BY rp."openedAt" DESC LIMIT 100`),
    tablePanel(9, "Research Fill Trail", { h: 8, w: 24, x: 0, y: 24 }, `SELECT rf."createdAt" AS created_at, rp."runId" AS run_id, rp.id AS position_id, rp.mint, rp.symbol, rf.side, rf."priceUsd"::numeric AS price_usd, rf."amountUsd"::numeric AS amount_usd, rf."pnlUsd"::numeric AS pnl_usd FROM "ResearchFill" rf JOIN "ResearchPosition" rp ON rp.id = rf."positionId" WHERE (${asSqlText(varRef("runId"))} = '' OR rp."runId" = ${asSqlText(varRef("runId"))}) ORDER BY rf."createdAt" DESC LIMIT 100`),
  ];
  return buildDashboard("research", "Research dry-run summaries, token funnel, and mock position outcomes.", [runId, source], panels, [
    dashboardLink("Executive Scorecard", dashboardMeta.executive.uid),
    dashboardLink("Analyst Insights Overview", dashboardMeta.analyst.uid),
  ]);
}

const dashboards = [
  executiveDashboard(),
  analystDashboard(),
  liveDashboard(),
  telemetryDashboard(),
  candidateDashboard(),
  positionDashboard(),
  configDashboard(),
  sourceDashboard(),
  researchDashboard(),
];

for (const dashboard of dashboards) {
  const meta = Object.values(dashboardMeta).find((entry) => entry.uid === dashboard.uid);
  if (!meta) {
    throw new Error(`missing folder for dashboard ${dashboard.uid}`);
  }
  const filePath = path.join(dashboardsDir, meta.folder, `${dashboard.uid}.json`);
  await fs.writeFile(filePath, `${JSON.stringify(dashboard, null, 2)}\n`, "utf8");
}

console.log(`Wrote ${dashboards.length} Grafana dashboards to ${dashboardsDir}`);
