import {
  buildDashboard,
  dashboardLink,
  dashboardMeta,
  filterRegex,
  queryVariable,
  sharedConfigVersionVariable,
  sharedPackVariable,
  statPanel,
  tablePanel,
  timeseriesPanel,
} from "./core.mjs";

export function buildAdaptiveTelemetryDashboard() {
  const pack = sharedPackVariable();
  const configVer = sharedConfigVersionVariable();
  const axis = queryVariable("axis", "Axis", "SELECT DISTINCT axis AS __text, axis AS __value FROM v_adaptive_threshold_activity ORDER BY 1");
  const mutatorCode = queryVariable("mutatorCode", "Mutator Code", "SELECT DISTINCT mutator_code AS __text, mutator_code AS __value FROM v_mutator_outcome_daily ORDER BY 1");
  const panels = [
    statPanel(
      1,
      "Mutator Fire Count (24h)",
      { h: 4, w: 6, x: 0, y: 0 },
      `SELECT COALESCE(SUM(fire_count), 0) AS value FROM v_adaptive_threshold_activity WHERE bucket_at >= NOW() - INTERVAL '24 hours' AND ${filterRegex("axis", "axis")}`,
      "none",
      "Backed by v_adaptive_threshold_activity for recent mutator firing volume.",
    ),
    statPanel(
      2,
      "Helped Verdict Share",
      { h: 4, w: 6, x: 6, y: 0 },
      `SELECT COALESCE((SUM(helped_count)::numeric / NULLIF(SUM(total_count), 0)) * 100, 0) AS value FROM v_mutator_outcome_daily WHERE ${filterRegex("mutator_code", "mutatorCode")}`,
      "percent",
      "Backed by v_mutator_outcome_daily for helped outcome ratio.",
    ),
    statPanel(
      3,
      "Hurt Verdict Share",
      { h: 4, w: 6, x: 12, y: 0 },
      `SELECT COALESCE((SUM(hurt_count)::numeric / NULLIF(SUM(total_count), 0)) * 100, 0) AS value FROM v_mutator_outcome_daily WHERE ${filterRegex("mutator_code", "mutatorCode")}`,
      "percent",
      "Backed by v_mutator_outcome_daily for hurt outcome ratio.",
    ),
    statPanel(
      4,
      "Net Counterfactual Delta",
      { h: 4, w: 6, x: 18, y: 0 },
      `SELECT COALESCE(SUM(counterfactual_delta_usd), 0) AS value FROM v_mutator_outcome_daily WHERE ${filterRegex("mutator_code", "mutatorCode")}`,
      "currencyUSD",
      "Backed by v_mutator_outcome_daily for counterfactual delta aggregation.",
    ),
    timeseriesPanel(
      5,
      "Mutator Firing Rate by Axis",
      { h: 8, w: 12, x: 0, y: 4 },
      `SELECT bucket_at AS "time", axis AS metric, fire_rate AS value FROM v_adaptive_threshold_activity WHERE ${filterRegex("axis", "axis")} ORDER BY 1, 2`,
      "percent",
      "Backed by v_adaptive_threshold_activity for axis-level fire-rate trend.",
    ),
    timeseriesPanel(
      6,
      "Threshold Drift by Axis",
      { h: 8, w: 12, x: 12, y: 4 },
      `SELECT bucket_at AS "time", axis AS metric, threshold_drift AS value FROM v_adaptive_threshold_activity WHERE ${filterRegex("axis", "axis")} ORDER BY 1, 2`,
      "none",
      "Backed by v_adaptive_threshold_activity for threshold drift timeseries.",
    ),
    tablePanel(
      7,
      "Mutator Outcome Verdict Split",
      { h: 8, w: 12, x: 0, y: 12 },
      `SELECT mutator_code, SUM(helped_count) AS helped_count, SUM(hurt_count) AS hurt_count, SUM(neutral_count) AS neutral_count FROM v_mutator_outcome_daily WHERE ${filterRegex("mutator_code", "mutatorCode")} GROUP BY mutator_code ORDER BY hurt_count DESC`,
      undefined,
      "Backed by v_mutator_outcome_daily for helped/hurt/neutral verdict split.",
    ),
    tablePanel(
      8,
      "Counterfactual Delta Distribution",
      { h: 8, w: 12, x: 12, y: 12 },
      `SELECT mutator_code, bucket_label, bucket_count FROM v_mutator_outcome_daily WHERE ${filterRegex("mutator_code", "mutatorCode")} ORDER BY mutator_code, bucket_label`,
      undefined,
      "Backed by v_mutator_outcome_daily for counterfactual delta histogram bins.",
    ),
  ];

  return buildDashboard(
    "adaptiveTelemetry",
    "Adaptive mutator telemetry, threshold drift, and outcome verdict quality.",
    [pack, configVer, axis, mutatorCode],
    panels,
    [
      dashboardLink("Exit Reason RCA", dashboardMeta.exitReasonRca.uid),
      dashboardLink("Pack Leaderboard", dashboardMeta.packLeaderboard.uid),
      dashboardLink("Session Overview", dashboardMeta.sessionOverview.uid),
    ],
  );
}
