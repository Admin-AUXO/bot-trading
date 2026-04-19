"use client";

import Link from "next/link";
import type { Route } from "next";
import { Activity, AlertCircle, ArrowUpRight, Gauge, PlayCircle, TrendingDown, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { WorkbenchRowActions } from "@/components/workbench-row-actions";
import { buildHeatCellStyle, buildMetricScale } from "@/components/grid-utils";
import { NativeTable, type NativeTableColumn } from "@/components/ui/native-table";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { fetchJson } from "@/lib/api";
import { formatCompactCurrency, formatPercent, formatTimestamp } from "@/lib/format";
import { buildGrafanaDashboardLink } from "@/lib/grafana";
import type { DeskShellPayload, PositionBookPayload } from "@/lib/types";
import { shortMint } from "@/lib/utils";
import { buildPositionDetailHref, type PositionSort } from "@/src/lib/use-trading-search-params";

type PositionRow = PositionBookPayload["rows"][number];

export function PositionsGrid(props: {
  rows: PositionRow[];
  book: PositionBookPayload["book"];
  sort: PositionSort;
  query: string;
  availableActions?: DeskShellPayload["availableActions"];
}) {
  const rowIdSet = useMemo(() => new Set(props.rows.map((row) => row.id)), [props.rows]);
  const [focusedRowId, setFocusedRowId] = useState<string | null>(null);
  const [isEvaluating, startEvaluateTransition] = useTransition();

  const evaluateAction = props.availableActions?.find((a) => a.id === "evaluate-now");
  const canEvaluate = evaluateAction?.enabled && !props.query && props.book === "open";

  useEffect(() => {
    const focusFromHash = () => {
      if (!window.location.hash.startsWith("#position-")) {
        setFocusedRowId(null);
        return;
      }
      const focusId = decodeURIComponent(window.location.hash.replace("#position-", ""));
      if (!rowIdSet.has(focusId)) {
        setFocusedRowId(null);
        return;
      }
      setFocusedRowId(focusId);
      window.requestAnimationFrame(() => {
        const el = document.getElementById(`position-${focusId}`);
        if (el) {
          el.style.scrollMarginTop = "calc(var(--shell-header-height) + 1rem)";
          el.scrollIntoView({ block: "center" });
        }
      });
    };
    focusFromHash();
    window.addEventListener("hashchange", focusFromHash);
    return () => window.removeEventListener("hashchange", focusFromHash);
  }, [rowIdSet]);

  const metricScales = useMemo(
    () => ({
      unrealizedPnlUsd: buildMetricScale(props.rows.map((row) => row.unrealizedPnlUsd), true),
      returnPct: buildMetricScale(props.rows.map((row) => row.returnPct), true),
      latestExecutionLatencyMs: buildMetricScale(props.rows.map((row) => row.latestExecutionLatencyMs), false, true),
    }),
    [props.rows],
  );

  const columns = useMemo<Array<NativeTableColumn<PositionRow>>>(() => [
    {
      id: "position",
      header: "Position",
      widthClassName: "min-w-[14rem]",
      render: (row, index) => {
        const detailHref = buildPositionDetailHref(row.id, props.book, props.sort, props.query);
        const leadRow = props.book === "open" && index < 4;
        return (
          <div className="min-w-[14rem]">
            <Link
              href={detailHref as Route}
              prefetch={false}
              title={`Open ${row.symbol} position`}
              className="inline-flex items-center gap-2 text-sm font-semibold text-text-primary transition hover:text-accent"
            >
              <span>{row.symbol}</span>
              <ArrowUpRight className="h-4 w-4" />
            </Link>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-muted">
              <span className="font-mono">{shortMint(row.mint)}</span>
              {leadRow ? (
                <span className="meta-chip border-[rgba(250,204,21,0.24)] bg-[rgba(250,204,21,0.08)] text-text-primary">
                  Top priority
                </span>
              ) : null}
            </div>
          </div>
        );
      },
    },
    {
      id: "intervention",
      header: "Intervention",
      widthClassName: props.book === "open" ? "min-w-[13rem]" : "hidden",
      cellClassName: props.book === "open" ? undefined : "hidden",
      headerClassName: props.book === "open" ? undefined : "hidden",
      render: (row) => props.book === "open" ? (
        <div className="min-w-[12rem]">
          <div className="text-sm font-medium text-text-primary">{row.interventionLabel}</div>
          <div className="mt-1 text-xs text-text-muted">Priority {row.interventionPriority}</div>
        </div>
      ) : null,
    },
    {
      id: "pnl",
      header: <MetricHeader icon={rowIcon("pnl")} label="PnL" />,
      align: "center",
      render: (row) => <MetricCell value={formatCompactCurrency(row.unrealizedPnlUsd)} style={buildHeatCellStyle(row.unrealizedPnlUsd, metricScales.unrealizedPnlUsd)} tone={row.unrealizedPnlUsd < 0 ? "danger" : row.unrealizedPnlUsd > 0 ? "accent" : "default"} />,
    },
    {
      id: "return",
      header: <MetricHeader icon={rowIcon("return")} label="Return" />,
      align: "center",
      render: (row) => <MetricCell value={formatPercent(row.returnPct)} style={buildHeatCellStyle(row.returnPct, metricScales.returnPct)} tone={row.returnPct < 0 ? "danger" : row.returnPct > 0 ? "accent" : "default"} />,
    },
    {
      id: "exec",
      header: <MetricHeader icon={Gauge} label="Exec" />,
      align: "center",
      render: (row) => <MetricCell value={row.latestExecutionLatencyMs == null ? "—" : `${Math.round(Number(row.latestExecutionLatencyMs))} ms`} style={buildHeatCellStyle(row.latestExecutionLatencyMs, metricScales.latestExecutionLatencyMs)} tone={Number(row.latestExecutionLatencyMs) > 1500 ? "warning" : "default"} />,
    },
    {
      id: "opened",
      header: "Opened",
      align: "center",
      render: (row) => formatTimestamp(row.openedAt),
    },
    {
      id: "closed",
      header: "Closed",
      align: "center",
      render: (row) => props.book === "open" ? "—" : row.closedAt ? formatTimestamp(row.closedAt) : "—",
    },
    {
      id: "actions",
      header: "Actions",
      widthClassName: "min-w-[16rem]",
      render: (row) => {
        const detailHref = buildPositionDetailHref(row.id, props.book, props.sort, props.query);
        const grafanaRowHref = buildGrafanaDashboardLink("position", {
          from: Date.parse(row.openedAt) - 30 * 60 * 1000,
          to: row.closedAt ?? "now",
          vars: { positionId: row.id, mint: row.mint, symbol: row.symbol },
        });
        return (
          <div className="min-w-[14rem]">
            <WorkbenchRowActions
              openHref={detailHref}
              openLabel={row.symbol}
              grafanaHref={grafanaRowHref}
              pinItem={{
                id: row.id,
                kind: "position",
                label: row.symbol,
                href: detailHref,
                secondary: row.interventionLabel,
                meta: shortMint(row.mint),
              }}
              copyValue={row.id}
              copyLabel="Copy"
            />
          </div>
        );
      },
    },
  ], [metricScales.latestExecutionLatencyMs, metricScales.returnPct, metricScales.unrealizedPnlUsd, props.book, props.query, props.sort]);

  if (props.rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[14px] border border-bg-border bg-bg-hover/40 px-4 py-8">
        <div className="mb-3 flex items-center justify-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-bg-border bg-bg-hover text-text-muted">
            <AlertCircle className="h-5 w-5" />
          </div>
        </div>
        {props.query ? (
          <div className="text-sm font-medium text-text-secondary">No matching positions found.</div>
        ) : (
          <>
            <div className="text-sm font-medium text-text-secondary">No positions in this book.</div>
            <div className="mt-1 max-w-xs text-xs text-text-muted">
              {canEvaluate
                ? "Run evaluation to score candidates and open positions."
                : props.book === "open"
                  ? "Open positions will appear here once candidates are evaluated."
                  : "Closed positions will appear here after positions are exited."}
            </div>
            {canEvaluate ? (
              <Button
                onClick={() => {
                  startEvaluateTransition(async () => {
                    try {
                      await fetchJson("/control/evaluate-now", { method: "POST" });
                      window.dispatchEvent(new CustomEvent("desk-refresh"));
                    } catch {
                      // silently fail
                    }
                  });
                }}
                disabled={isEvaluating}
                variant="default"
                size="sm"
                className="mt-3"
              >
                <PlayCircle className="h-4 w-4" />
                {isEvaluating ? "Starting..." : "Run evaluation now"}
              </Button>
            ) : null}
          </>
        )}
      </div>
    );
  }

  return (
    <NativeTable
      rows={props.rows}
      columns={columns}
      rowKey={(row) => row.id}
      rowId={(row) => `position-${row.id}`}
      rowClassName={(row, index) => cn(
        row.id === focusedRowId && "bg-[rgba(163,230,53,0.07)]",
        props.book === "open" && index < 4 && "bg-[rgba(250,204,21,0.04)]",
      )}
      maxHeightClassName="max-h-[43rem]"
    />
  );
}

function rowIcon(kind: "pnl" | "return") {
  return kind === "pnl" ? Activity : TrendingUp;
}

function MetricHeader(props: { icon: typeof Activity; label: string }) {
  const Icon = props.icon;
  return (
    <span className="inline-flex items-center justify-center gap-1.5">
      <Icon className="h-3.5 w-3.5" />
      {props.label}
    </span>
  );
}

function MetricCell(props: { value: string; style?: Record<string, string>; tone?: "default" | "accent" | "warning" | "danger" }) {
  const toneClass = props.tone === "accent"
    ? "text-[var(--success,#22c55e)]"
    : props.tone === "warning"
      ? "text-[var(--warning,#eab308)]"
      : props.tone === "danger"
        ? "text-[var(--danger,#ef4444)]"
        : "text-text-primary";

  return (
    <div className={cn("min-w-[5.4rem] rounded-[10px] px-2 py-1 text-center text-[12px] font-semibold tabular-nums", toneClass)} style={props.style}>
      {props.value}
    </div>
  );
}
