"use client";

import Link from "next/link";
import type { Route } from "next";
import { Activity, AlertCircle, ArrowUpRight, Droplets, Radar, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { WorkbenchRowActions } from "@/components/workbench-row-actions";
import { buildHeatCellStyle, buildMetricScale } from "@/components/grid-utils";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { NativeTable, type NativeTableColumn } from "@/components/ui/native-table";
import { fetchJson } from "@/lib/api";
import { formatCompactCurrency, formatNumber, formatTimestamp } from "@/lib/format";
import { buildGrafanaDashboardLink } from "@/lib/grafana";
import type { CandidateBucket, CandidateQueuePayload, DeskShellPayload } from "@/lib/types";
import { shortMint } from "@/lib/utils";
import { buildCandidateDetailHref, type CandidateSort } from "@/src/lib/use-trading-search-params";

type CandidateRow = CandidateQueuePayload["rows"][number];

export function CandidatesGrid(props: {
  rows: CandidateRow[];
  bucket: CandidateBucket;
  sort: CandidateSort;
  query: string;
  availableActions?: DeskShellPayload["availableActions"];
}) {
  const rowIdSet = useMemo(() => new Set(props.rows.map((row) => row.id)), [props.rows]);
  const [focusedRowId, setFocusedRowId] = useState<string | null>(null);
  const [isDiscovering, startDiscoverTransition] = useTransition();

  const discoverAction = props.availableActions?.find((a) => a.id === "discover-now");
  const canDiscover = discoverAction?.enabled && !props.query;

  useEffect(() => {
    const focusFromHash = () => {
      if (!window.location.hash.startsWith("#candidate-")) {
        setFocusedRowId(null);
        return;
      }
      const focusId = decodeURIComponent(window.location.hash.replace("#candidate-", ""));
      if (!rowIdSet.has(focusId)) {
        setFocusedRowId(null);
        return;
      }
      setFocusedRowId(focusId);
      window.requestAnimationFrame(() => {
        const el = document.getElementById(`candidate-${focusId}`);
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
      entryScore: buildMetricScale(props.rows.map((row) => row.adaptive.entryScore)),
      liquidityUsd: buildMetricScale(props.rows.map((row) => row.liquidityUsd)),
      volume5mUsd: buildMetricScale(props.rows.map((row) => row.volume5mUsd)),
      buySellRatio: buildMetricScale(props.rows.map((row) => row.buySellRatio)),
    }),
    [props.rows],
  );

  const columns = useMemo<Array<NativeTableColumn<CandidateRow>>>(() => [
    {
      id: "token",
      header: "Token",
      widthClassName: "min-w-[16rem]",
      render: (row, index) => {
        const detailHref = buildCandidateDetailHref(row.id, props.bucket, props.sort, props.query);
        const actionable = props.bucket === "ready" && index < 5;
        return (
          <div className="min-w-[16rem]">
            <Link
              href={detailHref as Route}
              prefetch={false}
              title={`Open ${row.symbol || shortMint(row.mint)} details`}
              className="inline-flex items-center gap-2 text-sm font-semibold text-text-primary transition hover:text-accent"
            >
              <span>{row.symbol || shortMint(row.mint)}</span>
              <ArrowUpRight className="h-4 w-4" />
            </Link>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-muted">
              <span className="font-mono">{shortMint(row.mint)}</span>
              <span className="meta-chip" title={`Source: ${row.source}`}>{row.source}</span>
              {actionable ? (
                <span className="meta-chip border-[rgba(163,230,53,0.26)] bg-[rgba(163,230,53,0.08)] text-text-primary">
                  Front
                </span>
              ) : null}
            </div>
          </div>
        );
      },
    },
    {
      id: "blocker",
      header: "Blocker",
      widthClassName: "min-w-[16rem]",
      render: (row) => (
        <div className="min-w-[15rem]">
          <div className="text-sm font-medium text-text-primary">{sanitizeBlocker(row.primaryBlocker)}</div>
          {row.secondaryReasons.length > 0 ? (
            <div className="mt-1.5 line-clamp-2 text-xs leading-5 text-text-muted">
              {row.secondaryReasons.join(" · ")}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      id: "entry",
      header: <MetricHeader icon={Activity} label="Entry" />,
      align: "center",
      render: (row) => (
        <div className="min-w-[5rem] rounded-[10px] px-2 py-1.5 text-center" style={buildHeatCellStyle(row.adaptive.entryScore, metricScales.entryScore)}>
          <div className="text-sm font-semibold text-text-primary">{row.adaptive.entryScore == null ? "—" : formatNumber(row.adaptive.entryScore)}</div>
          <div className="mt-1 text-[11px] text-text-muted">{row.status.replace(/_/g, " ")}</div>
        </div>
      ),
    },
    {
      id: "liquidity",
      header: <MetricHeader icon={Droplets} label="Liquidity" />,
      align: "center",
      render: (row) => <MetricCell value={formatCompactCurrency(row.liquidityUsd)} style={buildHeatCellStyle(row.liquidityUsd, metricScales.liquidityUsd)} tone="accent" />,
    },
    {
      id: "volume5m",
      header: <MetricHeader icon={TrendingUp} label="Vol 5m" />,
      align: "center",
      render: (row) => <MetricCell value={formatCompactCurrency(row.volume5mUsd)} style={buildHeatCellStyle(row.volume5mUsd, metricScales.volume5mUsd)} tone="default" />,
    },
    {
      id: "buySell",
      header: <MetricHeader icon={TrendingUp} label="B/S" />,
      align: "center",
      render: (row) => <MetricCell value={formatNumber(row.buySellRatio)} style={buildHeatCellStyle(row.buySellRatio, metricScales.buySellRatio)} tone={Number(row.buySellRatio) >= 1 ? "accent" : "warning"} />,
    },
    {
      id: "lastTouch",
      header: "Last touch",
      align: "center",
      render: (row) => formatTimestamp(row.lastEvaluatedAt ?? row.discoveredAt),
    },
    {
      id: "actions",
      header: "Actions",
      widthClassName: "min-w-[16rem]",
      render: (row) => {
        const detailHref = buildCandidateDetailHref(row.id, props.bucket, props.sort, props.query);
        const grafanaRowHref = buildGrafanaDashboardLink("candidate", {
          from: Date.parse(row.discoveredAt) - 60 * 60 * 1000,
          vars: { mint: row.mint, symbol: row.symbol, source: row.source },
        });
        return (
          <div className="min-w-[14rem]">
            <WorkbenchRowActions
              openHref={detailHref}
              openLabel={row.symbol || shortMint(row.mint)}
              grafanaHref={grafanaRowHref}
              pinItem={{
                id: row.id,
                kind: "candidate",
                label: row.symbol || shortMint(row.mint),
                href: detailHref,
                secondary: row.primaryBlocker,
                meta: row.source,
              }}
              copyValue={row.mint}
              copyLabel="Copy"
            />
          </div>
        );
      },
    },
  ], [metricScales.buySellRatio, metricScales.entryScore, metricScales.liquidityUsd, metricScales.volume5mUsd, props.bucket, props.query, props.sort]);

  if (props.rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[14px] border border-bg-border bg-bg-hover/40 px-4 py-8">
        <div className="mb-3 flex items-center justify-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-bg-border bg-bg-hover text-text-muted">
            <AlertCircle className="h-5 w-5" />
          </div>
        </div>
        {props.query ? (
          <div className="text-sm font-medium text-text-secondary">No matching candidates found.</div>
        ) : (
          <>
            <div className="text-sm font-medium text-text-secondary">No candidates in this bucket.</div>
            <div className="mt-1 max-w-xs text-xs text-text-muted">
              {canDiscover
                ? "Run discovery to surface fresh candidates for this bucket."
                : "Discovery may be disabled or the intake queue is empty."}
            </div>
            {canDiscover ? (
              <Button
                onClick={() => {
                  startDiscoverTransition(async () => {
                    try {
                      await fetchJson("/control/discover-now", { method: "POST" });
                      window.dispatchEvent(new CustomEvent("desk-refresh"));
                    } catch {
                      // silently fail
                    }
                  });
                }}
                disabled={isDiscovering}
                variant="default"
                size="sm"
                className="mt-3"
              >
                <Radar className="h-4 w-4" />
                {isDiscovering ? "Starting..." : "Run discovery now"}
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
      rowId={(row) => `candidate-${row.id}`}
      rowClassName={(row, index) => cn(
        row.id === focusedRowId && "bg-[rgba(163,230,53,0.07)]",
        props.bucket === "ready" && index < 5 && "bg-[rgba(163,230,53,0.04)]",
      )}
      maxHeightClassName="max-h-[43rem]"
    />
  );
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

function MetricCell(props: { value: string; style?: Record<string, string>; tone?: "default" | "accent" | "warning" }) {
  const toneClass = props.tone === "accent"
    ? "text-[var(--success,#22c55e)]"
    : props.tone === "warning"
      ? "text-[var(--warning,#eab308)]"
      : "text-text-primary";

  return (
    <div className={cn("min-w-[5.2rem] rounded-[10px] px-2 py-1 text-center text-[12px] font-semibold tabular-nums", toneClass)} style={props.style}>
      {props.value}
    </div>
  );
}

function sanitizeBlocker(blocker: string | null | undefined): string {
  if (!blocker) return "—";
  if (blocker.includes("prisma.") || blocker.includes("$queryRaw") || blocker.includes("Raw query failed")) {
    return "System error - check backend logs";
  }
  if (blocker.length > 200) {
    return blocker.slice(0, 200) + "...";
  }
  return blocker;
}
