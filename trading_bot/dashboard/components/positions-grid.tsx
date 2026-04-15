"use client";

import Link from "next/link";
import type { Route } from "next";
import { type ColDef, type GetRowIdParams, type ICellRendererParams, type RowClassRules } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { ArrowUpRight, Eye } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  GridStatusBadge,
  RowDetailsDialog,
  type GridRecord,
} from "@/components/ag-grid-shared";
import { WorkbenchRowActions } from "@/components/workbench-row-actions";
import { formatCurrency, formatNumber, formatTimestamp } from "@/lib/format";
import { buildGrafanaDashboardLink } from "@/lib/grafana";
import type { PositionBookPayload } from "@/lib/types";

type PositionSort = "priority" | "opened" | "current" | "remaining";
type PositionRow = PositionBookPayload["rows"][number];

export function PositionsGrid(props: {
  rows: PositionRow[];
  book: PositionBookPayload["book"];
  sort: PositionSort;
  query: string;
}) {
  const gridRef = useRef<AgGridReact<PositionRow>>(null);
  const [selectedRow, setSelectedRow] = useState<PositionRow | null>(null);
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
      "ag-grid-warning-row": (params) => props.book === "open" && (params.node.rowIndex ?? Number.MAX_SAFE_INTEGER) < 4,
      "ag-grid-focus-row": (params) => params.data?.id === focusedRowId,
    }),
    [focusedRowId, props.book],
  );

  const columnDefs = useMemo<ColDef<PositionRow>[]>(() => [
    {
      colId: "position",
      headerName: "Position",
      minWidth: 230,
      flex: 1.1,
      sortable: true,
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
              title={`Open ${row.symbol} position`}
              className="inline-flex items-center gap-2 text-sm font-semibold text-text-primary transition hover:text-accent"
            >
              <span>{row.symbol}</span>
              <ArrowUpRight className="h-4 w-4" />
            </Link>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-muted">
              <span className="font-mono">{shortMint(row.mint)}</span>
              {leadRow ? <span className="meta-chip border-[rgba(250,204,21,0.24)] bg-[rgba(250,204,21,0.08)] text-text-primary">Top priority</span> : null}
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
      field: "status",
      headerName: "Status",
      minWidth: 120,
      maxWidth: 150,
      cellRenderer: (params: ICellRendererParams<PositionRow>) => <GridStatusBadge value={params.value as string | null | undefined} />,
    },
    {
      field: "entryPriceUsd",
      headerName: "Entry",
      minWidth: 120,
      maxWidth: 150,
      cellClass: "ag-grid-cell-number",
      valueFormatter: (params) => formatCurrency(params.value, 6),
    },
    {
      field: "currentPriceUsd",
      headerName: "Current",
      minWidth: 120,
      maxWidth: 150,
      cellClass: "ag-grid-cell-number",
      valueFormatter: (params) => formatCurrency(params.value, 6),
    },
    {
      field: "remainingToken",
      headerName: "Remaining",
      minWidth: 120,
      maxWidth: 145,
      cellClass: "ag-grid-cell-number",
      valueFormatter: (params) => formatNumber(params.value),
    },
    {
      field: "openedAt",
      headerName: "Opened",
      minWidth: 170,
      maxWidth: 210,
      valueFormatter: (params) => formatTimestamp(params.value),
    },
    {
      field: "closedAt",
      headerName: "Closed",
      minWidth: 170,
      maxWidth: 210,
      hide: props.book === "open",
      valueFormatter: (params) => params.value ? formatTimestamp(params.value) : "—",
    },
    {
      colId: "__actions",
      headerName: "Actions",
      minWidth: 300,
      maxWidth: 380,
      sortable: false,
      filter: false,
      resizable: false,
      pinned: "right",
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
          <div className="flex min-w-[18rem] flex-wrap items-center gap-2 py-1">
            <button
              type="button"
              onClick={() => setSelectedRow(row)}
              className="ag-grid-view-button"
            >
              <Eye className="h-3.5 w-3.5" />
              Full
            </button>
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
  ], [focusFromHash, props.book, props.query, props.sort]);

  const defaultColDef = useMemo<ColDef<PositionRow>>(
    () => ({
      sortable: true,
      filter: true,
      resizable: true,
      suppressMovable: true,
    }),
    [],
  );

  const selectedRowDetails = selectedRow ? toDetailRecord(selectedRow) : null;

  if (props.rows.length === 0) {
    return (
      <div className="rounded-[14px] border border-bg-border bg-bg-hover/40 px-4 py-4 text-sm text-text-secondary">
        {props.query ? "No match." : "No positions in this book."}
      </div>
    );
  }

  return (
    <>
      <div className="ag-theme-quartz-dark ag-grid-desk h-[min(62vh,43rem)] w-full rounded-[14px] border border-bg-border bg-bg-card/45">
        <AgGridReact<PositionRow>
          ref={gridRef}
          rowData={props.rows}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          rowClassRules={rowClassRules}
          getRowId={(params: GetRowIdParams<PositionRow>) => params.data.id}
          animateRows={false}
          rowHeight={72}
          headerHeight={34}
          suppressCellFocus
          pagination={props.rows.length > 15}
          paginationPageSize={15}
          onFirstDataRendered={() => focusFromHash()}
        />
      </div>

      <RowDetailsDialog
        row={selectedRowDetails}
        title={selectedRow ? `${selectedRow.symbol} · Position` : "Position details"}
        subtitle="Full book row"
        preferredKeys={["symbol", "mint", "status", "interventionLabel", "interventionPriority", "entryPriceUsd", "currentPriceUsd", "remainingToken", "exitReason", "openedAt", "closedAt"]}
        onClose={() => setSelectedRow(null)}
      />
    </>
  );
}

function toDetailRecord(row: PositionRow): GridRecord {
  return {
    ...row,
    exitReason: row.exitReason ?? "—",
  };
}

function shortMint(mint: string) {
  return `${mint.slice(0, 6)}…${mint.slice(-4)}`;
}

function buildPositionDetailHref(id: string, book: PositionBookPayload["book"], sort: PositionSort, query: string) {
  return `/positions/${id}?book=${book}&sort=${sort}&focus=${id}${query ? `&q=${encodeURIComponent(query)}` : ""}`;
}
