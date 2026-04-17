"use client";

import Link from "next/link";
import type { Route } from "next";
import type { DeskHomePayload } from "@/lib/types";
import { operationalDeskRoutes } from "@/lib/dashboard-routes";
import { formatCompactCurrency, formatPercent, formatRelativeMinutes } from "@/lib/format";
import { StatusPill } from "@/components/dashboard-primitives";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/components/ui/cn";

interface PositionsSummaryProps {
  positions: DeskHomePayload["positions"];
}

export function PositionsSummary({ positions }: PositionsSummaryProps) {
  if (!positions || positions.length === 0) return null;

  return (
    <section>
      <div className="mb-2 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Live positions</span>
          <span className="rounded-full bg-[var(--accent)]/15 px-2 py-0.5 text-[10px] font-semibold text-[var(--accent)]">{positions.length}</span>
        </div>
        <Link href={`${operationalDeskRoutes.trading}?book=open` as Route} className="text-[11px] text-text-muted transition hover:text-accent">View all</Link>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {positions.slice(0, 6).map((pos) => (
          <PositionCard key={pos.id} position={pos} />
        ))}
      </div>
    </section>
  );
}

function PositionCard({ position }: { position: DeskHomePayload["positions"][number] }) {
  return (
    <Link
      key={position.id}
      href={`/positions/${position.id}` as Route}
      className="group rounded-[14px] border border-bg-border bg-[#101012] px-4 py-3 transition hover:border-[rgba(163,230,53,0.25)] hover:bg-[#111113]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-text-primary">{position.symbol}</span>
            <StatusPill value={position.status} />
          </div>
          <div className="mt-1 font-mono text-[11px] text-text-muted">
            {position.mint.slice(0, 6)}...{position.mint.slice(-4)}
          </div>
        </div>
        <ArrowUpRight className="h-4 w-4 shrink-0 text-text-muted transition group-hover:text-accent" />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] text-text-muted">Entry</div>
          <div className="mt-0.5 text-sm font-semibold text-text-primary">${position.entryPriceUsd}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] text-text-muted">Return</div>
          <div className={cn("mt-0.5 text-sm font-semibold", (position.returnPct ?? 0) >= 0 ? "text-[var(--accent)]" : "text-[var(--danger)]")}>
            {formatPercent(position.returnPct ?? 0)}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] text-text-muted">Unrealized</div>
          <div className={cn("mt-0.5 text-sm font-semibold", (position.unrealizedPnlUsd ?? 0) >= 0 ? "text-[var(--accent)]" : "text-[var(--danger)]")}>
            {formatCompactCurrency(position.unrealizedPnlUsd ?? 0)}
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px] text-text-muted">
        <span>Opened {formatRelativeMinutes(position.openedAt)}</span>
        <span>{position.interventionLabel ?? "—"}</span>
      </div>
    </Link>
  );
}
