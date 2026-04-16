import Link from "next/link";
import type { Route } from "next";
import { ArrowUpRight, FlaskConical, Settings2, Sparkles } from "lucide-react";
import { CompactPageHeader, CompactStatGrid, Panel, ScanStat, StatusPill } from "@/components/dashboard-primitives";
import { buttonVariants } from "@/components/ui/button";
import { serverFetch } from "@/lib/api";
import { discoveryLabRoutes, operationalDeskRoutes } from "@/lib/dashboard-routes";
import { formatInteger, formatTimestamp } from "@/lib/format";
import type { DiscoveryLabCatalog, DiscoveryLabRuntimeSnapshot } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DiscoveryLabOverviewPage() {
  const [catalog, runtimeSnapshot] = await Promise.all([
    serverFetch<DiscoveryLabCatalog>("/api/operator/discovery-lab/catalog"),
    serverFetch<DiscoveryLabRuntimeSnapshot>("/api/status"),
  ]);

  const latestRun = catalog.activeRun ?? catalog.recentRuns[0] ?? null;
  const customPackCount = catalog.packs.filter((pack) => pack.kind === "custom").length;
  const createdPackCount = catalog.packs.filter((pack) => pack.kind === "created").length;

  return (
    <div className="space-y-5">
      <CompactPageHeader
        eyebrow="Discovery lab"
        title="Discovery overview"
        description="Shared shell, shared theme, and a clearer lab workflow."
        badges={(
          <>
            <StatusPill value={runtimeSnapshot.botState.tradeMode} />
            <StatusPill value={catalog.activeRun?.status ?? "idle"} />
          </>
        )}
        actions={(
          <>
            <Link href={discoveryLabRoutes.studio} className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Open studio
            </Link>
            <Link href={discoveryLabRoutes.results} className={buttonVariants({ variant: "default", size: "sm" })}>
              Open results
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </>
        )}
      >
        <CompactStatGrid
          className="xl:grid-cols-4"
          items={[
            { label: "Active run", value: catalog.activeRun ? catalog.activeRun.packName : "Idle", detail: catalog.activeRun?.status ?? "No run in flight", tone: catalog.activeRun ? "warning" : "default" },
            { label: "Recent runs", value: formatInteger(catalog.recentRuns.length), detail: latestRun?.completedAt ? `Latest ${formatTimestamp(latestRun.completedAt)}` : "History ready", tone: "accent" },
            { label: "Workspace packs", value: formatInteger(customPackCount), detail: `${formatInteger(createdPackCount)} seeded packs`, tone: "default" },
            { label: "Known sources", value: formatInteger(catalog.knownSources.length), detail: catalog.knownSources.join(", ") || "No sources", tone: "default" },
          ]}
        />
      </CompactPageHeader>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel title="Workflow map" eyebrow="Shared layout" description="Move through the lab without losing the common dashboard chrome.">
          <div className="grid gap-3 md:grid-cols-2">
            <WorkflowCard
              href={discoveryLabRoutes.studio}
              icon={Sparkles}
              title="Studio"
              detail="Packs, thresholds, and strategy ladders."
              status={`${formatInteger(catalog.packs.length)} packs available`}
            />
            <WorkflowCard
              href={discoveryLabRoutes.results}
              icon={FlaskConical}
              title="Results"
              detail="Run, monitor, and review the current lab from one compact surface."
              status={catalog.activeRun ? catalog.activeRun.status : latestRun?.winnerCount != null ? `${formatInteger(latestRun.winnerCount)} winners in latest run` : "Awaiting a completed run"}
            />
            <WorkflowCard
              href={discoveryLabRoutes.config}
              icon={Settings2}
              title="Config"
              detail="Edit discovery-owned strategy, filters, and session controls."
              status={runtimeSnapshot.settings.strategy.liveStrategy.enabled ? "Adaptive live staged" : "Baseline strategy"}
            />
          </div>
        </Panel>

        <Panel
          title="Current lab state"
          eyebrow="Run and runtime"
          description="Keep the current discovery posture visible before diving deeper."
          tone={catalog.activeRun?.status === "FAILED" ? "critical" : catalog.activeRun ? "warning" : "passive"}
        >
          <div className="grid gap-3">
            <ScanStat
              label="Runtime mode"
              value={runtimeSnapshot.botState.tradeMode}
              detail={`Open positions ${formatInteger(runtimeSnapshot.openPositions)}`}
              tone={runtimeSnapshot.botState.tradeMode === "LIVE" ? "warning" : "default"}
            />
            <ScanStat
              label="Active pack"
              value={catalog.activeRun?.packName ?? "No active run"}
              detail={catalog.activeRun?.sources.join(", ") ?? "Launch from Results"}
              tone={catalog.activeRun ? "accent" : "default"}
            />
            <ScanStat
              label="Latest completion"
              value={latestRun?.completedAt ? formatTimestamp(latestRun.completedAt) : "No completed run"}
              detail={latestRun?.status ?? "Ready for a new run"}
              tone={latestRun?.status === "FAILED" ? "danger" : "default"}
            />
            <Link href={operationalDeskRoutes.trading} className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Open operational trading
            </Link>
          </div>
        </Panel>
      </section>
    </div>
  );
}

function WorkflowCard(props: {
  href: Route;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  detail: string;
  status: string;
}) {
  const Icon = props.icon;

  return (
    <Link
      href={props.href}
      className="rounded-[14px] border border-bg-border bg-bg-hover/35 px-4 py-4 transition hover:border-[rgba(163,230,53,0.22)] hover:bg-bg-hover/50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="rounded-[12px] border border-bg-border bg-bg-primary/60 p-2 text-accent">
          <Icon className="h-4 w-4" />
        </div>
        <span className="meta-chip">Open</span>
      </div>
      <div className="mt-4 text-sm font-semibold text-text-primary">{props.title}</div>
      <div className="mt-1 text-xs leading-5 text-text-secondary">{props.detail}</div>
      <div className="mt-3 text-xs text-text-muted">{props.status}</div>
    </Link>
  );
}
