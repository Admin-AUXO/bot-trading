import {
  asSqlText,
  buildDashboard,
  dashboardLink,
  dashboardMeta,
  dateTimeColumn,
  filterContains,
  filterRegex,
  queryVariable,
  sharedConfigVersionVariable,
  sharedPackVariable,
  statPanel,
  tablePanel,
  textboxVariable,
  timeFilter,
  timeseriesPanel,
  varRef,
} from "./core.mjs";

export function analystDashboard() {
  const pack = sharedPackVariable();
  const configVer = sharedConfigVersionVariable();
  const source = queryVariable("source", "Source", "SELECT DISTINCT source AS __text, source AS __value FROM v_source_outcome_daily ORDER BY 1");
  const provider = queryVariable("provider", "Provider", "SELECT DISTINCT provider AS __text, provider AS __value FROM v_api_provider_daily ORDER BY 1");
  const endpoint = queryVariable("endpoint", "Endpoint", `SELECT DISTINCT endpoint AS __text, endpoint AS __value FROM v_api_endpoint_efficiency WHERE ${filterRegex("provider", "provider")} ORDER BY 1`);
  const config = queryVariable("configVersion", "Config Version", "SELECT config_version::text AS __text, config_version AS __value FROM v_config_change_log ORDER BY config_version DESC");
  const daypart = queryVariable("daypart", "Daypart", "SELECT DISTINCT daypart AS __text, daypart AS __value FROM v_candidate_cohort_daily ORDER BY 1");
  const exitProfile = queryVariable("exitProfile", "Exit Profile", "SELECT DISTINCT exit_profile AS __text, exit_profile AS __value FROM v_position_cohort_daily ORDER BY 1");
  const securityRisk = queryVariable("securityRisk", "Security Risk", "SELECT DISTINCT security_risk AS __text, security_risk AS __value FROM v_candidate_cohort_daily ORDER BY 1");
  const panels = [
    statPanel(1, "Net PnL", { h: 4, w: 6, x: 0, y: 0 }, `SELECT COALESCE(SUM(realized_pnl_usd), 0) AS value FROM v_source_outcome_daily WHERE ${timeFilter(dateTimeColumn("session_date"))} AND ${filterRegex("source", "source")} AND ${filterRegex("config_version", "configVersion")}`, "currencyUSD", "Net realized PnL across the current source and config slice."),
    statPanel(2, "Acceptance Rate", { h: 4, w: 6, x: 6, y: 0 }, `SELECT COALESCE((SUM(candidates_accepted)::numeric / NULLIF(SUM(candidates_discovered), 0)) * 100, 0) AS value FROM v_source_outcome_daily WHERE ${timeFilter(dateTimeColumn("session_date"))} AND ${filterRegex("source", "source")} AND ${filterRegex("config_version", "configVersion")}`, "percent", "Weighted acceptance rate for the current analytic slice."),
    statPanel(3, "Provider Units / Accepted", { h: 4, w: 6, x: 12, y: 0 }, `SELECT COALESCE(SUM(provider_units)::numeric / NULLIF(SUM(candidates_accepted), 0), 0) AS value FROM v_kpi_by_config_window WHERE ${filterRegex("config_version", "configVersion")}`, "none", "Provider cost per accepted candidate across selected config windows."),
    statPanel(4, "Worst Reject Share", { h: 4, w: 6, x: 18, y: 0 }, `SELECT COALESCE(MAX(100 - acceptance_rate_pct), 0) AS value FROM v_source_outcome_daily WHERE ${timeFilter(dateTimeColumn("session_date"))} AND ${filterRegex("source", "source")} AND ${filterRegex("config_version", "configVersion")}`, "percent", "Highest observed reject share in the selected source cohort."),
    timeseriesPanel(5, "Source PnL Trend", { h: 8, w: 12, x: 0, y: 4 }, `SELECT session_date::timestamp AS "time", source AS metric, realized_pnl_usd AS value FROM v_source_outcome_daily WHERE ${timeFilter(dateTimeColumn("session_date"))} AND ${filterRegex("source", "source")} AND ${filterRegex("config_version", "configVersion")} ORDER BY 1, 2`, "currencyUSD", "Daily PnL trend for source-level comparison."),
    timeseriesPanel(6, "Reject Share Trend", { h: 8, w: 12, x: 12, y: 4 }, `SELECT session_date::timestamp AS "time", source AS metric, (100 - acceptance_rate_pct) AS value FROM v_source_outcome_daily WHERE ${timeFilter(dateTimeColumn("session_date"))} AND ${filterRegex("source", "source")} AND ${filterRegex("config_version", "configVersion")} ORDER BY 1, 2`, "percent", "Reject-share trend by source for quality drift review."),
    tablePanel(7, "Candidate Cohort Matrix", { h: 8, w: 12, x: 0, y: 12 }, `SELECT session_date, source, daypart, security_risk, liquidity_band, volume_band, candidate_count, accepted_count, bought_count, win_count, loss_count, realized_pnl_usd FROM v_candidate_cohort_daily WHERE ${timeFilter(dateTimeColumn("session_date"))} AND ${filterRegex("source", "source")} AND ${filterRegex("daypart", "daypart")} AND ${filterRegex("security_risk", "securityRisk")} AND ${filterRegex("config_version", "configVersion")} ORDER BY session_date DESC, realized_pnl_usd DESC LIMIT 60`, undefined, "Candidate cohorts for source, daypart, and risk-shape comparison."),
    tablePanel(8, "Position Cohort Matrix", { h: 8, w: 12, x: 12, y: 12 }, `SELECT session_date, source, daypart, exit_profile, security_risk, outcome, position_count, avg_return_pct, avg_hold_minutes, win_rate * 100 AS win_rate_pct, realized_pnl_usd FROM v_position_cohort_daily WHERE ${timeFilter(dateTimeColumn("session_date"))} AND ${filterRegex("source", "source")} AND ${filterRegex("daypart", "daypart")} AND ${filterRegex("exit_profile", "exitProfile")} AND ${filterRegex("security_risk", "securityRisk")} AND ${filterRegex("config_version", "configVersion")} ORDER BY session_date DESC, realized_pnl_usd DESC LIMIT 60`, undefined, "Position cohorts for outcome, return, and hold-time comparisons."),
    tablePanel(9, "Provider Pressure by Endpoint", { h: 8, w: 24, x: 0, y: 20 }, `SELECT bucket_at, provider, endpoint, total_calls, total_units, avg_latency_ms, error_count FROM v_api_endpoint_hourly WHERE ${timeFilter("bucket_at")} AND ${filterRegex("provider", "provider")} AND ${filterRegex("endpoint", "endpoint")} ORDER BY bucket_at DESC, total_units DESC LIMIT 80`, undefined, "Endpoint-level provider load for cohort-level RCA."),
  ];

  return buildDashboard("analyst", "Analyst-first cohort and config view across sources, providers, and outcome patterns.", [pack, configVer, source, provider, endpoint, config, daypart, exitProfile, securityRisk], panels, [
    dashboardLink("Source & Cohort Performance", dashboardMeta.source.uid),
    dashboardLink("Config Change Impact & RCA", dashboardMeta.config.uid),
    dashboardLink("Telemetry & Provider Analytics", dashboardMeta.telemetry.uid),
    dashboardLink("Executive Scorecard", dashboardMeta.executive.uid),
  ]);
}

export function candidateDashboard() {
  const pack = sharedPackVariable();
  const configVer = sharedConfigVersionVariable();
  const source = queryVariable("source", "Source", "SELECT DISTINCT source AS __text, source AS __value FROM v_candidate_decision_facts ORDER BY 1");
  const config = queryVariable("configVersion", "Config Version", "SELECT DISTINCT config_version::text AS __text, config_version::text AS __value FROM v_candidate_decision_facts ORDER BY 1 DESC");
  const mint = textboxVariable("mint", "Mint");
  const symbol = textboxVariable("symbol", "Symbol");
  const candidateStatus = queryVariable("candidateStatus", "Candidate Status", "SELECT DISTINCT status AS __text, status AS __value FROM v_candidate_decision_facts ORDER BY 1");
  const rejectReason = queryVariable("rejectReason", "Reject Reason", "SELECT DISTINCT COALESCE(reject_reason, 'accepted_or_unknown') AS __text, COALESCE(reject_reason, 'accepted_or_unknown') AS __value FROM v_candidate_decision_facts ORDER BY 1");
  const trigger = queryVariable("trigger", "Trigger", "SELECT DISTINCT trigger AS __text, trigger AS __value FROM v_snapshot_trigger_daily ORDER BY 1");
  const securityRisk = queryVariable("securityRisk", "Security Risk", "SELECT DISTINCT security_risk AS __text, security_risk AS __value FROM v_candidate_decision_facts ORDER BY 1");
  const daypart = queryVariable("daypart", "Daypart", "SELECT DISTINCT daypart AS __text, daypart AS __value FROM v_candidate_decision_facts ORDER BY 1");
  const candidateScopeFilter = `${filterRegex("source", "source")} AND ${filterRegex("security_risk", "securityRisk")} AND ${filterRegex("daypart", "daypart")} AND ${filterRegex("config_version", "configVersion")} AND ${filterContains("mint", "mint")} AND ${filterContains("symbol", "symbol")}`;
  const panels = [
    statPanel(1, "Discovered", { h: 4, w: 5, x: 0, y: 0 }, `SELECT COUNT(candidate_id) AS value FROM v_candidate_decision_facts WHERE ${timeFilter("discovered_at")} AND ${candidateScopeFilter} AND ${filterRegex("status", "candidateStatus")}`, "none", "Discovered candidates in the current selection scope."),
    statPanel(2, "Acceptance Rate", { h: 4, w: 5, x: 5, y: 0 }, `SELECT COALESCE((SUM(CASE WHEN accepted THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(candidate_id), 0)) * 100, 0) AS value FROM v_candidate_decision_facts WHERE ${timeFilter("decision_at")} AND ${candidateScopeFilter} AND ${filterRegex("status", "candidateStatus")}`, "percent", "Weighted acceptance rate for the selected candidate slice."),
    statPanel(3, "Bought", { h: 4, w: 4, x: 10, y: 0 }, `SELECT COUNT(candidate_id) AS value FROM v_candidate_decision_facts WHERE ${timeFilter("decision_at")} AND bought = TRUE AND ${candidateScopeFilter}`, "none", "Candidates that progressed to buys in the current slice."),
    statPanel(4, "Avg Entry Score", { h: 4, w: 5, x: 14, y: 0 }, `SELECT COALESCE(AVG(entry_score), 0) AS value FROM v_candidate_decision_facts WHERE ${timeFilter("decision_at")} AND ${candidateScopeFilter}`, "none", "Average entry score for the selected decision slice."),
    statPanel(5, "Downstream Win Rate", { h: 4, w: 5, x: 19, y: 0 }, `SELECT COALESCE((SUM(CASE WHEN downstream_outcome = 'win' THEN 1 ELSE 0 END)::numeric / NULLIF(SUM(CASE WHEN downstream_outcome IN ('win', 'loss') THEN 1 ELSE 0 END), 0)) * 100, 0) AS value FROM v_candidate_decision_facts WHERE ${timeFilter("decision_at")} AND ${candidateScopeFilter}`, "percent", "How often accepted candidates eventually turned into downstream wins."),
    timeseriesPanel(6, "Funnel Trend by Status", { h: 8, w: 12, x: 0, y: 4 }, `SELECT DATE_TRUNC('day', decision_at)::timestamp AS "time", status AS metric, COUNT(candidate_id)::int AS value FROM v_candidate_decision_facts WHERE ${timeFilter("decision_at")} AND ${candidateScopeFilter} AND ${filterRegex("status", "candidateStatus")} GROUP BY 1, 2 ORDER BY 1, 2`, "none", "Daily funnel movement by candidate status."),
    timeseriesPanel(7, "Reject Reason Trend", { h: 8, w: 12, x: 12, y: 4 }, `SELECT DATE_TRUNC('day', decision_at)::timestamp AS "time", COALESCE(reject_reason, 'accepted_or_unknown') AS metric, COUNT(candidate_id)::int AS value FROM v_candidate_decision_facts WHERE ${timeFilter("decision_at")} AND ${candidateScopeFilter} AND ${filterRegex("COALESCE(reject_reason, 'accepted_or_unknown')", "rejectReason")} GROUP BY 1, 2 ORDER BY 1, 2`, "none", "Reject-reason drift over time for the current scope."),
    tablePanel(8, "Candidate Decision Trace", { h: 8, w: 12, x: 0, y: 12 }, `SELECT candidate_id, mint, symbol, source, config_version, status, reject_reason, entry_score, exit_profile, daypart, security_risk, liquidity_band, volume_band, downstream_outcome, realized_pnl_usd FROM v_candidate_decision_facts WHERE ${timeFilter("decision_at")} AND ${candidateScopeFilter} AND ${filterRegex("status", "candidateStatus")} AND ${filterRegex("COALESCE(reject_reason, 'accepted_or_unknown')", "rejectReason")} ORDER BY entry_score DESC NULLS LAST, decision_at DESC LIMIT 100`, undefined, "Decision spine for why candidates passed, failed, or eventually paid off."),
    tablePanel(9, "Latest Filter State", { h: 8, w: 12, x: 12, y: 12 }, `SELECT mint, symbol, source, status, reject_reason, security_risk, liquidity_usd, volume_5m_usd, buy_sell_ratio, top10_holder_percent, largest_holder_percent, price_usd, market_cap_usd, last_snapshot_at FROM v_candidate_latest_filter_state WHERE ${filterRegex("source", "source")} AND ${filterContains("mint", "mint")} AND ${filterContains("symbol", "symbol")} ORDER BY last_snapshot_at DESC LIMIT 100`, undefined, "Latest normalized filter evidence for active candidate rows."),
    tablePanel(10, "Snapshot Evidence", { h: 8, w: 12, x: 0, y: 20 }, `SELECT captured_at, mint, symbol, trigger, source, config_version, price_usd, liquidity_usd, volume_5m_usd, buy_sell_ratio, top10_holder_percent, security_risk FROM v_token_snapshot_enriched WHERE ${timeFilter("captured_at")} AND ${filterRegex("source", "source")} AND ${filterRegex("config_version", "configVersion")} AND ${filterContains("mint", "mint")} AND ${filterContains("symbol", "symbol")} AND ${filterRegex("trigger", "trigger")} ORDER BY captured_at DESC LIMIT 100`, undefined, "Snapshot trail for candidate-side RCA."),
    tablePanel(11, "Provider Payload Evidence", { h: 8, w: 12, x: 12, y: 20 }, `SELECT captured_at, provider, endpoint, status_code, error_family, entity_key, latency_ms, error_message FROM v_raw_api_payload_recent WHERE ${timeFilter("captured_at")} AND (${asSqlText(varRef("mint"))} = '' OR entity_key ILIKE '%' || ${asSqlText(varRef("mint"))} || '%') ORDER BY captured_at DESC LIMIT 1000`, undefined, "Raw provider failures and payload evidence for mint-focused RCA."),
  ];

  return buildDashboard("candidate", "Candidate funnel, decision evidence, and downstream outcome trace.", [pack, configVer, source, config, mint, symbol, candidateStatus, rejectReason, trigger, securityRisk, daypart], panels, [
    dashboardLink("Source & Cohort Performance", dashboardMeta.source.uid),
    dashboardLink("Analyst Insights Overview", dashboardMeta.analyst.uid),
    dashboardLink("Position & PnL Analytics", dashboardMeta.position.uid),
    dashboardLink("Config Change Impact & RCA", dashboardMeta.config.uid),
  ]);
}

export function positionDashboard() {
  const pack = sharedPackVariable();
  const configVer = sharedConfigVersionVariable();
  const source = queryVariable("source", "Source", "SELECT DISTINCT source AS __text, source AS __value FROM v_position_pnl_daily ORDER BY 1");
  const positionStatus = queryVariable("positionStatus", "Position Status", "SELECT DISTINCT status AS __text, status AS __value FROM v_position_performance ORDER BY 1");
  const positionId = textboxVariable("positionId", "Position ID");
  const mint = textboxVariable("mint", "Mint");
  const symbol = textboxVariable("symbol", "Symbol");
  const exitReason = queryVariable("exitReason", "Exit Reason", "SELECT DISTINCT exit_reason AS __text, exit_reason AS __value FROM v_position_exit_reason_daily ORDER BY 1");
  const exitProfile = queryVariable("exitProfile", "Exit Profile", "SELECT DISTINCT exit_profile AS __text, exit_profile AS __value FROM v_position_pnl_daily ORDER BY 1");
  const config = queryVariable("configVersion", "Config Version", "SELECT config_version::text AS __text, config_version AS __value FROM v_config_change_log ORDER BY config_version DESC");
  const positionScopeFilter = `${filterRegex("source", "source")} AND ${filterRegex("exit_profile", "exitProfile")} AND ${filterRegex("status", "positionStatus")} AND ${filterRegex("config_version", "configVersion")} AND ${filterContains("id", "positionId")} AND ${filterContains("mint", "mint")} AND ${filterContains("symbol", "symbol")}`;
  const panels = [
    statPanel(1, "Realized PnL", { h: 4, w: 5, x: 0, y: 0 }, `SELECT COALESCE(SUM(realized_pnl_usd), 0) AS value FROM v_position_performance WHERE ${timeFilter("COALESCE(closed_at, opened_at)")} AND ${positionScopeFilter}`, "currencyUSD", "Realized PnL across the selected position set."),
    statPanel(2, "Win Rate", { h: 4, w: 5, x: 5, y: 0 }, `SELECT COALESCE((SUM(CASE WHEN status = 'CLOSED' AND realized_pnl_usd > 0 THEN 1 ELSE 0 END)::numeric / NULLIF(SUM(CASE WHEN status = 'CLOSED' THEN 1 ELSE 0 END), 0)) * 100, 0) AS value FROM v_position_performance WHERE ${timeFilter("COALESCE(closed_at, opened_at)")} AND ${positionScopeFilter}`, "percent", "Closed-position win rate for the current slice."),
    statPanel(3, "Median Hold Minutes", { h: 4, w: 5, x: 10, y: 0 }, `SELECT COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY hold_minutes), 0) AS value FROM v_position_performance WHERE ${timeFilter("COALESCE(closed_at, opened_at)")} AND status = 'CLOSED' AND ${positionScopeFilter}`, "none", "Median hold time to avoid mean distortion from long-tail positions."),
    statPanel(4, "Median Return %", { h: 4, w: 5, x: 15, y: 0 }, `SELECT COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY realized_pnl_pct), 0) AS value FROM v_position_performance WHERE ${timeFilter("COALESCE(closed_at, opened_at)")} AND status = 'CLOSED' AND ${positionScopeFilter}`, "percent", "Median realized return to keep one outlier from lying about the book."),
    statPanel(5, "Closed Positions", { h: 4, w: 4, x: 20, y: 0 }, `SELECT COUNT(*) AS value FROM v_position_performance WHERE ${timeFilter("COALESCE(closed_at, opened_at)")} AND status = 'CLOSED' AND ${positionScopeFilter}`, "none", "Closed positions contributing to the selected result set."),
    timeseriesPanel(6, "Daily Realized PnL", { h: 8, w: 12, x: 0, y: 4 }, `SELECT session_date::timestamp AS "time", exit_profile AS metric, realized_pnl_usd AS value FROM v_position_pnl_daily WHERE ${timeFilter(dateTimeColumn("session_date"))} AND ${filterRegex("source", "source")} AND ${filterRegex("exit_profile", "exitProfile")} AND ${filterRegex("config_version", "configVersion")} ORDER BY 1, 2`, "currencyUSD", "Daily PnL split by exit profile."),
    timeseriesPanel(7, "Exit Reason Trend", { h: 8, w: 12, x: 12, y: 4 }, `SELECT session_date::timestamp AS "time", exit_reason AS metric, position_count AS value FROM v_position_exit_reason_daily WHERE ${timeFilter(dateTimeColumn("session_date"))} AND ${filterRegex("source", "source")} AND ${filterRegex("exit_reason", "exitReason")} AND ${filterRegex("config_version", "configVersion")} ORDER BY 1, 2`, "none", "Exit-reason trend to separate strategy behavior from execution fallout."),
    tablePanel(8, "Position Performance", { h: 8, w: 12, x: 0, y: 12 }, `SELECT id, mint, symbol, source, config_version, exit_profile, status, exit_reason, opened_at, closed_at, amount_usd, gross_exit_usd, realized_pnl_usd, realized_pnl_pct, hold_minutes FROM v_position_performance WHERE ${timeFilter("COALESCE(closed_at, opened_at)")} AND ${positionScopeFilter} ORDER BY opened_at DESC LIMIT 100`, undefined, "Position-level outcome table for focused drill-downs."),
    tablePanel(9, "Fill Trail", { h: 8, w: 12, x: 12, y: 12 }, `SELECT created_at, side, position_id, mint, symbol, source, config_version, exit_profile, price_usd, amount_usd, pnl_usd, tx_signature FROM v_recent_fill_activity WHERE ${timeFilter("created_at")} AND ${filterRegex("source", "source")} AND ${filterContains("position_id", "positionId")} AND ${filterContains("mint", "mint")} AND ${filterContains("symbol", "symbol")} ORDER BY created_at DESC LIMIT 100`, undefined, "Execution trail for the selected position slice."),
    tablePanel(10, "Snapshot Evidence", { h: 8, w: 24, x: 0, y: 20 }, `SELECT captured_at, mint, symbol, trigger, source, config_version, price_usd, liquidity_usd, volume_5m_usd, buy_sell_ratio, top10_holder_percent, security_risk, position_status, position_exit_reason FROM v_token_snapshot_enriched WHERE ${timeFilter("captured_at")} AND ${filterRegex("source", "source")} AND ${filterContains("mint", "mint")} AND ${filterContains("symbol", "symbol")} ORDER BY captured_at DESC LIMIT 100`, undefined, "Position-linked snapshot trail for trade RCA."),
  ];

  return buildDashboard("position", "Position outcomes, execution history, and raw trade evidence.", [pack, configVer, source, positionStatus, positionId, mint, symbol, exitReason, exitProfile, config], panels, [
    dashboardLink("Live Trade Monitor", dashboardMeta.live.uid),
    dashboardLink("Config Change Impact & RCA", dashboardMeta.config.uid),
    dashboardLink("Source & Cohort Performance", dashboardMeta.source.uid),
    dashboardLink("Analyst Insights Overview", dashboardMeta.analyst.uid),
  ]);
}

export function configDashboard() {
  const pack = sharedPackVariable();
  const configVer = sharedConfigVersionVariable();
  const config = queryVariable("configVersion", "Config Version", "SELECT config_version::text AS __text, config_version::text AS __value FROM v_config_change_log ORDER BY config_version DESC", { multi: false });
  const source = queryVariable("source", "Source", "SELECT DISTINCT source AS __text, source AS __value FROM v_source_outcome_daily ORDER BY 1");
  const exitProfile = queryVariable("exitProfile", "Exit Profile", "SELECT DISTINCT exit_profile AS __text, exit_profile AS __value FROM v_position_pnl_daily ORDER BY 1");
  const panels = [
    statPanel(1, "Config Window PnL", { h: 4, w: 6, x: 0, y: 0 }, `SELECT COALESCE(realized_pnl_usd, 0) AS value FROM v_kpi_by_config_window WHERE ${filterRegex("config_version", "configVersion")} ORDER BY config_version DESC LIMIT 1`, "currencyUSD", "PnL for the selected config window."),
    statPanel(2, "Config Window Win Rate", { h: 4, w: 6, x: 6, y: 0 }, `SELECT COALESCE(win_rate * 100, 0) AS value FROM v_kpi_by_config_window WHERE ${filterRegex("config_version", "configVersion")} ORDER BY config_version DESC LIMIT 1`, "percent", "Win rate for the selected config window."),
    statPanel(3, "Acceptance Rate", { h: 4, w: 6, x: 12, y: 0 }, `SELECT COALESCE(acceptance_rate_pct, 0) AS value FROM v_kpi_by_config_window WHERE ${filterRegex("config_version", "configVersion")} ORDER BY config_version DESC LIMIT 1`, "percent", "Acceptance rate for the selected config window."),
    statPanel(4, "Live-Affecting Paths", { h: 4, w: 6, x: 18, y: 0 }, `SELECT COALESCE(live_affecting_path_count, 0) AS value FROM v_config_change_log WHERE ${filterRegex("config_version", "configVersion")} ORDER BY config_version DESC LIMIT 1`, "none", "How many changed fields materially affect live trading behavior."),
    timeseriesPanel(5, "PnL by Config Window", { h: 8, w: 12, x: 0, y: 4 }, `SELECT window_start_at AS "time", 'config ' || config_version::text AS metric, realized_pnl_usd AS value FROM v_kpi_by_config_window WHERE ${filterRegex("config_version", "configVersion")} ORDER BY 1, 2`, "currencyUSD", "PnL across config windows for the selected version set."),
    timeseriesPanel(6, "Acceptance Rate by Config Window", { h: 8, w: 12, x: 12, y: 4 }, `SELECT window_start_at AS "time", 'config ' || config_version::text AS metric, acceptance_rate_pct AS value FROM v_kpi_by_config_window WHERE ${filterRegex("config_version", "configVersion")} ORDER BY 1, 2`, "percent", "Acceptance-rate trend across config windows."),
    tablePanel(7, "Config Change Log", { h: 8, w: 12, x: 0, y: 12 }, `SELECT config_version, previous_config_version, activated_at, next_activated_at, applied_by, changed_path_count, live_affecting_path_count, trade_mode, capital_usd, position_size_usd, min_liquidity_usd, min_volume_5m_usd, stop_loss_percent, tp1_multiplier, tp2_multiplier FROM v_config_change_log WHERE ${filterRegex("config_version", "configVersion")} ORDER BY config_version DESC LIMIT 50`, undefined, "Version-level config change log with live-affecting counts."),
    tablePanel(8, "Field-Level Change Trace", { h: 8, w: 12, x: 12, y: 12 }, `SELECT config_version, activated_at, field_path, previous_value, current_value FROM v_config_field_change WHERE ${filterRegex("config_version", "configVersion")} ORDER BY config_version DESC, field_path ASC LIMIT 200`, undefined, "Field-level diff for the selected config version."),
    tablePanel(9, "Source / Exit Profile Delta", { h: 8, w: 24, x: 0, y: 20 }, `SELECT p.session_date, p.source, p.exit_profile, p.config_version, p.position_count, p.closed_count, p.realized_pnl_usd, p.avg_return_pct, p.win_rate * 100 AS win_rate_pct FROM v_position_pnl_daily p WHERE ${timeFilter(dateTimeColumn("session_date"))} AND ${filterRegex("source", "source")} AND ${filterRegex("exit_profile", "exitProfile")} AND ${filterRegex("config_version", "configVersion")} ORDER BY p.session_date DESC, p.realized_pnl_usd DESC LIMIT 80`, undefined, "Outcome delta by source and exit profile within the selected config window."),
  ];

  return buildDashboard("config", "Config history, field-level diffs, and KPI windows.", [pack, configVer, config, source, exitProfile], panels, [
    dashboardLink("Candidate & Funnel Analytics", dashboardMeta.candidate.uid),
    dashboardLink("Position & PnL Analytics", dashboardMeta.position.uid),
    dashboardLink("Telemetry & Provider Analytics", dashboardMeta.telemetry.uid),
    dashboardLink("Executive Scorecard", dashboardMeta.executive.uid),
  ]);
}

export function sourceDashboard() {
  const pack = sharedPackVariable();
  const configVer = sharedConfigVersionVariable();
  const source = queryVariable("source", "Source", "SELECT DISTINCT source AS __text, source AS __value FROM v_source_outcome_daily ORDER BY 1");
  const daypart = queryVariable("daypart", "Daypart", "SELECT DISTINCT daypart AS __text, daypart AS __value FROM v_candidate_cohort_daily ORDER BY 1");
  const securityRisk = queryVariable("securityRisk", "Security Risk", "SELECT DISTINCT security_risk AS __text, security_risk AS __value FROM v_candidate_cohort_daily ORDER BY 1");
  const exitProfile = queryVariable("exitProfile", "Exit Profile", "SELECT DISTINCT exit_profile AS __text, exit_profile AS __value FROM v_position_cohort_daily ORDER BY 1");
  const config = queryVariable("configVersion", "Config Version", "SELECT config_version::text AS __text, config_version AS __value FROM v_config_change_log ORDER BY config_version DESC");
  const panels = [
    statPanel(1, "Net Source PnL", { h: 4, w: 6, x: 0, y: 0 }, `SELECT COALESCE(SUM(realized_pnl_usd), 0) AS value FROM v_source_outcome_daily WHERE ${timeFilter(dateTimeColumn("session_date"))} AND ${filterRegex("source", "source")} AND ${filterRegex("config_version", "configVersion")}`, "currencyUSD", "Net PnL for the currently selected sources and config windows."),
    statPanel(2, "Acceptance Rate", { h: 4, w: 6, x: 6, y: 0 }, `SELECT COALESCE((SUM(candidates_accepted)::numeric / NULLIF(SUM(candidates_discovered), 0)) * 100, 0) AS value FROM v_source_outcome_daily WHERE ${timeFilter(dateTimeColumn("session_date"))} AND ${filterRegex("source", "source")} AND ${filterRegex("config_version", "configVersion")}`, "percent", "Weighted acceptance rate for the selected source slice."),
    statPanel(3, "Positions Closed", { h: 4, w: 6, x: 12, y: 0 }, `SELECT COALESCE(SUM(positions_closed), 0) AS value FROM v_source_outcome_daily WHERE ${timeFilter(dateTimeColumn("session_date"))} AND ${filterRegex("source", "source")} AND ${filterRegex("config_version", "configVersion")}`, "none", "Closed positions attributed to the selected sources."),
    statPanel(4, "Avg Cohort Return", { h: 4, w: 6, x: 18, y: 0 }, `SELECT COALESCE(AVG(avg_return_pct), 0) AS value FROM v_position_cohort_daily WHERE ${timeFilter(dateTimeColumn("session_date"))} AND ${filterRegex("source", "source")} AND ${filterRegex("daypart", "daypart")} AND ${filterRegex("exit_profile", "exitProfile")} AND ${filterRegex("security_risk", "securityRisk")} AND ${filterRegex("config_version", "configVersion")}`, "percent", "Average cohort return for the currently selected source and cohort mix."),
    timeseriesPanel(5, "Source PnL Trend", { h: 8, w: 12, x: 0, y: 4 }, `SELECT session_date::timestamp AS "time", source AS metric, realized_pnl_usd AS value FROM v_source_outcome_daily WHERE ${timeFilter(dateTimeColumn("session_date"))} AND ${filterRegex("source", "source")} AND ${filterRegex("config_version", "configVersion")} ORDER BY 1, 2`, "currencyUSD", "Daily source-level PnL trend."),
    timeseriesPanel(6, "Source Acceptance Trend", { h: 8, w: 12, x: 12, y: 4 }, `SELECT session_date::timestamp AS "time", source AS metric, acceptance_rate_pct AS value FROM v_source_outcome_daily WHERE ${timeFilter(dateTimeColumn("session_date"))} AND ${filterRegex("source", "source")} AND ${filterRegex("config_version", "configVersion")} ORDER BY 1, 2`, "percent", "Acceptance-rate trend by source."),
    tablePanel(7, "Candidate Cohort Leaderboard", { h: 8, w: 12, x: 0, y: 12 }, `SELECT session_date, source, config_version, daypart, security_risk, liquidity_band, volume_band, candidate_count, accepted_count, bought_count, avg_entry_score, win_count, loss_count, realized_pnl_usd FROM v_candidate_cohort_daily WHERE ${timeFilter(dateTimeColumn("session_date"))} AND ${filterRegex("source", "source")} AND ${filterRegex("daypart", "daypart")} AND ${filterRegex("security_risk", "securityRisk")} AND ${filterRegex("config_version", "configVersion")} ORDER BY session_date DESC, realized_pnl_usd DESC LIMIT 80`, undefined, "Candidate cohort leaderboard for source, daypart, and risk-shape comparison."),
    tablePanel(8, "Position Cohort Leaderboard", { h: 8, w: 12, x: 12, y: 12 }, `SELECT session_date, source, config_version, daypart, exit_profile, security_risk, outcome, position_count, avg_return_pct, avg_hold_minutes, win_rate * 100 AS win_rate_pct, realized_pnl_usd FROM v_position_cohort_daily WHERE ${timeFilter(dateTimeColumn("session_date"))} AND ${filterRegex("source", "source")} AND ${filterRegex("daypart", "daypart")} AND ${filterRegex("exit_profile", "exitProfile")} AND ${filterRegex("security_risk", "securityRisk")} AND ${filterRegex("config_version", "configVersion")} ORDER BY session_date DESC, realized_pnl_usd DESC LIMIT 80`, undefined, "Position cohort leaderboard for source and exit-profile comparisons."),
  ];

  return buildDashboard("source", "Source-level and cohort-level performance review.", [pack, configVer, source, daypart, securityRisk, exitProfile, config], panels, [
    dashboardLink("Analyst Insights Overview", dashboardMeta.analyst.uid),
    dashboardLink("Candidate & Funnel Analytics", dashboardMeta.candidate.uid),
    dashboardLink("Position & PnL Analytics", dashboardMeta.position.uid),
    dashboardLink("Config Change Impact & RCA", dashboardMeta.config.uid),
  ]);
}

export function buildPackLeaderboardDashboard() {
  const pack = sharedPackVariable();
  const configVer = sharedConfigVersionVariable();
  const grade = queryVariable("grade", "Grade", "SELECT DISTINCT grade AS __text, grade AS __value FROM v_strategy_pack_performance_daily ORDER BY 1");
  const panels = [
    statPanel(
      1,
      "Top Pack Win Rate",
      { h: 4, w: 8, x: 0, y: 0 },
      `SELECT COALESCE(MAX(win_rate_pct), 0) AS value FROM v_strategy_pack_performance_daily WHERE ${filterRegex("strategy_pack_id", "pack")} AND ${filterRegex("config_version", "configVer")} AND ${filterRegex("grade", "grade")}`,
      "percent",
      "Backed by v_strategy_pack_performance_daily for peak pack win-rate.",
    ),
    statPanel(
      2,
      "Top Pack EV",
      { h: 4, w: 8, x: 8, y: 0 },
      `SELECT COALESCE(MAX(expected_value_usd), 0) AS value FROM v_strategy_pack_performance_daily WHERE ${filterRegex("strategy_pack_id", "pack")} AND ${filterRegex("config_version", "configVer")} AND ${filterRegex("grade", "grade")}`,
      "currencyUSD",
      "Backed by v_strategy_pack_performance_daily for expected-value leader.",
    ),
    statPanel(
      3,
      "Median Hold Minutes",
      { h: 4, w: 8, x: 16, y: 0 },
      `SELECT COALESCE(AVG(avg_hold_minutes), 0) AS value FROM v_strategy_pack_exit_profile_mix WHERE ${filterRegex("strategy_pack_id", "pack")} AND ${filterRegex("config_version", "configVer")}`,
      "none",
      "Backed by v_strategy_pack_exit_profile_mix for hold-time baseline.",
    ),
    tablePanel(
      4,
      "Pack Leaderboard",
      { h: 9, w: 12, x: 0, y: 4 },
      `SELECT day, strategy_pack_id, grade, accepted_count, closed_positions, win_rate_pct, avg_winner_usd, avg_loser_usd, expected_value_usd FROM v_strategy_pack_performance_daily WHERE ${filterRegex("strategy_pack_id", "pack")} AND ${filterRegex("config_version", "configVer")} AND ${filterRegex("grade", "grade")} ORDER BY expected_value_usd DESC, win_rate_pct DESC LIMIT 100`,
      undefined,
      "Backed by v_strategy_pack_performance_daily for rank-ordered pack performance.",
    ),
    timeseriesPanel(
      5,
      "Pack Grade Trend",
      { h: 9, w: 12, x: 12, y: 4 },
      `SELECT day::timestamp AS "time", strategy_pack_id::text AS metric, grade_score AS value FROM v_strategy_pack_performance_daily WHERE ${filterRegex("strategy_pack_id", "pack")} AND ${filterRegex("config_version", "configVer")} ORDER BY 1, 2`,
      "none",
      "Backed by v_strategy_pack_performance_daily for grade trajectory.",
    ),
    tablePanel(
      6,
      "Config Window Cross-Check",
      { h: 9, w: 24, x: 0, y: 13 },
      `SELECT config_version, window_start_at, window_end_at, candidates_accepted, positions_closed, realized_pnl_usd, win_rate * 100 AS win_rate_pct FROM v_kpi_by_config_window WHERE ${filterRegex("config_version", "configVer")} ORDER BY config_version DESC`,
      undefined,
      "Backed by v_kpi_by_config_window for config-level verification against pack stats.",
    ),
  ];

  return buildDashboard(
    "packLeaderboard",
    "Pack-level performance leaderboard with config-window cross-checks.",
    [pack, configVer, grade],
    panels,
    [
      dashboardLink("Candidate Funnel", dashboardMeta.candidateFunnel.uid),
      dashboardLink("Exit Reason RCA", dashboardMeta.exitReasonRca.uid),
      dashboardLink("Session Overview", dashboardMeta.sessionOverview.uid),
    ],
  );
}

export function buildCandidateFunnelDashboard() {
  const pack = sharedPackVariable();
  const configVer = sharedConfigVersionVariable();
  const source = queryVariable("source", "Source", "SELECT DISTINCT source AS __text, source AS __value FROM v_candidate_funnel_daily_source ORDER BY 1");
  const panels = [
    statPanel(
      1,
      "Discovered",
      { h: 4, w: 6, x: 0, y: 0 },
      `SELECT COALESCE(SUM(discovered_count), 0) AS value FROM v_candidate_funnel_daily_source WHERE ${filterRegex("source", "source")} AND ${filterRegex("strategy_pack_id", "pack")} AND ${filterRegex("config_version", "configVer")}`,
      "none",
      "Backed by v_candidate_funnel_daily_source for discovered-stage totals.",
    ),
    statPanel(
      2,
      "Accepted",
      { h: 4, w: 6, x: 6, y: 0 },
      `SELECT COALESCE(SUM(accepted_count), 0) AS value FROM v_candidate_funnel_daily_source WHERE ${filterRegex("source", "source")} AND ${filterRegex("strategy_pack_id", "pack")} AND ${filterRegex("config_version", "configVer")}`,
      "none",
      "Backed by v_candidate_funnel_daily_source for accepted-stage totals.",
    ),
    statPanel(
      3,
      "Filled",
      { h: 4, w: 6, x: 12, y: 0 },
      `SELECT COALESCE(SUM(filled_count), 0) AS value FROM v_candidate_funnel_daily_source WHERE ${filterRegex("source", "source")} AND ${filterRegex("strategy_pack_id", "pack")} AND ${filterRegex("config_version", "configVer")}`,
      "none",
      "Backed by v_candidate_funnel_daily_source for filled-stage totals.",
    ),
    statPanel(
      4,
      "Exited",
      { h: 4, w: 6, x: 18, y: 0 },
      `SELECT COALESCE(SUM(exited_count), 0) AS value FROM v_candidate_funnel_daily_source WHERE ${filterRegex("source", "source")} AND ${filterRegex("strategy_pack_id", "pack")} AND ${filterRegex("config_version", "configVer")}`,
      "none",
      "Backed by v_candidate_funnel_daily_source for exited-stage totals.",
    ),
    timeseriesPanel(
      5,
      "Funnel Stages by Day",
      { h: 8, w: 12, x: 0, y: 4 },
      `SELECT day::timestamp AS "time", stage AS metric, stage_count AS value FROM v_candidate_funnel_daily_source WHERE ${filterRegex("source", "source")} AND ${filterRegex("strategy_pack_id", "pack")} AND ${filterRegex("config_version", "configVer")} ORDER BY 1, 2`,
      "none",
      "Backed by v_candidate_funnel_daily_source for stage progression trend.",
    ),
    tablePanel(
      6,
      "Decision Reason Mix",
      { h: 8, w: 12, x: 12, y: 4 },
      `SELECT day, source, reject_reason, decision_count FROM v_candidate_decision_facts WHERE ${filterRegex("source", "source")} AND ${filterRegex("strategy_pack_id", "pack")} AND ${filterRegex("config_version", "configVer")} ORDER BY day DESC, decision_count DESC LIMIT 200`,
      undefined,
      "Backed by v_candidate_decision_facts for rejection and decision RCA.",
    ),
    tablePanel(
      7,
      "Latest Filter State Heatstrip",
      { h: 8, w: 24, x: 0, y: 12 },
      `SELECT mint, symbol, source, status, reject_reason, security_risk, liquidity_usd, volume_5m_usd, buy_sell_ratio, last_snapshot_at FROM v_candidate_latest_filter_state WHERE ${filterRegex("source", "source")} ORDER BY last_snapshot_at DESC LIMIT 200`,
      undefined,
      "Backed by v_candidate_latest_filter_state for latest filter-firing evidence.",
    ),
  ];

  return buildDashboard(
    "candidateFunnel",
    "Candidate funnel diagnostics from discovery through exits.",
    [pack, configVer, source],
    panels,
    [
      dashboardLink("Pack Leaderboard", dashboardMeta.packLeaderboard.uid),
      dashboardLink("Exit Reason RCA", dashboardMeta.exitReasonRca.uid),
      dashboardLink("Enrichment Quality", dashboardMeta.enrichmentQuality.uid),
    ],
  );
}

export function buildExitReasonRCADashboard() {
  const pack = sharedPackVariable();
  const configVer = sharedConfigVersionVariable();
  const exitReason = queryVariable("exitReason", "Exit Reason", "SELECT DISTINCT exit_reason AS __text, exit_reason AS __value FROM v_position_exit_reason_daily ORDER BY 1");
  const lane = queryVariable("lane", "Lane", "SELECT DISTINCT lane AS __text, lane AS __value FROM v_submit_lane_daily ORDER BY 1");
  const panels = [
    statPanel(
      1,
      "Exit Count",
      { h: 4, w: 6, x: 0, y: 0 },
      `SELECT COALESCE(SUM(position_count), 0) AS value FROM v_position_exit_reason_daily WHERE ${filterRegex("exit_reason", "exitReason")} AND ${filterRegex("strategy_pack_id", "pack")} AND ${filterRegex("config_version", "configVer")}`,
      "none",
      "Backed by v_position_exit_reason_daily for selected exit reason totals.",
    ),
    statPanel(
      2,
      "Exit PnL",
      { h: 4, w: 6, x: 6, y: 0 },
      `SELECT COALESCE(SUM(realized_pnl_usd), 0) AS value FROM v_position_exit_reason_daily WHERE ${filterRegex("exit_reason", "exitReason")} AND ${filterRegex("strategy_pack_id", "pack")} AND ${filterRegex("config_version", "configVer")}`,
      "currencyUSD",
      "Backed by v_position_exit_reason_daily for exit-reason PnL.",
    ),
    statPanel(
      3,
      "Exit p95 Latency",
      { h: 4, w: 6, x: 12, y: 0 },
      `SELECT COALESCE(MAX(p95_exit_latency_ms), 0) AS value FROM v_recent_fill_activity WHERE ${filterRegex("exit_reason", "exitReason")}`,
      "ms",
      "Backed by v_recent_fill_activity for exit latency tails.",
    ),
    statPanel(
      4,
      "SL Bundle Land Rate",
      { h: 4, w: 6, x: 18, y: 0 },
      `SELECT COALESCE(AVG(land_rate_pct), 0) AS value FROM v_submit_lane_daily WHERE ${filterRegex("lane", "lane")} AND lane = 'JITO_BUNDLE'`,
      "percent",
      "Backed by v_submit_lane_daily for Jito stop-loss landing reliability.",
    ),
    timeseriesPanel(
      5,
      "Exit Reason Trend",
      { h: 8, w: 12, x: 0, y: 4 },
      `SELECT day::timestamp AS "time", exit_reason AS metric, position_count AS value FROM v_position_exit_reason_daily WHERE ${filterRegex("exit_reason", "exitReason")} AND ${filterRegex("strategy_pack_id", "pack")} AND ${filterRegex("config_version", "configVer")} ORDER BY 1, 2`,
      "none",
      "Backed by v_position_exit_reason_daily for exit-reason timeline.",
    ),
    timeseriesPanel(
      6,
      "Lane Land Rate Trend",
      { h: 8, w: 12, x: 12, y: 4 },
      `SELECT day::timestamp AS "time", lane AS metric, land_rate_pct AS value FROM v_submit_lane_daily WHERE ${filterRegex("lane", "lane")} ORDER BY 1, 2`,
      "percent",
      "Backed by v_submit_lane_daily for lane landing trend.",
    ),
    tablePanel(
      7,
      "Recent Exit Fill Trail",
      { h: 8, w: 12, x: 0, y: 12 },
      `SELECT created_at, side, lane, position_id, mint, symbol, exit_reason, amount_usd, pnl_usd, tx_signature FROM v_recent_fill_activity WHERE ${timeFilter("created_at")} AND ${filterRegex("exit_reason", "exitReason")} ORDER BY created_at DESC LIMIT 200`,
      undefined,
      "Backed by v_recent_fill_activity for exit execution evidence.",
    ),
    tablePanel(
      8,
      "Exit Plan Mutation Impact",
      { h: 8, w: 12, x: 12, y: 12 },
      `SELECT day, mutator_code, axis, mutation_count, helped_count, hurt_count FROM v_exit_plan_mutation_daily WHERE ${filterRegex("strategy_pack_id", "pack")} AND ${filterRegex("config_version", "configVer")} ORDER BY day DESC, mutation_count DESC`,
      undefined,
      "Backed by v_exit_plan_mutation_daily for mutation-to-outcome linkage.",
    ),
  ];

  return buildDashboard(
    "exitReasonRca",
    "Exit-reason root-cause analysis across execution quality and mutator impact.",
    [pack, configVer, exitReason, lane],
    panels,
    [
      dashboardLink("Adaptive Telemetry", dashboardMeta.adaptiveTelemetry.uid),
      dashboardLink("Pack Leaderboard", dashboardMeta.packLeaderboard.uid),
      dashboardLink("Position & PnL Analytics", dashboardMeta.position.uid),
    ],
  );
}
