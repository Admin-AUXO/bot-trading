"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowUpRight, RefreshCcw, Search } from "lucide-react";
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
  formatCurrency,
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

export function DiscoveryLabMarketStatsClient(props: {
  initialPayload: DiscoveryLabMarketStatsPayload;
}) {
  const [payload, setPayload] = useState(props.initialPayload);
  const [focusMintInput, setFocusMintInput] = useState("");
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"board" | "focus" | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();

  const refreshBoard = () => {
    startTransition(async () => {
      setPendingAction("board");
      try {
        const nextPayload = await fetchJson<DiscoveryLabMarketStatsPayload>(
          "/operator/discovery-lab/market-stats?limit=18&refresh=true",
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
          `/operator/discovery-lab/market-stats?limit=18&refresh=true&focusOnly=true&mint=${encodeURIComponent(mint)}`,
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

  const hasBoardData = payload.tokens.length > 0;
  const boardStatus =
    payload.meta.cacheState === "empty"
      ? "snapshot empty"
      : payload.meta.cacheState;

  return (
    <div className="space-y-5">
      <CompactPageHeader
        eyebrow="Discovery lab"
        title="Market stats"
        description="Manual-refresh market board. Opening this page reads cache only, so paid provider units are only spent when you explicitly refresh."
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
              <RefreshCcw className="h-4 w-4" />
              {pendingAction === "board" ? "Refreshing" : "Refresh board"}
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
              label: "Advancing share",
              value: formatPercent(payload.marketPulse.advancingSharePercent),
              detail: "5m positive movers",
              tone: "accent",
            },
            {
              label: "Caution share",
              value: formatPercent(payload.marketPulse.cautionSharePercent),
              detail: "Danger rug read or weak structure",
              tone:
                payload.marketPulse.cautionSharePercent >= 50
                  ? "danger"
                  : "warning",
            },
            {
              label: "Median 5m move",
              value: formatPercent(
                payload.marketPulse.medianPriceChange5mPercent,
              ),
              detail: "Snapshot breadth pulse",
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
              label: "Tracked open positions",
              value: formatInteger(payload.marketPulse.trackedOpenPositions),
              detail: "Local runtime book",
              tone:
                payload.marketPulse.trackedOpenPositions > 0
                  ? "warning"
                  : "default",
            },
          ]}
        />
      </CompactPageHeader>

      {refreshError ? <WarningBanner message={refreshError} /> : null}
      {payload.meta.warnings.length > 0 ? (
        <WarningBanner
          message={payload.meta.warnings.join(" ")}
          tone="warning"
        />
      ) : null}

      <Panel
        title="Refresh controls"
        eyebrow="Manual spend"
        description="Only explicit refresh uses paid Birdeye units. DexScreener, Rugcheck, and runtime context stay free or local."
        tone={payload.meta.cacheState === "degraded" ? "warning" : "default"}
      >
        <div className="grid gap-4">
          <div className="rounded-[16px] border border-bg-border bg-bg-hover/35 p-3">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
              <Input
                value={focusMintInput}
                onChange={(event) => setFocusMintInput(event.target.value)}
                placeholder="Paste a Solana mint for one-token refresh"
                className="h-11 rounded-full"
              />
              <Button
                onClick={refreshFocusToken}
                className="h-11 rounded-full px-5"
                disabled={isPending}
              >
                <Search className="h-4 w-4" />
                {pendingAction === "focus" ? "Loading token" : "Load token"}
              </Button>
              <Button
                onClick={refreshBoard}
                variant="secondary"
                className="h-11 rounded-full px-5"
                disabled={isPending}
              >
                <RefreshCcw className="h-4 w-4" />
                Refresh board
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <InlineLabel value="Paid refresh: Birdeye" tone="paid" />
              <InlineLabel
                value="Free tape + risk: DexScreener / Rugcheck"
                tone="free"
              />
              <InlineLabel value="Local context: runtime book" tone="local" />
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            <SourceMixTile
              label="Birdeye recent"
              count={payload.sourceMix.birdeyeRecentCount}
              tier="paid"
              detail="Recent paid seed slice"
            />
            <SourceMixTile
              label="Birdeye momentum"
              count={payload.sourceMix.birdeyeMomentumCount}
              tier="paid"
              detail="Momentum paid seed slice"
            />
            <SourceMixTile
              label="Rugcheck recent"
              count={payload.sourceMix.rugcheckRecentCount}
              tier="free"
              detail="Recent free listings"
            />
            <SourceMixTile
              label="Rugcheck verified"
              count={payload.sourceMix.rugcheckVerifiedCount}
              tier="free"
              detail="Verified free names"
            />
          </div>
        </div>
      </Panel>

      <Panel
        title="Trending DEX board"
        eyebrow={hasBoardData ? "Primary surface" : "Empty but healthy"}
        description={
          hasBoardData
            ? "Cards are ordered for fast scan: freshness, structure, social backing, free security read, then execution links."
            : "No snapshot is cached yet. The page is healthy, but the board stays empty until you refresh it."
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <InlineLabel
              value={`${formatInteger(payload.tokens.length)} rows`}
              tone="neutral"
            />
            <InlineLabel
              value={
                payload.meta.lastRefreshedAt
                  ? formatTimestamp(payload.meta.lastRefreshedAt)
                  : "not refreshed"
              }
              tone="neutral"
            />
            <InlineLabel value="Paid seeds: Birdeye" tone="paid" />
          </div>
        }
      >
        {hasBoardData ? (
          <div className="grid gap-3 xl:grid-cols-2">
            {payload.tokens.map((token) => (
              <MarketTokenCard key={token.mint} token={token} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No market board cached yet"
            detail="The page is available. Use Refresh board only when you want to spend provider calls on a new snapshot."
          />
        )}
      </Panel>

      <Panel
        title="Focus token"
        eyebrow={payload.focusToken ? "Single-token read" : "Idle"}
        description="Use this only when the board is not enough and you need a one-mint refresh."
        tone={payload.focusToken ? "default" : "passive"}
      >
        {payload.focusToken ? (
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill
                value={
                  payload.focusToken.insight.symbol ??
                  payload.focusToken.insight.mint.slice(0, 8)
                }
              />
              <StatusPill
                value={
                  payload.focusToken.trackedPositionStatus ?? "not tracked"
                }
              />
              <StatusPill
                value={payload.focusToken.rugcheck?.topRiskLevel ?? "unknown"}
              />
              <StatusPill
                value={
                  payload.focusToken.insight.pairAddress
                    ? "pair linked"
                    : "mint fallback"
                }
              />
              <StatusPill
                value={
                  payload.meta.focusTokenCachedAt
                    ? `cached ${formatMinutesAgo(payload.meta.focusTokenCachedAt)}`
                    : "fresh"
                }
              />
            </div>

            <div className="grid gap-2 md:grid-cols-3">
              <MetricCard
                label="Liquidity"
                value={formatCompactCurrency(
                  payload.focusToken.insight.market.liquidityUsd,
                )}
                detail={`MC ${formatCompactCurrency(payload.focusToken.insight.market.marketCapUsd)}`}
                tone="accent"
              />
              <MetricCard
                label="5m move"
                value={formatPercent(
                  payload.focusToken.insight.market.priceChange5mPercent,
                )}
                detail={`24h vol ${formatCompactCurrency(payload.focusToken.insight.market.volume24hUsd)}`}
                tone={
                  (payload.focusToken.insight.market.priceChange5mPercent ??
                    0) >= 0
                    ? "success"
                    : "danger"
                }
              />
              <MetricCard
                label="Rug score"
                value={formatInteger(
                  payload.focusToken.rugcheck?.scoreNormalized,
                )}
                detail={
                  payload.focusToken.rugcheck?.topRiskName ??
                  "No cached summary"
                }
                tone={riskTone(
                  payload.focusToken.rugcheck?.topRiskLevel ?? "unknown",
                )}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <InlineLabel
                value={`Socials ${countInsightSocials(payload.focusToken.insight)}`}
                tone={
                  countInsightSocials(payload.focusToken.insight) >= 2
                    ? "success"
                    : "neutral"
                }
              />
              <InlineLabel
                value={
                  payload.focusToken.insight.pairCreatedAt
                    ? `Pair ${formatMinutesAgo(payload.focusToken.insight.pairCreatedAt)}`
                    : "Pair age unknown"
                }
                tone="neutral"
              />
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              <ExternalChip
                href={payload.focusToken.insight.toolLinks.axiom}
                label={
                  payload.focusToken.insight.pairAddress
                    ? "Axiom pair"
                    : "Axiom"
                }
              />
              <ExternalChip
                href={payload.focusToken.insight.toolLinks.dexscreener}
                label="DexScreener"
              />
              <ExternalChip
                href={payload.focusToken.insight.toolLinks.rugcheck}
                label="Rugcheck"
              />
              <ExternalChip
                href={payload.focusToken.insight.toolLinks.solscanToken}
                label="Solscan"
              />
            </div>
          </div>
        ) : payload.meta.focusMint ? (
          <EmptyState
            title={`No token detail for ${payload.meta.focusMint.slice(0, 8)}`}
            detail="The page stayed up, but this mint did not produce a usable response. Retry only if you need another paid one-token lookup."
          />
        ) : (
          <EmptyState
            title="No mint loaded"
            detail="Paste a mint and use Load token only when you need a fresh single-token read."
          />
        )}
      </Panel>
    </div>
  );
}

function MarketTokenCard(props: { token: DiscoveryLabMarketTokenRow }) {
  const { token } = props;
  const positiveMove = (token.priceChange5mPercent ?? 0) >= 0;
  const socialCount = token.socials.count;

  return (
    <div className="rounded-[18px] border border-bg-border bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-base font-semibold text-text-primary">
              {token.symbol}
            </div>
            <InlineLabel
              value={describeSeedSource(token)}
              tone={seedTone(token)}
            />
            <InlineLabel
              value={
                token.trackedPositionStatus === "OPEN"
                  ? "tracked live"
                  : "not tracked"
              }
              tone={
                token.trackedPositionStatus === "OPEN" ? "warning" : "neutral"
              }
            />
          </div>
          <div className="mt-1 truncate text-sm text-text-secondary">
            {token.name}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <InlineLabel
              value={
                token.graduationAgeMinutes == null
                  ? "age unknown"
                  : formatRelativeMinutes(token.graduationAgeMinutes)
              }
              tone="neutral"
            />
            <InlineLabel
              value={`socials ${socialCount}`}
              tone={
                socialCount >= 2
                  ? "success"
                  : socialCount === 1
                    ? "free"
                    : "neutral"
              }
            />
            <InlineLabel
              value={marketCapBand(token.marketCapUsd)}
              tone="local"
            />
          </div>
        </div>

        <div
          className={`rounded-full px-3 py-1 text-sm font-semibold ${positiveMove ? "bg-[rgba(163,230,53,0.14)] text-[var(--success)]" : "bg-[rgba(251,113,133,0.14)] text-[var(--danger)]"}`}
        >
          {formatPercent(token.priceChange5mPercent)}
        </div>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-3">
        <MetricCard
          label="Structure"
          value={formatCompactCurrency(token.liquidityUsd)}
          detail={`MC ${formatCompactCurrency(token.marketCapUsd)}`}
        />
        <MetricCard
          label="Flow"
          value={formatCompactCurrency(token.volume5mUsd)}
          detail={`${formatInteger(token.buys5m)} buys / ${formatInteger(token.sells5m)} sells`}
          tone="accent"
        />
        <MetricCard
          label="Risk"
          value={formatInteger(token.rugScoreNormalized)}
          detail={token.topRiskName ?? "No top risk"}
          tone={riskTone(token.rugRiskLevel)}
        />
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-[1fr_auto]">
        <div className="flex flex-wrap gap-2">
          {token.rugRiskLevel === "danger" ? (
            <InlineLabel value="free risk high" tone="danger" />
          ) : null}
          {token.rugRiskLevel === "warning" ? (
            <InlineLabel value="free risk caution" tone="warning" />
          ) : null}
          {(token.lpLockedPercent ?? 0) > 0 ? (
            <InlineLabel
              value={`lp ${formatPercent(token.lpLockedPercent)}`}
              tone="neutral"
            />
          ) : null}
          {!token.pairAddress ? (
            <InlineLabel value="mint fallback axiom" tone="warning" />
          ) : null}
        </div>

        <div className="flex flex-wrap justify-start gap-2 xl:justify-end">
          <MiniExternal href={token.toolLinks.dexscreener} label="Dex" />
          <MiniExternal href={token.toolLinks.rugcheck} label="Rug" />
          <MiniExternal
            href={token.toolLinks.axiom}
            label={token.pairAddress ? "Axiom pair" : "Axiom"}
          />
        </div>
      </div>
    </div>
  );
}

function countInsightSocials(
  payload: NonNullable<DiscoveryLabMarketStatsPayload["focusToken"]>["insight"],
) {
  return [
    payload.socials.website,
    payload.socials.twitter,
    payload.socials.telegram,
    payload.socials.discord,
  ].filter(Boolean).length;
}

function marketCapBand(value: number | null) {
  if (value === null) {
    return "cap unknown";
  }
  if (value < 400_000) {
    return "micro cap";
  }
  if (value < 1_000_000) {
    return "sub 1M";
  }
  if (value < 3_000_000) {
    return "1M to 3M";
  }
  return "3M+";
}

function SourceMixTile(props: {
  label: string;
  count: number;
  tier: "paid" | "free";
  detail: string;
}) {
  return (
    <div className="rounded-[14px] border border-bg-border bg-[#101112] p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-text-primary">
          {props.label}
        </div>
        <InlineLabel
          value={props.tier === "paid" ? "paid api" : "free api"}
          tone={props.tier}
        />
      </div>
      <div className="mt-2 text-[1.15rem] font-semibold text-text-primary">
        {formatInteger(props.count)}
      </div>
      <div className="mt-1 text-xs text-text-secondary">{props.detail}</div>
    </div>
  );
}

function SourceCard(props: {
  label: string;
  tier: "paid" | "free" | "local";
  detail: string;
}) {
  return (
    <div className="rounded-[14px] border border-bg-border bg-[#101112] p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-text-primary">
          {props.label}
        </div>
        <InlineLabel
          value={props.tier === "local" ? "local" : `${props.tier} api`}
          tone={props.tier}
        />
      </div>
      <div className="mt-2 text-xs leading-5 text-text-secondary">
        {props.detail}
      </div>
    </div>
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
    <div className={`rounded-[14px] border px-3 py-2.5 ${toneClass}`}>
      <div className="text-[10px] uppercase tracking-[0.12em] text-text-muted">
        {props.label}
      </div>
      <div className="mt-1 text-sm font-semibold text-text-primary">
        {props.value}
      </div>
      <div className="mt-1 text-xs text-text-secondary">{props.detail}</div>
    </div>
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
    <div className={`rounded-[16px] border px-5 py-4 text-sm ${toneClass}`}>
      {props.message}
    </div>
  );
}

function describeSeedSource(token: DiscoveryLabMarketTokenRow): string {
  return token.primarySignal.startsWith("birdeye") ? "paid seed" : "free seed";
}

function seedTone(token: DiscoveryLabMarketTokenRow): "paid" | "free" {
  return token.primarySignal.startsWith("birdeye") ? "paid" : "free";
}

function riskTone(
  level: DiscoveryLabMarketTokenRow["rugRiskLevel"],
): "default" | "warning" | "danger" | "success" {
  if (level === "danger") {
    return "danger";
  }
  if (level === "warning") {
    return "warning";
  }
  if (level === "info") {
    return "success";
  }
  return "default";
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
      className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${toneClass}`}
    >
      {props.value}
    </span>
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
      className="inline-flex items-center rounded-full border border-bg-border px-2.5 py-1 text-[11px] font-semibold text-text-secondary transition hover:border-[rgba(255,255,255,0.12)] hover:text-text-primary"
    >
      {props.label}
    </a>
  );
}
