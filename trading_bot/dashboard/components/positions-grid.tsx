"use client";

import Link from "next/link";
import type { Route } from "next";
import { type ColDef, type GetRowIdParams, type ICellRendererParams, type RowClassRules } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { ArrowUpRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WorkbenchRowActions } from "@/components/workbench-row-actions";
import { buildHeatCellStyle, buildMetricScale } from "@/components/grid-utils";
import { formatCompactCurrency, formatPercent, formatTimestamp } from "@/lib/format";
import { buildGrafanaDashboardLink } from "@/lib/grafana";
import type { PositionBookPayload } from "@/lib/types";
import { shortMint } from "@/lib/utils";
import { buildPositionDetailHref, type PositionSort } from "@/src/lib/use-trading-search-params";

type PositionRow = PositionBookPayload["rows"][number];

export function PositionsGrid(props: {
  rows: PositionRow[];
  book: PositionBookPayload["book"];
  sort: PositionSort;
  query: string;
}) {
  const gridRef = useRef<AgGridReact<PositionRow>>(null);
  const [focusedRowId, setFocusedRowId] = useState<string | null>(null);

  const rowIdSet = useMemo(() => new Set(props.rows.map((row) => row.id)), [props.rows]);

  const focusFromHash = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }
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

  const rowClassRules = useMemo<RowClassRules<PositionRow>>(
    () => ({
      "ag-grid-warning-row": (params) =>
        props.book === "open" && (params.node.rowIndex ?? Number.MAX_SAFE_INTEGER) < 4,
      "ag-grid-focus-row": (params) => params.data?.id === focusedRowId,
    }),
    [focusedRowId, props.book],
  );

  const metricScales = useMemo(
    () => ({
      unrealizedPnlUsd: buildMetricScale(props.rows.map((row) => row.unrealizedPnlUsd), true),
      returnPct: buildMetricScale(props.rows.map((row) => row.returnPct), true),
      latestExecutionLatencyMs: buildMetricScale(
        props.rows.map((row) => row.latestExecutionLatencyMs),
        false,
        true,
      ),
    }),
    [props.rows],
  );

  const columnDefs = useMemo<ColDef<PositionRow>[]>(
    () => [
      {
        colId: "position",
        headerName: "Position",
        minWidth: 230,
        flex: 1.1,
        sortable: true,
        wrapText: true,
        autoHeight: true,
        cellClass: "ag-grid-cell-wrap",
        valueGetter: (params) => params.data?.symbol ?? "",
        cellRenderer: (params: ICellRendererParams<PositionRow>) => {
          if (!params.data) {
            return null;
          }
          const row = params.data;
          const detailHref = buildPositionDetailHref(row.id, props.book, props.sort, props.query);
          const leadRow = props.book === "open" && (params.node.rowIndex ?? Number.MAX_SAFE_INTEGER) < 4;
          return (
            <div className="min-w-[14rem] py-1">
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
        field: "interventionLabel",
        headerName: "Intervention",
        minWidth: 190,
        flex: 1,
        hide: props.book === "closed",
        wrapText: true,
        autoHeight: true,
        cellClass: "ag-grid-cell-wrap",
        cellRenderer: (params: ICellRendererParams<PositionRow>) => {
          if (!params.data) {
            return null;
          }
          return (
            <div className="py-1">
              <div className="text-sm font-medium text-text-primary">{params.data.interventionLabel}</div>
              <div className="mt-1 text-xs text-text-muted">Priority {params.data.interventionPriority}</div>
            </div>
          );
        },
      },
      {
        field: "unrealizedPnlUsd",
        headerName: "PnL",
        minWidth: 130,
        maxWidth: 160,
        headerClass: "ag-grid-header-center",
        cellClass: "ag-grid-cell-metric",
        cellStyle: (params) => buildHeatCellStyle(params.value, metricScales.unrealizedPnlUsd),
        valueFormatter: (params) => formatCompactCurrency(params.value),
      },
      {
        field: "returnPct",
        headerName: "Return",
        minWidth: 110,
        maxWidth: 130,
        headerClass: "ag-grid-header-center",
        cellClass: "ag-grid-cell-metric",
        cellStyle: (params) => buildHeatCellStyle(params.value, metricScales.returnPct),
        valueFormatter: (params) => formatPercent(params.value),
      },
      {
        field: "latestExecutionLatencyMs",
        headerName: "Exec",
        minWidth: 110,
        maxWidth: 130,
        headerClass: "ag-grid-header-center",
        cellClass: "ag-grid-cell-metric",
        cellStyle: (params) => buildHeatCellStyle(params.value, metricScales.latestExecutionLatencyMs),
        valueFormatter: (params) =>
          params.value == null ? "—" : `${Math.round(Number(params.value))} ms`,
      },
      {
        field: "openedAt",
        headerName: "Opened",
        minWidth: 170,
        maxWidth: 210,
        headerClass: "ag-grid-header-center",
        cellClass: "ag-grid-cell-center",
        valueFormatter: (params) => formatTimestamp(params.value),
      },
      {
        field: "closedAt",
        headerName: "Closed",
        minWidth: 170,
        maxWidth: 210,
        hide: props.book === "open",
        headerClass: "ag-grid-header-center",
        cellClass: "ag-grid-cell-center",
        valueFormatter: (params) => (params.value ? formatTimestamp(params.value) : "—"),
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
        cellRenderer: (params: ICellRendererParams<PositionRow>) => {
          if (!params.data) {
            return null;
          }
          const row = params.data;
          const detailHref = buildPositionDetailHref(row.id, props.book, props.sort, props.query);
          const grafanaRowHref = buildGrafanaDashboardLink("position", {
            from: Date.parse(row.openedAt) - 30 * 60 * 1000,
            to: row.closedAt ?? "now",
            vars: {
              positionId: row.id,
              mint: row.mint,
              symbol: row.symbol,
            },
          });
          return (
            <div className="flex min-w-[14rem] flex-wrap items-center gap-2 py-1">
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
    ],
    [
      focusFromHash,
      metricScales.latestExecutionLatencyMs,
      metricScales.returnPct,
      metricScales.unrealizedPnlUsd,
      props.book,
      props.query,
      props.sort,
    ],
  );

  const defaultColDef = useMemo<ColDef<PositionRow>>(
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
        {props.query ? "No match." : "No positions in this book."}
      </div>
    );
  }

  return (
    <div className="ag-theme-quartz-dark ag-grid-desk h-[min(62vh,43rem)] w-full rounded-[14px] border border-bg-border bg-bg-card/45">
      <AgGridReact<PositionRow>
        ref={gridRef}
        theme="legacy"
        rowData={props.rows}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        rowClassRules={rowClassRules}
        getRowId={(params: GetRowIdParams<PositionRow>) => params.data.id}
        animateRows={false}
        rowHeight={52}
        headerHeight={36}
        suppressCellFocus
        pagination={props.rows.length > 15}
        paginationPageSize={15}
        onFirstDataRendered={() => focusFromHash()}
      />
    </div>
  );
}
