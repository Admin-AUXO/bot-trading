DROP VIEW IF EXISTS v_runtime_overview;
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
  COALESCE(discovered.queue_count, 0) AS queued_candidates
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
) discovered ON TRUE;

DROP VIEW IF EXISTS v_candidate_funnel_daily;
CREATE VIEW v_candidate_funnel_daily AS
SELECT
  DATE_TRUNC('day', "discoveredAt")::date AS session_date,
  status,
  COUNT(*)::int AS candidate_count
FROM "Candidate"
GROUP BY 1, 2;

DROP VIEW IF EXISTS v_position_performance;
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
)
SELECT
  p.id,
  p.mint,
  p.symbol,
  p.strategy,
  p.status,
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
LEFT JOIN sell_fills s ON s."positionId" = p.id;

DROP VIEW IF EXISTS v_api_provider_daily;
CREATE VIEW v_api_provider_daily AS
SELECT
  DATE_TRUNC('day', "calledAt")::date AS session_date,
  provider,
  COUNT(*)::int AS total_calls,
  SUM(units)::int AS total_units,
  AVG(COALESCE("latencyMs", 0))::numeric(12,2) AS avg_latency_ms,
  SUM(CASE WHEN success THEN 0 ELSE 1 END)::int AS error_count
FROM "ApiEvent"
GROUP BY 1, 2;

DROP VIEW IF EXISTS v_api_endpoint_efficiency;
CREATE VIEW v_api_endpoint_efficiency AS
SELECT
  provider,
  endpoint,
  COUNT(*)::int AS total_calls,
  SUM(units)::int AS total_units,
  AVG(COALESCE("latencyMs", 0))::numeric(12,2) AS avg_latency_ms,
  SUM(CASE WHEN success THEN 0 ELSE 1 END)::int AS error_count,
  MAX("calledAt") AS last_called_at
FROM "ApiEvent"
GROUP BY 1, 2;

DROP VIEW IF EXISTS v_raw_api_payload_recent;
CREATE VIEW v_raw_api_payload_recent AS
SELECT
  provider,
  endpoint,
  "requestMethod" AS request_method,
  "entityKey" AS entity_key,
  success,
  "statusCode" AS status_code,
  "latencyMs" AS latency_ms,
  "requestParams" AS request_params,
  "responseBody" AS response_body,
  "errorMessage" AS error_message,
  "capturedAt" AS captured_at
FROM "RawApiPayload"
WHERE "capturedAt" >= NOW() - INTERVAL '14 days';

DROP VIEW IF EXISTS v_token_snapshot_enriched;
CREATE VIEW v_token_snapshot_enriched AS
SELECT
  ts.id,
  ts.mint,
  ts.symbol,
  ts.trigger,
  ts.source,
  ts.creator,
  ts."platformId" AS platform_id,
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
LEFT JOIN "Position" p ON p.id = ts."positionId";

DROP VIEW IF EXISTS v_candidate_latest_filter_state;
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
  c."securityCheckedAt" AS security_checked_at
FROM "Candidate" c;

DROP VIEW IF EXISTS v_candidate_reject_reason_daily;
CREATE VIEW v_candidate_reject_reason_daily AS
SELECT
  DATE_TRUNC('day', "lastEvaluatedAt")::date AS session_date,
  COALESCE("rejectReason", 'accepted_or_unknown') AS reject_reason,
  COUNT(*)::int AS candidate_count
FROM "Candidate"
WHERE "lastEvaluatedAt" IS NOT NULL
GROUP BY 1, 2;

DROP VIEW IF EXISTS v_snapshot_trigger_daily;
CREATE VIEW v_snapshot_trigger_daily AS
SELECT
  DATE_TRUNC('day', "capturedAt")::date AS session_date,
  trigger,
  COUNT(*)::int AS snapshot_count,
  COUNT(DISTINCT mint)::int AS unique_tokens,
  AVG(COALESCE("liquidityUsd", 0))::numeric(18,2) AS avg_liquidity_usd,
  AVG(COALESCE("marketCapUsd", 0))::numeric(18,2) AS avg_market_cap_usd,
  AVG(COALESCE("buySellRatio", 0))::numeric(12,4) AS avg_buy_sell_ratio
FROM "TokenSnapshot"
GROUP BY 1, 2;

DROP VIEW IF EXISTS v_position_exit_reason_daily;
CREATE VIEW v_position_exit_reason_daily AS
SELECT
  DATE_TRUNC('day', COALESCE("closedAt", "openedAt"))::date AS session_date,
  COALESCE("exitReason", 'open') AS exit_reason,
  COUNT(*)::int AS position_count,
  AVG(EXTRACT(EPOCH FROM (COALESCE("closedAt", NOW()) - "openedAt")) / 60.0)::numeric(12,2) AS avg_hold_minutes,
  AVG(COALESCE("currentPriceUsd", 0) - COALESCE("entryPriceUsd", 0))::numeric(18,9) AS avg_price_delta_usd
FROM "Position"
GROUP BY 1, 2;

DROP VIEW IF EXISTS v_runtime_settings_current;
CREATE VIEW v_runtime_settings_current AS
SELECT
  r.id,
  r."updatedAt" AS updated_at,
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
FROM "RuntimeConfig" r;
