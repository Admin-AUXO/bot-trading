"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { RefreshCcw, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { CompactStatGrid, InlineNotice, Panel, ScanStat, StatusPill } from "@/components/dashboard-primitives";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { fetchJson } from "@/lib/api";
import { workbenchRoutes } from "@/lib/dashboard-routes";
import { formatCompactCurrency, formatInteger, formatPercent, formatRelativeMinutes } from "@/lib/format";
import type { DiscoveryLabPackDraft, DiscoveryLabStrategySuggestionsPayload } from "@/lib/types";

type SavePackResponse = {
  id?: string;
  pack?: {
    id?: string;
  };
};

export function MarketStrategyIdeasPanel(props: {
  initialPayload: DiscoveryLabStrategySuggestionsPayload | null;
}) {
  const router = useRouter();
  const [payload, setPayload] = useState(props.initialPayload);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    setPayload(props.initialPayload);
  }, [props.initialPayload]);

  async function refreshIdeas() {
    setIsRefreshing(true);
    setMessage(null);
    try {
      const next = await fetchJson<DiscoveryLabStrategySuggestionsPayload>("/operator/market/strategy-suggestions?refresh=true");
      setPayload(next);
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "strategy ideas refresh failed",
      });
    } finally {
      setIsRefreshing(false);
    }
  }

  async function createDraft(draft: DiscoveryLabPackDraft, suggestionId: string) {
    setCreatingId(suggestionId);
    setMessage(null);
    try {
      const response = await fetchJson<SavePackResponse>("/operator/packs", {
        method: "POST",
        body: JSON.stringify(draft),
      });
      const packId = response.pack?.id ?? response.id;
      if (!packId) {
        throw new Error("pack save returned no id");
      }
      setMessage({ kind: "success", text: `Created draft ${packId}. Opening editor.` });
      router.push(`${workbenchRoutes.editorByIdPrefix}/${encodeURIComponent(packId)}`);
      router.refresh();
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "draft creation failed",
      });
    } finally {
      setCreatingId(null);
    }
  }

  const sources = payload?.meta.sources.filter((source) => source.tier !== "paid") ?? [];
  const topSuggestions = payload?.suggestions.slice(0, 3) ?? [];

  return (
    <Panel
      title="Free signal ideas"
      eyebrow="Market intel"
      description="Use the cached market board plus free-provider coverage to propose the next pack before spending another paid refresh."
      action={(
        <div className="flex flex-wrap items-center gap-2">
          {sources.map((source) => (
            <span key={source.key} className="meta-chip">{source.label} · {source.tier}</span>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={() => void refreshIdeas()} disabled={isRefreshing}>
            <RefreshCcw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
            {isRefreshing ? "Refreshing" : "Refresh ideas"}
          </Button>
        </div>
      )}
    >
      {message ? <InlineNotice tone={message.kind === "error" ? "danger" : "accent"}>{message.text}</InlineNotice> : null}

      {payload ? (
        <div className={cn("space-y-4", message ? "mt-3" : undefined)}>
          <CompactStatGrid
            className="xl:grid-cols-5"
            items={[
              {
                label: "Regime",
                value: payload.regime.replace("_", " "),
                detail: `${payload.confidencePercent}% confidence`,
                tone: payload.regime === "RISK_OFF" ? "warning" : payload.regime === "RISK_ON" ? "accent" : "default",
              },
              {
                label: "Universe",
                value: formatInteger(payload.marketSummary.tokenUniverseSize),
                detail: "Current suggestion base",
              },
              {
                label: "Advancing",
                value: formatPercent(payload.marketSummary.advancingSharePercent),
                detail: `Caution ${formatPercent(payload.marketSummary.cautionSharePercent)}`,
              },
              {
                label: "Median liq",
                value: formatCompactCurrency(payload.marketSummary.medianLiquidityUsd),
                detail: `5m move ${formatPercent(payload.marketSummary.medianPriceChange5mPercent)}`,
              },
              {
                label: "Board age",
                value: formatRelativeMinutes(payload.meta.staleMinutes),
                detail: payload.meta.lastRefreshedAt ?? "No refresh time",
                tone: payload.meta.cacheState === "degraded" ? "warning" : "default",
              },
            ]}
          />

          {payload.meta.warnings.map((warning) => (
            <InlineNotice key={warning} tone="warning">
              {warning}
            </InlineNotice>
          ))}

          {topSuggestions.length > 0 ? (
            <div className="grid gap-3 xl:grid-cols-3">
              {topSuggestions.map((suggestion) => (
                <article key={suggestion.id} className="rounded-[14px] border border-bg-border bg-bg-hover/20 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill value={suggestion.posture} />
                    <StatusPill value={`${suggestion.confidencePercent}%`} />
                    <StatusPill value={`${suggestion.recommendedSessionMinutes}m`} />
                  </div>
                  <div className="mt-3">
                    <div className="font-display text-[0.98rem] font-semibold tracking-[-0.02em] text-text-primary">
                      {suggestion.title}
                    </div>
                    <div className="mt-1 text-sm text-text-secondary">{suggestion.summary}</div>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {suggestion.thresholdRanges.slice(0, 4).map((range) => (
                      <ScanStat
                        key={range.key}
                        label={range.label}
                        value={formatThreshold(range.recommended, range.unit)}
                        detail={`Range ${formatThreshold(range.min, range.unit)} to ${formatThreshold(range.max, range.unit)}`}
                      />
                    ))}
                  </div>

                  {suggestion.discoveryFilters.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {suggestion.discoveryFilters.slice(0, 4).map((filter) => (
                        <span key={`${suggestion.id}-${filter.key}`} className="meta-chip">
                          {filter.label}: {filter.value}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={creatingId === suggestion.id}
                      onClick={() => void createDraft(suggestion.packDraft, suggestion.id)}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      {creatingId === suggestion.id ? "Creating..." : "Create draft"}
                    </Button>
                    <Link
                      href={workbenchRoutes.editor}
                      prefetch={false}
                      className={buttonVariants({ variant: "ghost", size: "sm" })}
                    >
                      Open editor
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <InlineNotice tone="default">
              No strategy ideas yet. Refresh the market board first, then regenerate ideas from the same cached context.
            </InlineNotice>
          )}
        </div>
      ) : (
        <InlineNotice tone="warning">
          Strategy ideas are unavailable right now. The market board can still load, but the free-signal pack suggestions did not.
        </InlineNotice>
      )}
    </Panel>
  );
}

function formatThreshold(value: number, unit: "usd" | "percent" | "count" | "ratio") {
  if (unit === "usd") return formatCompactCurrency(value);
  if (unit === "percent") return `${Math.round(value)}%`;
  if (unit === "ratio") return `${value.toFixed(2).replace(/\.?0+$/, "")}x`;
  return formatInteger(value);
}
