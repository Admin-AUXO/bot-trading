"use client";

import * as Dialog from "@radix-ui/react-dialog";
import clsx from "clsx";
import {
  type ColDef,
  type ICellRendererParams,
} from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import {
  Eye,
  ExternalLink,
  Search,
  SlidersHorizontal,
  Trophy,
  X,
} from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  formatCompactCurrency,
  formatInteger,
  formatNumber,
  formatPercent,
  formatRelativeMinutes,
} from "@/lib/format";
import type {
  DiscoveryLabRunDetail,
  DiscoveryLabRunReport,
  DiscoveryLabTokenInsight,
  PositionBookRow,
} from "@/lib/types";
import { useHydrated } from "@/lib/use-hydrated";

type WinnerRow = {
  symbol: string;
  address: string;
  score: number;
  liquidityUsd: number | null;
  marketCapUsd: number | null;
  volume5mUsd: number | null;
  holders: number | null;
  top10HolderPercent: number | null;
  timeSinceGraduationMin: number | null;
  whichRecipes: string[];
  priceChange5mPercent: number | null;
  buySellRatio: number | null;
};

function buildWinnerRows(report: DiscoveryLabRunReport | null): WinnerRow[] {
  if (!report) return [];
  return report.winners.map((w) => ({
    symbol: w.tokenName || "Unknown",
    address: w.address,
    score: w.score,
    liquidityUsd: w.liquidityUsd,
    marketCapUsd: w.marketCapUsd,
    volume5mUsd: w.volume5mUsd,
    holders: w.holders,
    top10HolderPercent: w.top10HolderPercent,
    timeSinceGraduationMin: w.timeSinceGraduationMin,
    whichRecipes: w.whichRecipes,
    priceChange5mPercent: w.priceChange5mPercent,
    buySellRatio: w.buySellRatio,
  }));
}

function ScoreCell(props: ICellRendererParams<WinnerRow>) {
  const value = props.value as number;
  const tone = value >= 80 ? "accent" : value >= 60 ? "warning" : "default";
  return (
    <div className={clsx(
      "rounded-full px-2.5 py-1 text-xs font-semibold",
      tone === "accent" && "bg-[rgba(163,230,53,0.15)] text-accent",
      tone === "warning" && "bg-[rgba(250,204,21,0.15)] text-[var(--warning)]",
      tone === "default" && "bg-bg-hover text-text-secondary"
    )}>
      {formatNumber(value)}
    </div>
  );
}

function OutcomePill({ outcome }: { outcome: "winner" | "pass" | "reject" }) {
  const tone = {
    winner: "bg-[rgba(163,230,53,0.15)] text-accent border-[rgba(163,230,53,0.3)]",
    pass: "bg-[rgba(250,204,21,0.15)] text-[var(--warning)] border-[rgba(250,204,21,0.3)]",
    reject: "bg-[rgba(248,113,113,0.15)] text-[var(--danger)] border-[rgba(248,113,113,0.3)]",
  }[outcome];
  return (
    <span className={clsx("inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-[0.14em] border", tone)}>
      {outcome.toUpperCase()}
    </span>
  );
}

interface WinnersGridProps {
  runDetail: DiscoveryLabRunDetail | null;
}

export function WinnersGrid({ runDetail }: WinnersGridProps) {
  const report = runDetail?.report ?? null;
  const hydrated = useHydrated();
  const [searchText, setSearchText] = useState("");
  const deferredSearchText = useDeferredValue(searchText);
  const [selectedMint, setSelectedMint] = useState<string | null>(null);

  const rows = useMemo(() => {
    const winnerRows = buildWinnerRows(report);
    if (!deferredSearchText) return winnerRows;
    const query = deferredSearchText.toLowerCase();
    return winnerRows.filter(
      (r) =>
        r.symbol.toLowerCase().includes(query) ||
        r.address.toLowerCase().includes(query)
    );
  }, [report, deferredSearchText]);

  const colDefs = useMemo<ColDef<WinnerRow>[]>(() => [
    {
      field: "symbol",
      headerName: "Symbol",
      cellClass: "font-semibold",
      width: 110,
    },
    {
      field: "score",
      headerName: "Score",
      cellRenderer: ScoreCell,
      width: 90,
    },
    {
      field: "marketCapUsd",
      headerName: "Mkt Cap",
      width: 110,
      valueFormatter: (p) => p.value != null ? formatCompactCurrency(p.value) : "—",
    },
    {
      field: "liquidityUsd",
      headerName: "Liquidity",
      width: 110,
      valueFormatter: (p) => p.value != null ? formatCompactCurrency(p.value) : "—",
    },
    {
      field: "volume5mUsd",
      headerName: "Vol 5m",
      width: 100,
      valueFormatter: (p) => p.value != null ? formatCompactCurrency(p.value) : "—",
    },
    {
      field: "holders",
      headerName: "Holders",
      width: 90,
      valueFormatter: (p) => p.value != null ? formatInteger(p.value) : "—",
    },
    {
      field: "top10HolderPercent",
      headerName: "Top10 %",
      width: 90,
      valueFormatter: (p) => p.value != null ? formatPercent(p.value, 0) : "—",
    },
    {
      field: "priceChange5mPercent",
      headerName: "5m %",
      width: 80,
      valueFormatter: (p) => {
        if (p.value == null) return "—";
        const sign = p.value >= 0 ? "+" : "";
        return `${sign}${formatPercent(p.value, 1)}`;
      },
    },
    {
      field: "timeSinceGraduationMin",
      headerName: "Grad Age",
      width: 90,
      valueFormatter: (p) => p.value != null ? formatRelativeMinutes(p.value) : "—",
    },
  ], []);

  const defaultColDef = useMemo<ColDef>(() => ({
    sortable: true,
    resizable: true,
    suppressMovable: true,
  }), []);

  const selectedRow = rows.find((r) => r.address === selectedMint);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <Input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search symbol or address"
              className="h-9 bg-[#101112] pl-9"
            />
          </label>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <Trophy className="h-4 w-4 text-accent" />
          {formatInteger(rows.length)} winners
        </div>
      </div>

      <div className="ag-theme-quartz-dark ag-grid-desk overflow-hidden rounded-[18px] border border-bg-border/80 bg-[linear-gradient(180deg,rgba(13,14,14,0.96),rgba(8,9,9,0.98))] h-[min(50vh,32rem)]">
        <AgGridReact<WinnerRow>
          rowData={rows}
          columnDefs={colDefs}
          defaultColDef={defaultColDef}
          getRowId={(params: { data: WinnerRow }) => params.data.address}
          onRowClicked={(e) => setSelectedMint(e.data?.address ?? null)}
          rowSelection="single"
          suppressCellFocus
        />
      </div>
    </div>
  );
}
