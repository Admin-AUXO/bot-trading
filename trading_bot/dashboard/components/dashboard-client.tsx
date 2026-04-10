"use client";

import { useEffect, useEffectEvent, useMemo, useState, useTransition } from "react";
import { motion } from "motion/react";
import { Activity, AlertTriangle, ArrowUpRight, PauseCircle, PlayCircle, RefreshCcw, ShieldAlert, Zap } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchJson } from "@/lib/api";
import { chartColors } from "@/lib/chart-colors";
import { formatCompactCurrency, formatCurrency, formatInteger, formatNumber, formatPercent, formatTimestamp } from "@/lib/format";
import type { StatusPayload, ViewRow } from "@/lib/types";
import { DataTable, EmptyState, PageHero, Panel, StatCard, StatusPill } from "@/components/dashboard-primitives";

type GenericRow = Record<string, unknown>;

export function DashboardClient(props: {
  initialStatus: StatusPayload;
  initialFunnel: ViewRow[];
  initialProviderDaily: ViewRow[];
  initialPositionPerformance: ViewRow[];
}) {
  const [status, setStatus] = useState(props.initialStatus);
  const [funnel, setFunnel] = useState(props.initialFunnel);
  const [providerDaily, setProviderDaily] = useState(props.initialProviderDaily);
  const [positions, setPositions] = useState(props.initialPositionPerformance);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(() => new Date());
  const [isPending, startTransition] = useTransition();

  const refresh = useEffectEvent(() => {
    startTransition(async () => {
      try {
        const [nextStatus, nextFunnel, nextProviderDaily, nextPositions] = await Promise.all([
          fetchJson<StatusPayload>("/status"),
          fetchJson<ViewRow[]>("/views/v_candidate_funnel_daily"),
          fetchJson<ViewRow[]>("/views/v_api_provider_daily"),
          fetchJson<ViewRow[]>("/views/v_position_performance"),
        ]);
        setStatus(nextStatus);
        setFunnel(nextFunnel);
        setProviderDaily(nextProviderDaily);
        setPositions(nextPositions);
        setRefreshError(null);
        setLastRefreshedAt(new Date());
      } catch (error) {
        setRefreshError(error instanceof Error ? error.message : "refresh failed");
      }
    });
  });

  useEffect(() => {
    const timer = window.setInterval(() => refresh(), 15_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const latestPositions = positions.slice(0, 6);
  const providerSummary = (status.providerSummary ?? []) as GenericRow[];
  const latestCandidates = (status.latestCandidates ?? []) as GenericRow[];
  const latestFills = (status.latestFills ?? []) as GenericRow[];
  const isResearchMode = status.botState.tradeMode === "DRY_RUN";
  const activeResearchRun = status.research?.activeRun ?? null;
  const latestResearchRun = status.research?.latestCompletedRun ?? null;
  const previousResearchRun = status.research?.previousCompletedRun ?? null;
  const headlineResearchRun = activeResearchRun ?? latestResearchRun;
  const todayProviderRows = useMemo(() => providerDaily.slice(-6), [providerDaily]);
  const latestFunnelDay = funnel.at(-1);

  const positionStats = useMemo(() => {
    const closed = positions.filter((row) => String(row.status) === "CLOSED");
    const realizedPnlUsd = closed.reduce((sum, row) => sum + Number(row.realized_pnl_usd ?? 0), 0);
    const avgHoldMinutes = closed.length
      ? closed.reduce((sum, row) => sum + Number(row.hold_minutes ?? 0), 0) / closed.length
      : 0;

    return {
      realizedPnlUsd,
      avgHoldMinutes,
      closedCount: closed.length,
    };
  }, [positions]);

  const lastActions = isResearchMode
    ? [
      { label: "Run started", value: activeResearchRun?.startedAt ?? latestResearchRun?.startedAt ?? null },
      { label: "Last poll", value: activeResearchRun?.lastPolledAt ?? null },
      { label: "Run finished", value: latestResearchRun?.completedAt ?? null },
    ]
    : [
      { label: "Discovery", value: status.botState.lastDiscoveryAt },
      { label: "Evaluation", value: status.botState.lastEvaluationAt },
      { label: "Exit sweep", value: status.botState.lastExitCheckAt },
    ];

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow={isResearchMode ? "Research shell" : "Operator shell"}
        title={isResearchMode ? "Bounded dry runs instead of fake runtime theater" : "Migration control without the dashboard landfill"}
        description={isResearchMode
          ? "DRY_RUN is a one-shot research lane now: one discovery sweep across all sources, cheap ranking across the page, deep evaluation on the shortlist, then mock exits on the capped winners. No legacy candidate loop, no fake portfolio churn."
          : "Runtime truth, queue pressure, current exposure, and provider burn stay in the first viewport. The shell is for operating the bot, not for pretending every page should be Grafana."}
        actions={
          <>
            {isResearchMode ? (
              <ActionButton
                label={activeResearchRun ? "Research run active" : "Run research dry run"}
                icon={RefreshCcw}
                endpoint="/control/run-research-dry-run"
                onDone={() => {
                  setRefreshError(null);
                  refresh();
                }}
                onError={(message) => setRefreshError(message)}
                disabled={Boolean(activeResearchRun)}
              />
            ) : (
              <>
                <ActionButton
                  label="Discover now"
                  icon={RefreshCcw}
                  endpoint="/control/discover-now"
                  onDone={() => {
                    setRefreshError(null);
                    refresh();
                  }}
                  onError={(message) => setRefreshError(message)}
                />
                <ActionButton
                  label={status.botState.pauseReason ? "Resume bot" : "Pause bot"}
                  icon={status.botState.pauseReason ? PlayCircle : PauseCircle}
                  endpoint={status.botState.pauseReason ? "/control/resume" : "/control/pause"}
                  body={status.botState.pauseReason ? undefined : { reason: "paused from dashboard" }}
                  onDone={() => {
                    setRefreshError(null);
                    refresh();
                  }}
                  onError={(message) => setRefreshError(message)}
                />
              </>
            )}
            <button
              onClick={() => refresh()}
              className="rounded-full border border-[var(--line)] px-4 py-2 text-sm text-muted transition hover:border-[var(--accent)] hover:text-ink"
            >
              {isPending ? "Refreshing..." : isResearchMode ? "Refresh research lane" : "Refresh desk"}
            </button>
          </>
        }
        aside={(
          <div className="panel-muted rounded-[24px] p-5">
            <div className="flex items-center justify-between">
              <div className="section-kicker">{isResearchMode ? "Run status" : "Lane status"}</div>
              <StatusPill value={isResearchMode ? (activeResearchRun?.status ?? latestResearchRun?.status ?? "ready") : (status.botState.pauseReason ? "paused" : "active")} />
            </div>
            <div className="mt-4 text-2xl font-semibold tracking-tight text-text-primary">
              {isResearchMode ? (activeResearchRun ? "Research run active" : "Research lane ready") : status.botState.tradeMode}
            </div>
            <div className="mt-2 text-sm leading-6 text-text-secondary">
              {isResearchMode
                ? activeResearchRun
                  ? `Polling every ${formatNumber(activeResearchRun.pollIntervalMs / 1000)} sec until the ${formatNumber(activeResearchRun.maxDurationMs / 60_000)} minute cap or the exit logic closes everything first.`
                  : latestResearchRun
                    ? `Last run closed ${formatInteger(latestResearchRun.totalMockClosed)} mock positions and finished at ${formatTimestamp(latestResearchRun.completedAt)}.`
                    : "Manual only. One discovery page, one shortlist, one capped mock batch, then forced finalization on the configured timer."
                : status.botState.pauseReason
                  ?? status.entryGate.reason
                  ?? "Live lane is armed and polling on schedule."}
            </div>
            <div className="mt-5 grid gap-3 text-sm">
              {isResearchMode ? (
                <>
                  <MiniMetric label="Last refresh" value={formatTimestamp(lastRefreshedAt)} />
                  <MiniMetric label="Poll cadence" value={`${formatNumber(status.settings.research.pollIntervalMs / 1000)} sec`} />
                  <MiniMetric label="Run window" value={`${formatNumber(status.settings.research.maxRunDurationMs / 60_000)} min`} />
                  <MiniMetric label="Fixed ticket" value={formatCurrency(status.settings.research.fixedPositionSizeUsd)} />
                </>
              ) : (
                <>
                  <MiniMetric label="Last refresh" value={formatTimestamp(lastRefreshedAt)} />
                  <MiniMetric label="Cash on desk" value={formatCurrency(status.botState.cashUsd)} />
                  <MiniMetric label="Realized edge" value={formatCompactCurrency(status.botState.realizedPnlUsd)} />
                  <MiniMetric label="Day guard" value={`${formatCurrency(status.entryGate.dailyRealizedPnlUsd)} / ${status.entryGate.consecutiveLosses}L`} />
                </>
              )}
            </div>
          </div>
        )}
      />

      {refreshError ? (
        <div className="rounded-[24px] border border-[rgba(255,107,107,0.25)] bg-[rgba(255,107,107,0.08)] px-5 py-4 text-sm text-[var(--danger)]">
          Refresh failed: {refreshError}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-5">
        {isResearchMode ? (
          <>
            <StatCard
              label="Research status"
              value={activeResearchRun ? "RUNNING" : latestResearchRun ? "READY" : "IDLE"}
              detail={activeResearchRun ? "A bounded run is live" : "Manual start only"}
              tone={activeResearchRun ? "success" : "default"}
              icon={Activity}
            />
            <StatCard
              label="Discovered"
              value={formatInteger(headlineResearchRun?.totalDiscovered ?? 0)}
              detail={`One page, max ${formatInteger(status.settings.research.discoveryLimit)} names`}
              tone="accent"
              icon={RefreshCcw}
            />
            <StatCard
              label="Deep evaluated"
              value={formatInteger(headlineResearchRun?.totalEvaluated ?? 0)}
              detail={`Shortlist capped at ${formatInteger(status.settings.research.fullEvaluationLimit)}`}
              tone="warning"
              icon={ShieldAlert}
            />
            <StatCard
              label="Mock positions"
              value={formatInteger(headlineResearchRun ? headlineResearchRun.totalMockOpened - headlineResearchRun.totalMockClosed : 0)}
              detail={`Max ${formatInteger(status.settings.research.maxMockPositions)} opened per run`}
              tone="default"
              icon={ArrowUpRight}
            />
            <StatCard
              label="Run PnL"
              value={formatCompactCurrency(headlineResearchRun?.realizedPnlUsd ?? 0)}
              detail={headlineResearchRun?.winRatePercent == null ? "No closed mock exits yet" : `${formatPercent(headlineResearchRun.winRatePercent)} win rate`}
              tone={Number(headlineResearchRun?.realizedPnlUsd ?? 0) >= 0 ? "success" : "danger"}
              icon={Zap}
            />
          </>
        ) : (
          <>
            <StatCard
              label="Open positions"
              value={formatInteger(status.openPositions)}
              detail={`Max ${formatInteger(status.settings.capital.maxOpenPositions)} live at once`}
              tone="success"
              icon={Activity}
            />
            <StatCard
              label="Queued candidates"
              value={formatInteger(status.queuedCandidates)}
              detail="Still waiting through delayed evaluation"
              tone="warning"
              icon={RefreshCcw}
            />
            <StatCard
              label="Closed positions"
              value={formatInteger(positionStats.closedCount)}
              detail={`Average hold ${positionStats.avgHoldMinutes.toFixed(1)} min`}
              tone="default"
              icon={ArrowUpRight}
            />
            <StatCard
              label="Realized PnL"
              value={formatCompactCurrency(positionStats.realizedPnlUsd)}
              detail="Closed-position edge from the SQL view"
              tone={positionStats.realizedPnlUsd >= 0 ? "success" : "danger"}
              icon={Zap}
            />
            <StatCard
              label="Queue today"
              value={formatInteger(latestFunnelDay?.candidate_count ?? 0)}
              detail={latestFunnelDay ? `Latest funnel date ${String(latestFunnelDay.session_date)}` : "No funnel rows yet"}
              tone="accent"
              icon={ShieldAlert}
            />
          </>
        )}
      </section>

      <section className="grid gap-6 2xl:grid-cols-[1.35fr_0.95fr]">
        {isResearchMode ? (
          <>
            <Panel title="Research run summary" eyebrow="Current or latest run">
              {headlineResearchRun ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <ResearchMetric label="Run started" value={formatTimestamp(headlineResearchRun.startedAt)} />
                  <ResearchMetric label="Run finished" value={formatTimestamp(headlineResearchRun.completedAt)} />
                  <ResearchMetric label="Shortlisted" value={formatInteger(headlineResearchRun.totalShortlisted)} />
                  <ResearchMetric label="Strategy passed" value={formatInteger(headlineResearchRun.totalStrategyPassed)} />
                  <ResearchMetric label="Live tradable" value={formatInteger(headlineResearchRun.liveTradablePassed)} />
                  <ResearchMetric label="Research tradable" value={formatInteger(headlineResearchRun.researchTradablePassed)} />
                  <ResearchMetric label="Mock opened" value={formatInteger(headlineResearchRun.totalMockOpened)} />
                  <ResearchMetric label="Mock closed" value={formatInteger(headlineResearchRun.totalMockClosed)} />
                  <ResearchMetric label="Birdeye burn" value={`${formatInteger(headlineResearchRun.birdeyeUnitsUsed)} / ${formatInteger(headlineResearchRun.birdeyeUnitCap)}`} />
                  <ResearchMetric label="Helius burn" value={`${formatInteger(headlineResearchRun.heliusUnitsUsed)} / ${formatInteger(headlineResearchRun.heliusUnitCap)}`} />
                </div>
              ) : (
                <EmptyState title="No research run yet" detail="The lane is armed, but there is no discovery/evaluation evidence yet because DRY_RUN waits for a manual run." />
              )}
            </Panel>

            <Panel title="Run comparison" eyebrow="Against the previous completed run">
              {latestResearchRun?.comparison ? (
                <div className="space-y-3">
                  <ResearchMetric label="Previous run" value={previousResearchRun ? formatTimestamp(previousResearchRun.completedAt) : latestResearchRun.comparison.previousRunId} />
                  <ResearchMetric label="PnL delta" value={formatSignedCurrency(latestResearchRun.comparison.realizedPnlUsdDelta)} />
                  <ResearchMetric label="Pass-rate delta" value={formatSignedPercent(latestResearchRun.comparison.strategyPassRateDeltaPercent)} />
                  <ResearchMetric label="Win-rate delta" value={formatSignedPercent(latestResearchRun.comparison.mockWinRateDeltaPercent)} />
                  <ResearchMetric label="Avg-hold delta" value={formatSignedMinutes(latestResearchRun.comparison.averageHoldMinutesDelta)} />
                  <ResearchMetric label="Opened-count delta" value={formatSignedInteger(latestResearchRun.comparison.openedCountDelta)} />
                </div>
              ) : (
                <EmptyState title="No comparison yet" detail="The first completed run has nothing to compare against. That is how time works, unfortunately." />
              )}
            </Panel>
          </>
        ) : (
          <>
            <Panel title="Candidate funnel" eyebrow="Daily discovery flow">
              {funnel.length === 0 ? (
                <EmptyState title="No candidate history yet" detail="Once discovery runs, the funnel chart shows whether the bot is finding edge or just collecting rejects." />
              ) : (
                <div className="h-80 min-w-0">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={280}>
                    <BarChart data={funnel}>
                      <CartesianGrid stroke={chartColors.gridLine} vertical={false} />
                      <XAxis dataKey="session_date" stroke={chartColors.muted} />
                      <YAxis stroke={chartColors.muted} />
                      <Tooltip
                        contentStyle={{
                          background: chartColors.tooltipBg,
                          border: `1px solid ${chartColors.tooltipBorder}`,
                          color: chartColors.tooltipText,
                        }}
                      />
                      <Bar dataKey="candidate_count" fill={chartColors.warning} radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Panel>

            <Panel title="Provider burn today" eyebrow="Cost discipline">
              <div className="space-y-4">
                {todayProviderRows.length === 0 ? (
                  <EmptyState title="No provider rows yet" detail="The desk will fill once Birdeye or Helius calls land in today's provider view." />
                ) : (
                  todayProviderRows.map((row, index) => (
                    <motion.div
                      key={`${row.provider}-${index}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.04 }}
                      className="panel-muted rounded-2xl p-4"
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium text-text-primary">{String(row.provider)}</div>
                        <div className="text-xs text-text-muted">{String(row.session_date)}</div>
                      </div>
                      <div className="mt-3 flex items-end justify-between gap-3">
                        <div>
                          <div className="text-2xl font-semibold text-text-primary">{formatInteger(row.total_units ?? 0)}</div>
                          <div className="text-xs text-text-muted">units</div>
                        </div>
                        <div className="text-right text-sm text-text-primary">
                          <div>{formatInteger(row.total_calls ?? 0)} calls</div>
                          <div className="text-xs text-text-muted">{formatInteger(row.error_count ?? 0)} errors</div>
                        </div>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </Panel>
          </>
        )}
      </section>

      <section className="grid gap-6 2xl:grid-cols-[1.15fr_1fr]">
        {isResearchMode ? (
          <>
            <Panel title="Research config snapshot" eyebrow="What this run actually used">
              {headlineResearchRun ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <ResearchMetric label="Discovery cap" value={formatInteger(headlineResearchRun.configSnapshot.research.discoveryLimit)} />
                  <ResearchMetric label="Deep-eval cap" value={formatInteger(headlineResearchRun.configSnapshot.research.fullEvaluationLimit)} />
                  <ResearchMetric label="Mock-position cap" value={formatInteger(headlineResearchRun.configSnapshot.research.maxMockPositions)} />
                  <ResearchMetric label="Fixed ticket" value={formatCurrency(headlineResearchRun.configSnapshot.research.fixedPositionSizeUsd)} />
                  <ResearchMetric label="Poll cadence" value={`${formatNumber(headlineResearchRun.configSnapshot.research.pollIntervalMs / 1000)} sec`} />
                  <ResearchMetric label="Run window" value={`${formatNumber(headlineResearchRun.configSnapshot.research.maxRunDurationMs / 60_000)} min`} />
                  <ResearchMetric label="Time stop" value={`${formatNumber(headlineResearchRun.configSnapshot.exits.timeStopMinutes)} min`} />
                  <ResearchMetric label="Hard limit" value={`${formatNumber(headlineResearchRun.configSnapshot.exits.timeLimitMinutes)} min`} />
                </div>
              ) : (
                <EmptyState title="No config snapshot yet" detail="The run-level snapshot gets written when you actually launch the research lane." />
              )}
            </Panel>

            <Panel title="Research notes" eyebrow="What matters next">
              <div className="space-y-3 text-sm text-muted">
                <DeskNote icon={ShieldAlert} title="All sources, one page">
                  Dry-run discovery ignores the live source allowlist and asks Birdeye for one all-source page, capped by the runtime setting instead of burning through paginated folklore.
                </DeskNote>
                <DeskNote icon={Zap} title="Cheap ranking before deep spend">
                  The lane scores the page first, then spends deep evaluation calls only on the top shortlist. That is the whole point of the redesign: less provider burn, same strategy logic where it matters.
                </DeskNote>
                <DeskNote icon={ArrowUpRight} title="Mock exits use the real exit plan">
                  Opened mock positions follow the same TP, trailing, and time-stop logic as the live position engine, then force-close on the configured run window if the market refuses to finish the experiment for you.
                </DeskNote>
                <DeskNote icon={AlertTriangle} title="Operational tables stay separate">
                  Research rows live in dedicated tables, so the normal candidates, positions, and fills views keep telling the truth about the live desk instead of becoming a landfill for tuning runs.
                </DeskNote>
              </div>
            </Panel>
          </>
        ) : (
          <>
            <Panel title="Recent realized edge" eyebrow="Closed-position outcomes">
              {positions.length === 0 ? (
                <EmptyState title="No performance rows yet" detail="Once exits start landing, the area chart will show whether the desk is manufacturing edge or donating it back." />
              ) : (
                <div className="h-80 min-w-0">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={280}>
                    <AreaChart data={positions.slice(0, 12).reverse()}>
                      <defs>
                        <linearGradient id="edgeFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={chartColors.win} stopOpacity={0.45} />
                          <stop offset="95%" stopColor={chartColors.win} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke={chartColors.gridLine} vertical={false} />
                      <XAxis dataKey="symbol" stroke={chartColors.muted} />
                      <YAxis stroke={chartColors.muted} />
                      <Tooltip
                        contentStyle={{
                          background: chartColors.tooltipBg,
                          border: `1px solid ${chartColors.tooltipBorder}`,
                          color: chartColors.tooltipText,
                        }}
                      />
                      <Area dataKey="realized_pnl_usd" stroke={chartColors.win} fill="url(#edgeFill)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Panel>

            <Panel title="Desk notes" eyebrow="What matters next">
              <div className="space-y-3 text-sm text-muted">
                <DeskNote icon={ShieldAlert} title="Evidence before folklore">
                  Error payloads stay queryable by default, and success payload capture is explicit instead of quietly turning telemetry into a storage leak.
                </DeskNote>
                <DeskNote icon={Zap} title="Parallelism without lying">
                  Evaluation still runs concurrently, but capacity gets checked before provider reads and live wallet actions are serialized so the DB and chain do not tell different stories.
                </DeskNote>
                <DeskNote icon={ArrowUpRight} title="This page is for operating">
                  Grafana still owns the heavier read path. The shell keeps the runtime lane tight and explicit instead of turning into a BI landfill.
                </DeskNote>
                <DeskNote icon={AlertTriangle} title="LIVE has prerequisites">
                  The backend can route live fills now, but only if the trading wallet, quote mint, and Sender/Jupiter env are configured sanely. A green badge does not fund the wallet for you.
                </DeskNote>
              </div>
            </Panel>
          </>
        )}
      </section>

      <section className="grid gap-6 2xl:grid-cols-[0.86fr_1.14fr]">
        <Panel title="Runtime heartbeat" eyebrow="Recent activity">
          <div className="space-y-3">
            {lastActions.map((action) => (
              <div key={action.label} className="panel-muted flex items-center justify-between rounded-2xl px-4 py-3">
                <span className="text-sm text-text-secondary">{action.label}</span>
                <span className="text-sm font-medium text-text-primary">{formatTimestamp(action.value)}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title={isResearchMode ? "Provider summary" : "Provider summary"} eyebrow={isResearchMode ? "Current lane pressure" : "Live desk pressure"}>
          {providerSummary.length === 0 ? (
            <EmptyState title="No provider summary yet" detail="Once today's provider view has rows, this block will show current pressure without making you jump to telemetry." />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {providerSummary.map((row, index) => (
                <div key={`${row.provider}-${index}`} className="panel-muted rounded-2xl p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-text-primary">{String(row.provider ?? "unknown")}</span>
                    <span className="text-xs text-text-muted">{formatInteger(row.error_count ?? 0)} errors</span>
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-3">
                    <div>
                      <div className="text-2xl font-semibold text-text-primary">{formatInteger(row.total_units ?? 0)}</div>
                      <div className="text-xs text-text-muted">units today</div>
                    </div>
                    <div className="text-right text-xs text-text-muted">
                      <div>{formatInteger(row.total_calls ?? 0)} calls</div>
                      <div>{Number(row.avg_latency_ms ?? 0).toFixed(1)} ms avg</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </section>

      {isResearchMode ? (
        <Panel title="Operational tables stay clean" eyebrow="Deliberate separation">
          <div className="space-y-3 text-sm leading-6 text-text-secondary">
            <p>
              Research dry runs write to dedicated research tables, so the default positions, candidates, and fills slices stay reserved for the real runtime path.
            </p>
            <p>
              If you want token-level research evidence next, the backend routes are already there. This page is only surfacing run-level truth first, because a tuning lane that starts with table spam is how people miss the actual signal.
            </p>
          </div>
        </Panel>
      ) : (
        <>
          <section className="grid gap-6 2xl:grid-cols-[1.1fr_0.9fr]">
            <DataTable
              title="Latest positions"
              eyebrow="Current and recent exposure"
              rows={latestPositions}
              preferredKeys={["symbol", "status", "entry_price_usd", "current_price_usd", "realized_pnl_usd", "hold_minutes", "exit_reason"]}
              emptyTitle="No positions yet"
              emptyDetail="The desk is flat. Either the filters are behaving, or the bot has found nothing worth buying."
            />
            <DataTable
              title="Latest candidates"
              eyebrow="Queue pressure"
              rows={latestCandidates}
              preferredKeys={["symbol", "status", "source", "liquidityUsd", "volume5mUsd", "marketCapUsd", "scheduledEvaluationAt"]}
              emptyTitle="No candidates yet"
              emptyDetail="Discovery has not populated the runtime snapshot with candidate rows."
            />
          </section>

          <DataTable
            title="Latest fills"
            eyebrow="Trade trail"
            rows={latestFills}
            preferredKeys={["side", "priceUsd", "amountUsd", "amountToken", "pnlUsd", "createdAt"]}
            emptyTitle="No fills yet"
            emptyDetail="No fills have been written yet, so the execution trail is still clean."
          />
        </>
      )}
    </div>
  );
}

function ActionButton(props: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  endpoint: string;
  body?: Record<string, unknown>;
  onDone: () => void;
  onError?: (message: string) => void;
  disabled?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const Icon = props.icon;

  return (
    <button
      onClick={() => startTransition(async () => {
        try {
          await fetchJson(props.endpoint, {
            method: "POST",
            body: props.body ? JSON.stringify(props.body) : undefined,
          });
          props.onDone();
        } catch (error) {
          props.onError?.(error instanceof Error ? error.message : "request failed");
        }
      })}
      className="btn-ghost border border-bg-border bg-bg-card/70 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={props.disabled || pending}
    >
      <span className="inline-flex items-center gap-2">
        <Icon className="h-4 w-4" />
        {pending ? "Working..." : props.label}
      </span>
    </button>
  );
}

function DeskNote(props: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  const Icon = props.icon;
  return (
    <div className="panel-muted flex gap-3 rounded-2xl p-4">
      <Icon className="mt-0.5 h-4 w-4 text-accent-blue" />
      <div>
        <div className="font-medium text-text-primary">{props.title}</div>
        <div className="mt-1 leading-6 text-text-secondary">{props.children}</div>
      </div>
    </div>
  );
}

function MiniMetric(props: { label: string; value: string }) {
  return (
    <div className="micro-stat flex items-center justify-between gap-3">
      <span className="micro-stat-label">{props.label}</span>
      <span className="text-sm font-medium text-text-primary">{props.value}</span>
    </div>
  );
}

function ResearchMetric(props: { label: string; value: string }) {
  return (
    <div className="panel-muted rounded-2xl px-4 py-3">
      <div className="text-xs uppercase tracking-[0.24em] text-text-muted">{props.label}</div>
      <div className="mt-2 text-sm font-medium text-text-primary">{props.value}</div>
    </div>
  );
}

function formatSignedCurrency(value: number): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "—";
  }
  return `${numeric >= 0 ? "+" : ""}${formatCurrency(numeric)}`;
}

function formatSignedPercent(value: number): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "—";
  }
  return `${numeric >= 0 ? "+" : ""}${formatPercent(numeric)}`;
}

function formatSignedMinutes(value: number): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "—";
  }
  return `${numeric >= 0 ? "+" : ""}${formatNumber(numeric)} min`;
}

function formatSignedInteger(value: number): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "—";
  }
  return `${numeric >= 0 ? "+" : ""}${formatInteger(numeric)}`;
}
