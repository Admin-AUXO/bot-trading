"use client";

import Link from "next/link";
import type { Route } from "next";
import type { DeskHomePayload, PositionBookRow } from "@/lib/types";
import { operationalDeskRoutes } from "@/lib/dashboard-routes";
import { formatCompactCurrency, formatPercent, formatRelativeMinutes } from "@/lib/format";
import { StatusPill } from "@/components/dashboard-primitives";
import { cn } from "@/components/ui/cn";

interface PositionsSummaryProps {
  positions: DeskHomePayload["positions"];
}

export function PositionsSummary({ positions }: PositionsSummaryProps) {
  if (!positions || positions.length === 0) {
    return null;
  }

  return (
    <section className="rounded-[14px] border border-bg-border bg-bg-secondary/70 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="section-kicker">Live book</div>
          <div className="mt-1 text-sm font-semibold text-text-primary">Open positions</div>
        </div>
        <Link
          href={`${operationalDeskRoutes.trading}?book=open` as Route}
          className="text-[11px] text-text-muted transition hover:text-accent"
        >
          View all
        </Link>
      </div>

      <div className="space-y-2">
        {positions.slice(0, 6).map((position) => (
          <PositionRow key={position.id} position={position} />
        ))}
      </div>
    </section>
  );
}

function PositionRow({ position }: { position: PositionBookRow }) {
  return (
    <Link
      href={`/positions/${position.id}` as Route}
      className="grid gap-2 rounded-[12px] border border-bg-border bg-bg-hover/20 px-3 py-3 transition hover:border-[rgba(163,230,53,0.22)] hover:bg-bg-hover/30 md:grid-cols-[minmax(0,1.25fr)_repeat(4,minmax(0,0.8fr))]"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <div className="truncate text-sm font-semibold text-text-primary">{position.symbol}</div>
          <StatusPill value={position.status} />
          <StatusPill value={position.interventionLabel} />
        </div>
        <div className="mt-1 font-mono text-[11px] text-text-muted">
          {position.mint.slice(0, 6)}...{position.mint.slice(-4)}
        </div>
      </div>

      <MetricCell label="Entry" value={formatCompactCurrency(position.entryPriceUsd)} />
      <MetricCell
        label="Return"
        value={formatPercent(position.returnPct)}
        tone={position.returnPct >= 0 ? "accent" : "danger"}
      />
      <MetricCell
        label="PnL"
        value={formatCompactCurrency(position.unrealizedPnlUsd)}
        tone={position.unrealizedPnlUsd >= 0 ? "accent" : "danger"}
      />
      <MetricCell label="Priority" value={position.interventionLabel} />
      <MetricCell label="Opened" value={formatRelativeMinutes(position.openedAt)} />
    </Link>
  );
}

function MetricCell(props: {
  label: string;
  value: string;
  tone?: "default" | "accent" | "danger";
}) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-[0.12em] text-text-muted">{props.label}</div>
      <div
        className={cn(
          "mt-0.5 truncate text-sm font-semibold",
          props.tone === "accent"
            ? "text-[var(--accent)]"
            : props.tone === "danger"
              ? "text-[var(--danger)]"
              : "text-text-primary",
        )}
      >
        {props.value}
      </div>
    </div>
  );
}
