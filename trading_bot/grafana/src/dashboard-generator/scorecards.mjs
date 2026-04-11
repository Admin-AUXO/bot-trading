import {
  buildDashboard,
  dashboardLink,
  dashboardMeta,
  dateTimeColumn,
  filterRegex,
  queryVariable,
  statPanel,
  tablePanel,
  timeFilter,
  timeseriesPanel,
} from "./core.mjs";

export function executiveDashboard() {
  const source = queryVariable("source", "Source", "SELECT DISTINCT source AS __text, source AS __value FROM v_source_outcome_daily ORDER BY 1");
  const config = queryVariable("configVersion", "Config Version", "SELECT config_version::text AS __text, config_version AS __value FROM v_config_change_log ORDER BY config_version DESC");
  const panels = [
    statPanel(1, "Realized PnL", { h: 4, w: 6, x: 0, y: 0 }, `SELECT COALESCE(SUM(realized_pnl_usd), 0) AS value FROM v_fill_pnl_daily WHERE ${timeFilter(dateTimeColumn("session_date"))} AND ${filterRegex("source", "source")} AND ${filterRegex("config_version", "configVersion")}`, "currencyUSD", "Top-line realized PnL for the selected sources and config windows."),
    statPanel(2, "Win Rate", { h: 4, w: 6, x: 6, y: 0 }, `SELECT COALESCE((SUM(wins)::numeric / NULLIF(SUM(wins + losses), 0)) * 100, 0) AS value FROM v_source_outcome_daily WHERE ${timeFilter(dateTimeColumn("session_date"))} AND ${filterRegex("source", "source")} AND ${filterRegex("config_version", "configVersion")}`, "percent", "Weighted closed-position win rate across the selected scope."),
    statPanel(3, "Acceptance Rate", { h: 4, w: 6, x: 12, y: 0 }, `SELECT COALESCE((SUM(candidates_accepted)::numeric / NULLIF(SUM(candidates_discovered), 0)) * 100, 0) AS value FROM v_source_outcome_daily WHERE ${timeFilter(dateTimeColumn("session_date"))} AND ${filterRegex("source", "source")} AND ${filterRegex("config_version", "configVersion")}`, "percent", "How much discovered flow survives filtering into accepted candidates."),
    statPanel(4, "Provider Error Rate", { h: 4, w: 6, x: 18, y: 0 }, `SELECT COALESCE((SUM(error_count)::numeric / NULLIF(SUM(total_calls), 0)) * 100, 0) AS value FROM v_api_provider_daily WHERE ${timeFilter(dateTimeColumn("session_date"))}`, "percent", "Weighted provider error rate across the selected time range."),
    timeseriesPanel(5, "Daily Realized PnL", { h: 8, w: 12, x: 0, y: 4 }, `SELECT session_date::timestamp AS "time", source AS metric, realized_pnl_usd AS value FROM v_source_outcome_daily WHERE ${timeFilter(dateTimeColumn("session_date"))} AND ${filterRegex("source", "source")} AND ${filterRegex("config_version", "configVersion")} ORDER BY 1, 2`, "currencyUSD", "PnL trend broken out by source for the selected config windows."),
    timeseriesPanel(6, "Daily Candidate Funnel", { h: 8, w: 12, x: 12, y: 4 }, `SELECT session_date::timestamp AS "time", status AS metric, candidate_count AS value FROM v_candidate_funnel_daily_source WHERE ${timeFilter(dateTimeColumn("session_date"))} AND ${filterRegex("source", "source")} ORDER BY 1, 2`, "none", "Daily funnel movement by status so throughput problems are visible next to outcomes."),
    tablePanel(7, "Source Outcome Leaderboard", { h: 8, w: 12, x: 0, y: 12 }, `SELECT session_date, source, candidates_discovered, candidates_accepted, positions_closed, wins, losses, realized_pnl_usd, acceptance_rate_pct FROM v_source_outcome_daily WHERE ${timeFilter(dateTimeColumn("session_date"))} AND ${filterRegex("source", "source")} AND ${filterRegex("config_version", "configVersion")} ORDER BY session_date DESC, realized_pnl_usd DESC LIMIT 50`, undefined, "Daily source leaderboard for quick comparison of throughput and realized outcome."),
    tablePanel(8, "Config Window KPI Delta", { h: 8, w: 12, x: 12, y: 12 }, `SELECT config_version, window_start_at, window_end_at, candidates_discovered, candidates_accepted, positions_opened, positions_closed, realized_pnl_usd, win_rate * 100 AS win_rate_pct, provider_units, provider_errors, acceptance_rate_pct, conversion_rate_pct FROM v_kpi_by_config_window WHERE ${filterRegex("config_version", "configVersion")} ORDER BY config_version DESC LIMIT 20`, undefined, "Config-window rollup to compare the operating footprint of each version."),
  ];

  return buildDashboard("executive", "Executive scorecard for health, throughput, and config-aware trend review.", [source, config], panels, [
    dashboardLink("Live Trade Monitor", dashboardMeta.live.uid),
    dashboardLink("Telemetry & Provider Analytics", dashboardMeta.telemetry.uid),
    dashboardLink("Candidate & Funnel Analytics", dashboardMeta.candidate.uid),
    dashboardLink("Config Change Impact & RCA", dashboardMeta.config.uid),
  ]);
}
