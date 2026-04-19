"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Copy, ExternalLink, Pin, PinOff, RefreshCcw, ShieldAlert, Users } from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { CompactStatGrid, DisclosurePanel, EmptyState, InlineNotice, Panel, StatusPill } from "@/components/dashboard-primitives";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { NativeTable, type NativeTableColumn } from "@/components/ui/native-table";
import { fetchJson } from "@/lib/api";
import { marketRoutes } from "@/lib/dashboard-routes";
import { formatCompactCurrency, formatInteger, formatMinutesAgo, formatPercent, formatRelativeMinutes } from "@/lib/format";
import { buildDegradedMarketStatsPayload } from "@/lib/market-fallback";
import { MARKET_WATCHLIST_KEY, readMarketWatchlist, writeMarketWatchlist } from "@/lib/market-watchlist";
import type { DiscoveryLabMarketStatsPayload, SmartWalletActivityPayload } from "@/lib/types";
import { shortMint } from "@/lib/utils";

type MarketTrendingGridProps = {
  initialPayload: DiscoveryLabMarketStatsPayload;
  initialSmartWalletEvents: SmartWalletActivityPayload[];
  mode: "trending" | "watchlist";
};

type TrendingRow = DiscoveryLabMarketStatsPayload["tokens"][number];

function buildMarketEndpoint(mode: "trending" | "watchlist", watchlist: Set<string>, options?: { refresh?: boolean }): string | null {
  const params = new URLSearchParams({ limit: "50" });
  if (options?.refresh) {
    params.set("refresh", "true");
  }
  if (mode === "watchlist") {
    const scopedMints = [...watchlist].filter(Boolean).sort();
    if (scopedMints.length === 0) {
      return null;
    }
    params.set("scope", "watchlist");
    params.set("mints", scopedMints.join(","));
  }
  return `/operator/market/trending?${params.toString()}`;
}

export function MarketTrendingGrid(props: MarketTrendingGridProps) {
  const router = useRouter();
  const [payload, setPayload] = useState(props.initialPayload);
  const [events, setEvents] = useState(props.initialSmartWalletEvents);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [watchlist, setWatchlist] = useState<Set<string>>(new Set());

  const syncBoard = useEffectEvent(async (options?: { refresh?: boolean; nextWatchlist?: Set<string> }) => {
    const activeWatchlist = options?.nextWatchlist ?? watchlist;
    const endpoint = buildMarketEndpoint(props.mode, activeWatchlist, { refresh: options?.refresh });
    if (!endpoint) {
      setPayload(buildDegradedMarketStatsPayload(
        "No watchlist mints yet. Pin tokens from Trending to build a free watchlist board.",
        { scope: "watchlist", cacheState: "empty" },
      ));
      setEvents([]);
      setError(null);
      return;
    }

    setIsRefreshing(true);
    try {
      const next = await fetchJson<DiscoveryLabMarketStatsPayload>(endpoint);
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
    if (props.mode !== "trending") {
      return;
    }
    setPayload(props.initialPayload);
    setEvents(props.initialSmartWalletEvents);
    setError(null);
  }, [props.initialPayload, props.initialSmartWalletEvents, props.mode]);

  useEffect(() => {
    const sync = () => {
      const next = readMarketWatchlist();
      setWatchlist(next);
      if (props.mode === "watchlist") {
        void syncBoard({ nextWatchlist: next });
      }
    };
    sync();
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [props.mode]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (props.mode === "watchlist" && watchlist.size === 0) {
        return;
      }
      void syncBoard();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [props.mode, watchlist]);

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
      if (props.mode === "watchlist") {
        void syncBoard({ nextWatchlist: next });
      }
      return next;
    });
  };

  const openTokenDetail = (mint: string) => {
    void router.push(`${marketRoutes.tokenByMintPrefix}/${encodeURIComponent(mint)}` as Route);
  };

  const columns = useMemo<Array<NativeTableColumn<TrendingRow>>>(() => [
    {
      id: "symbol",
      header: "Symbol",
      render: (row) => (
        <div className="min-w-[8rem]">
          <div className="font-medium text-text-primary">{row.symbol || "—"}</div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-text-muted">
            {watchlist.has(row.mint) ? <Pin className="h-3 w-3 text-[var(--accent)]" /> : null}
            <span>{shortMint(row.mint, 5)}</span>
          </div>
        </div>
      ),
    },
    {
      id: "mint",
      header: "Mint",
      render: (row) => (
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary"
          onClick={() => void navigator.clipboard.writeText(row.mint)}
          title={row.mint}
        >
          {shortMint(row.mint, 5)}
          <Copy className="h-3 w-3" />
        </button>
      ),
    },
    {
      id: "age",
      header: "Age",
      align: "center",
      render: (row) => <MetricCell value={formatRelativeMinutes(row.graduationAgeMinutes)} tone="default" />,
    },
    {
      id: "mc",
      header: "MC",
      align: "center",
      render: (row) => <MetricCell value={formatCompactCurrency(row.marketCapUsd)} tone="default" />,
    },
    {
      id: "liq",
      header: "Liq",
      align: "center",
      render: (row) => <MetricCell value={formatCompactCurrency(row.liquidityUsd)} tone="accent" />,
    },
    {
      id: "buyers5m",
      header: "Buyers5m",
      align: "center",
      render: (row) => <MetricCell value={formatInteger(row.buys5m)} tone="default" />,
    },
    {
      id: "bsRatio",
      header: "B/S",
      align: "center",
      render: (row) => {
        if (!row.buys5m || !row.sells5m) return "—";
        const ratio = row.buys5m / row.sells5m;
        return <MetricCell value={`${ratio.toFixed(2)}x`} tone={ratio >= 1.2 ? "accent" : ratio < 1 ? "warning" : "default"} />;
      },
    },
    {
      id: "rug",
      header: "Rug",
      align: "center",
      render: (row) => <MetricCell value={formatInteger(row.rugScoreNormalized)} tone={Number(row.rugScoreNormalized) >= 70 ? "warning" : "default"} />,
    },
    {
      id: "smart",
      header: (
        <Tooltip.Provider delayDuration={120}>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <span className="cursor-default">Smart1h</span>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                className="z-50 overflow-hidden rounded-md border border-bg-border bg-[--bg-secondary] px-3 py-1.5 text-xs shadow-xl"
                sideOffset={5}
              >
                Smart wallet events in last hour
                <Tooltip.Arrow className="fill-[#111214]" />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        </Tooltip.Provider>
      ),
      align: "center",
      render: (row) => <MetricCell value={formatInteger(smartHitsByMint.get(row.mint) ?? 0)} tone={(smartHitsByMint.get(row.mint) ?? 0) > 0 ? "accent" : "default"} />,
    },
    {
      id: "actions",
      header: "Actions",
      widthClassName: "min-w-[12rem]",
      render: (row) => {
        const isPinned = watchlist.has(row.mint);
        return (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded border border-bg-border px-2 py-1 text-[11px] font-medium text-text-secondary hover:text-text-primary"
              onClick={() => toggleWatchlist(row.mint)}
            >
              {isPinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
              {isPinned ? "Unpin" : "Pin"}
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded border border-bg-border px-2 py-1 text-[11px] font-medium text-text-secondary hover:text-text-primary"
              onClick={() => openTokenDetail(row.mint)}
            >
              <Users className="h-3 w-3" />
              Token
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded border border-bg-border px-2 py-1 text-[11px] font-medium text-text-secondary hover:text-text-primary"
              onClick={() => window.open(row.toolLinks.dexscreener, "_blank", "noopener,noreferrer")}
            >
              <ExternalLink className="h-3 w-3" />
              Dex
            </button>
          </div>
        );
      },
    },
  ], [openTokenDetail, smartHitsByMint, watchlist]);

  const status = error ?? payload.meta.warnings[0] ?? null;
  const marketUnavailable = payload.meta.cacheState === "degraded";
  const paidSeedCount = payload.sourceMix.birdeyeRecentCount + payload.sourceMix.birdeyeMomentumCount;
  const freeSeedCount = payload.sourceMix.rugcheckRecentCount + payload.sourceMix.rugcheckVerifiedCount;
  const scopeLabel = payload.meta.scope === "watchlist" ? "free watchlist" : "paid-seeded board";
  const sourceLegend = payload.meta.sources;

  return (
    <div className="space-y-4">
      <div className="workbench-controls">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <StatusPill value={props.mode === "watchlist" ? "watchlist" : "market scan"} />
          <StatusPill value={scopeLabel} />
          <StatusPill value={marketUnavailable ? "degraded" : "live"} />
          <span className="text-xs text-text-secondary">
            {props.mode === "watchlist"
              ? "Pinned names only. This route stays on the lighter watchlist contract."
              : "Refresh only when you need a paid seed pull from the market board."}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {sourceLegend.map((source) => (
            <span key={source.key} className="meta-chip cursor-pointer" title={source.detail}>{source.label} · {source.tier}</span>
          ))}
          <Link
            href={(props.mode === "watchlist" ? marketRoutes.trending : marketRoutes.watchlist) as Route}
            prefetch={false}
            className="rounded border border-bg-border px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary"
          >
            {props.mode === "watchlist" ? "Open trending" : "Open watchlist"}
          </Link>
          <Button type="button" variant="ghost" size="sm" onClick={() => void syncBoard({ refresh: true })} disabled={isRefreshing}>
            <RefreshCcw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
            {isRefreshing ? "Refreshing" : props.mode === "watchlist" ? "Refresh watchlist" : "Refresh board"}
          </Button>
        </div>
      </div>

      <CompactStatGrid
        className="xl:grid-cols-3 lg:grid-cols-2"
        items={[
          {
            label: "Universe",
            value: formatInteger(payload.tokenUniverseSize),
            detail: "Tracked tokens",
          },
          {
            label: "Visible",
            value: formatInteger(rows.length),
            detail: props.mode === "watchlist" ? "Pinned subset" : "Current board",
          },
          {
            label: "Pinned",
            value: formatInteger(watchlist.size),
            detail: "Browser-local list",
          },
          {
            label: "Smart hits",
            value: formatInteger(events.length),
            detail: latestEventAge ? `Last ${formatMinutesAgo(latestEventAge)}` : "No recent event",
            tone: events.length > 0 ? "accent" : "default",
          },
          {
            label: props.mode === "watchlist" ? "Watchlist seeds" : "Paid seeds",
            value: formatInteger(props.mode === "watchlist" ? payload.sourceMix.watchlistCount : paidSeedCount),
            detail: props.mode === "watchlist" ? "Local seed path" : "Birdeye seeded rows",
            tone: props.mode === "watchlist" ? "default" : paidSeedCount > 0 ? "warning" : "default",
          },
          {
            label: "Coverage",
            value: `${formatInteger(payload.providerCoverage.dexscreenerPairCount)} / ${formatInteger(payload.providerCoverage.rugcheckSummaryCount)}`,
            detail: `Dex / Rugcheck · free ${formatInteger(freeSeedCount)}`,
            tone: payload.providerCoverage.dexscreenerPairCount > 0 ? "accent" : "default",
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

      <InlineNotice tone={props.mode === "watchlist" ? "accent" : "default"} className="text-xs">
        <div className="flex flex-wrap items-center gap-2">
          {props.mode === "watchlist" ? <Pin className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
          <span>
            {props.mode === "watchlist"
              ? "Watchlist stays on the lighter local-pin contract first. Open token detail only for names that still hold up here."
              : "Trending is the paid seed board. Pin conviction names first, then move to watchlist or token detail for deeper review."}
          </span>
        </div>
      </InlineNotice>

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
                ? "Pin mints from the trending board first. This page will then load them on the lighter watchlist contract."
                : "No rows returned by /market/trending."
          }
          compact
        />
      ) : (
        <NativeTable
          rows={rows}
          columns={columns}
          rowKey={(row) => row.mint}
          maxHeightClassName="max-h-[46rem]"
        />
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
                href={`${marketRoutes.tokenByMintPrefix}/${encodeURIComponent(event.mint)}` as Route}
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

function MetricCell(props: { value: string; tone?: "default" | "accent" | "warning" }) {
  const toneClass = props.tone === "accent"
    ? "text-[var(--success)]"
    : props.tone === "warning"
      ? "text-[var(--warning)]"
      : "text-text-primary";

  return <span className={cn("inline-flex min-w-[4.9rem] justify-center rounded-[10px] px-2 py-1 text-[12px] font-semibold tabular-nums", toneClass)}>{props.value}</span>;
}
