import { Suspense } from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  ExternalLink,
  ShieldCheck,
  ShieldX,
} from "lucide-react";
import {
  CompactPageHeader,
  CompactStatGrid,
  InlineNotice,
  Panel,
  StatusPill,
} from "@/components/dashboard-primitives";
import { CopyButton } from "@/components/copy-button";
import { MarketTokenActions } from "@/components/market-token-actions";
import { TokenRefreshButton } from "@/components/token-refresh-button";
import { serverFetch } from "@/lib/server-api";
import {
  formatCompactCurrency,
  formatInteger,
  formatPercent,
  formatRelativeMinutes,
  formatTimestamp,
} from "@/lib/format";
import type {
  DiscoveryLabTokenInsight,
  EnrichmentSourceState,
  MarketTokenStatsPayload,
} from "@/lib/types";
import { shortMint } from "@/lib/utils";
import { marketRoutes } from "@/lib/dashboard-routes";
import { cn } from "@/components/ui/cn";

export const dynamic = "force-dynamic";

type TokenEnrichmentPayload = DiscoveryLabTokenInsight;

export default async function MarketTokenPage({
  params,
}: {
  params: Promise<{ mint: string }>;
}) {
  const { mint } = await params;
  const [enrichment, stats] = await Promise.all([
    safeFetch<TokenEnrichmentPayload>(`/api/operator/enrichment/${encodeURIComponent(mint)}`),
    safeFetch<MarketTokenStatsPayload>(`/api/operator/market/stats/${encodeURIComponent(mint)}`),
  ]);

  if (!enrichment.data && !stats.data) {
    return (
      <EmptyState
        title="Token detail unavailable"
        detail={enrichment.error ?? stats.error ?? "No token payload available."}
      />
    );
  }

  const insight = enrichment.data;
  const symbol = insight?.symbol ?? shortMint(mint, 5);
  const birdeyeHref = `https://birdeye.so/token/${mint}?chain=solana`;
  const dexscreenerHref =
    insight?.toolLinks.dexscreener ?? `https://dexscreener.com/solana/${mint}`;
  const solscanHref =
    insight?.toolLinks.solscanToken ?? `https://solscan.io/token/${mint}`;

  const priceChange24h = insight?.market.priceChange24hPercent;
  const isPriceUp = priceChange24h !== null && priceChange24h !== undefined && priceChange24h >= 0;

  return (
    <div className="space-y-4">
      <CompactPageHeader
        eyebrow="Market intel"
        title={symbol}
        description={insight?.name ?? shortMint(mint, 6)}
        badges={
          <>
            <StatusPill
              value={
                stats.data?.ageMinutes != null
                  ? `${formatRelativeMinutes(stats.data.ageMinutes)} since grad`
                  : "age unknown"
              }
            />
            <StatusPill
              value={
                insight?.compositeScore != null
                  ? `score ${Math.round(insight.compositeScore * 100)}`
                  : "score pending"
              }
            />
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Link
              href={marketRoutes.trending as Route}
              className="btn-ghost inline-flex items-center gap-1.5 border border-bg-border px-2.5 py-1.5"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Back to trending</span>
              <span className="sm:hidden">Back</span>
            </Link>
            <CopyButton value={mint} label="Copy mint" />
            <MarketTokenActions mint={mint} birdeyeHref={birdeyeHref} />
            <TokenRefreshButton />
          </div>
        }
      >
        <CompactStatGrid
          className="grid-cols-2 sm:grid-cols-3 xl:grid-cols-6"
          items={[
            {
              label: "Price",
              value: formatCompactCurrency(insight?.market.priceUsd ?? null),
              detail: priceChange24h !== null
                ? `${isPriceUp ? "+" : ""}${formatPercent(priceChange24h)} 24h`
                : undefined,
              tooltip: "Spot price with 24h change.",
              tone: priceChange24h !== null ? (isPriceUp ? "accent" : "danger") : "default",
            },
            {
              label: "MC",
              value: formatCompactCurrency(stats.data?.mc ?? insight?.market.marketCapUsd ?? null),
              detail: `FDV ${formatCompactCurrency(insight?.market.fdvUsd ?? null)}`,
              tooltip: "Market cap.",
            },
            {
              label: "Liq",
              value: formatCompactCurrency(stats.data?.liq ?? insight?.market.liquidityUsd ?? null),
              detail: `Holders ${formatInteger(insight?.market.holders ?? null)}`,
              tooltip: "Current liquidity.",
            },
            {
              label: "Buys 5m",
              value: formatInteger(stats.data?.buyers5m ?? null),
              detail: `${formatInteger(stats.data?.sellCount5m ?? null)} sells`,
              tooltip: "Recent buy and sell counts over the last five minutes.",
            },
            {
              label: "Score",
              value:
                insight?.compositeScore != null
                  ? `${Math.round(insight.compositeScore * 100)}`
                  : "—",
              detail: stats.data?.rugScore != null ? `Rug ${formatInteger(stats.data.rugScore)}` : undefined,
              tooltip: "Composite score across enrichment providers.",
              tone:
                insight?.compositeScore == null
                  ? "default"
                  : insight.compositeScore >= 0.7
                    ? "accent"
                    : insight.compositeScore >= 0.4
                      ? "warning"
                      : "danger",
            },
            {
              label: "Security",
              value: insight?.security.mintAuthorityEnabled ? "Authority on" : "Authority off",
              detail: insight?.security.freezeable ? "Freeze on" : "Freeze off",
              tooltip: "Mint authority and freeze authority status.",
              tone:
                insight?.security.mintAuthorityEnabled || insight?.security.freezeable
                  ? "warning"
                  : "accent",
            },
          ]}
        />
      </CompactPageHeader>

{enrichment.error || stats.error ? (
        <InlineNotice tone="warning">{enrichment.error ?? stats.error}</InlineNotice>
      ) : null}

      <nav className="sticky top-[calc(var(--shell-header-height)+0.5rem)] z-10 -mt-2 mb-2 flex gap-1 overflow-x-auto pb-2 scrollbar-hide">
        <a href="#token-identity" className="inline-flex items-center rounded-lg border border-[var(--line)] bg-[var(--bg-secondary)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] no-underline transition-all hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">Identity</a>
        <a href="#security" className="inline-flex items-center rounded-lg border border-[var(--line)] bg-[var(--bg-secondary)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] no-underline transition-all hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">Security</a>
        <a href="#creator-lineage" className="inline-flex items-center rounded-lg border border-[var(--line)] bg-[var(--bg-secondary)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] no-underline transition-all hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">Creator</a>
        <a href="#market-stats" className="inline-flex items-center rounded-lg border border-[var(--line)] bg-[var(--bg-secondary)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] no-underline transition-all hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">Market</a>
        <a href="#enrichment" className="inline-flex items-center rounded-lg border border-[var(--line)] bg-[var(--bg-secondary)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] no-underline transition-all hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">Enrichment</a>
      </nav>

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Panel id="token-identity" title="Token identity" eyebrow="Overview">
              <div className="space-y-2.5 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill value={symbol} />
                  <StatusPill
                    value={
                      insight?.providers?.jupiter.data?.strict
                        ? "strict-listed"
                        : "strict unknown"
                    }
                  />
                  <StatusPill
                    value={insight?.providers?.jupiter.data?.verified ? "verified" : "unverified"}
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[11px] text-text-muted" title={mint}>
                    {shortMint(mint, 6)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-3 text-xs">
                  <a
                    href={solscanHref}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-text-secondary hover:text-text-primary"
                  >
                    <ExternalLink className="h-3 w-3" /> Solscan
                  </a>
                  <a
                    href={birdeyeHref}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-text-secondary hover:text-text-primary"
                  >
                    <ExternalLink className="h-3 w-3" /> Birdeye
                  </a>
                  <a
                    href={dexscreenerHref}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-text-secondary hover:text-text-primary"
                  >
                    <ExternalLink className="h-3 w-3" /> DexScreener
                  </a>
                </div>
              </div>
            </Panel>

            <Panel id="security" title="Security posture" eyebrow="Authority flags">
              <div className="flex flex-wrap gap-2">
                <SecurityBadge
                  label="Mint auth"
                  active={!!insight?.security.mintAuthorityEnabled}
                />
                <SecurityBadge
                  label="Freeze"
                  active={!!insight?.security.freezeable}
                />
                <SecurityBadge
                  label="Mutable meta"
                  active={!!insight?.security.mutableMetadata}
                />
                <SecurityBadge
                  label="Token-2022"
                  active={!!insight?.security.token2022}
                />
                <SecurityBadge
                  label="Honeypot"
                  active={!!insight?.security.honeypot}
                  invert
                />
                <SecurityBadge
                  label="Fake token"
                  active={!!insight?.security.fakeToken}
                  invert
                />
              </div>
            </Panel>
          </div>

          {insight?.creatorLineage ? (
            <Panel id="creator-lineage" title="Creator lineage" eyebrow="Funding and launch history">
              <div className="space-y-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill value={insight.creatorLineage.fundingSource ?? "unknown"} />
                  <StatusPill
                    value={
                      insight.creatorLineage.tokenCount24h != null
                        ? `${insight.creatorLineage.tokenCount24h} launches 24h`
                        : "launch rate unknown"
                    }
                  />
                  {insight.creatorLineage.rugRate != null && (
                    <StatusPill
                      value={`${formatPercent(insight.creatorLineage.rugRate * 100)} rug`}
                    />
                  )}
                </div>
                <div className="text-xs text-text-secondary">
                  Creator{" "}
                  <span className="font-mono text-text-primary">
                    {shortMint(insight.creatorLineage.creatorAddress, 4)}
                  </span>
                  {insight.creatorLineage.lastSampledAt && (
                    <>
                      {" · "}Last sampled {formatTimestamp(insight.creatorLineage.lastSampledAt)}
                    </>
                  )}
                </div>
              </div>
            </Panel>
          ) : null}

          <Panel id="market-stats" title="Market stats" eyebrow="Backend metrics">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
              <MarketStatRow label="MC" value={formatCompactCurrency(stats.data?.mc ?? null)} />
              <MarketStatRow
                label="Liq"
                value={formatCompactCurrency(stats.data?.liq ?? null)}
              />
              <MarketStatRow
                label="Price 24h"
                value={formatCompactCurrency(stats.data?.price24h ?? null)}
              />
              <MarketStatRow
                label="Buys 5m"
                value={formatInteger(stats.data?.buyers5m ?? null)}
              />
              <MarketStatRow
                label="Sells 5m"
                value={formatInteger(stats.data?.sellCount5m ?? null)}
              />
              <MarketStatRow
                label="RugScore"
                value={formatInteger(stats.data?.rugScore ?? null)}
                tone={
                  stats.data?.rugScore != null && stats.data.rugScore >= 70 ? "warning" : undefined
                }
              />
            </div>
          </Panel>

          <div id="enrichment" className="rounded-[14px] border border-bg-border bg-bg-secondary/50 p-3">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="section-kicker">Enrichment</p>
                <h2 className="mt-1 font-display text-[0.93rem] font-semibold tracking-[-0.02em] text-text-primary">
                  Provider evidence
                </h2>
              </div>
              <p className="text-xs text-text-muted">
                Open when the summary above is not enough.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <Suspense fallback={<LoadingCard title="Bundle (Trench)" />}>
                <TrenchCard mint={mint} />
              </Suspense>
              <Suspense fallback={<LoadingCard title="Cluster (Bubblemaps)" />}>
                <BubblemapsCard mint={mint} />
              </Suspense>
              <Suspense fallback={<LoadingCard title="Security (Solsniffer)" />}>
                <SolsnifferCard mint={mint} />
              </Suspense>
              <Suspense fallback={<LoadingCard title="Pools (GeckoTerminal)" />}>
                <GeckoPoolsCard mint={mint} />
              </Suspense>
              <Suspense fallback={<LoadingCard title="Pump.fun origin" />}>
                <PumpfunCard mint={mint} />
              </Suspense>
              <Suspense fallback={<LoadingCard title="Smart money (Cielo)" />}>
                <CieloCard mint={mint} />
              </Suspense>
            </div>
          </div>
        </div>

        <div className="hidden lg:block">
          <div className="sticky top-[calc(var(--shell-header-height)+1rem)] space-y-4">
            <div className="rounded-[14px] border border-bg-border bg-bg-secondary/70 p-3">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="section-kicker">Quick actions</p>
                  <h2 className="mt-1 font-display text-[0.93rem] font-semibold tracking-[-0.02em] text-text-primary">
                    Token actions
                  </h2>
                </div>
              </div>
              <MarketTokenActions
                mint={mint}
                birdeyeHref={`https://birdeye.so/token/${mint}?chain=solana`}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SecurityBadge(props: { label: string; active: boolean; invert?: boolean }) {
  const isRisky = props.invert ? props.active : !props.active;
  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-[0.1em] ${
        isRisky
          ? "border-[rgba(251,113,133,0.26)] bg-[rgba(251,113,133,0.12)] text-[var(--danger)]"
          : "border-[rgba(163,230,53,0.26)] bg-[rgba(163,230,53,0.12)] text-[var(--success)]"
      }`}
    >
      {isRisky ? (
        <ShieldX className="h-3 w-3 shrink-0" />
      ) : (
        <ShieldCheck className="h-3 w-3 shrink-0" />
      )}
      {props.label}
    </div>
  );
}

function MarketStatRow(props: {
  label: string;
  value: string;
  tone?: "accent" | "warning" | "danger" | "default";
}) {
  const toneClass =
    props.tone === "warning"
      ? "text-[var(--warning)]"
      : props.tone === "danger"
        ? "text-[var(--danger)]"
        : props.tone === "accent"
          ? "text-[var(--success)]"
          : "text-text-primary";
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-text-secondary">{props.label}</span>
      <span className={`font-medium ${toneClass}`}>{props.value}</span>
    </div>
  );
}

async function TrenchCard(props: { mint: string }) {
  const state = await fetchSourceState("trench", props.mint);
  if (!state?.data) {
    return <UnavailableCard title="Bundle (Trench)" state={state} defaultReason="Trench unavailable" />;
  }

  const bundlePct = toPercent(state.data.bundleSupplyPct);
  const hasHighBundle = bundlePct !== null && bundlePct > 15;
  const hasDevBundle = state.data.devBundle;
  const sniperCount = state.data.sniperCount ?? 0;
  const hasManySnipers = sniperCount > 3;

  return (
    <Panel
      title="Bundle"
      eyebrow={sourceEyebrow(state)}
      tone={hasHighBundle || hasDevBundle ? "warning" : undefined}
      className="text-sm"
    >
      <div className="space-y-2">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-[10px] border border-bg-border bg-bg-hover/40 px-2 py-1.5 text-center">
            <div className="text-[10px] text-text-secondary">Bundle</div>
            <div
              className={`text-base font-bold ${hasHighBundle ? "text-[var(--warning)]" : "text-text-primary"}`}
            >
              {formatPercent(bundlePct)}
            </div>
          </div>
          <div className="rounded-[10px] border border-bg-border bg-bg-hover/40 px-2 py-1.5 text-center">
            <div className="text-[10px] text-text-secondary">Snipers</div>
            <div
              className={`text-base font-bold ${hasManySnipers ? "text-[var(--danger)]" : "text-text-primary"}`}
            >
              {formatInteger(sniperCount)}
            </div>
          </div>
          <div className="rounded-[10px] border border-bg-border bg-bg-hover/40 px-2 py-1.5 text-center">
            <div className="text-[10px] text-text-secondary">Dev</div>
            <div
              className={`text-base font-bold ${hasDevBundle ? "text-[var(--danger)]" : "text-[var(--success)]"}`}
            >
              {hasDevBundle ? "Yes" : "No"}
            </div>
          </div>
        </div>

        {(hasHighBundle || hasDevBundle || hasManySnipers) && (
          <div className="space-y-1 rounded-[10px] border border-[rgba(250,204,21,0.24)] bg-[rgba(250,204,21,0.08)] px-2.5 py-2 text-xs text-[var(--warning)]">
            {hasHighBundle && <div>• High bundle: {formatPercent(bundlePct)} in bundles</div>}
            {hasDevBundle && <div>• Dev wallet has an active bundle</div>}
            {hasManySnipers && <div>• Unusual sniper wallets detected</div>}
          </div>
        )}

        {state.data.bundles.length > 0 && (
          <div className="space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              Top Bundles
            </div>
            {state.data.bundles.slice(0, 2).map((bundle) => (
              <div
                key={bundle.wallet}
                className="flex items-center justify-between rounded-[8px] border border-bg-border/60 bg-bg-hover/30 px-2.5 py-1.5 text-xs"
              >
                <span className="font-mono text-text-secondary">{shortMint(bundle.wallet, 4)}</span>
                <div className="flex gap-3 text-[10px]">
                  <span>
                    Held: <span className="text-text-primary">{formatPercent(toPercent(bundle.holdingPct))}</span>
                  </span>
                  <span>
                    Sold: <span className="text-text-primary">{formatPercent(toPercent(bundle.soldPct))}</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}

async function BubblemapsCard(props: { mint: string }) {
  const state = await fetchSourceState("bubblemaps", props.mint);
  if (!state?.data) {
    return (
      <UnavailableCard
        title="Cluster (Bubblemaps)"
        state={state}
        defaultReason="Bubblemaps unavailable"
      />
    );
  }

  const topClusterPct = toPercent(state.data.topClusterPct);
  const isRisky = state.data.topClusterPct != null && state.data.topClusterPct > 0.2;
  const isVeryRisky = state.data.topClusterPct != null && state.data.topClusterPct > 0.4;
  const tone = isRisky ? "warning" : "default";

  return (
    <Panel title="Cluster" eyebrow={sourceEyebrow(state)} tone={tone} className="text-sm">
      <div className="space-y-2">
        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-xs text-text-secondary">Top Cluster</span>
            <span
              className={`text-base font-bold ${isVeryRisky ? "text-[var(--danger)]" : isRisky ? "text-[var(--warning)]" : "text-text-primary"}`}
            >
              {topClusterPct !== null ? formatPercent(topClusterPct) : "—"}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-bg-border">
            <div
              className={`h-full rounded-full transition-all ${isVeryRisky ? "bg-[var(--danger)]" : isRisky ? "bg-[var(--warning)]" : "bg-[var(--success)]"}`}
              style={{ width: topClusterPct !== null ? `${Math.min(100, topClusterPct)}%` : "0%" }}
            />
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-text-muted">
            <span>Distributed</span>
            <span>Concentrated</span>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-[10px] border border-bg-border px-2.5 py-1.5">
          <span className="text-xs text-text-secondary">Cluster Count</span>
          <span className="text-sm font-bold text-text-primary">
            {formatInteger(state.data.clusterCount)}
          </span>
        </div>

        {isRisky && (
          <div
            className={`rounded-[10px] border px-2.5 py-2 text-xs ${isVeryRisky ? "border-[rgba(251,113,133,0.3)] bg-[rgba(251,113,133,0.1)] text-[var(--danger)]" : "border-[rgba(250,204,21,0.24)] bg-[rgba(250,204,21,0.08)] text-[var(--warning)]"}`}
          >
            <div className="font-semibold">
              {isVeryRisky ? "Critical: Severe concentration" : "Warning: High holder concentration"}
            </div>
            {!isVeryRisky && (
              <div className="mt-0.5">{topClusterPct} of supply in one cluster</div>
            )}
          </div>
        )}

        {!isRisky && topClusterPct !== null && (
          <div className="rounded-[8px] border border-[rgba(163,230,53,0.3)] bg-[rgba(163,230,53,0.08)] px-2.5 py-1.5 text-xs text-[var(--success)]">
            Holder distribution looks healthy
          </div>
        )}

        {state.data.clusters.length > 0 && (
          <div className="space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              Top Clusters
            </div>
            {state.data.clusters.slice(0, 2).map((cluster) => (
              <div
                key={cluster.id}
                className="flex items-center justify-between rounded-[8px] border border-bg-border/60 bg-bg-hover/30 px-2.5 py-1.5 text-xs"
              >
                <span className="truncate font-medium text-text-secondary">{cluster.id}</span>
                <span className="text-text-primary">
                  {formatPercent(toPercent(cluster.supplyPct))}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}

async function SolsnifferCard(props: { mint: string }) {
  const state = await fetchSourceState("solsniffer", props.mint);
  if (!state?.data) {
    return (
      <UnavailableCard
        title="Security (Solsniffer)"
        state={state}
        defaultReason="Solsniffer unavailable"
      />
    );
  }

  const score = state.data.score;
  const scoreTone =
    score !== null
      ? score >= 70
        ? "accent"
        : score >= 40
          ? "warning"
          : "danger"
      : "default";

  return (
    <Panel title="Security" eyebrow={sourceEyebrow(state)} className="text-sm">
      <div className="space-y-2">
        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-xs text-text-secondary">Score</span>
            <span
              className={`text-base font-bold ${scoreTone === "accent" ? "text-[var(--success)]" : scoreTone === "warning" ? "text-[var(--warning)]" : "text-[var(--danger)]"}`}
            >
              {score !== null ? score : "—"}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-bg-border">
            <div
              className={`h-full rounded-full transition-all ${scoreTone === "accent" ? "bg-[var(--success)]" : scoreTone === "warning" ? "bg-[var(--warning)]" : "bg-[var(--danger)]"}`}
              style={{ width: score !== null ? `${Math.min(100, score)}%` : "0%" }}
            />
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-text-muted">
            <span>Risky</span>
            <span>Safe</span>
          </div>
        </div>
        {state.data.topFlags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {state.data.topFlags.map((flag, i) => (
              <span
                key={i}
                className="inline-flex items-center rounded-full border border-[rgba(251,113,133,0.3)] bg-[rgba(251,113,133,0.1)] px-2 py-0.5 text-[10px] font-medium text-[var(--danger)]"
              >
                {flag}
              </span>
            ))}
          </div>
        )}
        {state.data.topFlags.length === 0 && score !== null && score >= 70 && (
          <div className="rounded-[8px] border border-[rgba(163,230,53,0.3)] bg-[rgba(163,230,53,0.08)] px-2.5 py-1.5 text-xs text-[var(--success)]">
            No major risk flags detected
          </div>
        )}
      </div>
    </Panel>
  );
}

async function GeckoPoolsCard(props: { mint: string }) {
  const state = await fetchSourceState("geckoterminal", props.mint);
  if (!state?.data) {
    return (
      <UnavailableCard
        title="Pools (GeckoTerminal)"
        state={state}
        defaultReason="GeckoTerminal unavailable"
      />
    );
  }

  const pools = state.data.pools;
  const totalLiquidity = pools.reduce((sum, pool) => sum + (pool.liquidityUsd ?? 0), 0);
  const primaryPool = pools[0];

  return (
    <Panel title="Pools" eyebrow={sourceEyebrow(state)} className="text-sm">
      <div className="space-y-2">
        <div className="flex items-center justify-between rounded-[10px] border border-bg-border px-2.5 py-1.5">
          <span className="text-xs text-text-secondary">Total Liquidity</span>
          <span className="text-sm font-bold text-text-primary">
            {formatCompactCurrency(totalLiquidity)}
          </span>
        </div>

        <div className="flex items-center justify-between rounded-[10px] border border-bg-border px-2.5 py-1.5">
          <span className="text-xs text-text-secondary">Pool Count</span>
          <span className="text-sm font-bold text-text-primary">{formatInteger(pools.length)}</span>
        </div>

        {primaryPool && (
          <div className="space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              Primary Pool
            </div>
            <div className="rounded-[10px] border border-[rgba(163,230,53,0.2)] bg-[rgba(163,230,53,0.05)] px-2.5 py-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-text-primary">
                  {primaryPool.dexName ?? shortMint(primaryPool.address, 4)}
                </span>
                <span className="text-sm font-bold text-[var(--success)]">
                  {formatCompactCurrency(primaryPool.liquidityUsd)}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-text-secondary">
                <span>
                  {primaryPool.createdAt
                    ? `Created ${formatTimestamp(primaryPool.createdAt)}`
                    : "Age unknown"}
                </span>
                {primaryPool.feeBps && <span>Fee: {primaryPool.feeBps / 100}%</span>}
              </div>
            </div>
          </div>
        )}

        {pools.length > 1 && (
          <div className="space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              Other Pools
            </div>
            <div className="space-y-1 text-xs">
              {pools.slice(1, 3).map((pool) => (
                <div
                  key={pool.address}
                  className="flex items-center justify-between rounded-[8px] border border-bg-border/60 bg-bg-hover/30 px-2.5 py-1.5"
                >
                  <span className="truncate font-mono text-text-secondary">
                    {pool.dexName ?? shortMint(pool.address, 4)}
                  </span>
                  <div className="flex gap-3 text-[10px]">
                    <span className="text-text-secondary">
                      {pool.createdAt ? formatTimestamp(pool.createdAt) : "—"}
                    </span>
                    <span className="text-text-primary">
                      {formatCompactCurrency(pool.liquidityUsd)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}

async function CieloCard(props: { mint: string }) {
  const state = await fetchSourceState("cielo", props.mint);
  if (!state?.data) {
    return (
      <UnavailableCard
        title="Smart money (Cielo)"
        state={state}
        defaultReason="Cielo unavailable"
      />
    );
  }

  const isNetPositive = (state.data.netFlowUsd24h ?? 0) >= 0;

  return (
    <Panel title="Smart money" eyebrow={sourceEyebrow(state)} className="text-sm">
      <div className="space-y-2">
        <div className="flex items-center justify-between rounded-[10px] border border-bg-border px-2.5 py-1.5">
          <span className="text-xs text-text-secondary">Net 24h</span>
          <span className={`text-sm font-bold ${isNetPositive ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
            {formatCompactCurrency(state.data.netFlowUsd24h)}
          </span>
        </div>
        <div className="flex items-center justify-between rounded-[10px] border border-bg-border px-2.5 py-1.5">
          <span className="text-xs text-text-secondary">Buys / Sells 24h</span>
          <span className="text-sm font-bold text-text-primary">
            {formatInteger(state.data.buys24h)} / {formatInteger(state.data.sells24h)}
          </span>
        </div>
        <div className="space-y-1 text-xs text-text-secondary">
          {state.data.events.slice(0, 2).map((event) => (
            <div key={`${event.wallet}-${event.occurredAt ?? "none"}`}>
              {shortMint(event.wallet, 4)} · {(event.side ?? "unknown").toUpperCase()} ·{" "}
              {formatCompactCurrency(event.amountUsd)}
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

async function PumpfunCard(props: { mint: string }) {
  const state = await fetchSourceState("pumpfun", props.mint);
  if (!state?.data) {
    return (
      <UnavailableCard title="Pump.fun origin" state={state} defaultReason="Pump.fun unavailable" />
    );
  }

  const isGraduated = !!state.data.graduatedAt;
  const kothMinutes = secondsToMinutes(state.data.kothDurationSeconds);

  return (
    <Panel
      title="Pump.fun"
      eyebrow={sourceEyebrow(state)}
      tone={isGraduated ? "passive" : undefined}
      className="text-sm"
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between rounded-[10px] border border-bg-border px-2.5 py-1.5">
          <div className="flex items-center gap-2">
            <div
              className={`h-2 w-2 rounded-full ${isGraduated ? "bg-[var(--success)]" : "bg-[var(--warning)]"}`}
            />
            <span className="text-xs font-medium text-text-secondary">Graduation</span>
          </div>
          <span
            className={`text-sm font-bold ${isGraduated ? "text-[var(--success)]" : "text-[var(--warning)]"}`}
          >
            {isGraduated ? "Graduated" : "In BC"}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-[10px] border border-bg-border bg-bg-hover/40 px-2.5 py-1.5 text-center">
            <div className="text-[10px] text-text-secondary">KOTH</div>
            <div className="text-base font-bold text-text-primary">
              {kothMinutes !== null ? `${kothMinutes.toFixed(0)}m` : "—"}
            </div>
          </div>
          <div className="rounded-[10px] border border-bg-border bg-bg-hover/40 px-2.5 py-1.5 text-center">
            <div className="text-[10px] text-text-secondary">Replies</div>
            <div className="text-base font-bold text-text-primary">
              {formatInteger(state.data.replyCount)}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-[10px] border border-bg-border px-2.5 py-1.5">
          <span className="text-xs text-text-secondary">Initial Buy (SOL)</span>
          <span className="text-sm font-bold text-text-primary">
            {state.data.initialBuySol != null ? `${state.data.initialBuySol.toFixed(3)}` : "—"}
          </span>
        </div>

        {isGraduated && state.data.graduatedAt && (
          <div className="text-xs text-text-secondary">
            Graduated {formatTimestamp(state.data.graduatedAt)}
          </div>
        )}

        {!isGraduated && (
          <div className="rounded-[8px] border border-[rgba(250,204,21,0.2)] bg-[rgba(250,204,21,0.06)] px-2.5 py-1.5 text-xs text-[var(--warning)]">
            Still in bonding curve phase on Pump.fun
          </div>
        )}
      </div>
    </Panel>
  );
}

function LoadingCard(props: { title: string }) {
  return (
    <div className="rounded-[14px] border border-bg-border p-3">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        {props.title}
      </div>
      <div className="h-16 animate-pulse rounded bg-bg-hover/40" />
    </div>
  );
}

function UnavailableCard<T>(props: {
  title: string;
  state: EnrichmentSourceState<T> | null;
  defaultReason: string;
}) {
  const reason = props.state?.error
    ? `${props.defaultReason} — ${describeStaleness(props.state)}`
    : props.defaultReason;

  return (
    <Panel title={props.title} eyebrow={props.state ? sourceEyebrow(props.state) : "Unavailable"}>
      <div className="flex items-center gap-2 text-sm text-text-secondary">
        <CircleAlert className="h-4 w-4 shrink-0 text-text-muted" />
        <span className="text-xs">{reason}</span>
      </div>
    </Panel>
  );
}

async function fetchSourceState<
  K extends keyof NonNullable<TokenEnrichmentPayload["providers"]>,
>(key: K, mint: string): Promise<NonNullable<TokenEnrichmentPayload["providers"]>[K] | null> {
  const result = await safeFetch<TokenEnrichmentPayload>(
    `/api/operator/enrichment/${encodeURIComponent(mint)}`,
  );
  if (!result.data?.providers) {
    return null;
  }
  return result.data.providers[key] ?? null;
}

function sourceEyebrow<T>(state: EnrichmentSourceState<T>): string {
  if (state.status === "stale") {
    return `Stale · ${formatRelativeMinutes(state.staleMinutes ?? null)}`;
  }
  if (state.status === "fresh") {
    return "Fresh";
  }
  if (state.status === "error") {
    return "Unavailable";
  }
  return "Empty";
}

function describeStaleness<T>(state: EnrichmentSourceState<T>): string {
  if (state.status === "stale") {
    return `${state.error ?? "provider stale"} — ${formatRelativeMinutes(state.staleMinutes ?? null)} stale`;
  }
  return state.error ?? "provider unavailable";
}

function toPercent(value: number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  return value * 100;
}

function secondsToMinutes(value: number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  return value / 60;
}

async function safeFetch<T>(path: string): Promise<{ data: T | null; error: string | null }> {
  try {
    const data = await serverFetch<T>(path);
    return { data, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : "request failed" };
  }
}

function EmptyState(props: { title: string; detail: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-bg-border bg-bg-hover text-text-muted">
        <CircleAlert className="h-4 w-4" />
      </div>
      <div className="text-sm font-medium text-text-secondary">{props.title}</div>
      <div className="mt-1 max-w-xs text-xs text-text-muted">{props.detail}</div>
    </div>
  );
}
