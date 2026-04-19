"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/components/ui/cn";

export type NativeTableColumn<Row> = {
  id: string;
  header: ReactNode;
  render: (row: Row, index: number) => ReactNode;
  align?: "left" | "right" | "center";
  widthClassName?: string;
  cellClassName?: string;
  headerClassName?: string;
};

export function NativeTable<Row>(props: {
  rows: Row[];
  columns: Array<NativeTableColumn<Row>>;
  rowKey: (row: Row, index: number) => string;
  rowId?: (row: Row, index: number) => string | undefined;
  rowClassName?: (row: Row, index: number) => string | undefined;
  className?: string;
  maxHeightClassName?: string;
  density?: "compact" | "default";
  initialPageSize?: 10 | 15 | 20;
}) {
  const compact = (props.density ?? "compact") === "compact";
  const resolvedInitialPageSize = props.initialPageSize ?? (props.rows.length <= 20 ? 10 : 15);
  const [pageSize, setPageSize] = useState<10 | 15 | 20>(resolvedInitialPageSize);
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(props.rows.length / pageSize));

  useEffect(() => {
    setPage(1);
  }, [props.rows, pageSize]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return props.rows.slice(start, start + pageSize);
  }, [page, pageSize, props.rows]);

  return (
    <div className={cn("overflow-hidden rounded-[14px] border border-bg-border bg-bg-card/45", props.className)}>
      <div className={cn("overflow-auto", props.maxHeightClassName ?? "max-h-[34rem]")}>
        <table className={cn("min-w-full border-collapse", compact ? "text-[12px]" : "text-sm")}>
          <thead className="sticky top-0 z-10 bg-[#090a0b] text-left text-[10px] uppercase tracking-[0.14em] text-text-muted">
            <tr>
              {props.columns.map((column) => (
                <th
                  key={column.id}
                  className={cn(
                    "border-b border-bg-border font-semibold",
                    compact ? "px-2.5 py-2" : "px-3 py-2.5",
                    column.align === "right" && "text-right",
                    column.align === "center" && "text-center",
                    column.widthClassName,
                    column.headerClassName,
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pagedRows.map((row, index) => {
              const absoluteIndex = (page - 1) * pageSize + index;
              return (
              <tr
                key={props.rowKey(row, absoluteIndex)}
                id={props.rowId?.(row, absoluteIndex)}
                className={cn(
                  "transition-colors hover:bg-white/[0.02]",
                  index % 2 === 1 && "bg-white/[0.012]",
                  props.rowClassName?.(row, absoluteIndex),
                )}
              >
                {props.columns.map((column) => (
                  <td
                    key={column.id}
                    className={cn(
                      "border-b border-bg-border/80 align-top text-text-secondary",
                      compact ? "px-2.5 py-2.5" : "px-3 py-3",
                      column.align === "right" && "text-right",
                      column.align === "center" && "text-center tabular-nums",
                      column.cellClassName,
                    )}
                  >
                    {column.render(row, absoluteIndex)}
                  </td>
                ))}
              </tr>
            )})}
          </tbody>
        </table>
      </div>
      {props.rows.length > pageSize ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-bg-border px-3 py-2 text-[11px] text-text-muted">
          <div>
            Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, props.rows.length)} of {props.rows.length}
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2">
              <span>Rows</span>
              <select
                value={pageSize}
                onChange={(event) => setPageSize(Number(event.target.value) as 10 | 15 | 20)}
                className="rounded border border-bg-border bg-[#101112] px-2 py-1 text-[11px] text-text-primary"
              >
                <option value={10}>10</option>
                <option value={15}>15</option>
                <option value={20}>20</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1}
              className="rounded border border-bg-border px-2 py-1 disabled:opacity-40"
            >
              Prev
            </button>
            <span>{page}/{totalPages}</span>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={page >= totalPages}
              className="rounded border border-bg-border px-2 py-1 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
