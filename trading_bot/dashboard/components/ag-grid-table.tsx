"use client";

import clsx from "clsx";
import { type ColDef, type GetRowIdParams, type ICellRendererParams } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { Eye } from "lucide-react";
import { useMemo, useState } from "react";
import {
  formatGridValue,
  GridStatusBadge,
  isLikelyIdentifierKey,
  isLikelyNumericKey,
  RowDetailsDialog,
  type GridRecord,
} from "@/components/ag-grid-shared";
import { humanizeKey } from "@/lib/format";

type GridTableRow = GridRecord & { __rowId: string };

export function AgGridTable(props: {
  rows: GridRecord[];
  preferredKeys: string[];
  maxRows?: number;
  emptyTitle?: string;
  emptyDetail?: string;
  heightClassName?: string;
  pageSize?: number;
}) {
  const [selectedRow, setSelectedRow] = useState<GridRecord | null>(null);

  const limitedRows = useMemo(
    () => (props.maxRows ? props.rows.slice(0, props.maxRows) : props.rows),
    [props.maxRows, props.rows],
  );

  const rowData = useMemo<GridTableRow[]>(
    () => limitedRows.map((row, index) => ({ ...row, __rowId: resolveRowId(row, index) })),
    [limitedRows],
  );

  const sampleRow = rowData[0];
  const keys = sampleRow
    ? props.preferredKeys
      .filter((key) => key in sampleRow)
      .concat(Object.keys(sampleRow).filter((key) => key !== "__rowId" && !props.preferredKeys.includes(key)).slice(0, Math.max(0, 8 - props.preferredKeys.length)))
    : [];

  const columnDefs = useMemo<ColDef<GridTableRow>[]>(() => {
    const dataColumns: ColDef<GridTableRow>[] = keys.map((key): ColDef<GridTableRow> => ({
      field: key,
      headerName: humanizeKey(key),
      minWidth: isLikelyIdentifierKey(key) ? 170 : 130,
      flex: key.includes("reason") ? 1.45 : 1,
      cellClass: clsx(
        "ag-grid-cell-base",
        isLikelyNumericKey(key) && "ag-grid-cell-number",
        isLikelyIdentifierKey(key) && "ag-grid-cell-identifier",
        key.includes("reason") && "ag-grid-cell-reason",
      ),
      cellRenderer: (params: ICellRendererParams<GridTableRow>) => {
        const value = params.data?.[key];
        if (key === "status" || key.endsWith("_status")) {
          return <GridStatusBadge value={String(value ?? "unknown")} />;
        }
        return (
          <span className={clsx("inline-block", key.includes("reason") && "line-clamp-2")}>
            {formatGridValue(key, value)}
          </span>
        );
      },
    }));

    dataColumns.push({
      colId: "__view",
      headerName: "View",
      minWidth: 92,
      maxWidth: 110,
      sortable: false,
      filter: false,
      resizable: false,
      pinned: "right",
      cellClass: "ag-grid-cell-action",
      cellRenderer: (params: ICellRendererParams<GridTableRow>) => (
        <button
          type="button"
          onClick={() => {
            if (params.data) {
              const { __rowId, ...plain } = params.data;
              void __rowId;
              setSelectedRow(plain);
            }
          }}
          className="ag-grid-view-button"
        >
          <Eye className="h-3.5 w-3.5" />
          Full
        </button>
      ),
    });

    return dataColumns;
  }, [keys]);

  const defaultColDef = useMemo<ColDef<GridTableRow>>(
    () => ({
      sortable: true,
      filter: true,
      resizable: true,
      suppressMovable: true,
    }),
    [],
  );

  const detailTitle = selectedRow
    ? String(selectedRow.symbol ?? selectedRow.id ?? selectedRow.mint ?? "Row details")
    : "Row details";

  if (rowData.length === 0 || keys.length === 0) {
    return (
      <div className="rounded-[14px] border border-bg-border bg-bg-hover/40 px-4 py-4 text-sm text-text-secondary">
        <div className="font-semibold text-text-primary">{props.emptyTitle ?? "Nothing to show yet"}</div>
        <div className="mt-1">
          {props.emptyDetail ?? "The backend returned no rows for this slice, which is still better than lying with placeholder numbers."}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={clsx("ag-theme-quartz-dark ag-grid-desk w-full rounded-[14px] border border-bg-border/80 bg-bg-card/45", props.heightClassName ?? "h-[21rem]")}>
        <AgGridReact<GridTableRow>
          rowData={rowData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          getRowId={(params: GetRowIdParams<GridTableRow>) => params.data.__rowId}
          animateRows={false}
          rowHeight={40}
          headerHeight={34}
          suppressCellFocus
          pagination={rowData.length > (props.pageSize ?? 12)}
          paginationPageSize={props.pageSize ?? 12}
        />
      </div>
      <RowDetailsDialog
        row={selectedRow}
        title={detailTitle}
        subtitle="Full row view"
        preferredKeys={keys}
        onClose={() => setSelectedRow(null)}
      />
    </>
  );
}

function resolveRowId(row: GridRecord, index: number): string {
  const candidate = row.id ?? row.mint ?? row.symbol ?? row.endpoint ?? row.provider;
  return `${String(candidate ?? "row")}-${index}`;
}
