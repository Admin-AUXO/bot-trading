"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowUpRight, RefreshCcw } from "lucide-react";
import {
  CompactPageHeader,
  CompactStatGrid,
  EmptyState,
  Panel,
  StatusPill,
} from "@/components/dashboard-primitives";
import { Button, buttonVariants } from "@/components/ui/button";
import { fetchJson } from "@/lib/api";
import { discoveryLabRoutes } from "@/lib/dashboard-routes";
import {
  formatCompactCurrency,
  formatInteger,
  formatMinutesAgo,
  formatPercent,
  formatTimestamp,
} from "@/lib/format";
import type {
  DiscoveryLabStrategySuggestionsPayload,
  DiscoveryLabThresholdOverrides,
} from "@/lib/types";

export function DiscoveryLabStrategyIdeasClient(props: {
  initialPayload: DiscoveryLabStrategySuggestionsPayload;
}) {
  const [payload, setPayload] = useState(props.initialPayload);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const refreshIdeas = () => {
    startTransition(async () => {
      try {
        const nextPayload =
          await fetchJson<DiscoveryLabStrategySuggestionsPayload>(
            "/operator/discovery-lab/strategy-suggestions?refresh=true",
          );
        setPayload(nextPayload);
        setRefreshError(null);
      } catch (error) {
        setRefreshError(
          error instanceof Error
            ? error.message
            : "strategy idea refresh failed",
        );
      }
    });
  };

  return (
    <div className="space-y-5">
      <CompactPageHeader
        eyebrow="Discovery lab"
        title="Strategy ideas"
        description="Manual-refresh strategy packs derived from the cached market board. This page stays cheap until you explicitly refresh."
        badges={
          <>
            <StatusPill value={payload.regime} />
            <StatusPill
              value={
                payload.meta.cacheState === "empty"
                  ? "snapshot empty"
                  : payload.meta.cacheState
              }
            />
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
              onClick={refreshIdeas}
              variant="ghost"
              size="sm"
              disabled={isPending}
              title="Refresh ideas"
            >
              <RefreshCcw className="h-4 w-4" />
              {isPending ? "Refreshing" : "Refresh ideas"}
            </Button>
            <Link
              href={discoveryLabRoutes.marketStats}
              className={buttonVariants({ variant: "default", size: "sm" })}
            >
              Market stats
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </>
        }
      >
        <CompactStatGrid
          className="xl:grid-cols-5"
          items={[
            {
              label: "Regime confidence",
              value: `${payload.confidencePercent}%`,
              detail: payload.meta.lastRefreshedAt
                ? formatTimestamp(payload.meta.lastRefreshedAt)
                : "No cached snapshot",
              tone: "accent",
            },
            {
              label: "Tracked names",
              value: formatInteger(payload.marketSummary.tokenUniverseSize),
              detail: "Across cached board",
              tone: "default",
            },
            {
              label: "Advancing share",
              value: formatPercent(payload.marketSummary.advancingSharePercent),
              detail: "Positive 5m names",
              tone: "accent",
            },
            {
              label: "Caution share",
              value: formatPercent(payload.marketSummary.cautionSharePercent),
              detail: "Free risk caution mix",
              tone:
                payload.marketSummary.cautionSharePercent >= 50
                  ? "danger"
                  : "warning",
            },
            {
              label: "Median liquidity",
              value: formatCompactCurrency(
                payload.marketSummary.medianLiquidityUsd,
              ),
              detail: `24h vol ${formatCompactCurrency(payload.marketSummary.medianVolume24hUsd)}`,
              tone: "default",
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
        title="Snapshot status"
        eyebrow="Manual refresh only"
        description="Suggestions reuse cached market stats until you ask for a fresh board. Opening this page is cheap; refresh is the paid path."
        tone={payload.meta.cacheState === "degraded" ? "warning" : "default"}
      >
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <SnapshotStat
            label="Regime"
            value={payload.regime}
            detail="Desk posture from breadth and caution mix"
          />
          <SnapshotStat
            label="Read mode"
            value="Read-only suggestions"
            detail="This page does not mutate runtime config"
          />
          <SnapshotStat
            label="Idea refresh"
            value={
              payload.meta.lastRefreshedAt
                ? formatMinutesAgo(payload.meta.lastRefreshedAt)
                : "not yet"
            }
            detail="Current pack snapshot age"
          />
          <SnapshotStat
            label="Market basis"
            value={
              payload.meta.marketStatsRefreshedAt
                ? formatMinutesAgo(payload.meta.marketStatsRefreshedAt)
                : "not yet"
            }
            detail="Underlying board snapshot age"
          />
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {payload.meta.sources.map((source) => (
            <SourceCard
              key={source.key}
              label={source.label}
              tier={source.tier}
              detail={source.detail}
            />
          ))}
        </div>
      </Panel>

      <Panel
        title="Suggested packs"
        eyebrow={
          payload.suggestions.length > 0
            ? "Primary surface"
            : "Empty but healthy"
        }
        description={
          payload.suggestions.length > 0
            ? "Each card is structured for scan order: posture, freshness and cap lane, security/social bias, then exact thresholds."
            : "No idea snapshot is cached yet. Refresh ideas after the market board has been populated."
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <InlineLabel
              value={`${formatInteger(payload.suggestions.length)} packs`}
              tone="neutral"
            />
            <InlineLabel
              value={`${payload.confidencePercent}% confidence`}
              tone="neutral"
            />
            <InlineLabel value="Paid seed refresh: Birdeye" tone="paid" />
            <InlineLabel
              value="Free market + risk: DexScreener / Rugcheck"
              tone="free"
            />
          </div>
        }
      >
        {payload.suggestions.length > 0 ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {payload.suggestions.map((suggestion) => (
              <SuggestionCard key={suggestion.id} suggestion={suggestion} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No strategy ideas cached yet"
            detail="The page is healthy, but it stays read-only and empty until you manually refresh ideas."
          />
        )}
      </Panel>
    </div>
  );
}

function SuggestionCard(props: {
  suggestion: DiscoveryLabStrategySuggestionsPayload["suggestions"][number];
}) {
  const { suggestion } = props;
  const tone =
    suggestion.posture === "aggressive"
      ? "border-[rgba(250,204,21,0.2)] bg-[rgba(250,204,21,0.05)]"
      : suggestion.posture === "defensive"
        ? "border-[rgba(251,113,133,0.2)] bg-[rgba(251,113,133,0.05)]"
        : "border-[rgba(96,165,250,0.2)] bg-[rgba(96,165,250,0.05)]";
  const primaryFilters = suggestion.discoveryFilters.slice(0, 3);
  const secondaryFilters = suggestion.discoveryFilters.slice(3);
  const primaryThresholds = pickPrimaryThresholdRanges(
    suggestion.thresholdRanges,
  );

  return (
    <div className={`rounded-[18px] border p-4 ${tone}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-base font-semibold text-text-primary">
              {suggestion.title}
            </div>
            <InlineLabel
              value={`${suggestion.confidencePercent}% confidence`}
              tone={
                suggestion.posture === "aggressive"
                  ? "warning"
                  : suggestion.posture === "defensive"
                    ? "danger"
                    : "paid"
              }
            />
          </div>
          <div className="mt-2 text-sm leading-6 text-text-secondary">
            {suggestion.summary}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <StatusPill value={suggestion.posture} />
          <StatusPill
            value={suggestion.packDraft.defaultProfile ?? "runtime"}
          />
        </div>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-4">
        <IdeaMetric
          label="Confidence"
          value={`${suggestion.confidencePercent}%`}
          detail="Calibrated pack confidence"
        />
        <IdeaMetric
          label="Freshness"
          value={describeOverride(
            suggestion.thresholdOverrides,
            "maxGraduationAgeSeconds",
          )}
          detail="Graduation ceiling"
        />
        <IdeaMetric
          label="Cap lane"
          value={describeOverride(
            suggestion.thresholdOverrides,
            "maxMarketCapUsd",
          )}
          detail="Upper market-cap band"
        />
        <IdeaMetric
          label="Structure"
          value={`${formatInteger(suggestion.packDraft.recipes.length)} recipes`}
          detail={suggestion.packDraft.targetPnlBand?.label ?? "Runtime band"}
        />
        <IdeaMetric
          label="Session"
          value={`${suggestion.recommendedSessionMinutes}m`}
          detail="Suggested live session"
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {primaryFilters.map((filter) => (
          <InlineLabel
            key={`${suggestion.id}-${filter.key}`}
            value={`${filter.label}: ${filter.value}`}
            tone="neutral"
          />
        ))}
      </div>

      {secondaryFilters.length > 0 ? (
        <details className="mt-2 group">
          <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
            More filters
          </summary>
          <div className="mt-2 flex flex-wrap gap-2">
            {secondaryFilters.map((filter) => (
              <InlineLabel
                key={`${suggestion.id}-${filter.key}`}
                value={`${filter.label}: ${filter.value}`}
                tone={
                  filter.key === "security"
                    ? "free"
                    : filter.key === "socials"
                      ? "free"
                      : "local"
                }
              />
            ))}
          </div>
        </details>
      ) : null}

      <div className="mt-4 grid gap-2">
        {primaryThresholds.map((range) => (
          <ThresholdBar
            key={range.key}
            label={range.label}
            unit={range.unit}
            min={range.min}
            recommended={range.recommended}
            max={range.max}
            posture={suggestion.posture}
          />
        ))}
      </div>

      <details className="mt-4 group rounded-[14px] border border-bg-border bg-bg-hover/35 p-3">
        <summary className="cursor-pointer list-none">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-text-primary">
                Advanced pack shape
              </div>
              <div className="mt-1 text-xs leading-5 text-text-secondary">
                {suggestion.packDraft.thesis}
              </div>
            </div>
            <StatusPill
              value={suggestion.packDraft.recipes[0]?.mode ?? "graduated"}
            />
          </div>
        </summary>

        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <IdeaMetric
            label="Pack name"
            value={suggestion.packDraft.name}
            detail="Autogenerated draft title"
          />
          <IdeaMetric
            label="Source"
            value={suggestion.packDraft.defaultSources?.join(", ") ?? "runtime"}
            detail="Discovery source lane"
          />
          <IdeaMetric
            label="Window"
            value={`${suggestion.recommendedSessionMinutes}m`}
            detail="Suggested live session"
          />
          <IdeaMetric
            label="Target band"
            value={suggestion.packDraft.targetPnlBand?.label ?? "runtime"}
            detail="Expected trading window"
          />
        </div>

        <details className="mt-3 group">
          <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
            Raw threshold overrides
          </summary>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {Object.entries(suggestion.thresholdOverrides).map(
              ([key, value]) => (
                <div
                  key={`${suggestion.id}-${key}`}
                  className="rounded-[12px] border border-bg-border bg-bg-primary/50 px-3 py-2 text-xs text-text-secondary"
                >
                  <div className="text-[10px] uppercase tracking-[0.12em] text-text-muted">
                    {humanize(key)}
                  </div>
                  <div className="mt-1 font-semibold text-text-primary">
                    {String(value)}
                  </div>
                </div>
              ),
            )}
          </div>
        </details>
      </details>
    </div>
  );
}

function pickPrimaryThresholdRanges(
  ranges: DiscoveryLabStrategySuggestionsPayload["suggestions"][number]["thresholdRanges"],
) {
  const preferredKeys = new Set([
    "maxGraduationAgeSeconds",
    "maxMarketCapUsd",
    "minLiquidityUsd",
    "minBuySellRatio",
  ]);
  const filtered = ranges
    .filter((range) => preferredKeys.has(range.key))
    .slice(0, 4);
  return filtered.length > 0 ? filtered : ranges.slice(0, 4);
}

function SnapshotStat(props: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-[14px] border border-bg-border bg-bg-hover/35 px-3 py-2.5">
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

function IdeaMetric(props: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-[14px] border border-bg-border bg-bg-primary/40 px-3 py-2">
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

function ThresholdBar(props: {
  label: string;
  unit: "usd" | "percent" | "count" | "ratio";
  min: number;
  recommended: number;
  max: number;
  posture: "aggressive" | "balanced" | "defensive";
}) {
  const pct =
    ((props.recommended - props.min) / Math.max(props.max - props.min, 1)) *
    100;
  const fillClass =
    props.posture === "aggressive"
      ? "bg-[linear-gradient(90deg,#FACC15,#FB923C)]"
      : props.posture === "defensive"
        ? "bg-[linear-gradient(90deg,#FB7185,#F97316)]"
        : "bg-[linear-gradient(90deg,#60A5FA,#A3E635)]";

  return (
    <div className="rounded-[14px] border border-bg-border bg-bg-hover/35 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-semibold text-text-primary">{props.label}</span>
        <span className="text-text-secondary">
          {formatThreshold(props.recommended, props.unit, props.label)}
        </span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-white/[0.06]">
        <div
          className={`h-2 rounded-full ${fillClass}`}
          style={{ width: `${Math.max(8, Math.min(pct, 100))}%` }}
        />
      </div>
      <div className="mt-1 flex items-center justify-between text-[11px] text-text-muted">
        <span>{formatThreshold(props.min, props.unit, props.label)}</span>
        <span>{formatThreshold(props.max, props.unit, props.label)}</span>
      </div>
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

function InlineLabel(props: {
  value: string;
  tone: "paid" | "free" | "local" | "neutral" | "warning" | "danger";
}) {
  const toneClass = {
    paid: "border-[rgba(96,165,250,0.28)] bg-[rgba(96,165,250,0.12)] text-[#93c5fd]",
    free: "border-[rgba(163,230,53,0.26)] bg-[rgba(163,230,53,0.12)] text-[var(--success)]",
    local: "border-[rgba(255,255,255,0.1)] bg-white/[0.05] text-text-secondary",
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

function formatThreshold(
  value: number,
  unit: "usd" | "percent" | "count" | "ratio",
  label: string,
) {
  if (label.toLowerCase().includes("freshness")) {
    return value >= 3_600
      ? `${(value / 3_600).toFixed(1).replace(/\.0$/, "")}h`
      : `${Math.round(value / 60)}m`;
  }
  if (unit === "usd") {
    return formatCompactCurrency(value);
  }
  if (unit === "percent") {
    return formatPercent(value);
  }
  if (unit === "ratio") {
    return value.toFixed(2);
  }
  return formatInteger(value);
}

function describeOverride(
  overrides: DiscoveryLabThresholdOverrides,
  key: keyof DiscoveryLabThresholdOverrides,
) {
  const value = overrides[key];
  if (value == null) {
    return "—";
  }
  if (key === "maxGraduationAgeSeconds") {
    return value >= 3_600
      ? `${(value / 3_600).toFixed(1).replace(/\.0$/, "")}h`
      : `${Math.round(value / 60)}m`;
  }
  if (key === "maxMarketCapUsd") {
    return formatCompactCurrency(value);
  }
  return String(value);
}

function humanize(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
