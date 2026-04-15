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
import { formatCompactCurrency, formatNumber, formatPercent, formatTimestamp } from "@/lib/format";
import { buildGrafanaDashboardLink } from "@/lib/grafana";
import type { CandidateBucket, CandidateQueuePayload } from "@/lib/types";

type CandidateSort = "recent" | "liquidity" | "volume" | "buySell";
type CandidateRow = CandidateQueuePayload["rows"][number];

export function CandidatesGrid(props: {
  rows: CandidateRow[];
  bucket: CandidateBucket;
  sort: CandidateSort;
  query: string;
}) {
  const gridRef = useRef<AgGridReact<CandidateRow>>(null);
  const [selectedRow, setSelectedRow] = useState<CandidateRow | null>(null);
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
      "ag-grid-action-row": (params) => props.bucket === "ready" && (params.node.rowIndex ?? Number.MAX_SAFE_INTEGER) < 5,
      "ag-grid-focus-row": (params) => params.data?.id === focusedRowId,
    }),
    [focusedRowId, props.bucket],
  );

  const columnDefs = useMemo<ColDef<CandidateRow>[]>(() => [
    {
      colId: "token",
      headerName: "Token",
      minWidth: 270,
      flex: 1.2,
      sortable: true,
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
              title={`Open ${row.symbol || shortMint(row.mint)} details`}
              className="inline-flex items-center gap-2 text-sm font-semibold text-text-primary transition hover:text-accent"
            >
              <span>{row.symbol || shortMint(row.mint)}</span>
              <ArrowUpRight className="h-4 w-4" />
            </Link>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-muted">
              <span className="font-mono">{shortMint(row.mint)}</span>
              <span className="meta-chip" title={`Source: ${row.source}`}>{row.source}</span>
              {actionable ? <span className="meta-chip border-[rgba(163,230,53,0.26)] bg-[rgba(163,230,53,0.08)] text-text-primary">Front</span> : null}
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
      cellRenderer: (params: ICellRendererParams<CandidateRow>) => {
        if (!params.data) {
          return null;
        }
        return (
          <div className="py-1">
            <div className="text-sm font-medium text-text-primary">{params.data.primaryBlocker}</div>
            {params.data.secondaryReasons.length > 0 ? (
              <div className="mt-1.5 line-clamp-2 text-xs leading-5 text-text-muted">{params.data.secondaryReasons.join(" · ")}</div>
            ) : null}
          </div>
        );
      },
    },
    {
      field: "status",
      headerName: "Status",
      minWidth: 120,
      maxWidth: 150,
      cellRenderer: (params: ICellRendererParams<CandidateRow>) => <GridStatusBadge value={params.value as string | null | undefined} />,
    },
    {
      field: "liquidityUsd",
      headerName: "Liquidity",
      minWidth: 130,
      maxWidth: 170,
      cellClass: "ag-grid-cell-number",
      valueFormatter: (params) => formatCompactCurrency(params.value),
    },
    {
      field: "volume5mUsd",
      headerName: "Volume 5m",
      minWidth: 130,
      maxWidth: 170,
      cellClass: "ag-grid-cell-number",
      valueFormatter: (params) => formatCompactCurrency(params.value),
    },
    {
      field: "buySellRatio",
      headerName: "Buy/sell",
      minWidth: 120,
      maxWidth: 150,
      cellClass: "ag-grid-cell-number",
      valueFormatter: (params) => formatNumber(params.value),
    },
    {
      field: "top10HolderPercent",
      headerName: "Top 10",
      minWidth: 110,
      maxWidth: 140,
      cellClass: "ag-grid-cell-number",
      valueFormatter: (params) => params.value == null ? "—" : formatPercent(params.value),
    },
    {
      colId: "lastTouch",
      headerName: "Last touch",
      minWidth: 170,
      maxWidth: 210,
      valueGetter: (params) => params.data?.lastEvaluatedAt ?? params.data?.discoveredAt ?? "",
      valueFormatter: (params) => formatTimestamp(params.value),
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
  ], [focusFromHash, props.bucket, props.query, props.sort]);

  const defaultColDef = useMemo<ColDef<CandidateRow>>(
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
        {props.query ? "No match." : "No candidates in this bucket."}
      </div>
    );
  }

  return (
    <>
      <div className="ag-theme-quartz-dark ag-grid-desk h-[min(62vh,43rem)] w-full rounded-[14px] border border-bg-border bg-bg-card/45">
        <AgGridReact<CandidateRow>
          ref={gridRef}
          rowData={props.rows}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          rowClassRules={rowClassRules}
          getRowId={(params: GetRowIdParams<CandidateRow>) => params.data.id}
          animateRows={false}
          rowHeight={74}
          headerHeight={34}
          suppressCellFocus
          pagination={props.rows.length > 15}
          paginationPageSize={15}
          onFirstDataRendered={() => focusFromHash()}
        />
      </div>

      <RowDetailsDialog
        row={selectedRowDetails}
        title={selectedRow ? `${selectedRow.symbol || shortMint(selectedRow.mint)} · Candidate` : "Candidate details"}
        subtitle="Full queue row"
        preferredKeys={["symbol", "mint", "source", "status", "primaryBlocker", "secondaryReasons", "liquidityUsd", "volume5mUsd", "buySellRatio", "top10HolderPercent", "discoveredAt", "lastEvaluatedAt"]}
        onClose={() => setSelectedRow(null)}
      />
    </>
  );
}

function toDetailRecord(row: CandidateRow): GridRecord {
  return {
    ...row,
    secondaryReasons: row.secondaryReasons.join(" · "),
  };
}

function shortMint(mint: string) {
  return `${mint.slice(0, 6)}…${mint.slice(-4)}`;
}

function buildCandidateDetailHref(id: string, bucket: CandidateBucket, sort: CandidateSort, query: string) {
  return `/candidates/${id}?bucket=${bucket}&sort=${sort}&focus=${id}${query ? `&q=${encodeURIComponent(query)}` : ""}`;
}
