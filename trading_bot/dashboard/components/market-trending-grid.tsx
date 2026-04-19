"use client";

import Link from "next/link";
import type { Route } from "next";
import { type ColDef, type ICellRendererParams } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { Copy, ExternalLink, Pin, PinOff, RefreshCcw } from "lucide-react";
import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { CompactStatGrid, DisclosurePanel, EmptyState, InlineNotice, StatusPill } from "@/components/dashboard-primitives";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { fetchJson } from "@/lib/api";
import { formatCompactCurrency, formatInteger, formatMinutesAgo, formatPercent, formatRelativeMinutes } from "@/lib/format";
import { MARKET_WATCHLIST_KEY, readMarketWatchlist, writeMarketWatchlist } from "@/lib/market-watchlist";
import type { DiscoveryLabMarketStatsPayload, SmartWalletActivityPayload } from "@/lib/types";
import { shortMint } from "@/lib/utils";

type MarketTrendingGridProps = {
  initialPayload: DiscoveryLabMarketStatsPayload;
  initialSmartWalletEvents: SmartWalletActivityPayload[];
  mode: "trending" | "watchlist";
};

type TrendingRow = DiscoveryLabMarketStatsPayload["tokens"][number];

export function MarketTrendingGrid(props: MarketTrendingGridProps) {
  const [payload, setPayload] = useState(props.initialPayload);
  const [events, setEvents] = useState(props.initialSmartWalletEvents);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [watchlist, setWatchlist] = useState<Set<string>>(new Set());

  useEffect(() => {
    const sync = () => {
      setWatchlist(readMarketWatchlist());
    };
    sync();
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const syncBoard = useEffectEvent(async (options?: { refresh?: boolean }) => {
    setIsRefreshing(true);
    try {
      const refreshSuffix = options?.refresh ? "&refresh=true" : "";
      const next = await fetchJson<DiscoveryLabMarketStatsPayload>(`/operator/market/trending?limit=50${refreshSuffix}`);
      setPayload(next);
      const mints = next.tokens.map((row) => row.mint).join(",");
      if (mints.length === 0) {
        setEvents([]);
        setError(null);
        return;
      }
      const smart = await fetchJson<SmartWalletActivityPayload[]>(
        `/operator/market/smart-wallet-events?limit=10&mints=${encodeURIComponent(mints)}`,
      );
      setEvents(smart);
      setError(null);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "market refresh failed");
    } finally {
      setIsRefreshing(false);
    }
  });

  useEffect(() => {
    const timer = window.setInterval(() => {
      void syncBoard();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const smartHitsByMint = useMemo(() => {
    const map = new Map<string, number>();
    for (const event of events) {
      map.set(event.mint, (map.get(event.mint) ?? 0) + 1);
    }
    return map;
  }, [events]);

  const rows = useMemo(() => {
    if (props.mode === "watchlist") {
      return payload.tokens.filter((row) => watchlist.has(row.mint));
    }
    return payload.tokens;
  }, [payload.tokens, props.mode, watchlist]);
  const latestEventAge = events[0]?.receivedAt ?? null;

  const toggleWatchlist = (mint: string) => {
    setWatchlist((current) => {
      const next = new Set(current);
      if (next.has(mint)) next.delete(mint);
      else next.add(mint);
      writeMarketWatchlist(next);
      window.dispatchEvent(new StorageEvent("storage", { key: MARKET_WATCHLIST_KEY }));
      return next;
    });
  };

  const columnDefs = useMemo<ColDef<TrendingRow>[]>(() => ([
    {
      field: "symbol",
      headerName: "Symbol",
      minWidth: 110,
      maxWidth: 130,
      cellClass: "ag-grid-cell-identifier",
      valueFormatter: (params) => params.value || "—",
    },
    {
      field: "mint",
      headerName: "Mint",
      minWidth: 180,
      maxWidth: 220,
      cellRenderer: (params: ICellRendererParams<TrendingRow>) => {
        const mint = params.data?.mint ?? "";
        return (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary"
            onClick={() => void navigator.clipboard.writeText(mint)}
            title={mint}
          >
            {shortMint(mint, 5)}
            <Copy className="h-3 w-3" />
          </button>
        );
      },
    },
    {
      field: "graduationAgeMinutes",
      headerName: "Age",
      minWidth: 96,
      maxWidth: 120,
      cellClass: "ag-grid-cell-metric",
      valueFormatter: (params) => formatRelativeMinutes(params.value),
    },
    { field: "marketCapUsd", headerName: "MC", minWidth: 110, maxWidth: 140, cellClass: "ag-grid-cell-metric", valueFormatter: (p) => formatCompactCurrency(p.value) },
    { field: "liquidityUsd", headerName: "Liq", minWidth: 110, maxWidth: 140, cellClass: "ag-grid-cell-metric", valueFormatter: (p) => formatCompactCurrency(p.value) },
    { field: "buys5m", headerName: "Buyers5m", minWidth: 110, maxWidth: 130, cellClass: "ag-grid-cell-metric", valueFormatter: (p) => formatInteger(p.value) },
    {
      colId: "bsRatio",
      headerName: "B/S",
      minWidth: 100,
      maxWidth: 120,
      cellClass: "ag-grid-cell-metric",
      valueGetter: (params) => {
        const buys = params.data?.buys5m ?? null;
        const sells = params.data?.sells5m ?? null;
        if (!buys || !sells) return null;
        return buys / sells;
      },
      valueFormatter: (params) => {
        if (typeof params.value !== "number" || !Number.isFinite(params.value)) return "—";
        return `${params.value.toFixed(2)}x`;
      },
    },
    { field: "rugScoreNormalized", headerName: "RugScore", minWidth: 105, maxWidth: 125, cellClass: "ag-grid-cell-metric", valueFormatter: (p) => formatInteger(p.value) },
    {
      colId: "smartHits",
      headerName: "Smart1h",
      minWidth: 105,
      maxWidth: 125,
      cellClass: "ag-grid-cell-metric",
      valueGetter: (params) => smartHitsByMint.get(params.data?.mint ?? "") ?? 0,
      valueFormatter: (params) => formatInteger(params.value),
    },
    {
      colId: "__actions",
      headerName: "Actions",
      minWidth: 170,
      maxWidth: 190,
      sortable: false,
      filter: false,
      pinned: "right",
      cellRenderer: (params: ICellRendererParams<TrendingRow>) => {
        if (!params.data) return null;
        const mint = params.data.mint;
        const isPinned = watchlist.has(mint);
        return (
          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              className="rounded border border-bg-border p-1 text-text-secondary hover:text-text-primary"
              title={isPinned ? "Unpin" : "Pin to watchlist"}
              onClick={() => toggleWatchlist(mint)}
            >
              {isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
            </button>
            <Link
              href={`/market/token/${mint}` as Route}
              prefetch={false}
              className="rounded border border-bg-border p-1 text-text-secondary hover:text-text-primary"
              title="Open token"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        );
      },
    },
  ]), [smartHitsByMint, watchlist]);

  const status = error ?? payload.meta.warnings[0] ?? null;
  const marketUnavailable = payload.meta.cacheState === "degraded";
  const sourceLegend = [
    "Birdeye = paid pulse",
    "Rugcheck = free security",
    "Smart wallets = recent tracked flow",
  ];

  return (
    <div className="space-y-4">
      <div className="workbench-controls">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <StatusPill value={props.mode === "watchlist" ? "watchlist" : "market scan"} />
          <StatusPill value={marketUnavailable ? "degraded" : "live"} />
          <span className="text-xs text-text-secondary">
            {props.mode === "watchlist"
              ? "Pinned names only."
              : "Refresh only when you need a paid market pull."}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {sourceLegend.map((item) => (
            <span key={item} className="meta-chip">{item}</span>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={() => void syncBoard({ refresh: true })} disabled={isRefreshing}>
            <RefreshCcw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
            {isRefreshing ? "Refreshing" : "Refresh board"}
          </Button>
        </div>
      </div>

      <CompactStatGrid
        className="xl:grid-cols-5"
        items={[
          {
            label: "Universe",
            value: formatInteger(payload.tokenUniverseSize),
            detail: "Tracked tokens",
            tooltip: "Backend token universe used to build the current board.",
          },
          {
            label: "Visible rows",
            value: formatInteger(rows.length),
            detail: props.mode === "watchlist" ? "Pinned subset" : "Current board",
            tooltip: "Rows currently visible after watchlist filtering.",
          },
          {
            label: "Pinned",
            value: formatInteger(watchlist.size),
            detail: "Browser-local list",
            tooltip: "Watchlist is stored locally in the browser, not in backend state.",
          },
          {
            label: "Smart hits",
            value: formatInteger(events.length),
            detail: latestEventAge ? `Last ${formatMinutesAgo(latestEventAge)}` : "No recent event",
            tooltip: "Recent tracked-wallet events for the mints currently on the board.",
          },
          {
            label: "Data age",
            value: formatMinutesAgo(payload.generatedAt),
            detail: `Cache ${formatMinutesAgo(payload.meta.lastRefreshedAt)}`,
            tooltip: "Board generation time versus the last cached refresh time.",
          },
        ]}
      />

      {status ? (
        <InlineNotice tone={marketUnavailable ? "warning" : "default"} className="text-xs">
          <div className="flex items-center gap-2">
            <StatusPill value={isRefreshing ? "refreshing" : "live"} />
            <span>{status}</span>
          </div>
        </InlineNotice>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          title={
            marketUnavailable
              ? "Market feed unavailable"
              : props.mode === "watchlist"
                ? "Watchlist is empty"
                : "No trending rows"
          }
          detail={
            marketUnavailable
              ? (status ?? "Market data did not load.")
              : props.mode === "watchlist"
                ? "Pin mints from the trending board first."
                : "No rows returned by /market/trending."
          }
          compact
        />
      ) : (
        <div className="ag-theme-quartz-dark ag-grid-desk h-[min(66vh,46rem)] w-full rounded-[14px] border border-bg-border bg-bg-card/45">
          <AgGridReact<TrendingRow>
            theme="legacy"
            rowData={rows}
            columnDefs={columnDefs}
            defaultColDef={{ sortable: true, filter: true, resizable: true, suppressMovable: true }}
            rowHeight={42}
            headerHeight={34}
            suppressCellFocus
            pagination={rows.length > 20}
            paginationPageSize={20}
          />
        </div>
      )}

      <DisclosurePanel
        title="Smart-wallet activity"
        description="Open only when you need to see who was buying or selling the names already on the board."
        badge={<span className="meta-chip">{formatInteger(events.length)} event{events.length === 1 ? "" : "s"}</span>}
      >
        <div className="flex flex-wrap gap-2">
          {events.length === 0 ? (
            <div className="text-sm text-text-secondary">No smart-wallet events for current mints.</div>
          ) : (
            events.map((event) => (
              <Link
                key={event.id}
                href={`/market/token/${event.mint}` as Route}
                prefetch={false}
                className="rounded border border-bg-border bg-bg-hover/30 px-2 py-1 text-xs text-text-secondary hover:text-text-primary"
              >
                <span className="font-medium text-text-primary">{event.walletLabel ?? shortMint(event.walletAddress)}</span>
                {" · "}
                {event.side}
                {" · "}
                {formatCompactCurrency(event.amountUsd)}
                {" · "}
                {shortMint(event.mint, 4)}
              </Link>
            ))
          )}
        </div>
      </DisclosurePanel>
    </div>
  );
}
