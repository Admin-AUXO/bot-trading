-- DailyStats aggregate row stability:
-- keep the schema-owned series key in sync without relying on a standalone migration file.
ALTER TABLE "DailyStats" ADD COLUMN IF NOT EXISTS "seriesKey" TEXT;

UPDATE "DailyStats"
SET "seriesKey" = CASE
  WHEN "strategy" IS NULL THEN 'ALL'
  ELSE "strategy"::text
END
WHERE "seriesKey" IS NULL;

WITH ranked_daily_stats AS (
  SELECT
    ctid,
    ROW_NUMBER() OVER (
      PARTITION BY "date", "mode", "configProfile", "seriesKey"
      ORDER BY "createdAt" DESC, "id" DESC
    ) AS rn
  FROM "DailyStats"
)
DELETE FROM "DailyStats"
WHERE ctid IN (
  SELECT ctid
  FROM ranked_daily_stats
  WHERE rn > 1
);

ALTER TABLE "DailyStats" ALTER COLUMN "seriesKey" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "DailyStats_date_seriesKey_mode_configProfile_key"
  ON "DailyStats" ("date", "seriesKey", "mode", "configProfile");

-- Dashboard Overview: current bot state + today's performance
-- Use with mode filter: WHERE mode = 'LIVE' or mode = 'DRY_RUN'
CREATE OR REPLACE VIEW v_dashboard_overview AS
SELECT
  bs.id,
  bs."capitalUsd",
  bs."capitalSol",
  bs."walletBalance",
  bs."dailyLossUsd",
  bs."weeklyLossUsd",
  bs."dailyLossLimit",
  bs."weeklyLossLimit",
  bs."capitalLevel",
  bs.regime,
  bs."rollingWinRate",
  bs."isRunning",
  bs."pauseReason",
  p_counts.open_positions,
  p_counts.open_positions_live,
  p_counts.open_positions_dry,
  t_today.today_pnl_live,
  t_today.today_pnl_dry,
  t_today.today_trades_live,
  t_today.today_trades_dry
FROM "BotState" bs
LEFT JOIN (
  SELECT
    COUNT(*) FILTER (WHERE status IN ('OPEN', 'PARTIALLY_CLOSED'))                       AS open_positions,
    COUNT(*) FILTER (WHERE status IN ('OPEN', 'PARTIALLY_CLOSED') AND mode = 'LIVE')     AS open_positions_live,
    COUNT(*) FILTER (WHERE status IN ('OPEN', 'PARTIALLY_CLOSED') AND mode = 'DRY_RUN')  AS open_positions_dry
  FROM "Position"
) p_counts ON true
LEFT JOIN (
  SELECT
    COALESCE(SUM("pnlUsd") FILTER (WHERE "executedAt" >= CURRENT_DATE AND side = 'SELL' AND mode = 'LIVE'), 0) AS today_pnl_live,
    COALESCE(SUM("pnlUsd") FILTER (WHERE "executedAt" >= CURRENT_DATE AND side = 'SELL' AND mode = 'DRY_RUN'), 0) AS today_pnl_dry,
    COUNT(*) FILTER (WHERE "executedAt" >= CURRENT_DATE AND mode = 'LIVE') AS today_trades_live,
    COUNT(*) FILTER (WHERE "executedAt" >= CURRENT_DATE AND mode = 'DRY_RUN') AS today_trades_dry
  FROM "Trade"
) t_today ON true
WHERE bs.id = 'singleton';

-- Active positions with unrealized P&L (includes mode column)
CREATE OR REPLACE VIEW v_active_positions AS
SELECT
  p.id,
  p.strategy,
  p."tokenAddress",
  p."tokenSymbol",
  p.platform,
  p."walletSource",
  p."entryPriceUsd",
  p."currentPriceUsd",
  p."amountSol",
  p."remainingToken",
  p."peakPriceUsd",
  p."stopLossPercent",
  p."tranche1Filled",
  p."tranche2Filled",
  p."exit1Done",
  p."exit2Done",
  p."exit3Done",
  p.status,
  p.regime,
  p.mode,
  p."configProfile",
  p."openedAt",
  CASE
    WHEN p."entryPriceUsd" > 0
    THEN ROUND(((p."currentPriceUsd" - p."entryPriceUsd") / p."entryPriceUsd") * 100, 2)
    ELSE 0
  END AS unrealized_pnl_percent,
  ROUND((p."currentPriceUsd" - p."entryPriceUsd") * p."remainingToken", 4) AS unrealized_pnl_usd,
  EXTRACT(EPOCH FROM (NOW() - p."openedAt")) / 60 AS hold_minutes
FROM "Position" p
WHERE p.status IN ('OPEN', 'PARTIALLY_CLOSED')
ORDER BY p."openedAt" DESC;

-- Per-strategy performance summary (rolling 30 days, grouped by mode)
CREATE OR REPLACE VIEW v_strategy_performance AS
SELECT
  t.strategy,
  t.mode,
  COUNT(*) FILTER (WHERE t.side = 'SELL') AS total_exits,
  COUNT(*) FILTER (WHERE t.side = 'SELL' AND t."pnlUsd" > 0) AS wins,
  COUNT(*) FILTER (WHERE t.side = 'SELL' AND t."pnlUsd" <= 0) AS losses,
  CASE
    WHEN COUNT(*) FILTER (WHERE t.side = 'SELL') > 0
    THEN ROUND(COUNT(*) FILTER (WHERE t.side = 'SELL' AND t."pnlUsd" > 0)::NUMERIC / COUNT(*) FILTER (WHERE t.side = 'SELL'), 4)
    ELSE 0
  END AS win_rate,
  COALESCE(SUM(t."pnlUsd") FILTER (WHERE t.side = 'SELL'), 0) AS total_pnl_usd,
  COALESCE(AVG(t."pnlUsd") FILTER (WHERE t.side = 'SELL' AND t."pnlUsd" > 0), 0) AS avg_win_usd,
  COALESCE(AVG(ABS(t."pnlUsd")) FILTER (WHERE t.side = 'SELL' AND t."pnlUsd" <= 0), 0) AS avg_loss_usd,
  COALESCE(SUM(t."gasFee" + t."jitoTip"), 0) AS total_fees_sol,
  MAX(t."pnlUsd") FILTER (WHERE t.side = 'SELL') AS best_trade_usd,
  MIN(t."pnlUsd") FILTER (WHERE t.side = 'SELL') AS worst_trade_usd
FROM "Trade" t
WHERE t."executedAt" >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY t.strategy, t.mode;

-- API budget tracking
-- Drop first so view shape changes remain idempotent on existing Docker volumes.
DROP VIEW IF EXISTS v_api_budget;
CREATE VIEW v_api_budget AS
SELECT
  a.service,
  SUM(a."totalCredits") AS credits_used_month,
  MAX(a."budgetTotal") AS budget_total,
  MAX(a."monthlyCreditsRemaining") AS credits_remaining_month,
  MAX(a."dailyBudget") AS daily_budget,
  MAX(a."dailyCreditsRemaining") AS daily_remaining,
  MAX(a."essentialCredits") AS essential_credits_today,
  MAX(a."nonEssentialCredits") AS non_essential_credits_today,
  MAX(a."cachedCalls") AS cached_calls_today,
  MAX(a."quotaStatus") AS quota_status,
  MAX(a."quotaSource") AS quota_source,
  MAX(a."providerCycleStart") AS provider_cycle_start,
  MAX(a."providerCycleEnd") AS provider_cycle_end,
  MAX(a."providerReportedUsed") AS provider_reported_used,
  MAX(a."providerReportedRemaining") AS provider_reported_remaining,
  MAX(a."pauseReason") AS pause_reason,
  CASE
    WHEN MAX(a."budgetTotal") > 0
    THEN ROUND(SUM(a."totalCredits")::NUMERIC / MAX(a."budgetTotal") * 100, 2)
    ELSE 0
  END AS usage_percent,
  SUM(a."totalCalls") AS total_calls,
  ROUND(AVG(a."avgLatencyMs"), 0) AS avg_latency_ms,
  ROUND(AVG(a."avgCreditsPerCall"), 2) AS avg_credits_per_call,
  SUM(a."errorCount") AS total_errors,
  MAX(a."peakRps") AS peak_rps
FROM "ApiUsageDaily" a
WHERE a.date >= DATE_TRUNC('month', CURRENT_DATE)
GROUP BY a.service;

DROP VIEW IF EXISTS v_api_endpoint_efficiency;
CREATE OR REPLACE VIEW v_api_endpoint_efficiency AS
SELECT
  a.date,
  a.service,
  a.endpoint,
  a.strategy,
  a.mode,
  a."configProfile",
  a.purpose,
  a.essential,
  a."totalCalls",
  a."totalCredits",
  a."cachedCalls",
  a."avgCreditsPerCall",
  a."avgLatencyMs",
  a."errorCount",
  a."avgBatchSize"
FROM "ApiEndpointDaily" a
WHERE a.date >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY a.date DESC, a."totalCredits" DESC, a."totalCalls" DESC;

-- Recent trades feed (last 50, includes mode)
CREATE OR REPLACE VIEW v_recent_trades AS
SELECT
  t.id,
  t.strategy,
  t."tokenSymbol",
  t."tokenAddress",
  t.side,
  t."amountSol",
  t."priceUsd",
  t."pnlUsd",
  t."pnlPercent",
  t."exitReason",
  t."gasFee",
  t."jitoTip",
  t.regime,
  t.mode,
  t."configProfile",
  t."txSignature",
  t."executedAt"
FROM "Trade" t
ORDER BY t."executedAt" DESC
LIMIT 50;

-- Daily P&L chart data (last 30 days, includes mode + profile)
CREATE OR REPLACE VIEW v_daily_pnl AS
SELECT
  d.date,
  d.strategy,
  d.mode,
  d."configProfile",
  d."tradesTotal",
  d."tradesWon",
  d."tradesLost",
  d."winRate",
  d."grossPnlUsd",
  d."netPnlUsd",
  d."totalGasFees",
  d."totalJitoTips",
  d."capitalEnd",
  d."maxDrawdownUsd",
  d.regime
FROM "DailyStats" d
WHERE d.date >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY d.date DESC, d.strategy;

-- Capital curve data (grouped by mode)
CREATE OR REPLACE VIEW v_capital_curve AS
SELECT
  d.date,
  d.mode,
  SUM(d."capitalEnd") AS capital_usd,
  SUM(d."netPnlUsd") AS daily_pnl,
  SUM(SUM(d."netPnlUsd")) OVER (PARTITION BY d.mode ORDER BY d.date) AS cumulative_pnl
FROM "DailyStats" d
WHERE d.strategy IS NULL
GROUP BY d.date, d.mode
ORDER BY d.date;

-- Profile comparison: aggregate performance per config profile
CREATE OR REPLACE VIEW v_profile_comparison AS
SELECT
  t."configProfile",
  t.mode,
  COUNT(*) FILTER (WHERE t.side = 'SELL') AS total_exits,
  COUNT(*) FILTER (WHERE t.side = 'SELL' AND t."pnlUsd" > 0) AS wins,
  COUNT(*) FILTER (WHERE t.side = 'SELL' AND t."pnlUsd" <= 0) AS losses,
  CASE
    WHEN COUNT(*) FILTER (WHERE t.side = 'SELL') > 0
    THEN ROUND(COUNT(*) FILTER (WHERE t.side = 'SELL' AND t."pnlUsd" > 0)::NUMERIC / COUNT(*) FILTER (WHERE t.side = 'SELL'), 4)
    ELSE 0
  END AS win_rate,
  COALESCE(SUM(t."pnlUsd") FILTER (WHERE t.side = 'SELL'), 0) AS total_pnl_usd,
  COALESCE(AVG(t."pnlUsd") FILTER (WHERE t.side = 'SELL' AND t."pnlUsd" > 0), 0) AS avg_win_usd,
  COALESCE(AVG(ABS(t."pnlUsd")) FILTER (WHERE t.side = 'SELL' AND t."pnlUsd" <= 0), 0) AS avg_loss_usd,
  COUNT(*) AS total_trades,
  MIN(t."executedAt") AS first_trade,
  MAX(t."executedAt") AS last_trade
FROM "Trade" t
WHERE t."executedAt" >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY t."configProfile", t.mode;

-- v_strategy_comparison: per-strategy rolling 30-day performance
DROP VIEW IF EXISTS v_strategy_comparison;
CREATE OR REPLACE VIEW v_strategy_comparison AS
SELECT
  strategy,
  mode,
  SUM("tradesTotal")  AS total_trades,
  SUM("tradesWon")    AS wins,
  SUM("tradesLost")   AS losses,
  CASE WHEN SUM("tradesTotal") > 0
    THEN ROUND((SUM("tradesWon")::numeric / SUM("tradesTotal")) * 100, 1)
    ELSE 0 END        AS win_rate_pct,
  ROUND(SUM("netPnlUsd")::numeric, 2) AS net_pnl,
  ROUND(AVG("profitFactor")::numeric, 3) AS avg_profit_factor,
  ROUND(AVG("expectancy")::numeric, 4)   AS avg_expectancy
FROM "DailyStats"
WHERE date >= CURRENT_DATE - INTERVAL '30 days'
  AND strategy IS NOT NULL
GROUP BY strategy, mode;

-- v_regime_performance: which strategies win in each regime
DROP VIEW IF EXISTS v_regime_performance;
CREATE OR REPLACE VIEW v_regime_performance AS
SELECT
  strategy,
  regime,
  mode,
  SUM("tradesTotal") AS total_trades,
  CASE WHEN SUM("tradesTotal") > 0
    THEN ROUND((SUM("tradesWon")::numeric / SUM("tradesTotal")) * 100, 1)
    ELSE 0 END AS win_rate_pct,
  ROUND(SUM("netPnlUsd")::numeric, 2) AS net_pnl
FROM "DailyStats"
WHERE date >= CURRENT_DATE - INTERVAL '30 days'
  AND strategy IS NOT NULL
  AND regime IS NOT NULL
GROUP BY strategy, regime, mode;

-- v_tranche_distribution: % of exits at each tranche per strategy
DROP VIEW IF EXISTS v_tranche_distribution;
CREATE OR REPLACE VIEW v_tranche_distribution AS
SELECT
  strategy,
  mode,
  SUM("trancheT1Pct") / NULLIF(COUNT(*), 0) AS avg_t1_pct,
  SUM("trancheT2Pct") / NULLIF(COUNT(*), 0) AS avg_t2_pct,
  SUM("trancheT3Pct") / NULLIF(COUNT(*), 0) AS avg_t3_pct
FROM "DailyStats"
WHERE date >= CURRENT_DATE - INTERVAL '30 days'
  AND strategy IS NOT NULL
GROUP BY strategy, mode;

-- v_signal_accuracy: pass rate and false positive rate per strategy
DROP VIEW IF EXISTS v_signal_accuracy;
CREATE OR REPLACE VIEW v_signal_accuracy AS
SELECT
  strategy,
  COUNT(*)                                                    AS total_signals,
  COUNT(*) FILTER (WHERE passed = true)                       AS passed_signals,
  COUNT(*) FILTER (WHERE passed = false)                      AS rejected_signals,
  ROUND(COUNT(*) FILTER (WHERE passed = true)::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS pass_rate_pct,
  COUNT(*) FILTER (WHERE passed = true AND "priceAfter1h" IS NOT NULL
    AND "priceAfter1h" < "priceAtSignal")                     AS false_positives
FROM "Signal"
WHERE "detectedAt" >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY strategy;
