import {
  buildDashboard,
  dashboardLink,
  dashboardMeta,
  filterRegex,
  queryVariable,
  statPanel,
  tablePanel,
  timeFilter,
} from "./core.mjs";

export function researchDashboard() {
  const runId = queryVariable("runId", "Research Run", `SELECT TO_CHAR("startedAt", 'YYYY-MM-DD HH24:MI') || ' · ' || status || ' · ' || LEFT(id, 8) AS __text, id AS __value FROM "ResearchRun" ORDER BY "startedAt" DESC`, { multi: false });
  const runStatus = queryVariable("runStatus", "Run Status", `SELECT DISTINCT status AS __text, status AS __value FROM "ResearchRun" ORDER BY 1`);
  const source = queryVariable("source", "Source", `SELECT DISTINCT source AS __text, source AS __value FROM "ResearchToken" ORDER BY 1`);
  const panels = [
    statPanel(1, "Latest Run PnL", { h: 4, w: 6, x: 0, y: 0 }, `SELECT COALESCE("realizedPnlUsd", 0)::numeric AS value FROM "ResearchRun" WHERE ${filterRegex("id", "runId")} AND ${filterRegex("status", "runStatus")} AND ${timeFilter('"startedAt"')} ORDER BY "startedAt" DESC LIMIT 1`, "currencyUSD", "Latest completed dry-run PnL in the selected research slice."),
    statPanel(2, "Latest Win Rate", { h: 4, w: 6, x: 6, y: 0 }, `SELECT COALESCE("winRatePercent", 0)::numeric AS value FROM "ResearchRun" WHERE ${filterRegex("id", "runId")} AND ${filterRegex("status", "runStatus")} AND ${timeFilter('"startedAt"')} ORDER BY "startedAt" DESC LIMIT 1`, "percent", "Latest dry-run win rate in the selected research slice."),
    statPanel(3, "Latest Discovered", { h: 4, w: 6, x: 12, y: 0 }, `SELECT COALESCE("totalDiscovered", 0) AS value FROM "ResearchRun" WHERE ${filterRegex("id", "runId")} AND ${filterRegex("status", "runStatus")} AND ${timeFilter('"startedAt"')} ORDER BY "startedAt" DESC LIMIT 1`, "none", "Latest dry-run discovery count in the selected scope."),
    statPanel(4, "Strategy Passed", { h: 4, w: 6, x: 18, y: 0 }, `SELECT COALESCE("totalStrategyPassed", 0) AS value FROM "ResearchRun" WHERE ${filterRegex("id", "runId")} AND ${filterRegex("status", "runStatus")} AND ${timeFilter('"startedAt"')} ORDER BY "startedAt" DESC LIMIT 1`, "none", "Latest count of tokens that passed strategy gates."),
    tablePanel(5, "Run History", { h: 8, w: 24, x: 0, y: 4 }, `SELECT id, status, "startedAt" AS started_at, "completedAt" AS completed_at, "totalDiscovered" AS total_discovered, "totalStrategyPassed" AS total_strategy_passed, "totalMockOpened" AS total_mock_opened, "totalMockClosed" AS total_mock_closed, "realizedPnlUsd"::numeric AS realized_pnl_usd, "winRatePercent"::numeric AS win_rate_percent, "averageHoldMinutes"::numeric AS average_hold_minutes FROM "ResearchRun" WHERE ${timeFilter('"startedAt"')} AND ${filterRegex("id", "runId")} AND ${filterRegex("status", "runStatus")} ORDER BY "startedAt" DESC LIMIT 50`, undefined, "Run-level history for dry-run comparisons."),
    tablePanel(6, "Research Token Funnel", { h: 8, w: 12, x: 0, y: 12 }, `SELECT rt."runId" AS run_id, rt.mint, rt.symbol, rt.source, rt.shortlisted, rt."fullEvaluationDone" AS full_evaluation_done, rt."strategyPassed" AS strategy_passed, rt."strategyRejectReason" AS strategy_reject_reason, rt."evaluationDeferReason" AS evaluation_defer_reason, rt."liveTradable" AS live_tradable, rt."researchTradable" AS research_tradable, rt."entryScore"::numeric AS entry_score, rt."exitProfile" AS exit_profile FROM "ResearchToken" rt JOIN "ResearchRun" rr ON rr.id = rt."runId" WHERE ${filterRegex('rt."runId"', "runId")} AND ${filterRegex('rr.status', "runStatus")} AND ${filterRegex("rt.source", "source")} ORDER BY rt."createdAt" DESC LIMIT 100`, undefined, "Token-level dry-run funnel evidence."),
    tablePanel(7, "Research Position Outcomes", { h: 8, w: 12, x: 12, y: 12 }, `SELECT rp."runId" AS run_id, rp.id AS position_id, rp.mint, rp.symbol, rp.status, rp."openedAt" AS opened_at, rp."closedAt" AS closed_at, rp."entryPriceUsd"::numeric AS entry_price_usd, rp."currentPriceUsd"::numeric AS current_price_usd, rp."amountUsd"::numeric AS amount_usd, rp."remainingToken"::numeric AS remaining_token, rp."exitReason" AS exit_reason FROM "ResearchPosition" rp JOIN "ResearchRun" rr ON rr.id = rp."runId" WHERE ${filterRegex('rp."runId"', "runId")} AND ${filterRegex('rr.status', "runStatus")} ORDER BY rp."openedAt" DESC LIMIT 100`, undefined, "Mock-position outcomes for dry-run analysis."),
    tablePanel(8, "Research Fill Trail", { h: 8, w: 24, x: 0, y: 20 }, `SELECT rf."createdAt" AS created_at, rp."runId" AS run_id, rp.id AS position_id, rp.mint, rp.symbol, rf.side, rf."priceUsd"::numeric AS price_usd, rf."amountUsd"::numeric AS amount_usd, rf."pnlUsd"::numeric AS pnl_usd FROM "ResearchFill" rf JOIN "ResearchPosition" rp ON rp.id = rf."positionId" JOIN "ResearchRun" rr ON rr.id = rp."runId" WHERE ${filterRegex('rp."runId"', "runId")} AND ${filterRegex('rr.status', "runStatus")} ORDER BY rf."createdAt" DESC LIMIT 100`, undefined, "Mock execution trail for the selected dry-run slice."),
  ];

  return buildDashboard("research", "Research dry-run summaries, token funnel, and mock position outcomes.", [runId, runStatus, source], panels, [
    dashboardLink("Executive Scorecard", dashboardMeta.executive.uid),
    dashboardLink("Analyst Insights Overview", dashboardMeta.analyst.uid),
    dashboardLink("Candidate & Funnel Analytics", dashboardMeta.candidate.uid),
  ]);
}
