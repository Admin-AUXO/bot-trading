import Link from "next/link";
import { ArrowUpRight, FlaskConical, Radar, Route as RouteIcon, Wallet } from "lucide-react";
import { DataTable, EmptyState, PageHero, Panel, StatCard, StatusPill } from "@/components/dashboard-primitives";
import { serverFetch } from "@/lib/api";
import { formatCompactCurrency, formatCurrency, formatInteger, formatNumber, formatPercent, formatTimestamp } from "@/lib/format";
import { buildGrafanaDashboardLink } from "@/lib/grafana";
import type { ResearchRunSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

type SearchParamsInput = Promise<{ run?: string | string[] | undefined }>;

export default async function ResearchPage(props: { searchParams?: SearchParamsInput }) {
  const searchParams = props.searchParams ? await props.searchParams : {};
  const requestedRunId = Array.isArray(searchParams.run) ? searchParams.run[0] : searchParams.run;
  const runs = await serverFetch<ResearchRunSummary[]>("/api/research-runs?limit=20");
  const selectedRunId = requestedRunId ?? runs.find((run) => run.status === "RUNNING")?.id ?? runs[0]?.id ?? null;
  const researchHref = buildGrafanaDashboardLink("research", selectedRunId ? { vars: { runId: selectedRunId } } : {});

  const [selectedRun, tokenRows, positionRows] = selectedRunId
    ? await Promise.all([
      serverFetch<ResearchRunSummary>(`/api/research-runs/${selectedRunId}`),
      serverFetch<Array<Record<string, unknown>>>(`/api/research-runs/${selectedRunId}/tokens`),
      serverFetch<Array<Record<string, unknown>>>(`/api/research-runs/${selectedRunId}/positions`),
    ])
    : [null, [], []];

  const flattenedTokens = tokenRows.map((row) => ({
    symbol: String(row.symbol ?? ""),
    source: String(row.source ?? ""),
    liveTradable: Boolean(row.liveTradable),
    researchTradable: Boolean(row.researchTradable),
    shortlisted: Boolean(row.shortlisted),
    selectedForMock: Boolean(row.selectedForMock),
    fullEvaluationDone: Boolean(row.fullEvaluationDone),
    strategyPassed: Boolean(row.strategyPassed),
    cheapScore: toNumber(row.cheapScore),
    entryScore: toNumber(row.entryScore),
    exitProfile: row.exitProfile ? String(row.exitProfile) : null,
    strategyRejectReason: row.strategyRejectReason ? String(row.strategyRejectReason) : null,
    evaluationDeferReason: row.evaluationDeferReason ? String(row.evaluationDeferReason) : null,
    evaluatedAt: row.evaluatedAt ? String(row.evaluatedAt) : null,
    mockOpenedAt: row.mockOpenedAt ? String(row.mockOpenedAt) : null,
    mint: String(row.mint ?? ""),
  }));

  const flattenedPositions = positionRows.map((row) => {
    const fills = Array.isArray(row.fills) ? row.fills as Array<Record<string, unknown>> : [];
    const realizedPnlUsd = fills
      .filter((fill) => String(fill.side ?? "") === "SELL")
      .reduce((sum, fill) => sum + toNumber(fill.pnlUsd), 0);
    const openedAt = row.openedAt ? new Date(String(row.openedAt)) : null;
    const closedAt = row.closedAt ? new Date(String(row.closedAt)) : null;

    return {
      symbol: String(row.symbol ?? ""),
      status: String(row.status ?? ""),
      entryPriceUsd: toNumber(row.entryPriceUsd),
      currentPriceUsd: toNumber(row.currentPriceUsd),
      lastSeenPriceUsd: toNumber(row.lastSeenPriceUsd),
      amountUsd: toNumber(row.amountUsd),
      remainingToken: toNumber(row.remainingToken),
      tp1Done: Boolean(row.tp1Done),
      tp2Done: Boolean(row.tp2Done),
      realizedPnlUsd,
      holdMinutes: openedAt ? ((closedAt ?? new Date()).getTime() - openedAt.getTime()) / 60_000 : null,
      openedAt: row.openedAt ? String(row.openedAt) : null,
      closedAt: row.closedAt ? String(row.closedAt) : null,
      exitReason: row.exitReason ? String(row.exitReason) : null,
      mint: String(row.mint ?? ""),
    };
  });

  return (
    <div className="space-y-5">
      <PageHero
        eyebrow="Research"
        title="Dry-run sandbox"
        description={undefined}
        meta={<StatusPill value={selectedRun?.status ?? "idle"} />}
        actions={researchHref ? (
          <a
            href={researchHref}
            target="_blank"
            rel="noreferrer"
            className="btn-primary inline-flex items-center gap-2"
            title="Open research analytics in Grafana"
          >
            Open Grafana
            <ArrowUpRight className="h-4 w-4" />
          </a>
        ) : null}
        aside={(
          <div className="panel-muted rounded-[16px] p-4">
            <div className="section-kicker">Sandbox</div>
            <div className="mt-4 text-2xl font-semibold tracking-tight text-text-primary">
              {selectedRun ? formatTimestamp(selectedRun.startedAt) : "No run yet"}
            </div>
            <div className="mt-2 text-sm leading-6 text-text-secondary">
              {selectedRun
                ? `Poll ${formatNumber(selectedRun.pollIntervalMs / 1000)}s · Cap ${formatNumber(selectedRun.maxDurationMs / 60_000)}m`
                : "No research run exists yet."}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="meta-chip">Dry run only</span>
              <span className="meta-chip">Mock positions</span>
              <span className="meta-chip">No live writes</span>
            </div>
          </div>
        )}
      />

      {selectedRun?.errorMessage ? (
        <Panel title="Failure note" eyebrow="Run issue" tone={selectedRun.status === "FAILED" ? "critical" : "warning"}>
          <div className="rounded-[14px] border border-bg-border bg-bg-hover/45 px-4 py-4 text-sm leading-6 text-text-secondary">
            {selectedRun.errorMessage}
          </div>
        </Panel>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-5">
        <StatCard
          label="Recorded runs"
          value={formatInteger(runs.length)}
          detail="Last 20 runs"
          tone="accent"
          icon={FlaskConical}
        />
        <StatCard
          label="Discovered"
          value={formatInteger(selectedRun?.totalDiscovered ?? 0)}
          detail={selectedRun ? `Shortlisted ${formatInteger(selectedRun.totalShortlisted)}` : "No run selected"}
          tone="warning"
          icon={Radar}
        />
        <StatCard
          label="Mock opened"
          value={formatInteger(selectedRun?.totalMockOpened ?? 0)}
          detail={selectedRun ? `${formatInteger(selectedRun.totalMockClosed)} closed` : "No run selected"}
          tone="default"
          icon={Wallet}
        />
        <StatCard
          label="Run PnL"
          value={formatCompactCurrency(selectedRun?.realizedPnlUsd ?? 0)}
          detail={selectedRun?.winRatePercent == null ? "No closed outcomes yet" : `${formatPercent(selectedRun.winRatePercent)} win rate`}
          tone={Number(selectedRun?.realizedPnlUsd ?? 0) >= 0 ? "success" : "danger"}
          icon={RouteIcon}
        />
        <StatCard
          label="Provider burn"
          value={selectedRun ? `${formatInteger(selectedRun.birdeyeUnitsUsed)}/${formatInteger(selectedRun.birdeyeUnitCap)}` : "—"}
          detail={selectedRun ? `${formatInteger(selectedRun.heliusUnitsUsed)}/${formatInteger(selectedRun.heliusUnitCap)} Helius` : "No run selected"}
          tone="default"
          icon={RouteIcon}
        />
      </section>

      <section className="grid gap-6 2xl:grid-cols-[0.8fr_1.2fr]">
        <Panel title="Run picker" eyebrow="Recent runs" tone="passive">
          {runs.length === 0 ? (
            <EmptyState title="No research runs yet" detail="Launch a dry-run research cycle from the desk first." />
          ) : (
            <div className="space-y-3">
              {runs.map((run) => {
                const active = run.id === selectedRunId;
                return (
                  <Link
                    key={run.id}
                    href={`/research?run=${run.id}`}
                    title={`Open run started ${formatTimestamp(run.startedAt)}`}
                    className={`block rounded-[14px] border px-4 py-3 transition ${
                      active
                        ? "border-[rgba(163,230,53,0.28)] bg-[#121511]"
                        : "border-bg-border bg-bg-card/45 hover:bg-bg-hover"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-text-primary">{formatTimestamp(run.startedAt)}</div>
                      <StatusPill value={run.status} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
                      <span>{formatInteger(run.totalDiscovered)} discovered</span>
                      <span>{formatInteger(run.totalEvaluated)} evaluated</span>
                      <span>{formatInteger(run.totalMockOpened)} mock opened</span>
                      <span>{formatCompactCurrency(run.realizedPnlUsd)} pnl</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel title="Selected run summary" eyebrow="Run metrics" tone="passive">
          {selectedRun ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <SummaryMetric label="Completed at" value={formatTimestamp(selectedRun.completedAt)} />
              <SummaryMetric label="Fixed ticket" value={formatCurrency(selectedRun.fixedPositionSizeUsd)} />
              <SummaryMetric label="Deep-eval cap" value={formatInteger(selectedRun.fullEvaluationLimit)} />
              <SummaryMetric label="Live tradable" value={formatInteger(selectedRun.liveTradablePassed)} />
              <SummaryMetric label="Research tradable" value={formatInteger(selectedRun.researchTradablePassed)} />
              <SummaryMetric label="Average hold" value={selectedRun.averageHoldMinutes == null ? "—" : `${formatNumber(selectedRun.averageHoldMinutes)} min`} />
              <SummaryMetric label="PnL delta" value={selectedRun.comparison ? formatSignedCurrency(selectedRun.comparison.realizedPnlUsdDelta) : "—"} />
              <SummaryMetric label="Pass delta" value={selectedRun.comparison ? formatSignedPercent(selectedRun.comparison.strategyPassRateDeltaPercent) : "—"} />
              <SummaryMetric label="Win delta" value={selectedRun.comparison ? formatSignedPercent(selectedRun.comparison.mockWinRateDeltaPercent) : "—"} />
            </div>
          ) : (
            <EmptyState title="No run selected" detail="Choose a run once one exists." />
          )}
        </Panel>
      </section>

      <section className="grid gap-6 2xl:grid-cols-[1.2fr_0.8fr]">
        <DataTable
          title="Research tokens"
          eyebrow="Discovery and evaluation"
          rows={flattenedTokens}
          preferredKeys={["symbol", "source", "liveTradable", "researchTradable", "shortlisted", "strategyPassed", "selectedForMock", "cheapScore", "entryScore", "exitProfile", "strategyRejectReason", "evaluationDeferReason"]}
          emptyTitle="No research tokens yet"
          emptyDetail="Token-level evidence appears here once a run has discovery results."
          panelTone="passive"
        />
        <DataTable
          title="Research positions"
          eyebrow="Mock trade trail"
          rows={flattenedPositions}
          preferredKeys={["symbol", "status", "entryPriceUsd", "currentPriceUsd", "lastSeenPriceUsd", "amountUsd", "remainingToken", "realizedPnlUsd", "holdMinutes", "exitReason"]}
          emptyTitle="No research positions yet"
          emptyDetail="If no mock positions were opened, either nothing passed or the run has not started."
          panelTone="passive"
        />
      </section>
    </div>
  );
}

function SummaryMetric(props: { label: string; value: string }) {
  return (
    <div className="panel-muted rounded-[12px] px-4 py-3">
      <div className="text-xs uppercase tracking-[0.24em] text-text-muted">{props.label}</div>
      <div className="mt-2 text-sm font-medium text-text-primary">{props.value}</div>
    </div>
  );
}

function toNumber(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatSignedCurrency(value: number): string {
  return `${value >= 0 ? "+" : ""}${formatCurrency(value)}`;
}

function formatSignedPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${formatPercent(value)}`;
}
