import {
  buildDashboard,
  dashboardLink,
  dashboardMeta,
  filterContains,
  filterRegex,
  queryVariable,
  statPanel,
  tablePanel,
  textboxVariable,
  timeFilter,
  timeseriesPanel,
} from "./core.mjs";

export function liveDashboard() {
  const source = queryVariable("source", "Source", "SELECT DISTINCT source AS __text, source AS __value FROM v_open_position_monitor ORDER BY 1");
  const interventionBand = queryVariable("interventionBand", "Intervention Band", "SELECT DISTINCT intervention_band AS __text, intervention_band AS __value FROM v_open_position_monitor ORDER BY 1");
  const mint = textboxVariable("mint", "Mint");
  const symbol = textboxVariable("symbol", "Symbol");
  const positionId = textboxVariable("positionId", "Position ID");
  const panels = [
    statPanel(1, "Open Positions", { h: 4, w: 5, x: 0, y: 0 }, `SELECT COALESCE(open_positions, 0) AS value FROM v_runtime_live_status`, "none", "Current open-position count from the live runtime snapshot."),
    statPanel(2, "Exposure %", { h: 4, w: 5, x: 5, y: 0 }, `SELECT COALESCE(((capital_usd - cash_usd)::numeric / NULLIF(capital_usd, 0)) * 100, 0) AS value FROM v_runtime_live_status`, "percent", "Current deployed capital as a percentage of total capital."),
    statPanel(3, "Cash On Hand", { h: 4, w: 5, x: 10, y: 0 }, `SELECT COALESCE(cash_usd, 0) AS value FROM v_runtime_live_status`, "currencyUSD", "Current available cash in the trading runtime."),
    statPanel(4, "Recent Fills", { h: 4, w: 5, x: 15, y: 0 }, `SELECT COALESCE(recent_fills, 0) AS value FROM v_runtime_live_status`, "none", "Recently landed fills in the current live-monitor window."),
    statPanel(5, "Stale Positions", { h: 4, w: 4, x: 20, y: 0 }, `SELECT COALESCE(stale_positions, 0) AS value FROM v_runtime_live_status`, "none", "Open positions missing fresh supporting evidence and likely needing intervention."),
    tablePanel(6, "Open Position Monitor", { h: 10, w: 16, x: 0, y: 4 }, `SELECT position_id, mint, symbol, source, exit_profile, tp_stage, live_price_usd, stop_distance_pct, return_pct, stale_minutes, intervention_priority, intervention_band, liquidity_usd, volume_5m_usd, buy_sell_ratio FROM v_open_position_monitor WHERE ${filterRegex("source", "source")} AND ${filterRegex("intervention_band", "interventionBand")} AND ${filterContains("mint", "mint")} AND ${filterContains("symbol", "symbol")} AND ${filterContains("position_id", "positionId")} ORDER BY intervention_priority DESC, stale_minutes DESC`, undefined, "Priority-ranked open-book table for intervention-first monitoring."),
    tablePanel(7, "Lane Health", { h: 10, w: 8, x: 16, y: 4 }, `SELECT lane, status, detail, trade_mode, pause_reason, last_run_at, age_minutes, stale_after_minutes FROM v_runtime_lane_health ORDER BY lane`, undefined, "Current lane staleness and pause context from the runtime health contract."),
    timeseriesPanel(8, "Recent Fill Activity", { h: 8, w: 12, x: 0, y: 14 }, `SELECT created_at AS "time", side AS metric, amount_usd AS value FROM v_recent_fill_activity WHERE ${timeFilter("created_at")} AND ${filterRegex("source", "source")} AND ${filterContains("mint", "mint")} AND ${filterContains("symbol", "symbol")} AND ${filterContains("position_id", "positionId")} ORDER BY 1, 2`, "currencyUSD", "Recent notional by fill side for the selected scope."),
    tablePanel(9, "Recent Fill Trail", { h: 8, w: 12, x: 12, y: 14 }, `SELECT created_at, side, position_id, mint, symbol, source, exit_profile, price_usd, amount_usd, pnl_usd, tx_signature FROM v_recent_fill_activity WHERE ${timeFilter("created_at")} AND ${filterRegex("source", "source")} AND ${filterContains("mint", "mint")} AND ${filterContains("symbol", "symbol")} AND ${filterContains("position_id", "positionId")} ORDER BY created_at DESC LIMIT 100`, undefined, "Recent execution trail for the currently selected book slice."),
  ];

  return buildDashboard("live", "Live risk, recent executions, and intervention priority.", [source, interventionBand, mint, symbol, positionId], panels, [
    dashboardLink("Position & PnL Analytics", dashboardMeta.position.uid),
    dashboardLink("Telemetry & Provider Analytics", dashboardMeta.telemetry.uid),
    dashboardLink("Executive Scorecard", dashboardMeta.executive.uid),
  ]);
}

export function telemetryDashboard() {
  const provider = queryVariable("provider", "Provider", "SELECT DISTINCT provider AS __text, provider AS __value FROM v_api_provider_daily ORDER BY 1");
  const endpoint = queryVariable("endpoint", "Endpoint", `SELECT DISTINCT endpoint AS __text, endpoint AS __value FROM v_api_endpoint_efficiency WHERE ${filterRegex("provider", "provider")} ORDER BY 1`);
  const errorFamily = queryVariable("errorFamily", "Error Family", `SELECT DISTINCT COALESCE(error_family, 'unknown') AS __text, COALESCE(error_family, 'unknown') AS __value FROM v_raw_api_payload_recent WHERE success = FALSE AND ${filterRegex("provider", "provider")} AND ${filterRegex("endpoint", "endpoint")} ORDER BY 1`);
  const panels = [
    statPanel(1, "Total Units", { h: 4, w: 5, x: 0, y: 0 }, `SELECT COALESCE(SUM(total_units), 0) AS value FROM v_api_provider_hourly WHERE ${timeFilter("bucket_at")} AND ${filterRegex("provider", "provider")}`, "none", "Provider-unit burn across the selected time range."),
    statPanel(2, "Error Rate", { h: 4, w: 5, x: 5, y: 0 }, `SELECT COALESCE((SUM(error_count)::numeric / NULLIF(SUM(total_calls), 0)) * 100, 0) AS value FROM v_api_provider_hourly WHERE ${timeFilter("bucket_at")} AND ${filterRegex("provider", "provider")}`, "percent", "Weighted provider error rate across the selected slice."),
    statPanel(3, "Avg Latency", { h: 4, w: 5, x: 10, y: 0 }, `SELECT COALESCE(SUM(avg_latency_ms * total_calls)::numeric / NULLIF(SUM(total_calls), 0), 0) AS value FROM v_api_provider_hourly WHERE ${timeFilter("bucket_at")} AND ${filterRegex("provider", "provider")}`, "ms", "Weighted latency across provider calls in the current scope."),
    statPanel(4, "Payload Failures", { h: 4, w: 5, x: 15, y: 0 }, `SELECT COALESCE(SUM(failure_count), 0) AS value FROM v_payload_failure_hourly WHERE ${timeFilter("bucket_at")} AND ${filterRegex("provider", "provider")} AND ${filterRegex("endpoint", "endpoint")}`, "none", "Count of failed payload captures in the selected provider and endpoint slice."),
    statPanel(5, "Affected Endpoints", { h: 4, w: 4, x: 20, y: 0 }, `SELECT COUNT(*) AS value FROM v_api_endpoint_efficiency WHERE ${filterRegex("provider", "provider")} AND ${filterRegex("endpoint", "endpoint")} AND error_count > 0`, "none", "Endpoints with non-zero error counts in the selected scope."),
    timeseriesPanel(6, "Provider Error Trend", { h: 8, w: 12, x: 0, y: 4 }, `SELECT bucket_at AS "time", provider AS metric, error_count AS value FROM v_api_provider_hourly WHERE ${timeFilter("bucket_at")} AND ${filterRegex("provider", "provider")} ORDER BY 1, 2`, "none", "Hourly provider error counts for symptom correlation and RCA."),
    timeseriesPanel(7, "Endpoint Latency Trend", { h: 8, w: 12, x: 12, y: 4 }, `SELECT bucket_at AS "time", endpoint AS metric, avg_latency_ms AS value FROM v_api_endpoint_hourly WHERE ${timeFilter("bucket_at")} AND ${filterRegex("provider", "provider")} AND ${filterRegex("endpoint", "endpoint")} ORDER BY 1, 2`, "ms", "Endpoint latency trend to separate cost spikes from slow-path failures."),
    tablePanel(8, "Endpoint Efficiency", { h: 8, w: 12, x: 0, y: 12 }, `SELECT provider, endpoint, total_calls, total_units, avg_latency_ms, error_count, error_rate_pct, last_called_at FROM v_api_endpoint_efficiency WHERE ${filterRegex("provider", "provider")} AND ${filterRegex("endpoint", "endpoint")} ORDER BY total_units DESC, total_calls DESC LIMIT 50`, undefined, "Current endpoint burn and reliability leaderboard."),
    tablePanel(9, "Recent Failed Payloads", { h: 8, w: 12, x: 12, y: 12 }, `SELECT captured_at, provider, endpoint, status_code, error_family, entity_key, latency_ms, error_message FROM v_raw_api_payload_recent WHERE success = FALSE AND ${timeFilter("captured_at")} AND ${filterRegex("provider", "provider")} AND ${filterRegex("endpoint", "endpoint")} AND ${filterRegex("COALESCE(error_family, 'unknown')", "errorFamily")} ORDER BY captured_at DESC LIMIT 100`, undefined, "Raw failure evidence for the selected provider, endpoint, and error family."),
    tablePanel(10, "Lane Health", { h: 8, w: 24, x: 0, y: 20 }, `SELECT lane, status, detail, last_run_at, age_minutes, stale_after_minutes, trade_mode, pause_reason FROM v_runtime_lane_health ORDER BY lane`, undefined, "Runtime lane health beside provider failures so infra and app-side degradation stay correlated."),
  ];

  return buildDashboard("telemetry", "Provider burn, latency, and payload-failure RCA.", [provider, endpoint, errorFamily], panels, [
    dashboardLink("Config Change Impact & RCA", dashboardMeta.config.uid),
    dashboardLink("Live Trade Monitor", dashboardMeta.live.uid),
    dashboardLink("Executive Scorecard", dashboardMeta.executive.uid),
  ]);
}
