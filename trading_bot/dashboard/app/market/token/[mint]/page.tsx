import { Suspense } from "react";
import { CompactPageHeader, EmptyState, Panel, StatusPill } from "@/components/dashboard-primitives";
import { serverFetch } from "@/lib/server-api";
import { formatCompactCurrency, formatInteger, formatPercent, formatRelativeMinutes } from "@/lib/format";
import type {
  MarketTokenStatsPayload,
  SmartWalletActivityPayload,
  DiscoveryLabTokenInsight,
} from "@/lib/types";
import { shortMint } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function MarketTokenPage({
  params,
}: {
  params: Promise<{ mint: string }>;
}) {
  const { mint } = await params;
  const [enrichment, stats] = await Promise.all([
    safeFetch<DiscoveryLabTokenInsight>(`/api/operator/enrichment/${encodeURIComponent(mint)}`),
    safeFetch<MarketTokenStatsPayload>(`/api/operator/market/stats/${encodeURIComponent(mint)}`),
  ]);

  if (!enrichment.data && !stats.data) {
    return <EmptyState title="Token detail unavailable" detail={enrichment.error ?? stats.error ?? "No token payload available."} />;
  }

  const symbol = enrichment.data?.symbol ?? shortMint(mint, 5);
  const birdeyeHref = `https://birdeye.so/token/${mint}?chain=solana`;
  const dexscreenerHref = enrichment.data?.toolLinks.dexscreener ?? `https://dexscreener.com/solana/${mint}`;
  const solscanHref = enrichment.data?.toolLinks.solscanToken ?? `https://solscan.io/token/${mint}`;

  return (
    <div className="space-y-5">
      <CompactPageHeader
        eyebrow="Market intel"
        title={`${symbol} token detail`}
        description={`Mint ${mint}`}
        actions={(
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <a href="/operational-desk/trading" className="text-text-secondary hover:text-text-primary">Manual entry</a>
            <a href="/market/trending" className="text-text-secondary hover:text-text-primary">Pin</a>
            <a href={birdeyeHref} target="_blank" rel="noreferrer" className="text-text-secondary hover:text-text-primary">Open in Birdeye</a>
          </div>
        )}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="space-y-4">
          <Panel title="Identity" eyebrow="Token overview">
            <div className="space-y-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill value={symbol} />
                <StatusPill value={stats.data?.ageMinutes != null ? `${formatRelativeMinutes(stats.data.ageMinutes)} since grad` : "age unknown"} />
              </div>
              <div className="font-mono text-xs text-text-secondary break-all">{mint}</div>
              <div className="flex flex-wrap gap-2 text-xs">
                <a href={solscanHref} target="_blank" rel="noreferrer" className="text-text-secondary hover:text-text-primary">Solscan</a>
                <a href={birdeyeHref} target="_blank" rel="noreferrer" className="text-text-secondary hover:text-text-primary">Birdeye</a>
                <a href={dexscreenerHref} target="_blank" rel="noreferrer" className="text-text-secondary hover:text-text-primary">DexScreener</a>
              </div>
            </div>
          </Panel>

          <Panel title="Creator lineage" eyebrow="Funding and launches">
            <div className="text-sm text-text-secondary">
              Creator lineage feed is not exposed by current API payload for this route set.
            </div>
          </Panel>

          <Panel title="Mint and authority flags" eyebrow="Security posture">
            <div className="flex flex-wrap gap-2 text-xs">
              <StatusPill value={enrichment.data?.security.mintAuthorityEnabled ? "mint authority enabled" : "mint authority disabled"} />
              <StatusPill value={enrichment.data?.security.freezeable ? "freeze enabled" : "freeze disabled"} />
              <StatusPill value={enrichment.data?.security.mutableMetadata ? "metadata mutable" : "metadata immutable"} />
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

        <div className="space-y-4">
          <Suspense fallback={<LoadingPanel title="Bundle (Trench)" />}>
            <UnavailableCard title="Bundle (Trench)" reason="Trench unavailable — provider client not wired in this runtime." />
          </Suspense>
          <Suspense fallback={<LoadingPanel title="Cluster (Bubblemaps)" />}>
            <UnavailableCard title="Cluster (Bubblemaps)" reason="Bubblemaps unavailable — provider client not wired in this runtime." />
          </Suspense>
          <Suspense fallback={<LoadingPanel title="Security (Solsniffer)" />}>
            <SecurityCard mint={mint} />
          </Suspense>
          <Suspense fallback={<LoadingPanel title="Pools (GeckoTerminal)" />}>
            <UnavailableCard title="Pools (GeckoTerminal)" reason="GeckoTerminal unavailable — provider client not wired in this runtime." />
          </Suspense>
          <Suspense fallback={<LoadingPanel title="Smart money (Cielo)" />}>
            <SmartMoneyCard mint={mint} />
          </Suspense>
          <Suspense fallback={<LoadingPanel title="Pump.fun origin" />}>
            <UnavailableCard title="Pump.fun origin" reason="Pump.fun origin details unavailable in current enrichment payload." />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

async function PricePanel(props: { mint: string }) {
  const priceData = await safeFetch<unknown>(`/api/operator/price/${encodeURIComponent(props.mint)}?tf=1h`);
  if (!priceData.data) {
    return (
      <Panel title="Price panel" eyebrow="1h candles">
        <div className="text-sm text-text-secondary">
          Price feed unavailable for this route set. {priceData.error ?? "No /api/operator/price endpoint present."}
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="Price panel" eyebrow="1h candles">
      <div className="text-sm text-text-secondary">
        Raw price payload is available, but chart rendering is deferred until the dedicated price API contract is finalized.
      </div>
    </Panel>
  );
}

async function SecurityCard(props: { mint: string }) {
  const result = await safeFetch<DiscoveryLabTokenInsight>(`/api/operator/enrichment/${encodeURIComponent(props.mint)}`);
  if (!result.data) {
    return <UnavailableCard title="Security (Solsniffer)" reason={`Solsniffer unavailable — ${result.error ?? "no data"}`} />;
  }

  const security = result.data.security;
  const flags = [
    security.honeypot ? "honeypot risk" : null,
    security.fakeToken ? "fake token risk" : null,
    security.transferFeeEnabled ? "transfer fee enabled" : null,
  ].filter((item): item is string => Boolean(item));

  return (
    <Panel title="Security (Solsniffer)" eyebrow="Compile-safe fallback">
      <div className="space-y-2 text-sm">
        <div>Top10 holder: <span className="text-text-primary">{formatPercent(security.top10HolderPercent)}</span></div>
        <div>Largest holder: <span className="text-text-primary">{formatPercent(security.ownerBalancePercent)}</span></div>
        <div className="text-xs text-text-secondary">{flags.length > 0 ? flags.join(" · ") : "No high-signal flags in current payload."}</div>
      </div>
    </Panel>
  );
}

async function SmartMoneyCard(props: { mint: string }) {
  const result = await safeFetch<SmartWalletActivityPayload[]>(
    `/api/operator/market/smart-wallet-events?limit=3&mints=${encodeURIComponent(props.mint)}`,
  );
  if (!result.data || result.data.length === 0) {
    return <UnavailableCard title="Smart money (Cielo)" reason={`Smart-money unavailable — ${result.error ?? "no recent events"}`} />;
  }

  const net = result.data.reduce((acc, row) => acc + (row.side === "BUY" ? row.amountUsd : -row.amountUsd), 0);
  return (
    <Panel title="Smart money (Cielo)" eyebrow="Last 3 events">
      <div className="space-y-2 text-sm">
        <div>Net flow: <span className="text-text-primary">{formatCompactCurrency(net)}</span></div>
        {result.data.map((row) => (
          <div key={row.id} className="text-xs text-text-secondary">
            {(row.walletLabel ?? shortMint(row.walletAddress, 4))} · {row.side} · {formatCompactCurrency(row.amountUsd)}
          </div>
        ))}
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

function UnavailableCard(props: { title: string; reason: string }) {
  return (
    <Panel title={props.title} eyebrow="Unavailable">
      <div className="text-sm text-text-secondary">{props.reason}</div>
    </Panel>
  );
}

async function safeFetch<T>(path: string): Promise<{ data: T | null; error: string | null }> {
  try {
    const data = await serverFetch<T>(path);
    return { data, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : "request failed" };
  }
}
