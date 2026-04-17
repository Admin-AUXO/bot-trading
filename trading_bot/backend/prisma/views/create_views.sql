





DROP VIEW IF EXISTS v_token_metrics_latest CASCADE;
DROP VIEW IF EXISTS v_token_metrics_aggregation CASCADE;
DROP VIEW IF EXISTS v_candidate_lifecycle CASCADE;
DROP VIEW IF EXISTS v_candidate_with_metrics CASCADE;
DROP VIEW IF EXISTS v_position_entry_analysis CASCADE;
DROP VIEW IF EXISTS v_position_with_metrics CASCADE;
DROP VIEW IF EXISTS v_position_monitor CASCADE;
DROP VIEW IF EXISTS v_fill_performance CASCADE;
DROP VIEW IF EXISTS v_runtime_overview CASCADE;
DROP VIEW IF EXISTS v_candidate_funnel_daily CASCADE;
DROP VIEW IF EXISTS v_api_telemetry_daily CASCADE;
DROP VIEW IF EXISTS v_api_provider_daily CASCADE;
DROP VIEW IF EXISTS v_api_endpoint_efficiency CASCADE;
DROP VIEW IF EXISTS v_position_pnl_daily CASCADE;
DROP VIEW IF EXISTS v_discovery_lab_run_summary CASCADE;
DROP VIEW IF EXISTS v_discovery_lab_pack_performance CASCADE;
DROP VIEW IF EXISTS v_shared_token_fact_cache CASCADE;
DROP VIEW IF EXISTS v_candidate_decision_facts CASCADE;





DROP FUNCTION IF EXISTS grafana_json_path_text(jsonb, text);
CREATE FUNCTION grafana_json_path_text(payload jsonb, dotted_path text)
RETURNS text
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT CASE
    WHEN payload IS NULL OR dotted_path IS NULL OR dotted_path = '' THEN NULL
    ELSE payload #>> string_to_array(dotted_path, '.')
  END
$$;






CREATE VIEW v_token_metrics_latest AS
WITH ranked AS (
  SELECT
    tm.*,
    ROW_NUMBER() OVER (
      PARTITION BY tm.mint, tm.trigger
      ORDER BY tm."capturedAt" DESC
    ) AS row_num
  FROM "TokenMetrics" tm
)
SELECT * FROM ranked WHERE row_num = 1;


CREATE VIEW v_token_metrics_aggregation AS
SELECT
  tm.mint,
  tm.trigger,
  DATE_TRUNC('hour', tm."capturedAt")::timestamp AS capture_hour,
  

  COUNT(*) AS sample_count,
  MAX(tm."capturedAt") AS latest_capture,
  

  AVG(tm."priceUsd"::numeric) AS avg_price_usd,
  MAX(tm."priceUsd"::numeric) AS max_price_usd,
  MIN(tm."priceUsd"::numeric) AS min_price_usd,
  (MAX(tm."priceUsd"::numeric) - MIN(tm."priceUsd"::numeric)) / NULLIF(MIN(tm."priceUsd"::numeric), 0) * 100 AS price_range_pct,
  

  SUM(tm."volume1mUsd"::numeric) AS total_volume_1m_usd,
  

  AVG(tm."holders")::int AS avg_holders,
  AVG(tm."top10HolderPct"::numeric) AS avg_top10_holder_pct,
  AVG(tm."largestHolderPct"::numeric) AS avg_largest_holder_pct,
  

  AVG(tm."trades1m")::int AS avg_trades_1m,
  AVG(tm."buys1m")::int AS avg_buys_1m,
  AVG(tm."sells1m")::int AS avg_sells_1m,
  CASE WHEN AVG(tm."sells1m") > 0 THEN AVG(tm."buys1m")::numeric / AVG(tm."sells1m")::numeric ELSE NULL END AS avg_buy_sell_ratio,
  

  AVG(tm."compositeScore"::numeric) AS avg_composite_score,
  MAX(tm."compositeScore"::numeric) AS max_composite_score,
  AVG(tm."riskScore"::numeric) AS avg_risk_score
  
FROM "TokenMetrics" tm
GROUP BY 1, 2, 3;






CREATE VIEW v_candidate_lifecycle AS
SELECT
  c.id,
  c.mint,
  c.symbol,
  c.status,
  c.source,
  c."discoveryLabRunId",
  

  c."discoveredAt",
  c."scheduledEvaluationAt",
  c."lastEvaluatedAt",
  c."acceptedAt",
  c."boughtAt",
  c."graduatedAt",
  c."lastTradeAt",
  c."creationAt",
  

  EXTRACT(EPOCH FROM (c."discoveredAt" - c."creationAt"))::int AS discovery_latency_sec,
  EXTRACT(EPOCH FROM (c."scheduledEvaluationAt" - c."discoveredAt"))::int AS queue_duration_sec,
  EXTRACT(EPOCH FROM (COALESCE(c."lastEvaluatedAt", NOW()) - c."scheduledEvaluationAt"))::int AS eval_delay_sec,
  EXTRACT(EPOCH FROM (c."acceptedAt" - COALESCE(c."lastEvaluatedAt", c."scheduledEvaluationAt")))::int AS accept_latency_sec,
  EXTRACT(EPOCH FROM (c."boughtAt" - c."acceptedAt"))::int AS entry_latency_sec,
  

  EXTRACT(EPOCH FROM (NOW() - c."lastTradeAt"))/60::int AS mins_since_last_trade,
  EXTRACT(EPOCH FROM (NOW() - c."discoveredAt"))/60::int AS mins_since_discovery,
  CASE WHEN c."lastTradeAt" IS NOT NULL AND EXTRACT(EPOCH FROM (NOW() - c."lastTradeAt"))/60 > 30 THEN TRUE ELSE FALSE END AS is_stale
  
FROM "Candidate" c;


CREATE VIEW v_candidate_with_metrics AS
SELECT
  c.*,
  tm."priceUsd"::numeric AS price_usd,
  tm."liquidityUsd"::numeric AS liquidity_usd,
  tm."marketCapUsd"::numeric AS market_cap_usd,
  tm."volume1mUsd"::numeric AS volume_1m_usd,
  tm."holders",
  tm."top10HolderPct"::numeric AS top10_holder_pct,
  tm."largestHolderPct"::numeric AS largest_holder_pct,
  tm."compositeScore"::numeric AS composite_score,
  tm."riskScore"::numeric AS risk_score,
  tm."capturedAt" AS metrics_captured_at,
  

  CASE WHEN tm."holders" > 0 THEN tm."volume1mUsd"::numeric / tm."holders" ELSE NULL END AS volume_per_holder,
  CASE WHEN tm."sells1m" > 0 THEN tm."buys1m"::numeric / tm."sells1m"::numeric ELSE NULL END AS buy_sell_ratio_1m,
  

  EXTRACT(EPOCH FROM (NOW() - c."discoveredAt"))/60::int AS mins_since_discovery,
  EXTRACT(EPOCH FROM (c."graduatedAt" - c."creationAt"))/60::int AS graduation_age_minutes
  
FROM "Candidate" c
LEFT JOIN v_token_metrics_latest tm ON tm.mint = c.mint AND tm.trigger = 'discovery'
WHERE tm.row_num = 1 OR tm.row_num IS NULL;






CREATE VIEW v_position_entry_analysis AS
SELECT
  p.id AS position_id,
  p.mint,
  p.symbol,
  p.status,
  p.strategy,
  p."entryOrigin",
  p."discoveryLabRunId",
  p."openedAt",
  

  p."entryPriceUsd"::numeric AS entry_price_usd,
  p."entryLiquidityUsd"::numeric AS entry_liquidity_usd,
  p."entryMktCapUsd"::numeric AS entry_market_cap_usd,
  p."entryHolders" AS entry_holders,
  p."entryVolume5mUsd"::numeric AS entry_volume_5m_usd,
  p."entryBuySellRatio"::numeric AS entry_buy_sell_ratio,
  p."entryTop10HolderPct"::numeric AS entry_top10_holder_pct,
  

  p."amountUsd"::numeric AS amount_usd,
  p."amountToken"::numeric AS amount_token,
  

  p."currentPriceUsd"::numeric AS current_price_usd,
  p."peakPriceUsd"::numeric AS peak_price_usd,
  

  p."stopLossPriceUsd"::numeric AS stop_loss_price_usd,
  p."takeProfit1PriceUsd"::numeric AS take_profit_1_price_usd,
  p."takeProfit2PriceUsd"::numeric AS take_profit_2_price_usd,
  

  p."maxAdverseExcursionPct"::numeric,
  p."timeToFirstProfitMins",
  

  CASE WHEN p."entryPriceUsd" > 0 
    THEN ((p."currentPriceUsd"::numeric - p."entryPriceUsd"::numeric) / p."entryPriceUsd"::numeric) * 100 
    ELSE NULL 
  END::numeric(12,4) AS unrealized_pnl_pct,
  EXTRACT(EPOCH FROM (NOW() - p."openedAt"))/60::numeric(12,2) AS hold_minutes
  
FROM "Position" p;


CREATE VIEW v_position_monitor AS
WITH latest_metrics AS (
  SELECT DISTINCT ON (mint)
    mint,
    "priceUsd"::numeric AS live_price,
    "liquidityUsd"::numeric AS live_liquidity,
    "volume1mUsd"::numeric AS live_volume_1m,
    "capturedAt"
  FROM "TokenMetrics"
  WHERE trigger IN ('scheduled', 'exit_check')
  ORDER BY mint, "capturedAt" DESC
),
metrics AS (
  SELECT
    p.id AS position_id,
    p.mint,
    p.symbol,
    p.status,
    p."entryPriceUsd"::numeric AS entry_price,
    COALESCE(lm.live_price, p."currentPriceUsd"::numeric) AS live_price,
    p."peakPriceUsd"::numeric AS peak_price,
    p."stopLossPriceUsd"::numeric AS stop_loss,
    p."takeProfit1PriceUsd"::numeric AS tp1,
    p."takeProfit2PriceUsd"::numeric AS tp2,
    p."tp1Done" AS tp1_done,
    p."tp2Done" AS tp2_done,
    p."openedAt",
    p.metadata -> 'metrics' ->> 'exitProfile' AS exit_profile,
    lm.live_liquidity,
    lm.live_volume_1m,
    lm."capturedAt" AS last_metric_at,
    

    CASE WHEN p."entryPriceUsd" > 0 
      THEN ((COALESCE(lm.live_price, p."currentPriceUsd"::numeric) - p."entryPriceUsd"::numeric) / p."entryPriceUsd"::numeric) * 100 
      ELSE NULL 
    END::numeric(12,4) AS return_pct,
    
    CASE WHEN COALESCE(lm.live_price, p."currentPriceUsd"::numeric) > 0 
      THEN ((COALESCE(lm.live_price, p."currentPriceUsd"::numeric) - p."stopLossPriceUsd"::numeric) / COALESCE(lm.live_price, p."currentPriceUsd"::numeric)) * 100 
      ELSE NULL 
    END::numeric(12,4) AS stop_distance_pct,
    
    EXTRACT(EPOCH FROM (NOW() - p."openedAt"))/60::numeric(12,2) AS hold_minutes,
    EXTRACT(EPOCH FROM (NOW() - lm."capturedAt"))/60::numeric(12,2) AS stale_minutes,
    
    CASE
      WHEN p."tp2Done" THEN 'tp2'
      WHEN p."tp1Done" THEN 'tp1'
      ELSE 'pre_tp1'
    END AS tp_stage
  
  FROM "Position" p
  LEFT JOIN latest_metrics lm ON lm.mint = p.mint
  WHERE p.status = 'OPEN'
)
SELECT
  *,
  

  (
    CASE WHEN stop_distance_pct <= 2 THEN 60 WHEN stop_distance_pct <= 5 THEN 35 ELSE 0 END
    + CASE WHEN return_pct <= -8 THEN 25 WHEN return_pct <= -3 THEN 10 ELSE 0 END
    + CASE WHEN stale_minutes >= 20 THEN 35 WHEN stale_minutes >= 10 THEN 15 ELSE 0 END
    + CASE WHEN NOT tp1_done THEN 8 WHEN tp1_done THEN 12 ELSE 0 END
  )::int AS intervention_priority,
  
  CASE
    WHEN stale_minutes >= 20 THEN 'stale'
    WHEN stop_distance_pct <= 2 THEN 'near_stop'
    WHEN return_pct <= -8 THEN 'loss_pressure'
    WHEN tp1_done AND NOT tp2_done THEN 'post_tp1'
    ELSE 'monitor'
  END AS alert_band
  
FROM metrics;






CREATE VIEW v_fill_performance AS
SELECT
  f.id AS fill_id,
  f."positionId",
  f.side,
  f."priceUsd"::numeric AS price_usd,
  f."amountUsd"::numeric AS amount_usd,
  f."pnlUsd"::numeric AS pnl_usd,
  f."executionSlippageBps"::numeric AS slippage_bps,
  f."totalLatencyMs" AS total_latency_ms,
  f."createdAt",
  f."executionReason",
  f."txSignature",
  

  p.symbol,
  p."entryPriceUsd"::numeric AS entry_price,
  p."entryOrigin",
  

  CASE WHEN f.side = 'SELL' AND p."entryPriceUsd" > 0 
    THEN (f."priceUsd"::numeric - p."entryPriceUsd"::numeric) / p."entryPriceUsd"::numeric * 100 
    ELSE NULL 
  END::numeric(12,4) AS price_vs_entry_pct,
  
  EXTRACT(EPOCH FROM (NOW() - f."createdAt"))/60::numeric(12,2) AS minutes_ago
  
FROM "Fill" f
JOIN "Position" p ON p.id = f."positionId";






CREATE VIEW v_runtime_overview AS
WITH config AS (
  SELECT COALESCE(MAX(id), 0)::int AS current_version FROM "RuntimeConfigVersion"
),
counts AS (
  SELECT 
    COUNT(*) FILTER (WHERE p.status = 'OPEN')::int AS open_positions,
    COUNT(*) FILTER (WHERE c.status IN ('DISCOVERED', 'SKIPPED', 'ERROR'))::int AS queued_candidates
  FROM "Position" p, "Candidate" c
)
SELECT
  b.id,
  b."tradeMode" AS trade_mode,
  b."capitalUsd"::numeric AS capital_usd,
  b."cashUsd"::numeric AS cash_usd,
  b."realizedPnlUsd"::numeric AS realized_pnl_usd,
  b."pauseReason",
  b."lastDiscoveryAt",
  b."lastEvaluationAt",
  b."lastExitCheckAt",
  c.open_positions,
  c.queued_candidates,
  cfg.current_version AS config_version
FROM "BotState" b, config cfg, counts c;


CREATE VIEW v_candidate_funnel_daily AS
SELECT
  DATE_TRUNC('day', "discoveredAt")::date AS session_date,
  COALESCE(NULLIF(source, ''), 'unknown') AS source,
  status,
  COUNT(*)::int AS candidate_count
FROM "Candidate"
GROUP BY 1, 2, 3;


CREATE VIEW v_api_telemetry_daily AS
SELECT
  DATE_TRUNC('day', "calledAt")::date AS session_date,
  provider,
  endpoint,
  COUNT(*)::int AS call_count,
  SUM(units)::int AS total_units,
  AVG(COALESCE("latencyMs", 0))::numeric(12,2) AS avg_latency_ms,
  SUM(CASE WHEN success THEN 0 ELSE 1 END)::int AS error_count,
  CASE WHEN COUNT(*) > 0 
    THEN SUM(CASE WHEN success THEN 0 ELSE 1 END)::numeric / COUNT(*)::numeric * 100 
    ELSE 0 
  END::numeric(12,4) AS error_rate_pct
FROM "ApiEvent"
GROUP BY 1, 2, 3;

CREATE VIEW v_api_provider_daily AS
SELECT
  session_date,
  provider,
  SUM(call_count)::int AS total_calls,
  SUM(total_units)::int AS total_units,
  CASE
    WHEN SUM(call_count) > 0
      THEN SUM(avg_latency_ms * call_count)::numeric / SUM(call_count)::numeric
    ELSE 0
  END::numeric(12,2) AS avg_latency_ms,
  SUM(error_count)::int AS error_count
FROM v_api_telemetry_daily
GROUP BY 1, 2;

CREATE VIEW v_api_endpoint_efficiency AS
SELECT
  DATE_TRUNC('day', "calledAt")::date AS session_date,
  provider,
  endpoint,
  COUNT(*)::int AS total_calls,
  COALESCE(SUM(units), 0)::int AS total_units,
  AVG(COALESCE("latencyMs", 0))::numeric(12,2) AS avg_latency_ms,
  SUM(CASE WHEN success THEN 0 ELSE 1 END)::int AS error_count,
  MAX("calledAt") AS last_called_at
FROM "ApiEvent"
GROUP BY 1, 2, 3;

CREATE VIEW v_position_pnl_daily AS
WITH closed_positions AS (
  SELECT
    p.id,
    DATE_TRUNC('day', p."closedAt")::date AS session_date,
    p."amountUsd"::numeric AS entry_amount_usd,
    EXTRACT(EPOCH FROM (p."closedAt" - p."openedAt")) / 60 AS hold_minutes
  FROM "Position" p
  WHERE p.status = 'CLOSED'
    AND p."closedAt" IS NOT NULL
),
sell_fills AS (
  SELECT
    f."positionId" AS position_id,
    COALESCE(SUM(f."pnlUsd"::numeric), 0)::numeric AS realized_pnl_usd
  FROM "Fill" f
  WHERE f.side = 'SELL'
  GROUP BY 1
)
SELECT
  c.session_date,
  COALESCE(SUM(sf.realized_pnl_usd), 0)::numeric AS realized_pnl_usd,
  COUNT(*)::int AS closed_count,
  CASE
    WHEN COUNT(*) > 0
      THEN AVG(CASE WHEN COALESCE(sf.realized_pnl_usd, 0) > 0 THEN 1 ELSE 0 END)::numeric * 100
    ELSE 0
  END::numeric(12,4) AS win_rate,
  CASE
    WHEN COUNT(*) > 0
      THEN AVG(
        CASE
          WHEN c.entry_amount_usd > 0
            THEN COALESCE(sf.realized_pnl_usd, 0) / c.entry_amount_usd * 100
          ELSE 0
        END
      )
    ELSE 0
  END::numeric(12,4) AS avg_return_pct,
  COALESCE(AVG(c.hold_minutes), 0)::numeric(12,2) AS avg_hold_minutes
FROM closed_positions c
LEFT JOIN sell_fills sf ON sf.position_id = c.id
GROUP BY 1;






CREATE VIEW v_discovery_lab_run_summary AS
SELECT
  d.id,
  d.status,
  d."packId",
  d."packName",
  d."packKind",
  d.profile,
  d."queryCount",
  d."winnerCount",
  d."evaluationCount",
  d."errorMessage",
  d."createdAt",
  d."startedAt",
  d."completedAt",
  

  EXTRACT(EPOCH FROM (COALESCE(d."completedAt", NOW()) - d."startedAt"))/60 AS run_minutes,
  COUNT(DISTINCT q.id) FILTER (WHERE q."goodCount" > 0)::int AS recipes_passed
  
FROM "DiscoveryLabRun" d
LEFT JOIN "DiscoveryLabRunQuery" q ON q."runId" = d.id
GROUP BY 1,2,3,4,5,6,7,8,9,10,11,12,13;


CREATE VIEW v_discovery_lab_pack_performance AS
SELECT
  d."packId" AS pack_id,
  d."packName" AS pack_name,
  d."packKind",
  COUNT(*)::int AS total_runs,
  COUNT(*) FILTER (WHERE d.status = 'COMPLETED')::int AS completed_runs,
  AVG(COALESCE(d."winnerCount", 0))::numeric(12,2) AS avg_winners,
  AVG(COALESCE(d."evaluationCount", 0))::numeric(12,2) AS avg_evaluations,
  MAX(d."startedAt") AS last_run_at
FROM "DiscoveryLabRun" d
GROUP BY 1, 2, 3;






CREATE VIEW v_shared_token_fact_cache AS
SELECT
  mint,
  symbol,
  name,
  source,
  "firstSeenAt",
  "lastSeenAt",
  

  EXTRACT(EPOCH FROM (NOW() - COALESCE("latestTradeDataAt", "firstSeenAt")))/60 AS trade_data_age_min,
  EXTRACT(EPOCH FROM (NOW() - COALESCE("latestSecurityAt", "firstSeenAt")))/60 AS security_age_min,
  EXTRACT(EPOCH FROM (NOW() - COALESCE("latestOverviewAt", "firstSeenAt")))/60 AS overview_age_min
  
FROM "SharedTokenFact";






CREATE VIEW v_candidate_decision_facts AS
WITH sell_summary AS (
  SELECT f."positionId",
    SUM(COALESCE(f."pnlUsd", 0)::numeric) AS realized_pnl_usd,
    MAX(f."createdAt") AS last_exit_at
  FROM "Fill" f
  WHERE f.side = 'SELL'
  GROUP BY f."positionId"
)
SELECT
  c.id AS candidate_id,
  c.mint,
  c.symbol,
  COALESCE(NULLIF(c.source, ''), 'unknown') AS source,
  c.status,
  c."rejectReason" AS reject_reason,
  COALESCE(NULLIF(c."entryOrigin", ''), 'auto_runtime') AS entry_origin,
  c."discoveryLabRunId" AS discovery_lab_run_id,
  c."discoveryRecipeName" AS discovery_recipe_name,
  c."discoveredAt" AS discovered_at,
  c."lastEvaluatedAt" AS evaluated_at,
  COALESCE(c."lastEvaluatedAt", c."discoveredAt") AS decision_at,
  (c."entryOrigin" = 'discovery_lab_manual_entry') AS manual_entry,

  COALESCE((c.metadata->>'confidenceScore')::numeric, 
    (tm."compositeScore")::numeric, 
    0) AS confidence_score,
  COALESCE((c.metadata->>'entryScore')::numeric, 0) AS entry_score,
  COALESCE(
    c.metadata->>'exitProfile',
    p.metadata->'metrics'->>'exitProfile',
    'unknown'
  ) AS exit_profile,
  CASE WHEN c.status IN ('ACCEPTED', 'BOUGHT', 'EXITED') THEN true ELSE false END AS accepted,
  CASE WHEN c."positionId" IS NOT NULL OR c.status IN ('BOUGHT', 'EXITED') THEN true ELSE false END AS bought,
  p.id AS position_id,
  p.status AS position_status,
  COALESCE(s.realized_pnl_usd, 0) AS realized_pnl_usd,
  CASE
    WHEN p.id IS NULL THEN 'no_position'
    WHEN p.status = 'OPEN' THEN 'open'
    WHEN COALESCE(s.realized_pnl_usd, 0) > 0 THEN 'win'
    WHEN COALESCE(s.realized_pnl_usd, 0) < 0 THEN 'loss'
    ELSE 'flat'
  END AS downstream_outcome
FROM "Candidate" c
LEFT JOIN "Position" p ON p.id = c."positionId"
LEFT JOIN sell_summary s ON s."positionId" = p.id
LEFT JOIN "TokenMetrics" tm ON tm.id = c."latestMetricsId";
