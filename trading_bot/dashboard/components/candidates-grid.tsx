"use client";

import Link from "next/link";
import type { Route } from "next";
import { type ColDef, type GetRowIdParams, type ICellRendererParams, type RowClassRules } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { ArrowUpRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WorkbenchRowActions } from "@/components/workbench-row-actions";
import { buildHeatCellStyle, buildMetricScale } from "@/components/grid-utils";
import { formatCompactCurrency, formatNumber, formatTimestamp } from "@/lib/format";
import { buildGrafanaDashboardLink } from "@/lib/grafana";
import type { CandidateBucket, CandidateQueuePayload } from "@/lib/types";
import { shortMint } from "@/lib/utils";
import { buildCandidateDetailHref, type CandidateSort } from "@/src/lib/use-trading-search-params";

type CandidateRow = CandidateQueuePayload["rows"][number];

export function CandidatesGrid(props: {
  rows: CandidateRow[];
  bucket: CandidateBucket;
  sort: CandidateSort;
  query: string;
}) {
  const gridRef = useRef<AgGridReact<CandidateRow>>(null);
  const [focusedRowId, setFocusedRowId] = useState<string | null>(null);

  const rowIdSet = useMemo(() => new Set(props.rows.map((row) => row.id)), [props.rows]);

  const focusFromHash = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }
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
      const api = gridRef.current?.api;
      if (!api) {
        return;
      }
      const rowNode = api.getRowNode(focusId);
      if (!rowNode) {
        return;
      }
      api.ensureNodeVisible(rowNode, "middle");
      api.flashCells({ rowNodes: [rowNode] });
    });
  }, [rowIdSet]);

  useEffect(() => {
    focusFromHash();
    window.addEventListener("hashchange", focusFromHash);
    return () => window.removeEventListener("hashchange", focusFromHash);
  }, [focusFromHash]);

  const rowClassRules = useMemo<RowClassRules<CandidateRow>>(
    () => ({
      "ag-grid-action-row": (params) =>
        props.bucket === "ready" && (params.node.rowIndex ?? Number.MAX_SAFE_INTEGER) < 5,
      "ag-grid-focus-row": (params) => params.data?.id === focusedRowId,
    }),
    [focusedRowId, props.bucket],
  );

  const metricScales = useMemo(
    () => ({
      entryScore: buildMetricScale(props.rows.map((row) => row.adaptive.entryScore)),
      liquidityUsd: buildMetricScale(props.rows.map((row) => row.liquidityUsd)),
      volume5mUsd: buildMetricScale(props.rows.map((row) => row.volume5mUsd)),
      buySellRatio: buildMetricScale(props.rows.map((row) => row.buySellRatio)),
    }),
    [props.rows],
  );

  const columnDefs = useMemo<ColDef<CandidateRow>[]>(
    () => [
      {
        colId: "token",
        headerName: "Token",
        minWidth: 270,
        flex: 1.2,
        sortable: true,
        wrapText: true,
        autoHeight: true,
        cellClass: "ag-grid-cell-wrap",
        valueGetter: (params) => params.data?.symbol ?? params.data?.mint ?? "",
        cellRenderer: (params: ICellRendererParams<CandidateRow>) => {
          if (!params.data) {
            return null;
          }
          const row = params.data;
          const detailHref = buildCandidateDetailHref(row.id, props.bucket, props.sort, props.query);
          const actionable = props.bucket === "ready" && (params.node.rowIndex ?? Number.MAX_SAFE_INTEGER) < 5;
          return (
            <div className="min-w-[16rem] py-1">
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
                <span className="meta-chip" title={`Source: ${row.source}`}>
                  {row.source}
                </span>
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
        field: "primaryBlocker",
        headerName: "Blocker",
        minWidth: 240,
        flex: 1.2,
        wrapText: true,
        autoHeight: true,
        cellClass: "ag-grid-cell-wrap",
        cellRenderer: (params: ICellRendererParams<CandidateRow>) => {
          if (!params.data) {
            return null;
          }
          return (
            <div className="py-1">
              <div className="text-sm font-medium text-text-primary">{params.data.primaryBlocker}</div>
              {params.data.secondaryReasons.length > 0 ? (
                <div className="mt-1.5 line-clamp-2 text-xs leading-5 text-text-muted">
                  {params.data.secondaryReasons.join(" · ")}
                </div>
              ) : null}
            </div>
          );
        },
      },
      {
        colId: "entryScore",
        headerName: "Entry",
        minWidth: 110,
        maxWidth: 130,
        headerClass: "ag-grid-header-center",
        cellClass: "ag-grid-cell-metric",
        cellStyle: (params) => buildHeatCellStyle(params.data?.adaptive.entryScore, metricScales.entryScore),
        valueGetter: (params) => params.data?.adaptive.entryScore ?? Number.NEGATIVE_INFINITY,
        cellRenderer: (params: ICellRendererParams<CandidateRow>) => {
          const value = params.data?.adaptive.entryScore;
          return (
            <div className="min-w-[5rem] text-center">
              <div className="text-sm font-semibold text-text-primary">
                {value == null ? "—" : formatNumber(value)}
              </div>
              <div className="mt-1 text-[11px] text-text-muted">
                {params.data ? params.data.status.replace(/_/g, " ") : ""}
              </div>
            </div>
          );
        },
      },
      {
        field: "liquidityUsd",
        headerName: "Liquidity",
        minWidth: 130,
        maxWidth: 170,
        headerClass: "ag-grid-header-center",
        cellClass: "ag-grid-cell-metric",
        cellStyle: (params) => buildHeatCellStyle(params.value, metricScales.liquidityUsd),
        valueFormatter: (params) => formatCompactCurrency(params.value),
      },
      {
        field: "volume5mUsd",
        headerName: "Volume 5m",
        minWidth: 130,
        maxWidth: 170,
        headerClass: "ag-grid-header-center",
        cellClass: "ag-grid-cell-metric",
        cellStyle: (params) => buildHeatCellStyle(params.value, metricScales.volume5mUsd),
        valueFormatter: (params) => formatCompactCurrency(params.value),
      },
      {
        field: "buySellRatio",
        headerName: "Buy/sell",
        minWidth: 120,
        maxWidth: 150,
        headerClass: "ag-grid-header-center",
        cellClass: "ag-grid-cell-metric",
        cellStyle: (params) => buildHeatCellStyle(params.value, metricScales.buySellRatio),
        valueFormatter: (params) => formatNumber(params.value),
      },
      {
        colId: "lastTouch",
        headerName: "Last touch",
        minWidth: 170,
        maxWidth: 210,
        headerClass: "ag-grid-header-center",
        cellClass: "ag-grid-cell-center",
        valueGetter: (params) => params.data?.lastEvaluatedAt ?? params.data?.discoveredAt ?? "",
        valueFormatter: (params) => formatTimestamp(params.value),
      },
      {
        colId: "__actions",
        headerName: "Actions",
        minWidth: 240,
        maxWidth: 320,
        sortable: false,
        filter: false,
        resizable: false,
        pinned: "right",
        headerClass: "ag-grid-header-center",
        cellClass: "ag-grid-cell-action",
        cellRenderer: (params: ICellRendererParams<CandidateRow>) => {
          if (!params.data) {
            return null;
          }
          const row = params.data;
          const detailHref = buildCandidateDetailHref(row.id, props.bucket, props.sort, props.query);
          const grafanaRowHref = buildGrafanaDashboardLink("candidate", {
            from: Date.parse(row.discoveredAt) - 60 * 60 * 1000,
            vars: {
              mint: row.mint,
              symbol: row.symbol,
              source: row.source,
            },
          });
          return (
            <div className="flex min-w-[14rem] flex-wrap items-center gap-2 py-1">
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
    ],
    [
      focusFromHash,
      metricScales.buySellRatio,
      metricScales.entryScore,
      metricScales.liquidityUsd,
      metricScales.volume5mUsd,
      props.bucket,
      props.query,
      props.sort,
    ],
  );

  const defaultColDef = useMemo<ColDef<CandidateRow>>(
    () => ({
      sortable: true,
      filter: true,
      resizable: true,
      suppressMovable: true,
    }),
    [],
  );

  if (props.rows.length === 0) {
    return (
      <div className="rounded-[14px] border border-bg-border bg-bg-hover/40 px-4 py-4 text-sm text-text-secondary">
        {props.query ? "No match." : "No candidates in this bucket."}
      </div>
    );
  }

  return (
    <div className="ag-theme-quartz-dark ag-grid-desk h-[min(62vh,43rem)] w-full rounded-[14px] border border-bg-border bg-bg-card/45">
      <AgGridReact<CandidateRow>
        ref={gridRef}
        theme="legacy"
        rowData={props.rows}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        rowClassRules={rowClassRules}
        getRowId={(params: GetRowIdParams<CandidateRow>) => params.data.id}
        animateRows={false}
        rowHeight={54}
        headerHeight={36}
        suppressCellFocus
        pagination={props.rows.length > 15}
        paginationPageSize={15}
        onFirstDataRendered={() => focusFromHash()}
      />
    </div>
  );
}
