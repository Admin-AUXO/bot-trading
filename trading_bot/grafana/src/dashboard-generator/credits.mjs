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
  timeFilter,
  timeseriesPanel,
} from "./core.mjs";

export function buildCreditBurnDashboard() {
  const pack = sharedPackVariable();
  const configVer = sharedConfigVersionVariable();
  const provider = queryVariable("provider", "Provider", "SELECT DISTINCT provider AS __text, provider AS __value FROM v_api_provider_daily ORDER BY 1");
  const purpose = queryVariable("purpose", "Purpose", "SELECT DISTINCT purpose AS __text, purpose AS __value FROM v_api_purpose_daily ORDER BY 1");
  const panels = [
    statPanel(
      1,
      "MTD Birdeye Credits",
      { h: 4, w: 6, x: 0, y: 0 },
      `SELECT COALESCE(SUM(credits), 0) AS value FROM v_api_provider_daily WHERE day >= DATE_TRUNC('month', NOW()) AND provider = 'BIRDEYE' AND ${filterRegex("provider", "provider")}`,
      "none",
      "Backed by v_api_provider_daily for month-to-date Birdeye credit burn.",
    ),
    statPanel(
      2,
      "MTD Helius Credits",
      { h: 4, w: 6, x: 6, y: 0 },
      `SELECT COALESCE(SUM(credits), 0) AS value FROM v_api_provider_daily WHERE day >= DATE_TRUNC('month', NOW()) AND provider = 'HELIUS' AND ${filterRegex("provider", "provider")}`,
      "none",
      "Backed by v_api_provider_daily for month-to-date Helius credit burn.",
    ),
    statPanel(
      3,
      "Today Birdeye Credits",
      { h: 4, w: 6, x: 12, y: 0 },
      `SELECT COALESCE(SUM(credits), 0) AS value FROM v_api_provider_hourly WHERE hour >= DATE_TRUNC('day', NOW()) AND provider = 'BIRDEYE' AND ${filterRegex("provider", "provider")}`,
      "none",
      "Backed by v_api_provider_hourly for today's Birdeye burn.",
    ),
    statPanel(
      4,
      "Today Helius Credits",
      { h: 4, w: 6, x: 18, y: 0 },
      `SELECT COALESCE(SUM(credits), 0) AS value FROM v_api_provider_hourly WHERE hour >= DATE_TRUNC('day', NOW()) AND provider = 'HELIUS' AND ${filterRegex("provider", "provider")}`,
      "none",
      "Backed by v_api_provider_hourly for today's Helius burn.",
    ),
    timeseriesPanel(
      5,
      "Hourly Credits by Provider (48h)",
      { h: 8, w: 24, x: 0, y: 4 },
      `SELECT hour AS "time", provider AS metric, credits AS value FROM v_api_provider_hourly WHERE hour >= NOW() - INTERVAL '48 hours' AND ${filterRegex("provider", "provider")} ORDER BY 1, 2`,
      "none",
      "Backed by v_api_provider_hourly for short-horizon burn slope.",
    ),
    tablePanel(
      6,
      "Credits by Purpose (Today)",
      { h: 8, w: 12, x: 0, y: 12 },
      `SELECT provider, purpose, SUM(credits) AS credits, SUM(calls) AS calls FROM v_api_purpose_daily WHERE day = DATE_TRUNC('day', NOW()) AND ${filterRegex("provider", "provider")} AND ${filterRegex("purpose", "purpose")} GROUP BY provider, purpose ORDER BY credits DESC`,
      undefined,
      "Backed by v_api_purpose_daily for cost attribution by purpose.",
    ),
    tablePanel(
      7,
      "Credits by Pack (30d)",
      { h: 8, w: 12, x: 12, y: 12 },
      `SELECT pack_id, SUM(birdeye_credits) AS birdeye_credits, SUM(helius_credits) AS helius_credits, SUM(total_credits) AS total_credits FROM v_api_session_cost WHERE started_at >= NOW() - INTERVAL '30 days' AND ${filterRegex("pack_id", "pack")} GROUP BY pack_id ORDER BY total_credits DESC LIMIT 50`,
      undefined,
      "Backed by v_api_session_cost for rolling pack-level burn.",
    ),
    tablePanel(
      8,
      "Top Endpoints by 7d Credits",
      { h: 8, w: 24, x: 0, y: 20 },
      `SELECT provider, endpoint, calls_7d, credits_7d, avg_latency_ms, fail_rate FROM v_api_endpoint_efficiency WHERE ${filterRegex("provider", "provider")} ORDER BY credits_7d DESC LIMIT 10`,
      undefined,
      "Backed by v_api_endpoint_efficiency for endpoint efficiency ranking.",
    ),
    timeseriesPanel(
      9,
      "Monthly Forecast vs Plan",
      { h: 8, w: 16, x: 0, y: 28 },
      `WITH daily AS (
         SELECT day::date AS day, provider, credits
         FROM v_api_provider_daily
         WHERE day >= DATE_TRUNC('month', NOW()) AND ${filterRegex("provider", "provider")}
       )
       SELECT day::timestamp AS "time", provider || ' actual' AS metric, credits AS value
       FROM daily
       UNION ALL
       SELECT day::timestamp AS "time", provider || ' forecast' AS metric, AVG(credits) OVER (PARTITION BY provider) * EXTRACT(DAY FROM DATE_TRUNC('month', NOW()) + INTERVAL '1 month - 1 day') AS value
       FROM daily
       ORDER BY 1, 2`,
      "none",
      "Backed by v_api_provider_daily for month projection versus plan line.",
    ),
    tablePanel(
      10,
      "Active Credit Burn Alerts",
      { h: 8, w: 8, x: 16, y: 28 },
      `SELECT provider, SUM(credits) AS credits_last_hour, CASE WHEN SUM(credits) > 0 THEN 'check_slope' ELSE 'ok' END AS status
       FROM v_api_provider_hourly
       WHERE hour >= NOW() - INTERVAL '1 hour' AND ${filterRegex("provider", "provider")}
       GROUP BY provider
       ORDER BY credits_last_hour DESC`,
      undefined,
      "Backed by v_api_provider_hourly to surface active burn anomalies.",
    ),
  ];

  return buildDashboard(
    "creditBurn",
    "Credit burn tracking for provider budgets, cost attribution, and endpoint efficiency.",
    [pack, configVer, provider, purpose],
    panels,
    [
      dashboardLink("Telemetry & Provider Analytics", dashboardMeta.telemetry.uid),
      dashboardLink("Session Overview", dashboardMeta.sessionOverview.uid),
      dashboardLink("Pack Leaderboard", dashboardMeta.packLeaderboard.uid),
    ],
  );
}
