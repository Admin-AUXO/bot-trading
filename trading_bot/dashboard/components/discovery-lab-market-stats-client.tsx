"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  RefreshCcw,
  Search,
  TrendingUp,
  Clock,
  ShieldCheck,
  Flame,
  Star,
  LayoutGrid,
  List,
} from "lucide-react";
import {
  CompactPageHeader,
  CompactStatGrid,
  EmptyState,
  Panel,
  StatusPill,
} from "@/components/dashboard-primitives";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchJson } from "@/lib/api";
import { discoveryLabRoutes } from "@/lib/dashboard-routes";
import {
  formatCompactCurrency,
  formatInteger,
  formatMinutesAgo,
  formatPercent,
  formatRelativeMinutes,
  formatTimestamp,
} from "@/lib/format";
import type {
  DiscoveryLabMarketStatsPayload,
  DiscoveryLabMarketTokenRow,
} from "@/lib/types";

type ViewMode = "trending" | "newgrads" | "watchlist";
type DisplayMode = "grid" | "list";

export function DiscoveryLabMarketStatsClient(props: {
  initialPayload: DiscoveryLabMarketStatsPayload;
}) {
  const [payload, setPayload] = useState(props.initialPayload);
  const [focusMintInput, setFocusMintInput] = useState("");
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"board" | "focus" | null>(
    null
  );
  const [isPending, startTransition] = useTransition();
  const [viewMode, setViewMode] = useState<ViewMode>("trending");
  const [displayMode, setDisplayMode] = useState<DisplayMode>("grid");
  const [watchlist, setWatchlist] = useState<Set<string>>(() => {
    try {
      const stored = window.localStorage.getItem("market-watchlist");
      return stored ? new Set(JSON.parse(stored)) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  });
  const [watchlistTab, setWatchlistTab] = useState(false);

  const refreshBoard = () => {
    startTransition(async () => {
      setPendingAction("board");
      try {
        const nextPayload = await fetchJson<DiscoveryLabMarketStatsPayload>(
          "/operator/discovery-lab/market-stats?limit=24&refresh=true",
        );
        setPayload(nextPayload);
        setRefreshError(null);
      } catch (error) {
        setRefreshError(
          error instanceof Error
            ? error.message
            : "market snapshot refresh failed",
        );
      } finally {
        setPendingAction(null);
      }
    });
  };

  const refreshFocusToken = () => {
    const mint = focusMintInput.trim();
    if (!mint) {
      setRefreshError("mint is required for focus-token lookup");
      return;
    }
    startTransition(async () => {
      setPendingAction("focus");
      try {
        const nextPayload = await fetchJson<DiscoveryLabMarketStatsPayload>(
          `/operator/discovery-lab/market-stats?limit=24&refresh=true&focusOnly=true&mint=${encodeURIComponent(mint)}`,
        );
        setPayload(nextPayload);
        setRefreshError(null);
      } catch (error) {
        setRefreshError(
          error instanceof Error ? error.message : "focus-token refresh failed",
        );
      } finally {
        setPendingAction(null);
      }
    });
  };

  const toggleWatchlist = (mint: string) => {
    setWatchlist((prev) => {
      const next = new Set(prev);
      if (next.has(mint)) {
        next.delete(mint);
      } else {
        next.add(mint);
      }
      try {
        window.localStorage.setItem("market-watchlist", JSON.stringify([...next]));
      } catch {}
      return next;
    });
  };

  const hasBoardData = payload.tokens.length > 0;
  const boardStatus =
    payload.meta.cacheState === "empty"
      ? "snapshot empty"
      : payload.meta.cacheState;
  const boardMessage = refreshError ?? payload.meta.warnings[0] ?? null;

  // Sort tokens by view mode
  const sortedTokens = [...payload.tokens].sort((a, b) => {
    if (viewMode === "newgrads") {
      // Youngest grads first
      const ageA = a.graduationAgeMinutes ?? 999999;
      const ageB = b.graduationAgeMinutes ?? 999999;
      return ageA - ageB;
    }
    if (viewMode === "trending") {
      // Highest 5m change first
      const moveA = a.priceChange5mPercent ?? -999;
      const moveB = b.priceChange5mPercent ?? -999;
      return moveB - moveA;
    }
    // Default: watchlist ordering
    return 0;
  });

  // Watchlist-filtered tokens
  const watchlistTokens = payload.tokens.filter((t) => watchlist.has(t.mint));

  const displayedTokens = watchlistTab ? watchlistTokens : sortedTokens;

  const hasPositions = payload.marketPulse.trackedOpenPositions > 0;
  const advancingTone = payload.marketPulse.advancingSharePercent >= 60 ? "accent" : payload.marketPulse.advancingSharePercent >= 40 ? "warning" : "danger";

  return (
    <div className="space-y-5">
      <CompactPageHeader
        eyebrow="Market watch"
        title="Live market"
        badges={
          <>
            <StatusPill value={boardStatus} />
            <StatusPill value={payload.meta.refreshMode} />
            <StatusPill
              value={
                payload.meta.lastRefreshedAt
                  ? `updated ${formatMinutesAgo(payload.meta.lastRefreshedAt)}`
                  : "not refreshed"
              }
            />
          </>
        }
        actions={
          <>
            <Button
              onClick={refreshBoard}
              variant="ghost"
              size="sm"
              disabled={isPending}
              title="Refresh market board"
            >
              <RefreshCcw className={clsx("h-4 w-4", isPending && "animate-spin")} />
              {pendingAction === "board" ? "Refreshing" : "Refresh"}
            </Button>
            <Link
              href={discoveryLabRoutes.strategyIdeas}
              className={buttonVariants({ variant: "default", size: "sm" })}
            >
              Strategy ideas
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </>
        }
      >
        <CompactStatGrid
          className="xl:grid-cols-5"
          items={[
            {
              label: "Advancing",
              value: formatPercent(payload.marketPulse.advancingSharePercent),
              detail: "5m positive movers",
              tone: advancingTone,
            },
            {
              label: "Caution",
              value: formatPercent(payload.marketPulse.cautionSharePercent),
              detail: "Rug risk or weak structure",
              tone:
                payload.marketPulse.cautionSharePercent >= 50
                  ? "danger"
                  : "warning",
            },
            {
              label: "Median 5m",
              value: formatPercent(
                payload.marketPulse.medianPriceChange5mPercent,
              ),
              detail: "Snapshot breadth",
              tone:
                (payload.marketPulse.medianPriceChange5mPercent ?? 0) >= 0
                  ? "accent"
                  : "danger",
            },
            {
              label: "Median liquidity",
              value: formatCompactCurrency(
                payload.marketPulse.medianLiquidityUsd,
              ),
              detail: "Best DEX pair per token",
              tone: "default",
            },
            {
              label: "Open positions",
              value: formatInteger(payload.marketPulse.trackedOpenPositions),
              detail: hasPositions ? "In runtime book" : "No active positions",
              tone: hasPositions ? "warning" : "default",
            },
          ]}
        />
      </CompactPageHeader>

      {boardMessage ? (
        <WarningBanner
          message={boardMessage}
          tone={refreshError ? "danger" : "warning"}
        />
      ) : null}

      {/* Mint lookup */}
      <Panel
        title="Token lookup"
        eyebrow="Quick scan"
        description="Paste any Solana mint for a one-token refresh. Use sparingly — each lookup is a paid call."
        tone={payload.meta.cacheState === "degraded" ? "warning" : "default"}
      >
        <div className="flex items-center gap-3">
          <Input
            value={focusMintInput}
            onChange={(event) => setFocusMintInput(event.target.value)}
            placeholder="Paste a Solana mint address"
            className="h-11 flex-1 rounded-full"
          />
          <Button
            onClick={refreshFocusToken}
            className="h-11 rounded-full px-5"
            disabled={isPending}
          >
            <Search className="h-4 w-4" />
            {pendingAction === "focus" ? "Loading" : "Lookup"}
          </Button>
        </div>
      </Panel>

      {/* View mode tabs + display mode toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left: view mode tabs */}
        <div className="flex items-center gap-1.5 rounded-full border border-bg-border bg-[#101012] p-1">
          <ViewTab
            active={viewMode === "trending" && !watchlistTab}
            onClick={() => { setViewMode("trending"); setWatchlistTab(false); }}
            icon={<TrendingUp className="h-3.5 w-3.5" />}
            label="Trending"
          />
          <ViewTab
            active={viewMode === "newgrads" && !watchlistTab}
            onClick={() => { setViewMode("newgrads"); setWatchlistTab(false); }}
            icon={<Clock className="h-3.5 w-3.5" />}
            label="New grads"
          />
          <ViewTab
            active={watchlistTab}
            onClick={() => { setWatchlistTab(true); }}
            icon={<Star className="h-3.5 w-3.5" />}
            label={`Watchlist`}
            count={watchlist.size}
          />
        </div>

        {/* Right: display mode + source counts */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <span
              className={clsx(
                "rounded-full border px-2 py-0.5",
                `border-[rgba(96,165,250,0.25)] bg-[rgba(96,165,250,0.08)] text-[#93c5fd]`
              )}
            >
              {payload.sourceMix.birdeyeRecentCount + payload.sourceMix.birdeyeMomentumCount} Birdeye
            </span>
            <span
              className={clsx(
                "rounded-full border px-2 py-0.5",
                `border-[rgba(163,230,53,0.25)] bg-[rgba(163,230,53,0.08)] text-[var(--success)]`
              )}
            >
              {payload.sourceMix.rugcheckRecentCount + payload.sourceMix.rugcheckVerifiedCount} Rugcheck
            </span>
          </div>
          <div className="flex items-center gap-1 rounded-full border border-bg-border bg-[#101012] p-1">
            <button
              type="button"
              onClick={() => setDisplayMode("grid")}
              title="Grid view"
              className={clsx(
                "rounded-full p-1.5 transition",
                displayMode === "grid"
                  ? "bg-accent/15 text-accent"
                  : "text-text-muted hover:text-text-primary"
              )}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setDisplayMode("list")}
              title="List view"
              className={clsx(
                "rounded-full p-1.5 transition",
                displayMode === "list"
                  ? "bg-accent/15 text-accent"
                  : "text-text-muted hover:text-text-primary"
              )}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main board */}
      {hasBoardData ? (
        displayMode === "grid" ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {displayedTokens.map((token) => (
              <MarketCard
                key={token.mint}
                token={token}
                starred={watchlist.has(token.mint)}
                onToggleStar={() => toggleWatchlist(token.mint)}
              />
            ))}
          </div>
        ) : (
          <TokenListTable
            tokens={displayedTokens}
            watchlist={watchlist}
            onToggleWatchlist={toggleWatchlist}
          />
        )
      ) : (
        <EmptyState
          title="No market board cached"
          detail="Use Refresh to pull a new snapshot from Birdeye and Rugcheck. The board stays empty until you explicitly refresh."
          compact
        />
      )}

      {hasBoardData && displayedTokens.length === 0 && (
        <EmptyState
          title={watchlistTab ? "Watchlist is empty" : "No tokens in this view"}
          detail={watchlistTab ? "Star tokens from the board to add them to your watchlist." : "Try a different view mode or refresh the board."}
          compact
        />
      )}

      {/* Focus token */}
      {payload.focusToken && (
        <Panel
          title="Focus token"
          eyebrow="Single-token deep read"
          description="Loaded from a direct mint lookup. Shows full insight, rug check, and runtime position."
          tone="default"
        >
          <FocusTokenDetail payload={payload} />
        </Panel>
      )}
    </div>
  );
}

function ViewTab({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition",
        active
          ? "bg-[rgba(163,230,53,0.12)] text-accent"
          : "text-text-secondary hover:text-text-primary"
      )}
    >
      {icon}
      {label}
      {count !== undefined && count > 0 ? (
        <span
          className={clsx(
            "ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
            active
              ? "bg-accent/20 text-accent"
              : "bg-bg-hover text-text-muted"
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

function MarketCard({
  token,
  starred,
  onToggleStar,
}: {
  token: DiscoveryLabMarketTokenRow;
  starred: boolean;
  onToggleStar: () => void;
}) {
  const positiveMove = (token.priceChange5mPercent ?? 0) >= 0;
  const socialCount = token.socials.count;
  const isBirdeye = token.primarySignal.startsWith("birdeye");

  return (
    <div className="group relative rounded-[18px] border border-bg-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] p-4 transition hover:border-accent/20">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-base font-semibold text-text-primary">
              {token.symbol}
            </span>
            <InlineLabel
              value={isBirdeye ? "paid" : "free"}
              tone={isBirdeye ? "paid" : "free"}
            />
            {token.trackedPositionStatus === "OPEN" && (
              <InlineLabel value="tracked" tone="warning" />
            )}
          </div>
          <div className="mt-0.5 truncate text-xs text-text-secondary">
            {token.name}
          </div>
        </div>

        {/* Star button */}
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); onToggleStar(); }}
          title={starred ? "Remove from watchlist" : "Add to watchlist"}
          className={clsx(
            "rounded-full p-1.5 transition",
            starred
              ? "bg-accent/15 text-accent"
              : "bg-bg-hover/50 text-text-muted opacity-0 hover:bg-bg-hover group-hover:opacity-100"
          )}
        >
          <Star className={clsx("h-4 w-4", starred && "fill-current")} />
        </button>
      </div>

      {/* Price move */}
      <div className="mt-3 flex items-end justify-between">
        <div>
          <div
            className={clsx(
              "text-xl font-bold",
              positiveMove ? "text-[var(--success)]" : "text-[var(--danger)]"
            )}
          >
            {formatPercent(token.priceChange5mPercent)}
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-text-muted">
            5-minute move
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold text-text-primary">
            {formatCompactCurrency(token.liquidityUsd)}
          </div>
          <div className="mt-0.5 text-[10px] text-text-muted">
            MC {formatCompactCurrency(token.marketCapUsd)}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <MiniStat
          label="Holders"
          value={
            token.socials.count > 0
              ? String(socialCount)
              : "—"
          }
        />
        <MiniStat
          label="Vol 5m"
          value={formatCompactCurrency(token.volume5mUsd)}
        />
        <MiniStat
          label="B/S"
          value={token.buys5m != null && token.sells5m != null ? `${token.buys5m}/${token.sells5m}` : "—"}
          tone={
            token.buys5m != null && token.sells5m != null && token.buys5m > token.sells5m
              ? "success"
              : token.buys5m != null && token.sells5m != null
              ? "danger"
              : "default"
          }
        />
      </div>

      {/* Bottom meta */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <InlineLabel
          value={
            token.graduationAgeMinutes == null
              ? "age unknown"
              : formatRelativeMinutes(token.graduationAgeMinutes)
          }
          tone="neutral"
        />
        <InlineLabel
          value={
            token.lpLockedPercent != null
              ? `LP ${formatPercent(token.lpLockedPercent)}`
              : "no lp data"
          }
          tone="neutral"
        />
        <InlineLabel
          value={riskShort(token.rugRiskLevel)}
          tone={riskShortTone(token.rugRiskLevel)}
        />
      </div>

      {/* External links */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <MiniExternal href={token.toolLinks.dexscreener} label="DexScreener" />
        <MiniExternal href={token.toolLinks.rugcheck} label="Rugcheck" />
        <MiniExternal
          href={token.toolLinks.axiom}
          label={token.pairAddress ? "Axiom" : "Axiom mint"}
        />
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "danger" | "warning";
}) {
  const toneClass = {
    default: "text-text-primary",
    success: "text-[var(--success)]",
    danger: "text-[var(--danger)]",
    warning: "text-[var(--warning)]",
  }[tone];
  return (
    <div className="rounded-[10px] border border-bg-border bg-bg-hover/35 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-[0.12em] text-text-muted">
        {label}
      </div>
      <div className={clsx("mt-0.5 truncate text-sm font-semibold", toneClass)}>
        {value}
      </div>
    </div>
  );
}

function TokenListTable({
  tokens,
  watchlist,
  onToggleWatchlist,
}: {
  tokens: DiscoveryLabMarketTokenRow[];
  watchlist: Set<string>;
  onToggleWatchlist: (mint: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-[18px] border border-bg-border/80">
      <table className="w-full">
        <thead>
          <tr className="border-b border-bg-border bg-[#101012]">
            <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Token</th>
            <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">5m %</th>
            <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Liquidity</th>
            <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">MC</th>
            <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Vol 5m</th>
            <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">B/S</th>
            <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Age</th>
            <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Risk</th>
            <th className="px-3 py-2.5"></th>
          </tr>
        </thead>
        <tbody>
          {tokens.map((token) => {
            const positiveMove = (token.priceChange5mPercent ?? 0) >= 0;
            return (
              <tr
                key={token.mint}
                className="border-b border-bg-border/50 bg-[#101012] hover:bg-[#111113]"
              >
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-text-primary">{token.symbol}</span>
                    <InlineLabel value={token.primarySignal.startsWith("birdeye") ? "paid" : "free"} tone={token.primarySignal.startsWith("birdeye") ? "paid" : "free"} />
                    {token.trackedPositionStatus === "OPEN" && <InlineLabel value="tracked" tone="warning" />}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-text-secondary">{token.name}</div>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <span className={clsx("text-sm font-semibold", positiveMove ? "text-[var(--success)]" : "text-[var(--danger)]")}>
                    {formatPercent(token.priceChange5mPercent)}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right text-sm text-text-primary">
                  {formatCompactCurrency(token.liquidityUsd)}
                </td>
                <td className="px-3 py-2.5 text-right text-sm text-text-primary">
                  {formatCompactCurrency(token.marketCapUsd)}
                </td>
                <td className="px-3 py-2.5 text-right text-sm text-text-primary">
                  {formatCompactCurrency(token.volume5mUsd)}
                </td>
                <td className="px-3 py-2.5 text-right text-sm text-text-primary">
                  {token.buys5m != null && token.sells5m != null ? `${formatInteger(token.buys5m)}/${formatInteger(token.sells5m)}` : "—"}
                </td>
                <td className="px-3 py-2.5 text-right text-xs text-text-muted">
                  {token.graduationAgeMinutes != null ? formatRelativeMinutes(token.graduationAgeMinutes) : "—"}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <InlineLabel value={riskShort(token.rugRiskLevel)} tone={riskShortTone(token.rugRiskLevel)} />
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center justify-end gap-1">
                    <a href={token.toolLinks.dexscreener} target="_blank" rel="noreferrer" className="rounded-full border border-bg-border px-2 py-0.5 text-[10px] font-semibold text-text-muted hover:text-text-primary">Dex</a>
                    <a href={token.toolLinks.rugcheck} target="_blank" rel="noreferrer" className="rounded-full border border-bg-border px-2 py-0.5 text-[10px] font-semibold text-text-muted hover:text-text-primary">Rug</a>
                    <button
                      type="button"
                      onClick={() => onToggleWatchlist(token.mint)}
                      className={clsx("rounded-full p-1", watchlist.has(token.mint) ? "text-accent" : "text-text-muted hover:text-accent")}
                    >
                      <Star className={clsx("h-3.5 w-3.5", watchlist.has(token.mint) && "fill-current")} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FocusTokenDetail({ payload }: { payload: DiscoveryLabMarketStatsPayload }) {
  const ft = payload.focusToken;
  if (!ft) return null;

  const positiveMove = (ft.insight.market.priceChange5mPercent ?? 0) >= 0;
  const socialCount = [
    ft.insight.socials.website,
    ft.insight.socials.twitter,
    ft.insight.socials.telegram,
    ft.insight.socials.discord,
  ].filter(Boolean).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill value={ft.insight.symbol ?? ft.insight.mint.slice(0, 8)} />
        <StatusPill value={ft.trackedPositionStatus ?? "not tracked"} />
        <StatusPill value={ft.rugcheck?.topRiskLevel ?? "unknown"} />
        <StatusPill value={ft.insight.pairAddress ? "pair linked" : "mint fallback"} />
        {payload.meta.focusTokenCachedAt && (
          <StatusPill value={`cached ${formatMinutesAgo(payload.meta.focusTokenCachedAt)}`} />
        )}
      </div>

      {/* Key metrics */}
      <div className="grid gap-2 md:grid-cols-3">
        <MetricCard
          label="Liquidity"
          value={formatCompactCurrency(ft.insight.market.liquidityUsd)}
          detail={`MC ${formatCompactCurrency(ft.insight.market.marketCapUsd)}`}
          tone="accent"
        />
        <MetricCard
          label="5m move"
          value={formatPercent(ft.insight.market.priceChange5mPercent)}
          detail={`24h vol ${formatCompactCurrency(ft.insight.market.volume24hUsd)}`}
          tone={positiveMove ? "success" : "danger"}
        />
        <MetricCard
          label="Rug score"
          value={ft.rugcheck?.scoreNormalized != null ? String(ft.rugcheck.scoreNormalized) : "—"}
          detail={ft.rugcheck?.topRiskName ?? "No cached summary"}
          tone={riskTone(ft.rugcheck?.topRiskLevel ?? "unknown")}
        />
      </div>

      {/* Socials + pair age */}
      <div className="flex flex-wrap gap-2">
        <InlineLabel
          value={`Socials ${socialCount}`}
          tone={socialCount >= 2 ? "success" : "neutral"}
        />
        <InlineLabel
          value={
            ft.insight.pairCreatedAt
              ? `Pair ${formatMinutesAgo(ft.insight.pairCreatedAt)}`
              : "Pair age unknown"
          }
          tone="neutral"
        />
        <InlineLabel
          value={
            ft.insight.market.buy5m != null && ft.insight.market.sell5m != null
              ? `${formatInteger(ft.insight.market.buy5m)} buys / ${formatInteger(ft.insight.market.sell5m)} sells`
              : "No flow data"
          }
          tone="neutral"
        />
      </div>

      {/* Risk details */}
      {ft.rugcheck && ft.rugcheck.risks.length > 0 && (
        <div>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
            Rugcheck risks
          </div>
          <div className="space-y-1.5">
            {ft.rugcheck.risks.slice(0, 4).map((risk, i) => (
              <div
                key={i}
                className={clsx(
                  "flex items-center justify-between rounded-[10px] border px-3 py-2 text-xs",
                  risk.level === "danger"
                    ? "border-[rgba(251,113,133,0.25)] bg-[rgba(251,113,133,0.06)]"
                    : risk.level === "warning"
                    ? "border-[rgba(250,204,21,0.2)] bg-[rgba(250,204,21,0.05)]"
                    : "border-bg-border bg-bg-hover/35"
                )}
              >
                <span className="text-text-primary">{risk.name}</span>
                <span className="font-semibold text-text-muted">{risk.score ?? "—"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* External links */}
      <div className="flex flex-wrap gap-2">
        <ExternalChip href={ft.insight.toolLinks.axiom} label={ft.insight.pairAddress ? "Axiom pair" : "Axiom"} />
        <ExternalChip href={ft.insight.toolLinks.dexscreener} label="DexScreener" />
        <ExternalChip href={ft.insight.toolLinks.rugcheck} label="Rugcheck" />
        <ExternalChip href={ft.insight.toolLinks.solscanToken} label="Solscan" />
      </div>
    </div>
  );
}

function InlineLabel(props: {
  value: string;
  tone:
    | "paid"
    | "free"
    | "local"
    | "warning"
    | "danger"
    | "neutral"
    | "success";
}) {
  const toneClass = {
    paid: "border-[rgba(96,165,250,0.28)] bg-[rgba(96,165,250,0.12)] text-[#93c5fd]",
    free: "border-[rgba(163,230,53,0.26)] bg-[rgba(163,230,53,0.12)] text-[var(--success)]",
    local: "border-[rgba(255,255,255,0.1)] bg-white/[0.05] text-text-secondary",
    success:
      "border-[rgba(163,230,53,0.22)] bg-[rgba(163,230,53,0.08)] text-[var(--success)]",
    warning:
      "border-[rgba(250,204,21,0.24)] bg-[rgba(250,204,21,0.12)] text-[var(--warning)]",
    danger:
      "border-[rgba(251,113,133,0.24)] bg-[rgba(251,113,133,0.12)] text-[var(--danger)]",
    neutral: "border-[var(--line)] bg-white/[0.05] text-text-secondary",
  }[props.tone];
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]",
        toneClass
      )}
    >
      {props.value}
    </span>
  );
}

function MetricCard(props: {
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "accent" | "success" | "warning" | "danger";
}) {
  const toneClass = {
    default: "border-bg-border bg-bg-hover/25",
    accent: "border-[rgba(96,165,250,0.18)] bg-[rgba(96,165,250,0.08)]",
    success: "border-[rgba(163,230,53,0.18)] bg-[rgba(163,230,53,0.08)]",
    warning: "border-[rgba(250,204,21,0.18)] bg-[rgba(250,204,21,0.08)]",
    danger: "border-[rgba(251,113,133,0.18)] bg-[rgba(251,113,133,0.08)]",
  }[props.tone ?? "default"];
  return (
    <div className={clsx("rounded-[14px] border px-3 py-2.5", toneClass)}>
      <div className="text-[10px] uppercase tracking-[0.12em] text-text-muted">
        {props.label}
      </div>
      <div className="mt-1 text-sm font-bold text-text-primary">{props.value}</div>
      <div className="mt-1 text-xs text-text-secondary">{props.detail}</div>
    </div>
  );
}

function ExternalChip(props: { href: string; label: string }) {
  return (
    <a
      href={props.href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center justify-between rounded-[12px] border border-bg-border bg-bg-hover/35 px-3 py-2 text-xs font-semibold text-text-secondary transition hover:border-[rgba(255,255,255,0.12)] hover:text-text-primary"
    >
      {props.label}
      <ArrowUpRight className="ml-2 h-3.5 w-3.5" />
    </a>
  );
}

function MiniExternal(props: { href: string; label: string }) {
  return (
    <a
      href={props.href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center rounded-full border border-bg-border px-2 py-1 text-[11px] font-semibold text-text-muted transition hover:border-[rgba(255,255,255,0.12)] hover:text-text-primary"
    >
      {props.label}
    </a>
  );
}

function WarningBanner(props: {
  message: string;
  tone?: "danger" | "warning";
}) {
  const toneClass =
    props.tone === "danger"
      ? "border-[rgba(251,113,133,0.25)] bg-[rgba(251,113,133,0.08)] text-[var(--danger)]"
      : "border-[rgba(250,204,21,0.24)] bg-[rgba(250,204,21,0.08)] text-[var(--warning)]";
  return (
    <div className={clsx("rounded-[16px] border px-5 py-4 text-sm", toneClass)}>
      {props.message}
    </div>
  );
}

function riskShort(level: DiscoveryLabMarketTokenRow["rugRiskLevel"]) {
  if (level === "danger") return "danger";
  if (level === "warning") return "caution";
  if (level === "info") return "safe";
  return "unknown";
}

function riskShortTone(
  level: DiscoveryLabMarketTokenRow["rugRiskLevel"]
): "danger" | "warning" | "success" | "neutral" {
  if (level === "danger") return "danger";
  if (level === "warning") return "warning";
  if (level === "info") return "success";
  return "neutral";
}

function riskTone(
  level: "danger" | "warning" | "info" | "unknown"
): "default" | "warning" | "danger" | "success" {
  if (level === "danger") return "danger";
  if (level === "warning") return "warning";
  if (level === "info") return "success";
  return "default";
}

// Need clsx imported
function clsx(...args: (string | undefined | null | false)[]) {
  return args.filter(Boolean).join(" ");
}
