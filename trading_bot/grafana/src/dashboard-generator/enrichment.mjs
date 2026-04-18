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

export function buildEnrichmentQualityDashboard() {
  const pack = sharedPackVariable();
  const configVer = sharedConfigVersionVariable();
  const enrichmentSource = queryVariable("enrichmentSource", "Enrichment Source", "SELECT DISTINCT source AS __text, source AS __value FROM v_enrichment_quality_daily ORDER BY 1");
  const panels = [
    statPanel(
      1,
      "Success Rate (24h)",
      { h: 4, w: 6, x: 0, y: 0 },
      `SELECT COALESCE((SUM(success_count)::numeric / NULLIF(SUM(total_count), 0)) * 100, 0) AS value FROM v_enrichment_quality_daily WHERE day >= DATE_TRUNC('day', NOW()) - INTERVAL '1 day' AND ${filterRegex("source", "enrichmentSource")}`,
      "percent",
      "Backed by v_enrichment_quality_daily for per-source success ratio.",
    ),
    statPanel(
      2,
      "p95 Latency (ms)",
      { h: 4, w: 6, x: 6, y: 0 },
      `SELECT COALESCE(MAX(p95_latency_ms), 0) AS value FROM v_enrichment_quality_daily WHERE day >= DATE_TRUNC('day', NOW()) - INTERVAL '1 day' AND ${filterRegex("source", "enrichmentSource")}`,
      "ms",
      "Backed by v_enrichment_quality_daily for source latency p95.",
    ),
    statPanel(
      3,
      "Cache Hit %",
      { h: 4, w: 6, x: 12, y: 0 },
      `SELECT COALESCE(AVG(cache_hit_pct), 0) AS value FROM v_enrichment_freshness WHERE ${timeFilter("bucket_at")} AND ${filterRegex("source", "enrichmentSource")}`,
      "percent",
      "Backed by v_enrichment_freshness for cache-hit share.",
    ),
    statPanel(
      4,
      "Composite Coverage %",
      { h: 4, w: 6, x: 18, y: 0 },
      `SELECT COALESCE(AVG(composite_coverage_pct), 0) AS value FROM v_enrichment_quality_daily WHERE ${filterRegex("source", "enrichmentSource")}`,
      "percent",
      "Backed by v_enrichment_quality_daily for composite-score coverage.",
    ),
    timeseriesPanel(
      5,
      "Success Rate by Source",
      { h: 8, w: 12, x: 0, y: 4 },
      `SELECT day::timestamp AS "time", source AS metric, success_rate_pct AS value FROM v_enrichment_quality_daily WHERE ${filterRegex("source", "enrichmentSource")} ORDER BY 1, 2`,
      "percent",
      "Backed by v_enrichment_quality_daily for success-rate trend.",
    ),
    timeseriesPanel(
      6,
      "p95 Latency by Source",
      { h: 8, w: 12, x: 12, y: 4 },
      `SELECT day::timestamp AS "time", source AS metric, p95_latency_ms AS value FROM v_enrichment_quality_daily WHERE ${filterRegex("source", "enrichmentSource")} ORDER BY 1, 2`,
      "ms",
      "Backed by v_enrichment_quality_daily for latency trend.",
    ),
    timeseriesPanel(
      7,
      "Stale Share by Source",
      { h: 8, w: 12, x: 0, y: 12 },
      `SELECT bucket_at AS "time", source AS metric, stale_pct AS value FROM v_enrichment_freshness WHERE ${timeFilter("bucket_at")} AND ${filterRegex("source", "enrichmentSource")} ORDER BY 1, 2`,
      "percent",
      "Backed by v_enrichment_freshness for stale-data share.",
    ),
    tablePanel(
      8,
      "Composite Score Coverage Detail",
      { h: 8, w: 12, x: 12, y: 12 },
      `SELECT day, source, composite_coverage_pct, success_rate_pct, p95_latency_ms FROM v_enrichment_quality_daily WHERE ${filterRegex("source", "enrichmentSource")} ORDER BY day DESC, source`,
      undefined,
      "Backed by v_enrichment_quality_daily for coverage detail rows.",
    ),
    tablePanel(
      9,
      "Endpoint Efficiency (Enrichment Providers)",
      { h: 8, w: 24, x: 0, y: 20 },
      `SELECT provider, endpoint, calls_7d, credits_7d, avg_latency_ms, fail_rate
       FROM v_api_endpoint_efficiency
       WHERE provider IN ('TRENCH', 'BUBBLEMAPS', 'SOLSNIFFER', 'JUPITER', 'GECKOTERMINAL', 'CIELO', 'PUMPFUN', 'DEFILLAMA')
       ORDER BY fail_rate DESC, calls_7d DESC`,
      undefined,
      "Backed by v_api_endpoint_efficiency scoped to enrichment providers.",
    ),
  ];

  return buildDashboard(
    "enrichmentQuality",
    "Enrichment-provider quality, freshness, and composite-score coverage telemetry.",
    [pack, configVer, enrichmentSource],
    panels,
    [
      dashboardLink("Credit Burn", dashboardMeta.creditBurn.uid),
      dashboardLink("Telemetry & Provider Analytics", dashboardMeta.telemetry.uid),
      dashboardLink("Candidate Funnel", dashboardMeta.candidateFunnel.uid),
    ],
  );
}
