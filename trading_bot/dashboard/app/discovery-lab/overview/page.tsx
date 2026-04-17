import Link from "next/link";
import type { Route } from "next";
import { FlaskConical, Sparkles, Play } from "lucide-react";
import { CompactPageHeader, ScanStat, StatusPill } from "@/components/dashboard-primitives";
import { Badge } from "@/components/ui/badge";
import { serverFetch } from "@/lib/api";
import { discoveryLabRoutes } from "@/lib/dashboard-routes";
import { formatInteger } from "@/lib/format";
import type { DiscoveryLabCatalog, DiscoveryLabRuntimeSnapshot } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DiscoveryLabOverviewPage() {
  const [catalog, runtimeSnapshot] = await Promise.all([
    serverFetch<DiscoveryLabCatalog>("/api/operator/discovery-lab/catalog"),
    serverFetch<DiscoveryLabRuntimeSnapshot>("/api/status"),
  ]);

  const activeRun = catalog.activeRun;
  const latestRun = catalog.recentRuns[0] ?? null;
  const displayRun = activeRun ?? latestRun;
  const isRunning = activeRun?.status === "RUNNING";

  return (
    <div className="space-y-5">
      <CompactPageHeader
        eyebrow="Discovery lab"
        title="Lab overview"
        badges={<StatusPill value={runtimeSnapshot.botState.tradeMode} />}
      >
        {/* Active Run Status - Big and Bold */}
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <div className="rounded-[14px] border px-4 py-3 md:col-span-2"
            style={{
              borderColor: isRunning ? "rgba(163,230,53,0.3)" : "var(--border)",
              backgroundColor: isRunning ? "rgba(163,230,53,0.05)" : "var(--bg-primary)",
            }}
          >
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <FlaskConical className={`h-5 w-5 ${isRunning ? "text-accent animate-pulse" : "text-text-muted"}`} />
                <span className="text-sm font-semibold text-text-primary">
                  {displayRun ? displayRun.packName : "No active run"}
                </span>
              </div>
              {displayRun && (
                <Badge className="normal-case">{displayRun.status}</Badge>
              )}
            </div>
            {activeRun && (
              <div className="mt-2 flex items-center gap-4 text-xs text-text-secondary">
                <span>{activeRun.winnerCount != null ? `${formatInteger(activeRun.winnerCount)} winners` : "Running..."}</span>
                <span>{activeRun.evaluationCount != null ? `${formatInteger(activeRun.evaluationCount)} evals` : ""}</span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Link
              href={discoveryLabRoutes.studio}
              className="flex items-center justify-center gap-2 rounded-[14px] border border-[rgba(163,230,53,0.3)] bg-[#0f0f10] px-4 py-3 text-sm font-semibold text-text-primary transition hover:border-[rgba(163,230,53,0.5)] hover:bg-[#121511]"
            >
              <Play className="h-4 w-4 text-accent" />
              Run pack
            </Link>
          </div>
        </div>
      </CompactPageHeader>

      {/* Quick Stats */}
      <div className="grid gap-2 md:grid-cols-3">
        <ScanStat
          label="Total runs"
          value={formatInteger(catalog.recentRuns.length)}
          detail="Completed runs"
        />
        <ScanStat
          label="Workspace packs"
          value={formatInteger(catalog.packs.length)}
          detail="Available"
        />
        <ScanStat
          label="Latest run"
          value={latestRun?.packName ?? "—"}
          detail={latestRun?.winnerCount != null ? `${formatInteger(latestRun.winnerCount)} winners` : "No runs yet"}
        />
      </div>

      {/* Clean Nav to Lab sections */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <NavCard
          href={discoveryLabRoutes.studio}
          icon={FlaskConical}
          title="Studio"
          detail="Packs, thresholds, strategies"
        />
        <NavCard
          href={discoveryLabRoutes.results}
          icon={Sparkles}
          title="Results"
          detail="Run history and winners"
        />
        <NavCard
          href={discoveryLabRoutes.config}
          icon={Sparkles}
          title="Config"
          detail="Threshold overrides"
        />
        <NavCard
          href={discoveryLabRoutes.marketStats}
          icon={Sparkles}
          title="Market"
          detail="Live market data"
        />
      </div>
    </div>
  );
}

function NavCard(props: {
  href: Route;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  detail: string;
}) {
  const Icon = props.icon;

  return (
    <Link
      href={props.href}
      className="rounded-[14px] border border-bg-border bg-[#101012] px-4 py-4 transition hover:border-[rgba(163,230,53,0.2)] hover:bg-[#111113]"
    >
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-accent" />
        <span className="text-sm font-semibold text-text-primary">{props.title}</span>
      </div>
      <div className="mt-1 text-xs text-text-secondary">{props.detail}</div>
    </Link>
  );
}
