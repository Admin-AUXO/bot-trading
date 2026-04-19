import { Suspense } from "react";
import {
  CompactPageHeader,
  CompactStatGrid,
  DisclosurePanel,
  EmptyState,
  InlineNotice,
  Panel,
  StatusPill,
} from "@/components/dashboard-primitives";
import { CopyButton } from "@/components/copy-button";
import { MarketTokenActions } from "@/components/market-token-actions";
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
    return <EmptyState title="Token detail unavailable" detail={enrichment.error ?? stats.error ?? "No token payload available."} />;
  }

  const insight = enrichment.data;
  const symbol = insight?.symbol ?? shortMint(mint, 5);
  const birdeyeHref = `https://birdeye.so/token/${mint}?chain=solana`;
  const dexscreenerHref = insight?.toolLinks.dexscreener ?? `https://dexscreener.com/solana/${mint}`;
  const solscanHref = insight?.toolLinks.solscanToken ?? `https://solscan.io/token/${mint}`;

  return (
    <div className="space-y-5">
      <CompactPageHeader
        eyebrow="Market intel"
        title={`${symbol} token detail`}
        description="Setup summary first. Provider evidence only when the summary is not enough."
        badges={(
          <>
            <StatusPill value={stats.data?.ageMinutes != null ? `${formatRelativeMinutes(stats.data.ageMinutes)} since grad` : "age unknown"} />
            <StatusPill value={insight?.compositeScore != null ? `score ${Math.round(insight.compositeScore * 100)}` : "score pending"} />
          </>
        )}
        actions={(
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <CopyButton value={mint} label="Copy mint" />
              <MarketTokenActions mint={mint} birdeyeHref={birdeyeHref} />
            </div>
          )}
      >
        <CompactStatGrid
          className="xl:grid-cols-5"
          items={[
            {
              label: "Price",
              value: formatCompactCurrency(insight?.market.priceUsd ?? null),
              detail: `MC ${formatCompactCurrency(stats.data?.mc ?? insight?.market.marketCapUsd ?? null)}`,
              tooltip: "Spot price with current market cap.",
            },
            {
              label: "Liquidity",
              value: formatCompactCurrency(stats.data?.liq ?? insight?.market.liquidityUsd ?? null),
              detail: `Holders ${formatInteger(insight?.market.holders ?? null)}`,
              tooltip: "Current liquidity with latest holder count.",
            },
            {
              label: "Flow 5m",
              value: `${formatInteger(stats.data?.buyers5m ?? null)} / ${formatInteger(stats.data?.sellCount5m ?? null)}`,
              detail: "Buys / sells",
              tooltip: "Recent buy and sell counts over the last five minutes.",
            },
            {
              label: "Security",
              value: insight?.security.mintAuthorityEnabled ? "Authority on" : "Authority off",
              detail: insight?.security.freezeable ? "Freeze enabled" : "Freeze disabled",
              tooltip: "Whether mint authority or freeze authority is still enabled.",
              tone: insight?.security.mintAuthorityEnabled || insight?.security.freezeable ? "warning" : "accent",
            },
            {
              label: "Composite",
              value: insight?.compositeScore != null ? `${Math.round(insight.compositeScore * 100)}` : "Pending",
              detail: stats.data?.rugScore != null ? `RugScore ${formatInteger(stats.data.rugScore)}` : "No rug score",
              tooltip: "Cache-backed composite read across enrichment providers plus RugScore when present.",
            },
          ]}
        />
      </CompactPageHeader>

      {enrichment.error || stats.error ? (
        <InlineNotice tone="warning">
          {enrichment.error ?? stats.error}
        </InlineNotice>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(19rem,0.85fr)]">
        <div className="space-y-4">
          <Panel title="Identity" eyebrow="Token overview">
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill value={symbol} />
                <StatusPill value={insight?.providers?.jupiter.data?.strict ? "strict-listed" : "strict unknown"} />
                <StatusPill value={insight?.providers?.jupiter.data?.verified ? "verified" : "unverified"} />
              </div>
              <div className="font-mono text-xs text-text-secondary break-all">{mint}</div>
              <div className="flex flex-wrap gap-2 text-xs">
                <a href={solscanHref} target="_blank" rel="noreferrer" className="text-text-secondary hover:text-text-primary">Solscan</a>
                <a href={birdeyeHref} target="_blank" rel="noreferrer" className="text-text-secondary hover:text-text-primary">Birdeye</a>
                <a href={dexscreenerHref} target="_blank" rel="noreferrer" className="text-text-secondary hover:text-text-primary">DexScreener</a>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 text-xs text-text-secondary">
                <div>Price: <span className="text-text-primary">{formatCompactCurrency(insight?.market.priceUsd ?? null)}</span></div>
                <div>MC: <span className="text-text-primary">{formatCompactCurrency(stats.data?.mc ?? insight?.market.marketCapUsd ?? null)}</span></div>
                <div>Liq: <span className="text-text-primary">{formatCompactCurrency(stats.data?.liq ?? insight?.market.liquidityUsd ?? null)}</span></div>
                <div>Holders: <span className="text-text-primary">{formatInteger(insight?.market.holders ?? null)}</span></div>
              </div>
            </div>
          </Panel>

          <Panel title="Creator lineage" eyebrow="Funding and launch history">
            {insight?.creatorLineage ? (
              <div className="space-y-2 text-sm">
                <div className="flex flex-wrap gap-2">
                  <StatusPill value={insight.creatorLineage.fundingSource ?? "unknown"} />
                  <StatusPill value={insight.creatorLineage.tokenCount24h != null ? `${insight.creatorLineage.tokenCount24h} launches 24h` : "launch rate unknown"} />
                </div>
                <div className="text-text-secondary">
                  Creator {shortMint(insight.creatorLineage.creatorAddress, 4)} · rug rate {formatPercent(
                    insight.creatorLineage.rugRate != null ? insight.creatorLineage.rugRate * 100 : null,
                  )}
                </div>
                <div className="text-xs text-text-muted">
                  Last sampled {formatTimestamp(insight.creatorLineage.lastSampledAt)}
                </div>
              </div>
            ) : (
              <div className="text-sm text-text-secondary">Creator lineage unavailable in current cache.</div>
            )}
          </Panel>

          <Panel title="Mint and authority flags" eyebrow="Security posture">
            <div className="flex flex-wrap gap-2 text-xs">
              <StatusPill value={insight?.security.mintAuthorityEnabled ? "mint authority enabled" : "mint authority disabled"} />
              <StatusPill value={insight?.security.freezeable ? "freeze enabled" : "freeze disabled"} />
              <StatusPill value={insight?.security.mutableMetadata ? "metadata mutable" : "metadata immutable"} />
              <StatusPill value={insight?.security.token2022 ? "token-2022" : "legacy token"} />
            </div>
          </Panel>

          <Panel title="Market stats" eyebrow="Composed backend stats">
            <div className="grid gap-2 sm:grid-cols-2 text-sm">
              <div>Price24h: <span className="text-text-primary">{formatCompactCurrency(stats.data?.price24h ?? null)}</span></div>
              <div>MC: <span className="text-text-primary">{formatCompactCurrency(stats.data?.mc ?? null)}</span></div>
              <div>Liq: <span className="text-text-primary">{formatCompactCurrency(stats.data?.liq ?? null)}</span></div>
              <div>Buyers5m: <span className="text-text-primary">{formatInteger(stats.data?.buyers5m ?? null)}</span></div>
              <div>Sells5m: <span className="text-text-primary">{formatInteger(stats.data?.sellCount5m ?? null)}</span></div>
              <div>RugScore: <span className="text-text-primary">{formatInteger(stats.data?.rugScore ?? null)}</span></div>
            </div>
          </Panel>

          <Suspense fallback={<LoadingPanel title="Price panel" />}>
            <PricePanel mint={mint} />
          </Suspense>
        </div>

        <DisclosurePanel
          title="Provider evidence"
          description="Secondary provider-specific checks. Open when the summary above is not enough to make the call."
          className="h-fit lg:sticky lg:top-[calc(var(--shell-header-height)+1rem)]"
        >
          <div className="space-y-4">
            <Suspense fallback={<LoadingPanel title="Bundle (Trench)" />}>
              <TrenchCard mint={mint} />
            </Suspense>
            <Suspense fallback={<LoadingPanel title="Cluster (Bubblemaps)" />}>
              <BubblemapsCard mint={mint} />
            </Suspense>
            <Suspense fallback={<LoadingPanel title="Security (Solsniffer)" />}>
              <SolsnifferCard mint={mint} />
            </Suspense>
            <Suspense fallback={<LoadingPanel title="Pools (GeckoTerminal)" />}>
              <GeckoPoolsCard mint={mint} />
            </Suspense>
            <Suspense fallback={<LoadingPanel title="Smart money (Cielo)" />}>
              <CieloCard mint={mint} />
            </Suspense>
            <Suspense fallback={<LoadingPanel title="Pump.fun origin" />}>
              <PumpfunCard mint={mint} />
            </Suspense>
          </div>
        </DisclosurePanel>
      </div>
    </div>
  );
}

async function TrenchCard(props: { mint: string }) {
  const state = await fetchSourceState("trench", props.mint);
  if (!state?.data) {
    return <UnavailableCard title="Bundle (Trench)" state={state} defaultReason="Trench unavailable" />;
  }

  return (
    <Panel title="Bundle (Trench)" eyebrow={sourceEyebrow(state)}>
      <div className="space-y-2 text-sm">
        <div>Bundle pct: <span className="text-text-primary">{formatPercent(toPercent(state.data.bundleSupplyPct))}</span></div>
        <div>Snipers: <span className="text-text-primary">{formatInteger(state.data.sniperCount)}</span></div>
        <div>Dev bundle: <span className="text-text-primary">{state.data.devBundle ? "yes" : "no"}</span></div>
        <div className="space-y-1 text-xs text-text-secondary">
          {state.data.bundles.slice(0, 3).map((bundle) => (
            <div key={bundle.wallet}>
              {shortMint(bundle.wallet, 4)} · hold {formatPercent(toPercent(bundle.holdingPct))} · sold {formatPercent(toPercent(bundle.soldPct))}
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

async function BubblemapsCard(props: { mint: string }) {
  const state = await fetchSourceState("bubblemaps", props.mint);
  if (!state?.data) {
    return <UnavailableCard title="Cluster (Bubblemaps)" state={state} defaultReason="Bubblemaps unavailable" />;
  }

  const tone = state.data.topClusterPct != null && state.data.topClusterPct > 0.2 ? "warning" : "default";
  return (
    <Panel title="Cluster (Bubblemaps)" eyebrow={sourceEyebrow(state)} tone={tone}>
      <div className="space-y-2 text-sm">
        <div>Top cluster: <span className="text-text-primary">{formatPercent(toPercent(state.data.topClusterPct))}</span></div>
        <div>Clusters: <span className="text-text-primary">{formatInteger(state.data.clusterCount)}</span></div>
        {state.data.topClusterPct != null && state.data.topClusterPct > 0.2 ? (
          <div className="rounded-[10px] border border-[rgba(250,204,21,0.24)] bg-[rgba(250,204,21,0.08)] px-3 py-2 text-xs text-[var(--warning)]">
            One cluster controls more than 20% of supply.
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

async function SolsnifferCard(props: { mint: string }) {
  const state = await fetchSourceState("solsniffer", props.mint);
  if (!state?.data) {
    return <UnavailableCard title="Security (Solsniffer)" state={state} defaultReason="Solsniffer unavailable" />;
  }

  return (
    <Panel title="Security (Solsniffer)" eyebrow={sourceEyebrow(state)}>
      <div className="space-y-2 text-sm">
        <div>Score: <span className="text-text-primary">{formatInteger(state.data.score)}</span></div>
        <div className="text-xs text-text-secondary">
          {state.data.topFlags.length > 0 ? state.data.topFlags.join(" · ") : "No major flags in provider payload."}
        </div>
      </div>
    </Panel>
  );
}

async function GeckoPoolsCard(props: { mint: string }) {
  const state = await fetchSourceState("geckoterminal", props.mint);
  if (!state?.data) {
    return <UnavailableCard title="Pools (GeckoTerminal)" state={state} defaultReason="GeckoTerminal unavailable" />;
  }

  return (
    <Panel title="Pools (GeckoTerminal)" eyebrow={sourceEyebrow(state)}>
      <div className="space-y-2 text-xs text-text-secondary">
        {state.data.pools.slice(0, 4).map((pool) => (
          <div key={pool.address} className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
            <span className="truncate text-text-primary">{pool.dexName ?? shortMint(pool.address, 4)}</span>
            <span>{pool.createdAt ? formatTimestamp(pool.createdAt) : "age unknown"}</span>
            <span>{formatCompactCurrency(pool.liquidityUsd)}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

async function CieloCard(props: { mint: string }) {
  const state = await fetchSourceState("cielo", props.mint);
  if (!state?.data) {
    return <UnavailableCard title="Smart money (Cielo)" state={state} defaultReason="Cielo unavailable" />;
  }

  return (
    <Panel title="Smart money (Cielo)" eyebrow={sourceEyebrow(state)}>
      <div className="space-y-2 text-sm">
        <div>Net 24h: <span className="text-text-primary">{formatCompactCurrency(state.data.netFlowUsd24h)}</span></div>
        <div>Buys / sells: <span className="text-text-primary">{formatInteger(state.data.buys24h)} / {formatInteger(state.data.sells24h)}</span></div>
        <div className="space-y-1 text-xs text-text-secondary">
          {state.data.events.slice(0, 3).map((event) => (
            <div key={`${event.wallet}-${event.occurredAt ?? "none"}`}>
              {shortMint(event.wallet, 4)} · {(event.side ?? "unknown").toUpperCase()} · {formatCompactCurrency(event.amountUsd)}
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
    return <UnavailableCard title="Pump.fun origin" state={state} defaultReason="Pump.fun unavailable" />;
  }

  return (
    <Panel title="Pump.fun origin" eyebrow={sourceEyebrow(state)}>
      <div className="space-y-2 text-sm">
        <div>Grad timestamp: <span className="text-text-primary">{formatTimestamp(state.data.graduatedAt)}</span></div>
        <div>KOTH duration: <span className="text-text-primary">{formatRelativeMinutes(secondsToMinutes(state.data.kothDurationSeconds))}</span></div>
        <div>Replies: <span className="text-text-primary">{formatInteger(state.data.replyCount)}</span></div>
        <div>Initial buy: <span className="text-text-primary">{state.data.initialBuySol != null ? `${state.data.initialBuySol.toFixed(2)} SOL` : "—"}</span></div>
      </div>
    </Panel>
  );
}

async function PricePanel(props: { mint: string }) {
  return (
    <Panel title="Price panel" eyebrow="1h candles">
      <div className="text-sm text-text-secondary">
        Candles are not wired into the operator API yet. Use Birdeye or DexScreener from this page until the dedicated price route exists.
      </div>
    </Panel>
  );
}

function LoadingPanel(props: { title: string }) {
  return (
    <Panel title={props.title} eyebrow="Loading">
      <div className="h-10 animate-pulse rounded bg-bg-hover/40" />
    </Panel>
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
      <div className="text-sm text-text-secondary">{reason}</div>
    </Panel>
  );
}

async function fetchSourceState<K extends keyof NonNullable<TokenEnrichmentPayload["providers"]>>(
  key: K,
  mint: string,
): Promise<NonNullable<TokenEnrichmentPayload["providers"]>[K] | null> {
  const result = await safeFetch<TokenEnrichmentPayload>(`/api/operator/enrichment/${encodeURIComponent(mint)}`);
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
