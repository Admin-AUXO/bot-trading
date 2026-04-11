DROP VIEW IF EXISTS v_runtime_live_status CASCADE;
DROP VIEW IF EXISTS v_open_position_monitor CASCADE;
DROP VIEW IF EXISTS v_recent_fill_activity CASCADE;
DROP VIEW IF EXISTS v_position_snapshot_latest CASCADE;
DROP VIEW IF EXISTS v_fill_pnl_daily CASCADE;
DROP VIEW IF EXISTS v_fill_daily CASCADE;
DROP VIEW IF EXISTS v_position_pnl_daily CASCADE;
DROP VIEW IF EXISTS v_source_outcome_daily CASCADE;
DROP VIEW IF EXISTS v_candidate_cohort_daily CASCADE;
DROP VIEW IF EXISTS v_position_cohort_daily CASCADE;
DROP VIEW IF EXISTS v_candidate_funnel_daily_source CASCADE;
DROP VIEW IF EXISTS v_candidate_reject_reason_daily_source CASCADE;
DROP VIEW IF EXISTS v_candidate_decision_facts CASCADE;
DROP VIEW IF EXISTS v_api_provider_hourly CASCADE;
DROP VIEW IF EXISTS v_api_endpoint_hourly CASCADE;
DROP VIEW IF EXISTS v_payload_failure_hourly CASCADE;
DROP VIEW IF EXISTS v_runtime_lane_health CASCADE;
DROP VIEW IF EXISTS v_config_change_log CASCADE;
DROP VIEW IF EXISTS v_kpi_by_config_window CASCADE;
DROP VIEW IF EXISTS v_config_field_change CASCADE;
DROP VIEW IF EXISTS v_runtime_overview CASCADE;
DROP VIEW IF EXISTS v_candidate_funnel_daily CASCADE;
DROP VIEW IF EXISTS v_position_performance CASCADE;
DROP VIEW IF EXISTS v_api_provider_daily CASCADE;
DROP VIEW IF EXISTS v_api_endpoint_efficiency CASCADE;
DROP VIEW IF EXISTS v_raw_api_payload_recent CASCADE;
DROP VIEW IF EXISTS v_token_snapshot_enriched CASCADE;
DROP VIEW IF EXISTS v_candidate_latest_filter_state CASCADE;
DROP VIEW IF EXISTS v_candidate_reject_reason_daily CASCADE;
DROP VIEW IF EXISTS v_snapshot_trigger_daily CASCADE;
DROP VIEW IF EXISTS v_position_exit_reason_daily CASCADE;
DROP VIEW IF EXISTS v_runtime_settings_current CASCADE;

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

CREATE VIEW v_runtime_overview AS
SELECT
  b.id,
  b."tradeMode" AS trade_mode,
  b."capitalUsd"::numeric AS capital_usd,
  b."cashUsd"::numeric AS cash_usd,
  b."realizedPnlUsd"::numeric AS realized_pnl_usd,
  b."pauseReason" AS pause_reason,
  b."lastDiscoveryAt" AS last_discovery_at,
  b."lastEvaluationAt" AS last_evaluation_at,
  b."lastExitCheckAt" AS last_exit_check_at,
  COALESCE(open_positions.open_count, 0) AS open_positions,
  COALESCE(discovered.queue_count, 0) AS queued_candidates,
  COALESCE(config_versions.current_config_version, 0) AS current_config_version
FROM "BotState" b
LEFT JOIN (
  SELECT COUNT(*)::int AS open_count
  FROM "Position"
  WHERE status = 'OPEN'
) open_positions ON TRUE
LEFT JOIN (
  SELECT COUNT(*)::int AS queue_count
  FROM "Candidate"
  WHERE status IN ('DISCOVERED', 'SKIPPED', 'ERROR')
) discovered ON TRUE
LEFT JOIN (
  SELECT COALESCE(MAX(id), 0)::int AS current_config_version
  FROM "RuntimeConfigVersion"
) config_versions ON TRUE;

CREATE VIEW v_candidate_funnel_daily AS
SELECT
  DATE_TRUNC('day', "discoveredAt")::date AS session_date,
  status,
  COUNT(*)::int AS candidate_count
FROM "Candidate"
GROUP BY 1, 2;

CREATE VIEW v_position_performance AS
WITH sell_fills AS (
  SELECT
    f."positionId",
    SUM(f."amountUsd")::numeric AS gross_exit_usd,
    SUM(COALESCE(f."pnlUsd", 0))::numeric AS realized_pnl_usd,
    MAX(f."createdAt") AS last_exit_at
  FROM "Fill" f
  WHERE f.side = 'SELL'
  GROUP BY 1
),
position_source AS (
  SELECT DISTINCT ON (c."positionId")
    c."positionId",
    c.source
  FROM "Candidate" c
  WHERE c."positionId" IS NOT NULL
  ORDER BY c."positionId", c."discoveredAt" DESC
),
config_windows AS (
  SELECT
    v.id AS config_version,
    v."activatedAt" AS activated_at,
    LEAD(v."activatedAt") OVER (ORDER BY v.id) AS next_activated_at
  FROM "RuntimeConfigVersion" v
)
SELECT
  p.id,
  p.mint,
  p.symbol,
  p.strategy,
  p.status,
  COALESCE(ps.source, 'unknown') AS source,
  COALESCE(p.metadata -> 'metrics' ->> 'exitProfile', 'unknown') AS exit_profile,
  COALESCE(cw.config_version, 0) AS config_version,
  p."openedAt" AS opened_at,
  p."closedAt" AS closed_at,
  p."entryPriceUsd"::numeric AS entry_price_usd,
  p."currentPriceUsd"::numeric AS current_price_usd,
  p."peakPriceUsd"::numeric AS peak_price_usd,
  p."amountUsd"::numeric AS amount_usd,
  p."amountToken"::numeric AS amount_token,
  p."remainingToken"::numeric AS remaining_token,
  COALESCE(s.gross_exit_usd, 0)::numeric AS gross_exit_usd,
  COALESCE(s.realized_pnl_usd, 0)::numeric AS realized_pnl_usd,
  CASE
    WHEN p."amountUsd" > 0 THEN COALESCE(s.realized_pnl_usd, 0) / p."amountUsd" * 100
    ELSE 0
  END AS realized_pnl_pct,
  EXTRACT(EPOCH FROM (COALESCE(p."closedAt", NOW()) - p."openedAt")) / 60.0 AS hold_minutes,
  p."exitReason" AS exit_reason
FROM "Position" p
LEFT JOIN sell_fills s ON s."positionId" = p.id
LEFT JOIN position_source ps ON ps."positionId" = p.id
LEFT JOIN config_windows cw
  ON p."openedAt" >= cw.activated_at
 AND (cw.next_activated_at IS NULL OR p."openedAt" < cw.next_activated_at);

CREATE VIEW v_api_provider_daily AS
SELECT
  DATE_TRUNC('day', "calledAt")::date AS session_date,
  provider,
  COUNT(*)::int AS total_calls,
  SUM(units)::int AS total_units,
  AVG(COALESCE("latencyMs", 0))::numeric(12, 2) AS avg_latency_ms,
  SUM(CASE WHEN success THEN 0 ELSE 1 END)::int AS error_count,
  CASE
    WHEN COUNT(*) > 0 THEN (SUM(CASE WHEN success THEN 0 ELSE 1 END)::numeric / COUNT(*)::numeric) * 100
    ELSE 0
  END::numeric(12, 4) AS error_rate_pct
FROM "ApiEvent"
GROUP BY 1, 2;

CREATE VIEW v_api_endpoint_efficiency AS
SELECT
  provider,
  endpoint,
  COUNT(*)::int AS total_calls,
  SUM(units)::int AS total_units,
  AVG(COALESCE("latencyMs", 0))::numeric(12, 2) AS avg_latency_ms,
  SUM(CASE WHEN success THEN 0 ELSE 1 END)::int AS error_count,
  CASE
    WHEN COUNT(*) > 0 THEN (SUM(CASE WHEN success THEN 0 ELSE 1 END)::numeric / COUNT(*)::numeric) * 100
    ELSE 0
  END::numeric(12, 4) AS error_rate_pct,
  MAX("calledAt") AS last_called_at
FROM "ApiEvent"
GROUP BY 1, 2;

CREATE VIEW v_raw_api_payload_recent AS
SELECT
  provider,
  endpoint,
  "requestMethod" AS request_method,
  "entityKey" AS entity_key,
  success,
  "statusCode" AS status_code,
  "latencyMs" AS latency_ms,
  CASE
    WHEN success THEN 'success'
    WHEN "statusCode" = 429 THEN 'rate_limited'
    WHEN LOWER(COALESCE("errorMessage", '')) LIKE '%timeout%' THEN 'timeout'
    WHEN LOWER(COALESCE("errorMessage", '')) LIKE '%unavailable%' OR COALESCE("statusCode", 0) >= 500 THEN 'upstream'
    WHEN COALESCE("statusCode", 0) BETWEEN 400 AND 499 THEN 'client'
    ELSE 'other_failure'
  END AS error_family,
  "requestParams" AS request_params,
  "responseBody" AS response_body,
  "errorMessage" AS error_message,
  "capturedAt" AS captured_at
FROM "RawApiPayload"
WHERE "capturedAt" >= NOW() - INTERVAL '14 days';

CREATE VIEW v_token_snapshot_enriched AS
WITH config_windows AS (
  SELECT
    v.id AS config_version,
    v."activatedAt" AS activated_at,
    LEAD(v."activatedAt") OVER (ORDER BY v.id) AS next_activated_at
  FROM "RuntimeConfigVersion" v
)
SELECT
  ts.id,
  ts.mint,
  ts.symbol,
  ts.trigger,
  ts.source,
  ts.creator,
  ts."platformId" AS platform_id,
  COALESCE(cw.config_version, 0) AS config_version,
  ts."capturedAt" AS captured_at,
  ts."creationAt" AS creation_at,
  ts."recentListingAt" AS recent_listing_at,
  ts."lastTradeAt" AS last_trade_at,
  ts.decimals,
  ts."progressPercent"::numeric AS progress_percent,
  ts."priceUsd"::numeric AS price_usd,
  ts."liquidityUsd"::numeric AS liquidity_usd,
  ts."marketCapUsd"::numeric AS market_cap_usd,
  ts."fdvUsd"::numeric AS fdv_usd,
  ts."totalSupply"::numeric AS total_supply,
  ts."circulatingSupply"::numeric AS circulating_supply,
  ts.holders,
  ts."volume1mUsd"::numeric AS volume_1m_usd,
  ts."volume5mUsd"::numeric AS volume_5m_usd,
  ts."volume30mUsd"::numeric AS volume_30m_usd,
  ts."volume1hUsd"::numeric AS volume_1h_usd,
  ts."volume24hUsd"::numeric AS volume_24h_usd,
  ts."volume1mChangePercent"::numeric AS volume_1m_change_percent,
  ts."volume5mChangePercent"::numeric AS volume_5m_change_percent,
  ts."volume30mChangePercent"::numeric AS volume_30m_change_percent,
  ts."volume1hChangePercent"::numeric AS volume_1h_change_percent,
  ts."volume24hChangePercent"::numeric AS volume_24h_change_percent,
  ts."volumeBuy1mUsd"::numeric AS volume_buy_1m_usd,
  ts."volumeBuy5mUsd"::numeric AS volume_buy_5m_usd,
  ts."volumeBuy30mUsd"::numeric AS volume_buy_30m_usd,
  ts."volumeBuy1hUsd"::numeric AS volume_buy_1h_usd,
  ts."volumeBuy24hUsd"::numeric AS volume_buy_24h_usd,
  ts."volumeSell1mUsd"::numeric AS volume_sell_1m_usd,
  ts."volumeSell5mUsd"::numeric AS volume_sell_5m_usd,
  ts."volumeSell30mUsd"::numeric AS volume_sell_30m_usd,
  ts."volumeSell1hUsd"::numeric AS volume_sell_1h_usd,
  ts."volumeSell24hUsd"::numeric AS volume_sell_24h_usd,
  ts."uniqueWallets1m" AS unique_wallets_1m,
  ts."uniqueWallets5m" AS unique_wallets_5m,
  ts."uniqueWallets30m" AS unique_wallets_30m,
  ts."uniqueWallets1h" AS unique_wallets_1h,
  ts."uniqueWallets24h" AS unique_wallets_24h,
  ts."trades1m" AS trades_1m,
  ts."trades5m" AS trades_5m,
  ts."trades30m" AS trades_30m,
  ts."trades1h" AS trades_1h,
  ts."trades24h" AS trades_24h,
  ts."buys1m" AS buys_1m,
  ts."buys5m" AS buys_5m,
  ts."buys30m" AS buys_30m,
  ts."buys1h" AS buys_1h,
  ts."buys24h" AS buys_24h,
  ts."sells1m" AS sells_1m,
  ts."sells5m" AS sells_5m,
  ts."sells30m" AS sells_30m,
  ts."sells1h" AS sells_1h,
  ts."sells24h" AS sells_24h,
  ts."buySellRatio"::numeric AS buy_sell_ratio,
  ts."priceChange1mPercent"::numeric AS price_change_1m_percent,
  ts."priceChange5mPercent"::numeric AS price_change_5m_percent,
  ts."priceChange30mPercent"::numeric AS price_change_30m_percent,
  ts."priceChange1hPercent"::numeric AS price_change_1h_percent,
  ts."priceChange24hPercent"::numeric AS price_change_24h_percent,
  ts."graduationAgeSeconds" AS graduation_age_seconds,
  ts."top10HolderPercent"::numeric AS top10_holder_percent,
  ts."largestHolderPercent"::numeric AS largest_holder_percent,
  ts."largestAccountsCount" AS largest_accounts_count,
  ts."largestHolderAddress" AS largest_holder_address,
  ts."creatorBalancePercent"::numeric AS creator_balance_percent,
  ts."ownerBalancePercent"::numeric AS owner_balance_percent,
  ts."updateAuthorityBalancePercent"::numeric AS update_authority_balance_percent,
  ts."top10UserPercent"::numeric AS top10_user_percent,
  ts."mintAuthorityActive" AS mint_authority_active,
  ts."freezeAuthorityActive" AS freeze_authority_active,
  ts."transferFeeEnabled" AS transfer_fee_enabled,
  ts."transferFeePercent"::numeric AS transfer_fee_percent,
  ts."trueToken" AS true_token,
  ts."token2022" AS token_2022,
  ts."nonTransferable" AS non_transferable,
  ts."fakeToken" AS fake_token,
  ts.honeypot,
  ts.freezeable,
  ts."mutableMetadata" AS mutable_metadata,
  ts."securityRisk" AS security_risk,
  c.status AS candidate_status,
  c."rejectReason" AS candidate_reject_reason,
  p.status AS position_status,
  p."exitReason" AS position_exit_reason,
  p."amountUsd"::numeric AS position_size_usd,
  p."entryPriceUsd"::numeric AS entry_price_usd,
  p."currentPriceUsd"::numeric AS current_price_usd
FROM "TokenSnapshot" ts
LEFT JOIN "Candidate" c ON c.id = ts."candidateId"
LEFT JOIN "Position" p ON p.id = ts."positionId"
LEFT JOIN config_windows cw
  ON ts."capturedAt" >= cw.activated_at
 AND (cw.next_activated_at IS NULL OR ts."capturedAt" < cw.next_activated_at);

CREATE VIEW v_candidate_latest_filter_state AS
SELECT
  c.id,
  c.mint,
  c.symbol,
  c.name,
  c.source,
  c.creator,
  c."platformId" AS platform_id,
  c.status,
  c."rejectReason" AS reject_reason,
  c."discoveredAt" AS discovered_at,
  c."graduatedAt" AS graduated_at,
  c."creationAt" AS creation_at,
  c."recentListingAt" AS recent_listing_at,
  c."lastTradeAt" AS last_trade_at,
  c.decimals,
  c."progressPercent"::numeric AS progress_percent,
  c."priceUsd"::numeric AS price_usd,
  c."liquidityUsd"::numeric AS liquidity_usd,
  c."marketCapUsd"::numeric AS market_cap_usd,
  c."fdvUsd"::numeric AS fdv_usd,
  c."totalSupply"::numeric AS total_supply,
  c."circulatingSupply"::numeric AS circulating_supply,
  c.holders,
  c."volume1mUsd"::numeric AS volume_1m_usd,
  c."volume5mUsd"::numeric AS volume_5m_usd,
  c."volume30mUsd"::numeric AS volume_30m_usd,
  c."volume1hUsd"::numeric AS volume_1h_usd,
  c."volume24hUsd"::numeric AS volume_24h_usd,
  c."volume1mChangePercent"::numeric AS volume_1m_change_percent,
  c."volume5mChangePercent"::numeric AS volume_5m_change_percent,
  c."volume30mChangePercent"::numeric AS volume_30m_change_percent,
  c."volume1hChangePercent"::numeric AS volume_1h_change_percent,
  c."volume24hChangePercent"::numeric AS volume_24h_change_percent,
  c."volumeBuy1mUsd"::numeric AS volume_buy_1m_usd,
  c."volumeBuy5mUsd"::numeric AS volume_buy_5m_usd,
  c."volumeBuy30mUsd"::numeric AS volume_buy_30m_usd,
  c."volumeBuy1hUsd"::numeric AS volume_buy_1h_usd,
  c."volumeBuy24hUsd"::numeric AS volume_buy_24h_usd,
  c."volumeSell1mUsd"::numeric AS volume_sell_1m_usd,
  c."volumeSell5mUsd"::numeric AS volume_sell_5m_usd,
  c."volumeSell30mUsd"::numeric AS volume_sell_30m_usd,
  c."volumeSell1hUsd"::numeric AS volume_sell_1h_usd,
  c."volumeSell24hUsd"::numeric AS volume_sell_24h_usd,
  c."uniqueWallets1m" AS unique_wallets_1m,
  c."uniqueWallets5m" AS unique_wallets_5m,
  c."uniqueWallets30m" AS unique_wallets_30m,
  c."uniqueWallets1h" AS unique_wallets_1h,
  c."uniqueWallets24h" AS unique_wallets_24h,
  c."trades1m" AS trades_1m,
  c."trades5m" AS trades_5m,
  c."trades30m" AS trades_30m,
  c."trades1h" AS trades_1h,
  c."trades24h" AS trades_24h,
  c."buys1m" AS buys_1m,
  c."buys5m" AS buys_5m,
  c."buys30m" AS buys_30m,
  c."buys1h" AS buys_1h,
  c."buys24h" AS buys_24h,
  c."sells1m" AS sells_1m,
  c."sells5m" AS sells_5m,
  c."sells30m" AS sells_30m,
  c."sells1h" AS sells_1h,
  c."sells24h" AS sells_24h,
  c."buySellRatio"::numeric AS buy_sell_ratio,
  c."priceChange1mPercent"::numeric AS price_change_1m_percent,
  c."priceChange5mPercent"::numeric AS price_change_5m_percent,
  c."priceChange30mPercent"::numeric AS price_change_30m_percent,
  c."priceChange1hPercent"::numeric AS price_change_1h_percent,
  c."priceChange24hPercent"::numeric AS price_change_24h_percent,
  c."graduationAgeSeconds" AS graduation_age_seconds,
  c."top10HolderPercent"::numeric AS top10_holder_percent,
  c."largestHolderPercent"::numeric AS largest_holder_percent,
  c."largestAccountsCount" AS largest_accounts_count,
  c."largestHolderAddress" AS largest_holder_address,
  c."creatorBalancePercent"::numeric AS creator_balance_percent,
  c."ownerBalancePercent"::numeric AS owner_balance_percent,
  c."updateAuthorityBalancePercent"::numeric AS update_authority_balance_percent,
  c."top10UserPercent"::numeric AS top10_user_percent,
  c."mintAuthorityActive" AS mint_authority_active,
  c."freezeAuthorityActive" AS freeze_authority_active,
  c."transferFeeEnabled" AS transfer_fee_enabled,
  c."transferFeePercent"::numeric AS transfer_fee_percent,
  c."trueToken" AS true_token,
  c."token2022" AS token_2022,
  c."nonTransferable" AS non_transferable,
  c."fakeToken" AS fake_token,
  c.honeypot,
  c.freezeable,
  c."mutableMetadata" AS mutable_metadata,
  c."lastFilterSnapshotAt" AS last_filter_snapshot_at,
  c."securityCheckedAt" AS security_checked_at,
  latest_snapshot.security_risk,
  latest_snapshot.captured_at AS last_snapshot_at
FROM "Candidate" c
LEFT JOIN LATERAL (
  SELECT
    ts."securityRisk" AS security_risk,
    ts."capturedAt" AS captured_at
  FROM "TokenSnapshot" ts
  WHERE ts."candidateId" = c.id
  ORDER BY ts."capturedAt" DESC
  LIMIT 1
) latest_snapshot ON TRUE;

CREATE VIEW v_candidate_reject_reason_daily AS
SELECT
  DATE_TRUNC('day', "lastEvaluatedAt")::date AS session_date,
  COALESCE("rejectReason", 'accepted_or_unknown') AS reject_reason,
  COUNT(*)::int AS candidate_count
FROM "Candidate"
WHERE "lastEvaluatedAt" IS NOT NULL
GROUP BY 1, 2;

CREATE VIEW v_snapshot_trigger_daily AS
SELECT
  DATE_TRUNC('day', "capturedAt")::date AS session_date,
  trigger,
  COUNT(*)::int AS snapshot_count,
  COUNT(DISTINCT mint)::int AS unique_tokens,
  AVG(COALESCE("liquidityUsd", 0))::numeric(18, 2) AS avg_liquidity_usd,
  AVG(COALESCE("marketCapUsd", 0))::numeric(18, 2) AS avg_market_cap_usd,
  AVG(COALESCE("buySellRatio", 0))::numeric(12, 4) AS avg_buy_sell_ratio
FROM "TokenSnapshot"
GROUP BY 1, 2;

CREATE VIEW v_position_exit_reason_daily AS
WITH position_source AS (
  SELECT DISTINCT ON (c."positionId")
    c."positionId",
    c.source
  FROM "Candidate" c
  WHERE c."positionId" IS NOT NULL
  ORDER BY c."positionId", c."discoveredAt" DESC
),
config_windows AS (
  SELECT
    v.id AS config_version,
    v."activatedAt" AS activated_at,
    LEAD(v."activatedAt") OVER (ORDER BY v.id) AS next_activated_at
  FROM "RuntimeConfigVersion" v
)
SELECT
  DATE_TRUNC('day', COALESCE(p."closedAt", p."openedAt"))::date AS session_date,
  COALESCE("exitReason", 'open') AS exit_reason,
  COALESCE(ps.source, 'unknown') AS source,
  COALESCE(cw.config_version, 0) AS config_version,
  COUNT(*)::int AS position_count,
  AVG(EXTRACT(EPOCH FROM (COALESCE("closedAt", NOW()) - "openedAt")) / 60.0)::numeric(12, 2) AS avg_hold_minutes,
  AVG(COALESCE("currentPriceUsd", 0) - COALESCE("entryPriceUsd", 0))::numeric(18, 9) AS avg_price_delta_usd
FROM "Position" p
LEFT JOIN position_source ps ON ps."positionId" = p.id
LEFT JOIN config_windows cw
  ON p."openedAt" >= cw.activated_at
 AND (cw.next_activated_at IS NULL OR p."openedAt" < cw.next_activated_at)
GROUP BY 1, 2, 3, 4;

CREATE VIEW v_runtime_settings_current AS
SELECT
  r.id,
  r."updatedAt" AS updated_at,
  COALESCE(config_versions.current_config_version, 0) AS current_config_version,
  r.settings ->> 'tradeMode' AS trade_mode,
  (r.settings -> 'capital' ->> 'capitalUsd')::numeric AS capital_usd,
  (r.settings -> 'capital' ->> 'positionSizeUsd')::numeric AS position_size_usd,
  (r.settings -> 'capital' ->> 'maxOpenPositions')::numeric AS max_open_positions,
  (r.settings -> 'filters' ->> 'minLiquidityUsd')::numeric AS min_liquidity_usd,
  (r.settings -> 'filters' ->> 'minVolume5mUsd')::numeric AS min_volume_5m_usd,
  (r.settings -> 'filters' ->> 'minUniqueBuyers5m')::numeric AS min_unique_buyers_5m,
  (r.settings -> 'filters' ->> 'maxTop10HolderPercent')::numeric AS max_top10_holder_percent,
  (r.settings -> 'filters' ->> 'maxSingleHolderPercent')::numeric AS max_single_holder_percent,
  (r.settings -> 'exits' ->> 'stopLossPercent')::numeric AS stop_loss_percent,
  (r.settings -> 'exits' ->> 'tp1Multiplier')::numeric AS tp1_multiplier,
  (r.settings -> 'exits' ->> 'tp2Multiplier')::numeric AS tp2_multiplier,
  (r.settings -> 'exits' ->> 'trailingStopPercent')::numeric AS trailing_stop_percent,
  (r.settings -> 'exits' ->> 'timeStopMinutes')::numeric AS time_stop_minutes,
  (r.settings -> 'exits' ->> 'timeLimitMinutes')::numeric AS time_limit_minutes
FROM "RuntimeConfig" r
LEFT JOIN (
  SELECT COALESCE(MAX(id), 0)::int AS current_config_version
  FROM "RuntimeConfigVersion"
) config_versions ON TRUE;

CREATE VIEW v_api_provider_hourly AS
SELECT
  DATE_TRUNC('hour', "calledAt") AS bucket_at,
  provider,
  COUNT(*)::int AS total_calls,
  SUM(units)::int AS total_units,
  AVG(COALESCE("latencyMs", 0))::numeric(12, 2) AS avg_latency_ms,
  SUM(CASE WHEN success THEN 0 ELSE 1 END)::int AS error_count
FROM "ApiEvent"
GROUP BY 1, 2;

CREATE VIEW v_api_endpoint_hourly AS
SELECT
  DATE_TRUNC('hour', "calledAt") AS bucket_at,
  provider,
  endpoint,
  COUNT(*)::int AS total_calls,
  SUM(units)::int AS total_units,
  AVG(COALESCE("latencyMs", 0))::numeric(12, 2) AS avg_latency_ms,
  SUM(CASE WHEN success THEN 0 ELSE 1 END)::int AS error_count
FROM "ApiEvent"
GROUP BY 1, 2, 3;

CREATE VIEW v_payload_failure_hourly AS
SELECT
  DATE_TRUNC('hour', "capturedAt") AS bucket_at,
  provider,
  endpoint,
  COALESCE("statusCode", 0) AS status_code,
  CASE
    WHEN "statusCode" = 429 THEN 'rate_limited'
    WHEN LOWER(COALESCE("errorMessage", '')) LIKE '%timeout%' THEN 'timeout'
    WHEN LOWER(COALESCE("errorMessage", '')) LIKE '%unavailable%' OR COALESCE("statusCode", 0) >= 500 THEN 'upstream'
    WHEN COALESCE("statusCode", 0) BETWEEN 400 AND 499 THEN 'client'
    ELSE 'other_failure'
  END AS error_family,
  COUNT(*)::int AS failure_count
FROM "RawApiPayload"
WHERE success = FALSE
GROUP BY 1, 2, 3, 4, 5;

CREATE VIEW v_runtime_lane_health AS
WITH research_state AS (
  SELECT
    r.status,
    r."lastPolledAt" AS last_polled_at,
    r."pollIntervalMs" AS poll_interval_ms
  FROM "ResearchRun" r
  WHERE r.status = 'RUNNING'
  ORDER BY r."startedAt" DESC
  LIMIT 1
)
SELECT
  b."tradeMode" AS trade_mode,
  b."pauseReason" AS pause_reason,
  'discovery' AS lane,
  b."lastDiscoveryAt" AS last_run_at,
  30::int AS stale_after_minutes,
  CASE
    WHEN b."lastDiscoveryAt" IS NULL THEN NULL
    ELSE EXTRACT(EPOCH FROM (NOW() - b."lastDiscoveryAt")) / 60.0
  END::numeric(12, 2) AS age_minutes,
  CASE
    WHEN b."lastDiscoveryAt" IS NULL OR b."lastDiscoveryAt" < NOW() - INTERVAL '30 minutes' THEN 'warning'
    ELSE 'healthy'
  END AS status,
  CASE
    WHEN b."lastDiscoveryAt" IS NULL THEN 'discovery has not run yet'
    WHEN b."pauseReason" IS NOT NULL THEN b."pauseReason"
    ELSE NULL
  END AS detail
FROM "BotState" b
UNION ALL
SELECT
  b."tradeMode" AS trade_mode,
  b."pauseReason" AS pause_reason,
  'evaluation' AS lane,
  b."lastEvaluationAt" AS last_run_at,
  20::int AS stale_after_minutes,
  CASE
    WHEN b."lastEvaluationAt" IS NULL THEN NULL
    ELSE EXTRACT(EPOCH FROM (NOW() - b."lastEvaluationAt")) / 60.0
  END::numeric(12, 2) AS age_minutes,
  CASE
    WHEN b."lastEvaluationAt" IS NULL OR b."lastEvaluationAt" < NOW() - INTERVAL '20 minutes' THEN 'warning'
    ELSE 'healthy'
  END AS status,
  CASE
    WHEN b."lastEvaluationAt" IS NULL THEN 'evaluation has not run yet'
    WHEN b."pauseReason" IS NOT NULL THEN b."pauseReason"
    ELSE NULL
  END AS detail
FROM "BotState" b
UNION ALL
SELECT
  b."tradeMode" AS trade_mode,
  b."pauseReason" AS pause_reason,
  'exit' AS lane,
  b."lastExitCheckAt" AS last_run_at,
  20::int AS stale_after_minutes,
  CASE
    WHEN b."lastExitCheckAt" IS NULL THEN NULL
    ELSE EXTRACT(EPOCH FROM (NOW() - b."lastExitCheckAt")) / 60.0
  END::numeric(12, 2) AS age_minutes,
  CASE
    WHEN b."lastExitCheckAt" IS NULL OR b."lastExitCheckAt" < NOW() - INTERVAL '20 minutes' THEN 'warning'
    ELSE 'healthy'
  END AS status,
  CASE
    WHEN b."lastExitCheckAt" IS NULL THEN 'exit loop has not run yet'
    WHEN b."pauseReason" IS NOT NULL THEN b."pauseReason"
    ELSE NULL
  END AS detail
FROM "BotState" b
UNION ALL
SELECT
  b."tradeMode" AS trade_mode,
  b."pauseReason" AS pause_reason,
  'research' AS lane,
  rs.last_polled_at AS last_run_at,
  COALESCE(GREATEST(CEIL(rs.poll_interval_ms / 60000.0)::int, 5), 10) AS stale_after_minutes,
  CASE
    WHEN rs.last_polled_at IS NULL THEN NULL
    ELSE EXTRACT(EPOCH FROM (NOW() - rs.last_polled_at)) / 60.0
  END::numeric(12, 2) AS age_minutes,
  CASE
    WHEN rs.status IS NULL THEN 'idle'
    WHEN rs.last_polled_at IS NULL THEN 'warning'
    WHEN rs.last_polled_at < NOW() - MAKE_INTERVAL(mins => GREATEST(CEIL(rs.poll_interval_ms / 60000.0)::int, 5)) THEN 'warning'
    ELSE 'healthy'
  END AS status,
  CASE
    WHEN rs.status IS NULL THEN 'no active research run'
    ELSE 'active research polling'
  END AS detail
FROM "BotState" b
LEFT JOIN research_state rs ON TRUE;

CREATE VIEW v_position_snapshot_latest AS
WITH ranked AS (
  SELECT
    p.id AS position_id,
    p.mint,
    p.symbol,
    ts.id AS snapshot_id,
    ts.trigger,
    ts."capturedAt" AS captured_at,
    ts."priceUsd"::numeric AS price_usd,
    ts."liquidityUsd"::numeric AS liquidity_usd,
    ts."volume5mUsd"::numeric AS volume_5m_usd,
    ts."buySellRatio"::numeric AS buy_sell_ratio,
    ts."top10HolderPercent"::numeric AS top10_holder_percent,
    ts."largestHolderPercent"::numeric AS largest_holder_percent,
    ts."securityRisk" AS security_risk,
    ROW_NUMBER() OVER (
      PARTITION BY p.id
      ORDER BY CASE WHEN ts."positionId" = p.id THEN 0 ELSE 1 END, ts."capturedAt" DESC NULLS LAST
    ) AS row_num
  FROM "Position" p
  LEFT JOIN "TokenSnapshot" ts
    ON ts.mint = p.mint
   AND (ts."positionId" = p.id OR ts."positionId" IS NULL)
)
SELECT
  position_id,
  mint,
  symbol,
  snapshot_id,
  trigger,
  captured_at,
  price_usd,
  liquidity_usd,
  volume_5m_usd,
  buy_sell_ratio,
  top10_holder_percent,
  largest_holder_percent,
  security_risk
FROM ranked
WHERE row_num = 1;

CREATE VIEW v_open_position_monitor AS
WITH position_source AS (
  SELECT DISTINCT ON (c."positionId")
    c."positionId",
    c.source
  FROM "Candidate" c
  WHERE c."positionId" IS NOT NULL
  ORDER BY c."positionId", c."discoveredAt" DESC
),
metrics AS (
  SELECT
    p.id AS position_id,
    p.mint,
    p.symbol,
    p.status,
    COALESCE(ps.source, 'unknown') AS source,
    p."openedAt" AS opened_at,
    p."entryPriceUsd"::numeric AS entry_price_usd,
    COALESCE(snapshot.price_usd, p."currentPriceUsd"::numeric) AS live_price_usd,
    p."peakPriceUsd"::numeric AS peak_price_usd,
    p."stopLossPriceUsd"::numeric AS stop_loss_price_usd,
    p."takeProfit1PriceUsd"::numeric AS take_profit_1_price_usd,
    p."takeProfit2PriceUsd"::numeric AS take_profit_2_price_usd,
    p."remainingToken"::numeric AS remaining_token,
    snapshot.captured_at AS snapshot_captured_at,
    snapshot.liquidity_usd,
    snapshot.volume_5m_usd,
    snapshot.buy_sell_ratio,
    snapshot.security_risk,
    COALESCE(p.metadata -> 'metrics' ->> 'exitProfile', 'unknown') AS exit_profile,
    CASE
      WHEN p."tp2Done" THEN 'tp2'
      WHEN p."tp1Done" THEN 'tp1'
      ELSE 'pre_tp1'
    END AS tp_stage,
    CASE
      WHEN COALESCE(snapshot.price_usd, p."currentPriceUsd"::numeric) > 0
        THEN ((COALESCE(snapshot.price_usd, p."currentPriceUsd"::numeric) - p."stopLossPriceUsd"::numeric)
          / COALESCE(snapshot.price_usd, p."currentPriceUsd"::numeric)) * 100
      ELSE NULL
    END::numeric(12, 4) AS stop_distance_pct,
    CASE
      WHEN p."entryPriceUsd" > 0
        THEN ((COALESCE(snapshot.price_usd, p."currentPriceUsd"::numeric) - p."entryPriceUsd"::numeric)
          / p."entryPriceUsd"::numeric) * 100
      ELSE NULL
    END::numeric(12, 4) AS return_pct,
    EXTRACT(EPOCH FROM (NOW() - COALESCE(snapshot.captured_at, p."openedAt"))) / 60.0 AS stale_minutes,
    p."tp1Done" AS tp1_done,
    p."tp2Done" AS tp2_done
  FROM "Position" p
  LEFT JOIN position_source ps ON ps."positionId" = p.id
  LEFT JOIN v_position_snapshot_latest snapshot ON snapshot.position_id = p.id
  WHERE p.status = 'OPEN'
)
SELECT
  position_id,
  mint,
  symbol,
  status,
  source,
  opened_at,
  entry_price_usd,
  live_price_usd,
  peak_price_usd,
  stop_loss_price_usd,
  take_profit_1_price_usd,
  take_profit_2_price_usd,
  remaining_token,
  snapshot_captured_at,
  liquidity_usd,
  volume_5m_usd,
  buy_sell_ratio,
  security_risk,
  exit_profile,
  tp_stage,
  stop_distance_pct,
  return_pct,
  stale_minutes::numeric(12, 2) AS stale_minutes,
  (
    CASE
      WHEN stop_distance_pct <= 2 THEN 60
      WHEN stop_distance_pct <= 5 THEN 35
      ELSE 0
    END
    + CASE
      WHEN return_pct <= -8 THEN 25
      WHEN return_pct <= -3 THEN 10
      ELSE 0
    END
    + CASE
      WHEN stale_minutes >= 20 THEN 35
      WHEN stale_minutes >= 10 THEN 15
      ELSE 0
    END
    + CASE
      WHEN NOT tp1_done THEN 8
      WHEN tp1_done AND NOT tp2_done THEN 12
      ELSE 0
    END
  )::int AS intervention_priority,
  CASE
    WHEN stale_minutes >= 20 THEN 'stale'
    WHEN stop_distance_pct <= 2 THEN 'near_stop'
    WHEN return_pct <= -8 THEN 'loss_pressure'
    WHEN tp1_done AND NOT tp2_done THEN 'post_tp1'
    ELSE 'monitor'
  END AS intervention_band
FROM metrics;

CREATE VIEW v_recent_fill_activity AS
WITH position_source AS (
  SELECT DISTINCT ON (c."positionId")
    c."positionId",
    c.source
  FROM "Candidate" c
  WHERE c."positionId" IS NOT NULL
  ORDER BY c."positionId", c."discoveredAt" DESC
),
config_windows AS (
  SELECT
    v.id AS config_version,
    v."activatedAt" AS activated_at,
    LEAD(v."activatedAt") OVER (ORDER BY v.id) AS next_activated_at
  FROM "RuntimeConfigVersion" v
)
SELECT
  f.id AS fill_id,
  f."createdAt" AS created_at,
  f.side,
  p.id AS position_id,
  p.mint,
  p.symbol,
  COALESCE(ps.source, 'unknown') AS source,
  COALESCE(cw.config_version, 0) AS config_version,
  COALESCE(p.metadata -> 'metrics' ->> 'exitProfile', 'unknown') AS exit_profile,
  f."priceUsd"::numeric AS price_usd,
  f."amountUsd"::numeric AS amount_usd,
  f."amountToken"::numeric AS amount_token,
  f."pnlUsd"::numeric AS pnl_usd,
  f."txSignature" AS tx_signature,
  EXTRACT(EPOCH FROM (NOW() - f."createdAt")) / 60.0 AS minutes_ago
FROM "Fill" f
JOIN "Position" p ON p.id = f."positionId"
LEFT JOIN position_source ps ON ps."positionId" = p.id
LEFT JOIN config_windows cw
  ON p."openedAt" >= cw.activated_at
 AND (cw.next_activated_at IS NULL OR p."openedAt" < cw.next_activated_at)
WHERE f."createdAt" >= NOW() - INTERVAL '7 days'
ORDER BY f."createdAt" DESC;

CREATE VIEW v_runtime_live_status AS
SELECT
  b.id,
  b."tradeMode" AS trade_mode,
  b."capitalUsd"::numeric AS capital_usd,
  b."cashUsd"::numeric AS cash_usd,
  b."realizedPnlUsd"::numeric AS realized_pnl_usd,
  b."pauseReason" AS pause_reason,
  b."lastDiscoveryAt" AS last_discovery_at,
  b."lastEvaluationAt" AS last_evaluation_at,
  b."lastExitCheckAt" AS last_exit_check_at,
  COALESCE(open_positions.open_positions, 0) AS open_positions,
  COALESCE(open_positions.stale_positions, 0) AS stale_positions,
  COALESCE(open_positions.high_priority_positions, 0) AS high_priority_positions,
  COALESCE(fill_stats.recent_fills, 0) AS recent_fills,
  COALESCE(config_versions.current_config_version, 0) AS current_config_version
FROM "BotState" b
LEFT JOIN (
  SELECT
    COUNT(*)::int AS open_positions,
    COUNT(*) FILTER (WHERE stale_minutes >= 20)::int AS stale_positions,
    COUNT(*) FILTER (WHERE intervention_priority >= 60)::int AS high_priority_positions
  FROM v_open_position_monitor
) open_positions ON TRUE
LEFT JOIN (
  SELECT COUNT(*)::int AS recent_fills
  FROM v_recent_fill_activity
  WHERE created_at >= NOW() - INTERVAL '6 hours'
) fill_stats ON TRUE
LEFT JOIN (
  SELECT COALESCE(MAX(id), 0)::int AS current_config_version
  FROM "RuntimeConfigVersion"
) config_versions ON TRUE;

CREATE VIEW v_fill_pnl_daily AS
WITH position_source AS (
  SELECT DISTINCT ON (c."positionId")
    c."positionId",
    c.source
  FROM "Candidate" c
  WHERE c."positionId" IS NOT NULL
  ORDER BY c."positionId", c."discoveredAt" DESC
),
config_windows AS (
  SELECT
    v.id AS config_version,
    v."activatedAt" AS activated_at,
    LEAD(v."activatedAt") OVER (ORDER BY v.id) AS next_activated_at
  FROM "RuntimeConfigVersion" v
)
SELECT
  DATE_TRUNC('day', f."createdAt")::date AS session_date,
  COALESCE(ps.source, 'unknown') AS source,
  COALESCE(cw.config_version, 0) AS config_version,
  COUNT(*)::int AS sell_fill_count,
  SUM(f."amountUsd")::numeric AS gross_exit_usd,
  SUM(COALESCE(f."pnlUsd", 0))::numeric AS realized_pnl_usd,
  AVG(COALESCE(f."pnlUsd", 0))::numeric(18, 9) AS avg_realized_pnl_usd
FROM "Fill" f
JOIN "Position" p ON p.id = f."positionId"
LEFT JOIN position_source ps ON ps."positionId" = p.id
LEFT JOIN config_windows cw
  ON p."openedAt" >= cw.activated_at
 AND (cw.next_activated_at IS NULL OR p."openedAt" < cw.next_activated_at)
WHERE f.side = 'SELL'
GROUP BY 1, 2, 3;

CREATE VIEW v_fill_daily AS
WITH position_source AS (
  SELECT DISTINCT ON (c."positionId")
    c."positionId",
    c.source
  FROM "Candidate" c
  WHERE c."positionId" IS NOT NULL
  ORDER BY c."positionId", c."discoveredAt" DESC
),
config_windows AS (
  SELECT
    v.id AS config_version,
    v."activatedAt" AS activated_at,
    LEAD(v."activatedAt") OVER (ORDER BY v.id) AS next_activated_at
  FROM "RuntimeConfigVersion" v
)
SELECT
  DATE_TRUNC('day', f."createdAt")::date AS session_date,
  f.side,
  COALESCE(ps.source, 'unknown') AS source,
  COALESCE(cw.config_version, 0) AS config_version,
  COUNT(*)::int AS fill_count,
  SUM(f."amountUsd")::numeric AS notional_usd,
  SUM(COALESCE(f."pnlUsd", 0))::numeric AS realized_pnl_usd
FROM "Fill" f
JOIN "Position" p ON p.id = f."positionId"
LEFT JOIN position_source ps ON ps."positionId" = p.id
LEFT JOIN config_windows cw
  ON p."openedAt" >= cw.activated_at
 AND (cw.next_activated_at IS NULL OR p."openedAt" < cw.next_activated_at)
GROUP BY 1, 2, 3, 4;

CREATE VIEW v_position_pnl_daily AS
WITH sell_summary AS (
  SELECT
    f."positionId",
    SUM(COALESCE(f."pnlUsd", 0))::numeric AS realized_pnl_usd,
    SUM(f."amountUsd")::numeric AS gross_exit_usd,
    MAX(f."createdAt") AS last_exit_at
  FROM "Fill" f
  WHERE f.side = 'SELL'
  GROUP BY 1
),
position_source AS (
  SELECT DISTINCT ON (c."positionId")
    c."positionId",
    c.source
  FROM "Candidate" c
  WHERE c."positionId" IS NOT NULL
  ORDER BY c."positionId", c."discoveredAt" DESC
),
config_windows AS (
  SELECT
    v.id AS config_version,
    v."activatedAt" AS activated_at,
    LEAD(v."activatedAt") OVER (ORDER BY v.id) AS next_activated_at
  FROM "RuntimeConfigVersion" v
)
SELECT
  DATE_TRUNC('day', COALESCE(s.last_exit_at, p."closedAt", p."openedAt"))::date AS session_date,
  COALESCE(ps.source, 'unknown') AS source,
  COALESCE(p.metadata -> 'metrics' ->> 'exitProfile', 'unknown') AS exit_profile,
  COALESCE(cw.config_version, 0) AS config_version,
  COUNT(p.id)::int AS position_count,
  COUNT(p.id) FILTER (WHERE p.status = 'CLOSED')::int AS closed_count,
  SUM(COALESCE(s.realized_pnl_usd, 0))::numeric AS realized_pnl_usd,
  SUM(COALESCE(s.gross_exit_usd, 0))::numeric AS gross_exit_usd,
  AVG(CASE
    WHEN p."amountUsd" > 0 THEN COALESCE(s.realized_pnl_usd, 0) / p."amountUsd" * 100
    ELSE NULL
  END)::numeric(12, 4) AS avg_return_pct,
  AVG(EXTRACT(EPOCH FROM (COALESCE(p."closedAt", NOW()) - p."openedAt")) / 60.0)::numeric(12, 2) AS avg_hold_minutes,
  AVG(CASE
    WHEN p.id IS NULL THEN NULL
    WHEN COALESCE(s.realized_pnl_usd, 0) > 0 THEN 1
    ELSE 0
  END)::numeric(12, 4) AS win_rate
FROM "Position" p
LEFT JOIN sell_summary s ON s."positionId" = p.id
LEFT JOIN position_source ps ON ps."positionId" = p.id
LEFT JOIN config_windows cw
  ON p."openedAt" >= cw.activated_at
 AND (cw.next_activated_at IS NULL OR p."openedAt" < cw.next_activated_at)
GROUP BY 1, 2, 3, 4;

CREATE VIEW v_candidate_decision_facts AS
WITH latest_snapshot AS (
  SELECT DISTINCT ON (ts."candidateId")
    ts."candidateId",
    ts."securityRisk" AS security_risk,
    ts."capturedAt" AS snapshot_captured_at
  FROM "TokenSnapshot" ts
  WHERE ts."candidateId" IS NOT NULL
  ORDER BY ts."candidateId", ts."capturedAt" DESC
),
sell_summary AS (
  SELECT
    f."positionId",
    SUM(COALESCE(f."pnlUsd", 0))::numeric AS realized_pnl_usd,
    MAX(f."createdAt") AS last_exit_at
  FROM "Fill" f
  WHERE f.side = 'SELL'
  GROUP BY 1
),
config_windows AS (
  SELECT
    v.id AS config_version,
    v."activatedAt" AS activated_at,
    LEAD(v."activatedAt") OVER (ORDER BY v.id) AS next_activated_at
  FROM "RuntimeConfigVersion" v
)
SELECT
  c.id AS candidate_id,
  c.mint,
  c.symbol,
  COALESCE(NULLIF(c.source, ''), 'unknown') AS source,
  c.status,
  c."rejectReason" AS reject_reason,
  c."discoveredAt" AS discovered_at,
  c."lastEvaluatedAt" AS evaluated_at,
  COALESCE(c."lastEvaluatedAt", c."discoveredAt") AS decision_at,
  COALESCE(cw.config_version, 0) AS config_version,
  (c.metrics ->> 'entryScore')::numeric AS entry_score,
  COALESCE(c.metrics ->> 'exitProfile', p.metadata -> 'metrics' ->> 'exitProfile', 'unknown') AS exit_profile,
  CASE
    WHEN EXTRACT(HOUR FROM COALESCE(c."lastEvaluatedAt", c."discoveredAt") AT TIME ZONE 'Europe/London') < 6 THEN 'overnight'
    WHEN EXTRACT(HOUR FROM COALESCE(c."lastEvaluatedAt", c."discoveredAt") AT TIME ZONE 'Europe/London') < 12 THEN 'morning'
    WHEN EXTRACT(HOUR FROM COALESCE(c."lastEvaluatedAt", c."discoveredAt") AT TIME ZONE 'Europe/London') < 17 THEN 'afternoon'
    WHEN EXTRACT(HOUR FROM COALESCE(c."lastEvaluatedAt", c."discoveredAt") AT TIME ZONE 'Europe/London') < 22 THEN 'evening'
    ELSE 'late'
  END AS daypart,
  CASE
    WHEN COALESCE(c."liquidityUsd", 0) < 10000 THEN '<10k'
    WHEN COALESCE(c."liquidityUsd", 0) < 25000 THEN '10k-25k'
    WHEN COALESCE(c."liquidityUsd", 0) < 50000 THEN '25k-50k'
    ELSE '50k+'
  END AS liquidity_band,
  CASE
    WHEN COALESCE(c."volume5mUsd", 0) < 2000 THEN '<2k'
    WHEN COALESCE(c."volume5mUsd", 0) < 5000 THEN '2k-5k'
    WHEN COALESCE(c."volume5mUsd", 0) < 10000 THEN '5k-10k'
    ELSE '10k+'
  END AS volume_band,
  CASE
    WHEN LOWER(COALESCE(latest_snapshot.security_risk, c."rejectReason", '')) ~ 'honeypot|fake token|mintable|freeze|transfer fee|concentration' THEN 'high'
    WHEN LOWER(COALESCE(latest_snapshot.security_risk, c."rejectReason", '')) ~ 'liquidity|volume|holder|buyers|market cap|buy/sell|price' THEN 'market'
    WHEN COALESCE(latest_snapshot.security_risk, c."rejectReason") IS NOT NULL THEN 'review'
    ELSE 'clear'
  END AS security_risk,
  CASE
    WHEN c.status IN ('ACCEPTED', 'BOUGHT', 'EXITED') THEN TRUE
    ELSE FALSE
  END AS accepted,
  CASE
    WHEN c."positionId" IS NOT NULL OR c.status IN ('BOUGHT', 'EXITED') THEN TRUE
    ELSE FALSE
  END AS bought,
  p.id AS position_id,
  p.status AS position_status,
  COALESCE(s.realized_pnl_usd, 0)::numeric AS realized_pnl_usd,
  CASE
    WHEN p.id IS NULL THEN 'no_position'
    WHEN p.status = 'OPEN' THEN 'open'
    WHEN COALESCE(s.realized_pnl_usd, 0) > 0 THEN 'win'
    WHEN COALESCE(s.realized_pnl_usd, 0) < 0 THEN 'loss'
    ELSE 'flat'
  END AS downstream_outcome,
  latest_snapshot.security_risk AS raw_security_risk,
  latest_snapshot.snapshot_captured_at
FROM "Candidate" c
LEFT JOIN "Position" p ON p.id = c."positionId"
LEFT JOIN sell_summary s ON s."positionId" = p.id
LEFT JOIN latest_snapshot ON latest_snapshot."candidateId" = c.id
LEFT JOIN config_windows cw
  ON COALESCE(c."lastEvaluatedAt", c."discoveredAt") >= cw.activated_at
 AND (cw.next_activated_at IS NULL OR COALESCE(c."lastEvaluatedAt", c."discoveredAt") < cw.next_activated_at);

CREATE VIEW v_candidate_funnel_daily_source AS
SELECT
  DATE_TRUNC('day', discovered_at)::date AS session_date,
  source,
  status,
  COUNT(*)::int AS candidate_count
FROM v_candidate_decision_facts
GROUP BY 1, 2, 3;

CREATE VIEW v_candidate_reject_reason_daily_source AS
SELECT
  DATE_TRUNC('day', decision_at)::date AS session_date,
  source,
  COALESCE(reject_reason, 'accepted_or_unknown') AS reject_reason,
  COUNT(*)::int AS candidate_count
FROM v_candidate_decision_facts
GROUP BY 1, 2, 3;

CREATE VIEW v_source_outcome_daily AS
WITH candidate_daily AS (
  SELECT
    DATE_TRUNC('day', discovered_at)::date AS session_date,
    source,
    config_version,
    COUNT(candidate_id)::int AS candidates_discovered,
    COUNT(candidate_id) FILTER (WHERE accepted)::int AS candidates_accepted,
    COUNT(candidate_id) FILTER (WHERE bought)::int AS candidates_bought
  FROM v_candidate_decision_facts
  GROUP BY 1, 2, 3
),
position_source AS (
  SELECT DISTINCT ON (c."positionId")
    c."positionId",
    c.source
  FROM "Candidate" c
  WHERE c."positionId" IS NOT NULL
  ORDER BY c."positionId", c."discoveredAt" DESC
),
sell_summary AS (
  SELECT
    f."positionId",
    SUM(COALESCE(f."pnlUsd", 0))::numeric AS realized_pnl_usd,
    MAX(f."createdAt") AS last_exit_at
  FROM "Fill" f
  WHERE f.side = 'SELL'
  GROUP BY 1
),
config_windows AS (
  SELECT
    v.id AS config_version,
    v."activatedAt" AS activated_at,
    LEAD(v."activatedAt") OVER (ORDER BY v.id) AS next_activated_at
  FROM "RuntimeConfigVersion" v
),
position_daily AS (
  SELECT
    DATE_TRUNC('day', COALESCE(s.last_exit_at, p."closedAt", p."openedAt"))::date AS session_date,
    COALESCE(ps.source, 'unknown') AS source,
    COALESCE(cw.config_version, 0) AS config_version,
    COUNT(p.id) FILTER (WHERE p.status = 'CLOSED')::int AS positions_closed,
    COUNT(p.id) FILTER (WHERE COALESCE(s.realized_pnl_usd, 0) > 0)::int AS wins,
    COUNT(p.id) FILTER (WHERE COALESCE(s.realized_pnl_usd, 0) < 0)::int AS losses,
    SUM(COALESCE(s.realized_pnl_usd, 0))::numeric AS realized_pnl_usd
  FROM "Position" p
  LEFT JOIN position_source ps ON ps."positionId" = p.id
  LEFT JOIN sell_summary s ON s."positionId" = p.id
  LEFT JOIN config_windows cw
    ON p."openedAt" >= cw.activated_at
   AND (cw.next_activated_at IS NULL OR p."openedAt" < cw.next_activated_at)
  GROUP BY 1, 2, 3
)
SELECT
  COALESCE(cd.session_date, pd.session_date) AS session_date,
  COALESCE(cd.source, pd.source, 'unknown') AS source,
  COALESCE(cd.config_version, pd.config_version, 0) AS config_version,
  COALESCE(cd.candidates_discovered, 0) AS candidates_discovered,
  COALESCE(cd.candidates_accepted, 0) AS candidates_accepted,
  COALESCE(cd.candidates_bought, 0) AS candidates_bought,
  COALESCE(pd.positions_closed, 0) AS positions_closed,
  COALESCE(pd.wins, 0) AS wins,
  COALESCE(pd.losses, 0) AS losses,
  COALESCE(pd.realized_pnl_usd, 0)::numeric AS realized_pnl_usd,
  CASE
    WHEN COALESCE(cd.candidates_discovered, 0) > 0
      THEN (COALESCE(cd.candidates_accepted, 0)::numeric / cd.candidates_discovered::numeric) * 100
    ELSE 0
  END::numeric(12, 4) AS acceptance_rate_pct
FROM candidate_daily cd
FULL OUTER JOIN position_daily pd
  ON pd.session_date = cd.session_date
 AND pd.source = cd.source
 AND pd.config_version = cd.config_version;

CREATE VIEW v_candidate_cohort_daily AS
SELECT
  DATE_TRUNC('day', decision_at)::date AS session_date,
  source,
  config_version,
  daypart,
  security_risk,
  liquidity_band,
  volume_band,
  COUNT(candidate_id)::int AS candidate_count,
  COUNT(candidate_id) FILTER (WHERE accepted)::int AS accepted_count,
  COUNT(candidate_id) FILTER (WHERE bought)::int AS bought_count,
  AVG(entry_score)::numeric(12, 4) AS avg_entry_score,
  COUNT(candidate_id) FILTER (WHERE downstream_outcome = 'win')::int AS win_count,
  COUNT(candidate_id) FILTER (WHERE downstream_outcome = 'loss')::int AS loss_count,
  SUM(COALESCE(realized_pnl_usd, 0))::numeric AS realized_pnl_usd
FROM v_candidate_decision_facts
GROUP BY 1, 2, 3, 4, 5, 6, 7;

CREATE VIEW v_position_cohort_daily AS
WITH sell_summary AS (
  SELECT
    f."positionId",
    SUM(COALESCE(f."pnlUsd", 0))::numeric AS realized_pnl_usd,
    MAX(f."createdAt") AS last_exit_at
  FROM "Fill" f
  WHERE f.side = 'SELL'
  GROUP BY 1
),
position_source AS (
  SELECT DISTINCT ON (c."positionId")
    c."positionId",
    c.source
  FROM "Candidate" c
  WHERE c."positionId" IS NOT NULL
  ORDER BY c."positionId", c."discoveredAt" DESC
),
config_windows AS (
  SELECT
    v.id AS config_version,
    v."activatedAt" AS activated_at,
    LEAD(v."activatedAt") OVER (ORDER BY v.id) AS next_activated_at
  FROM "RuntimeConfigVersion" v
)
SELECT
  DATE_TRUNC('day', COALESCE(s.last_exit_at, p."closedAt", p."openedAt"))::date AS session_date,
  COALESCE(ps.source, 'unknown') AS source,
  COALESCE(cw.config_version, 0) AS config_version,
  CASE
    WHEN EXTRACT(HOUR FROM p."openedAt" AT TIME ZONE 'Europe/London') < 6 THEN 'overnight'
    WHEN EXTRACT(HOUR FROM p."openedAt" AT TIME ZONE 'Europe/London') < 12 THEN 'morning'
    WHEN EXTRACT(HOUR FROM p."openedAt" AT TIME ZONE 'Europe/London') < 17 THEN 'afternoon'
    WHEN EXTRACT(HOUR FROM p."openedAt" AT TIME ZONE 'Europe/London') < 22 THEN 'evening'
    ELSE 'late'
  END AS daypart,
  COALESCE(p.metadata -> 'metrics' ->> 'exitProfile', 'unknown') AS exit_profile,
  CASE
    WHEN COALESCE(snapshot.liquidity_usd, 0) < 10000 THEN '<10k'
    WHEN COALESCE(snapshot.liquidity_usd, 0) < 25000 THEN '10k-25k'
    WHEN COALESCE(snapshot.liquidity_usd, 0) < 50000 THEN '25k-50k'
    ELSE '50k+'
  END AS liquidity_band,
  CASE
    WHEN COALESCE(snapshot.volume_5m_usd, 0) < 2000 THEN '<2k'
    WHEN COALESCE(snapshot.volume_5m_usd, 0) < 5000 THEN '2k-5k'
    WHEN COALESCE(snapshot.volume_5m_usd, 0) < 10000 THEN '5k-10k'
    ELSE '10k+'
  END AS volume_band,
  CASE
    WHEN LOWER(COALESCE(snapshot.security_risk, '')) ~ 'honeypot|fake token|mintable|freeze|transfer fee|concentration' THEN 'high'
    WHEN snapshot.security_risk IS NOT NULL THEN 'review'
    ELSE 'clear'
  END AS security_risk,
  CASE
    WHEN p.status = 'OPEN' THEN 'open'
    WHEN COALESCE(s.realized_pnl_usd, 0) > 0 THEN 'win'
    WHEN COALESCE(s.realized_pnl_usd, 0) < 0 THEN 'loss'
    ELSE 'flat'
  END AS outcome,
  COUNT(p.id)::int AS position_count,
  SUM(COALESCE(s.realized_pnl_usd, 0))::numeric AS realized_pnl_usd,
  AVG(CASE
    WHEN p."amountUsd" > 0 THEN COALESCE(s.realized_pnl_usd, 0) / p."amountUsd" * 100
    ELSE NULL
  END)::numeric(12, 4) AS avg_return_pct,
  AVG(EXTRACT(EPOCH FROM (COALESCE(p."closedAt", NOW()) - p."openedAt")) / 60.0)::numeric(12, 2) AS avg_hold_minutes,
  AVG(CASE
    WHEN p.id IS NULL THEN NULL
    WHEN COALESCE(s.realized_pnl_usd, 0) > 0 THEN 1
    ELSE 0
  END)::numeric(12, 4) AS win_rate
FROM "Position" p
LEFT JOIN sell_summary s ON s."positionId" = p.id
LEFT JOIN position_source ps ON ps."positionId" = p.id
LEFT JOIN v_position_snapshot_latest snapshot ON snapshot.position_id = p.id
LEFT JOIN config_windows cw
  ON p."openedAt" >= cw.activated_at
 AND (cw.next_activated_at IS NULL OR p."openedAt" < cw.next_activated_at)
GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9;

CREATE VIEW v_config_change_log AS
WITH versions AS (
  SELECT
    v.id AS config_version,
    LAG(v.id) OVER (ORDER BY v.id) AS previous_config_version,
    v."activatedAt" AS activated_at,
    LEAD(v."activatedAt") OVER (ORDER BY v.id) AS next_activated_at,
    v."appliedBy" AS applied_by,
    COALESCE(v."changedPaths", '[]'::jsonb) AS changed_paths,
    COALESCE(v."liveAffectingPaths", '[]'::jsonb) AS live_affecting_paths,
    v.settings::jsonb AS settings
  FROM "RuntimeConfigVersion" v
)
SELECT
  config_version,
  previous_config_version,
  activated_at,
  next_activated_at,
  applied_by,
  jsonb_array_length(changed_paths)::int AS changed_path_count,
  jsonb_array_length(live_affecting_paths)::int AS live_affecting_path_count,
  changed_paths,
  live_affecting_paths,
  settings ->> 'tradeMode' AS trade_mode,
  grafana_json_path_text(settings, 'capital.capitalUsd')::numeric AS capital_usd,
  grafana_json_path_text(settings, 'capital.positionSizeUsd')::numeric AS position_size_usd,
  grafana_json_path_text(settings, 'capital.maxOpenPositions')::numeric AS max_open_positions,
  grafana_json_path_text(settings, 'filters.minLiquidityUsd')::numeric AS min_liquidity_usd,
  grafana_json_path_text(settings, 'filters.minVolume5mUsd')::numeric AS min_volume_5m_usd,
  grafana_json_path_text(settings, 'filters.minUniqueBuyers5m')::numeric AS min_unique_buyers_5m,
  grafana_json_path_text(settings, 'filters.minBuySellRatio')::numeric AS min_buy_sell_ratio,
  grafana_json_path_text(settings, 'filters.maxTop10HolderPercent')::numeric AS max_top10_holder_percent,
  grafana_json_path_text(settings, 'filters.maxSingleHolderPercent')::numeric AS max_single_holder_percent,
  grafana_json_path_text(settings, 'exits.stopLossPercent')::numeric AS stop_loss_percent,
  grafana_json_path_text(settings, 'exits.tp1Multiplier')::numeric AS tp1_multiplier,
  grafana_json_path_text(settings, 'exits.tp2Multiplier')::numeric AS tp2_multiplier,
  grafana_json_path_text(settings, 'exits.trailingStopPercent')::numeric AS trailing_stop_percent,
  grafana_json_path_text(settings, 'exits.timeStopMinutes')::numeric AS time_stop_minutes,
  grafana_json_path_text(settings, 'exits.timeLimitMinutes')::numeric AS time_limit_minutes
FROM versions;

CREATE VIEW v_kpi_by_config_window AS
WITH config_windows AS (
  SELECT
    v.id AS config_version,
    v."activatedAt" AS activated_at,
    LEAD(v."activatedAt") OVER (ORDER BY v.id) AS next_activated_at
  FROM "RuntimeConfigVersion" v
),
candidate_metrics AS (
  SELECT
    cw.config_version,
    cw.activated_at,
    cw.next_activated_at,
    COUNT(c.id)::int AS candidates_discovered,
    COUNT(c.id) FILTER (WHERE c.status IN ('ACCEPTED', 'BOUGHT', 'EXITED'))::int AS candidates_accepted,
    COUNT(c.id) FILTER (WHERE c."positionId" IS NOT NULL OR c.status IN ('BOUGHT', 'EXITED'))::int AS candidates_bought
  FROM config_windows cw
  LEFT JOIN "Candidate" c
    ON c."discoveredAt" >= cw.activated_at
   AND (cw.next_activated_at IS NULL OR c."discoveredAt" < cw.next_activated_at)
  GROUP BY 1, 2, 3
),
sell_summary AS (
  SELECT
    f."positionId",
    SUM(COALESCE(f."pnlUsd", 0))::numeric AS realized_pnl_usd
  FROM "Fill" f
  WHERE f.side = 'SELL'
  GROUP BY 1
),
position_metrics AS (
  SELECT
    cw.config_version,
    COUNT(p.id)::int AS positions_opened,
    COUNT(p.id) FILTER (WHERE p.status = 'CLOSED')::int AS positions_closed,
    SUM(COALESCE(s.realized_pnl_usd, 0))::numeric AS realized_pnl_usd,
    AVG(CASE
      WHEN p.id IS NULL THEN NULL
      WHEN COALESCE(s.realized_pnl_usd, 0) > 0 THEN 1
      ELSE 0
    END)::numeric(12, 4) AS win_rate
  FROM config_windows cw
  LEFT JOIN "Position" p
    ON p."openedAt" >= cw.activated_at
   AND (cw.next_activated_at IS NULL OR p."openedAt" < cw.next_activated_at)
  LEFT JOIN sell_summary s ON s."positionId" = p.id
  GROUP BY 1
),
provider_metrics AS (
  SELECT
    cw.config_version,
    COUNT(a.id)::int AS provider_calls,
    COALESCE(SUM(a.units), 0)::int AS provider_units,
    SUM(CASE WHEN a.success THEN 0 ELSE 1 END)::int AS provider_errors
  FROM config_windows cw
  LEFT JOIN "ApiEvent" a
    ON a."calledAt" >= cw.activated_at
   AND (cw.next_activated_at IS NULL OR a."calledAt" < cw.next_activated_at)
  GROUP BY 1
)
SELECT
  cm.config_version,
  cm.activated_at AS window_start_at,
  cm.next_activated_at AS window_end_at,
  cm.candidates_discovered,
  cm.candidates_accepted,
  cm.candidates_bought,
  pm.positions_opened,
  pm.positions_closed,
  COALESCE(pm.realized_pnl_usd, 0)::numeric AS realized_pnl_usd,
  COALESCE(pm.win_rate, 0)::numeric(12, 4) AS win_rate,
  provider.provider_calls,
  provider.provider_units,
  provider.provider_errors,
  CASE
    WHEN cm.candidates_discovered > 0
      THEN (cm.candidates_accepted::numeric / cm.candidates_discovered::numeric) * 100
    ELSE 0
  END::numeric(12, 4) AS acceptance_rate_pct,
  CASE
    WHEN cm.candidates_accepted > 0
      THEN (pm.positions_opened::numeric / cm.candidates_accepted::numeric) * 100
    ELSE 0
  END::numeric(12, 4) AS conversion_rate_pct
FROM candidate_metrics cm
LEFT JOIN position_metrics pm ON pm.config_version = cm.config_version
LEFT JOIN provider_metrics provider ON provider.config_version = cm.config_version;

CREATE VIEW v_config_field_change AS
WITH versions AS (
  SELECT
    v.id AS config_version,
    v."activatedAt" AS activated_at,
    COALESCE(v."changedPaths", '[]'::jsonb) AS changed_paths,
    v.settings::jsonb AS current_settings,
    LAG(v.settings::jsonb) OVER (ORDER BY v.id) AS previous_settings
  FROM "RuntimeConfigVersion" v
)
SELECT
  versions.config_version,
  versions.activated_at,
  changed.field_path,
  grafana_json_path_text(versions.previous_settings, changed.field_path) AS previous_value,
  grafana_json_path_text(versions.current_settings, changed.field_path) AS current_value
FROM versions
CROSS JOIN LATERAL (
  SELECT jsonb_array_elements_text(versions.changed_paths) AS field_path
) changed;
