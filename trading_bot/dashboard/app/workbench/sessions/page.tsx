import Link from "next/link";
import {
  CompactPageHeader,
  EmptyState,
  Panel,
  ScanStat,
  StatusPill,
} from "@/components/dashboard-primitives";
import { buttonVariants } from "@/components/ui/button";
import { discoveryLabRoutes, workbenchRoutes } from "@/lib/dashboard-routes";
import { serverFetch } from "@/lib/server-api";
import type {
  TradingSessionHistoryPayload,
  TradingSessionSnapshot,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function WorkbenchSessionsPage() {
  const payload = await serverFetch<TradingSessionHistoryPayload>("/api/operator/sessions?limit=20");

  return (
    <div className="space-y-5">
      <CompactPageHeader
        eyebrow="Strategy workbench"
        title="Sessions"
        description="Backend-owned deployment history for live strategy sessions. Apply still cuts in from discovery-lab results; this page finally shows the real lifecycle instead of redirecting somewhere useless."
        actions={(
          <div className="flex flex-wrap gap-2">
            <Link href={discoveryLabRoutes.results} className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Open results lab
            </Link>
            <Link href={workbenchRoutes.sandbox} className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Open sandbox
            </Link>
          </div>
        )}
      />

      <Panel
        title="Current deployment"
        eyebrow="Authoritative session seam"
        description="The active session comes from the backend session service, not from guessing at runtime settings."
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

              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <DetailLine label="Pack id" value={payload.currentSession.packId ?? "Unlinked"} />
                <DetailLine label="Pack version" value={formatNullableNumber(payload.currentSession.packVersion)} />
                <DetailLine label="Source run" value={payload.currentSession.sourceRunId ?? "None"} />
                <DetailLine label="Previous pack" value={payload.currentSession.previousPackName ?? "None"} />
              </div>
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
          <EmptyState
            compact
            title="No active session"
            detail="Nothing is currently deployed through the session seam. Apply a discovery-lab run to create the next live strategy window."
          />
        )}
      </Panel>

      <Panel
        title="Recent history"
        eyebrow="Session windows"
        description="Closed rows now keep bounded counts and PnL for their own window instead of smearing across every later reuse of the same run."
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
            detail="Once discovery-lab applies a live strategy, the backend will keep the deployment history here."
          />
        )}
      </Panel>
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
