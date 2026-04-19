import Link from "next/link";
import {
  CompactPageHeader,
  CompactStatGrid,
  DisclosurePanel,
  EmptyState,
  Panel,
  ScanStat,
  StatusPill,
} from "@/components/dashboard-primitives";
import {
  SessionLaunchPanel,
  SessionLifecycleActions,
} from "@/components/workbench/workbench-actions";
import { WorkbenchFlowStrip } from "@/components/workbench/workbench-flow-strip";
import { serverFetch } from "@/lib/server-api";
import type {
  AdaptiveActivityPayload,
  DiscoveryLabRuntimeSnapshot,
  TradingSessionHistoryPayload,
  WorkbenchRunListPayload,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function WorkbenchSessionsPage() {
  const [payload, status, runsPayload, adaptiveActivity] = await Promise.all([
    serverFetch<TradingSessionHistoryPayload>("/api/operator/sessions?limit=20"),
    serverFetch<DiscoveryLabRuntimeSnapshot>("/api/status"),
    serverFetch<WorkbenchRunListPayload>("/api/operator/runs?limit=12"),
    serverFetch<AdaptiveActivityPayload>("/api/operator/adaptive/activity?limit=24"),
  ]);
  const isPaused = Boolean(payload.runtimePauseReason ?? status.botState.pauseReason);
  const adaptiveMutationCount = adaptiveActivity.points.reduce((sum, point) => sum + point.mutationCount, 0);

  return (
    <div className="space-y-5">
      <WorkbenchFlowStrip
        current="sessions"
        focusLabel={payload.currentSession?.packName ?? "No active session"}
        focusDetail={payload.currentSession
          ? `Runtime ${isPaused ? "paused" : "running"} · source run ${payload.currentSession.sourceRunId ?? "none"}`
          : "This page is the final deployment step. Only eligible runs should reach it."}
      />

      <CompactPageHeader
        eyebrow="Strategy workbench"
        title="Sessions"
        description="Start, pause, stop, or replace the live deployment here."
      >
        <CompactStatGrid
          className="xl:grid-cols-4"
          items={[
            {
              label: "Current session",
              value: payload.currentSession?.packName ?? "Idle",
              detail: payload.currentSession ? payload.currentSession.mode : "Nothing deployed",
              tone: payload.currentSession ? "warning" : "default",
            },
            {
              label: "Runtime",
              value: isPaused ? "Paused" : "Running",
              detail: payload.runtimePauseReason ?? status.botState.pauseReason ?? "No current pause reason",
              tone: isPaused ? "warning" : "accent",
            },
            {
              label: "Launch options",
              value: String(runsPayload.runs.length),
              detail: "Recent runs eligible for session start",
            },
            {
              label: "Adaptive mutations",
              value: String(adaptiveMutationCount),
              detail: adaptiveActivity.lastMutationAt ? `Last ${formatTimestamp(adaptiveActivity.lastMutationAt)}` : "No recent mutation evidence",
            },
          ]}
        />
      </CompactPageHeader>

      <Panel
        title="Current deployment"
        eyebrow="Authoritative session seam"
        description="This is the single source of truth for what is actually deployed right now."
      >
        {payload.currentSession ? (
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)]">
            <div className="rounded-[14px] border border-[rgba(163,230,53,0.18)] bg-[#10140f] p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-xs uppercase tracking-[0.14em] text-text-muted">Deployed pack</div>
                  <div className="mt-1 font-display text-[1rem] font-semibold tracking-[-0.02em] text-text-primary">
                    {payload.currentSession.packName}
                  </div>
                  <div className="mt-1 text-xs text-text-secondary">
                    Started {formatTimestamp(payload.currentSession.startedAt)}
                  </div>
                </div>
                <StatusPill value={payload.currentSession.mode} />
              </div>

              {isPaused ? (
                <div className="mt-3 rounded-[12px] border border-[rgba(251,191,36,0.22)] bg-[rgba(251,191,36,0.08)] px-3 py-2 text-xs text-[#fcd34d]">
                  Runtime pause: {payload.runtimePauseReason ?? status.botState.pauseReason ?? "manual pause"}
                </div>
              ) : null}

              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <DetailLine label="Pack id" value={payload.currentSession.packId ?? "Unlinked"} />
                <DetailLine label="Pack version" value={formatNullableNumber(payload.currentSession.packVersion)} />
                <DetailLine label="Source run" value={payload.currentSession.sourceRunId ?? "None"} />
                <DetailLine label="Previous pack" value={payload.currentSession.previousPackName ?? "None"} />
              </div>

              <SessionLifecycleActions
                session={payload.currentSession}
                isPaused={isPaused}
                className="mt-3"
              />
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <ScanStat
                label="Trades"
                value={String(payload.currentSession.tradeCount)}
                detail={`${payload.currentSession.openPositionCount} open / ${payload.currentSession.closedPositionCount} closed`}
                tone="accent"
              />
              <ScanStat
                label="Realized PnL"
                value={formatUsd(payload.currentSession.realizedPnlUsd)}
                detail={`Config v${formatNullableNumber(payload.currentSession.startedConfigVersionId)}`}
                tone={payload.currentSession.realizedPnlUsd < 0 ? "danger" : "default"}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <EmptyState
              compact
              title="No active session"
              detail="Nothing is currently deployed through the session seam."
            />
            <SessionLaunchPanel runs={runsPayload.runs} />
          </div>
        )}
      </Panel>

      {payload.currentSession ? (
        <Panel
          title="Start another session"
          eyebrow="Replacement flow"
          description="Starting a new session replaces the active deployment and stamps a fresh runtime window."
        >
          <SessionLaunchPanel runs={runsPayload.runs} />
        </Panel>
      ) : null}

      <Panel
        title="Recent history"
        eyebrow="Session windows"
        description="Past sessions keep their own counts and PnL, so one later reuse does not smear history across everything."
      >
        {payload.sessions.length > 0 ? (
          <div className="space-y-2">
            {payload.sessions.map((session) => (
              <article
                key={session.id}
                className="grid gap-3 rounded-[14px] border border-bg-border bg-bg-hover/20 px-3 py-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill value={session.stoppedAt ? session.stoppedReason ?? "closed" : "active"} />
                    <StatusPill value={session.mode} />
                  </div>
                  <div className="mt-2 font-medium text-text-primary">{session.packName}</div>
                  <div className="mt-1 text-xs text-text-secondary">
                    Started {formatTimestamp(session.startedAt)}
                    {session.stoppedAt ? ` · Stopped ${formatTimestamp(session.stoppedAt)}` : " · Still active"}
                  </div>
                  <div className="mt-2 grid gap-1 text-xs text-text-muted md:grid-cols-2">
                    <span>Run: {session.sourceRunId ?? "None"}</span>
                    <span>Pack version: {formatNullableNumber(session.packVersion)}</span>
                    <span>Previous: {session.previousPackName ?? "None"}</span>
                    <span>Config: v{formatNullableNumber(session.startedConfigVersionId)}</span>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <ScanStat
                    label="Trades"
                    value={String(session.tradeCount)}
                    detail={`${session.openPositionCount} open / ${session.closedPositionCount} closed`}
                  />
                  <ScanStat
                    label="PnL"
                    value={formatUsd(session.realizedPnlUsd)}
                    detail={session.id}
                    tone={session.realizedPnlUsd < 0 ? "danger" : "default"}
                  />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            compact
            title="No session history yet"
            detail="Once a graded run starts a session, the backend will keep the deployment history here."
          />
        )}
      </Panel>

      <DisclosurePanel
        title="Adaptive and Helius watch"
        description="Secondary runtime seams. Open this when you need mutation or smart-wallet evidence."
        badge={<span className="meta-chip">{adaptiveMutationCount} mutations / 24h</span>}
      >
        <div className="grid gap-2 lg:grid-cols-2">
          <div className="rounded-[14px] border border-bg-border bg-bg-hover/20 p-3">
            <div className="section-kicker">Adaptive activity</div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <ScanStat
                label="Mutations 24h"
                value={String(adaptiveMutationCount)}
                detail={adaptiveActivity.lastMutationAt ? `Last ${formatTimestamp(adaptiveActivity.lastMutationAt)}` : "No mutation evidence yet"}
                tone={adaptiveMutationCount > 0 ? "accent" : "warning"}
              />
              <ScanStat
                label="Model state"
                value={status.adaptiveModel?.status ?? "inactive"}
                detail={status.adaptiveModel?.packName ?? "No live adaptive pack"}
                tone={status.adaptiveModel?.status === "active" ? "accent" : status.adaptiveModel?.status === "degraded" ? "warning" : "default"}
              />
            </div>
          </div>

          <div className="rounded-[14px] border border-bg-border bg-bg-hover/20 p-3">
            <div className="section-kicker">Helius watch</div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <ScanStat
                label="Tracked wallets"
                value={String(status.heliusWatch?.trackedWalletCount ?? 0)}
                detail={`${status.heliusWatch?.recentSmartWalletEvents24h ?? 0} events / 24h`}
                tone={(status.heliusWatch?.trackedWalletCount ?? 0) > 0 ? "accent" : "warning"}
              />
              <ScanStat
                label="Signals 24h"
                value={String(status.heliusWatch?.recentSmartWalletSignals24h ?? 0)}
                detail={status.heliusWatch?.lastSmartWalletSignalAt ? `Last ${formatTimestamp(status.heliusWatch.lastSmartWalletSignalAt)}` : "No smart-money signal yet"}
                tone={(status.heliusWatch?.recentSmartWalletSignals24h ?? 0) > 0 ? "accent" : "default"}
              />
            </div>
            <div className="mt-3 text-xs text-text-secondary">
              Migration watcher {status.heliusWatch?.migrationWatcherEnabled ? "armed" : "disabled"}.
              {" "}
              Webhook secret {status.heliusWatch?.webhookSecretConfigured ? "configured" : "missing"}.
            </div>
          </div>
        </div>
      </DisclosurePanel>
    </div>
  );
}

function DetailLine(props: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-bg-border bg-bg-hover/25 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.14em] text-text-muted">{props.label}</div>
      <div className="mt-1 text-sm text-text-primary">{props.value}</div>
    </div>
  );
}

function formatTimestamp(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(parsed));
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNullableNumber(value: number | null): string {
  return value == null ? "None" : String(value);
}
