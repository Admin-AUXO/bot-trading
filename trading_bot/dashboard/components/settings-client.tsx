"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
import clsx from "clsx";
import { useEffect, useMemo, useState, useTransition } from "react";
import { ArrowUpRight, CircleHelp, RotateCcw, Save, Zap } from "lucide-react";
import { fetchJson } from "@/lib/api";
import { discoveryLabRoutes } from "@/lib/dashboard-routes";
import { formatInteger, formatTimestamp, smartFormatValue } from "@/lib/format";
import type { BotSettings } from "@/lib/types";

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};
import { useHydrated } from "@/lib/use-hydrated";
import { CompactPageHeader, CompactStatGrid, EmptyState, Panel, StatusPill } from "@/components/dashboard-primitives";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";

type SectionId = "capital" | "strategy" | "entry" | "exit" | "advanced";
type SettingsEditorMode = "default" | "hot-discovery";

const strategyOptions = [
  { value: "FIRST_MINUTE_POSTGRAD_CONTINUATION", label: "First-Minute Post-Grad Continuation" },
  { value: "LATE_CURVE_MIGRATION_SNIPE", label: "Late-Curve Migration Snipe" },
] as const;

const fieldGroups: Array<{
  section: SectionId;
  title: string;
  description: string;
  fields: Array<{
    path: string;
    label: string;
    step?: string;
    readOnly?: boolean;
    kind?: "number" | "select" | "checkbox";
    options?: ReadonlyArray<{ value: string; label: string }>;
  }>;
}> = [
  {
    section: "capital",
    title: "Capital",
    description: "Mode and exposure.",
    fields: [
      { path: "tradeMode", label: "Trade mode", kind: "select", options: [{ value: "DRY_RUN", label: "DRY_RUN" }, { value: "LIVE", label: "LIVE" }] },
      { path: "capital.capitalUsd", label: "Capital USD" },
      { path: "capital.positionSizeUsd", label: "Position size USD" },
      { path: "capital.maxOpenPositions", label: "Max open positions", step: "1" },
    ],
  },
  {
    section: "strategy",
    title: "Strategy",
    description: "Preset and watcher controls.",
    fields: [
      { path: "strategy.livePresetId", label: "Live preset", kind: "select", options: strategyOptions },
      { path: "strategy.dryRunPresetId", label: "Lab preset", kind: "select", options: strategyOptions },
      { path: "strategy.heliusWatcherEnabled", label: "Helius watcher", kind: "checkbox" },
    ],
  },
  {
    section: "entry",
    title: "Entry",
    description: "Discovery guardrails.",
    fields: [
      { path: "filters.minLiquidityUsd", label: "Min liquidity USD" },
      { path: "filters.maxMarketCapUsd", label: "Max market cap USD" },
      { path: "filters.minHolders", label: "Min holders", step: "1" },
      { path: "filters.minUniqueBuyers5m", label: "Min unique buyers 5m", step: "1" },
      { path: "filters.minBuySellRatio", label: "Min buy/sell ratio" },
      { path: "filters.maxTop10HolderPercent", label: "Max top10 holder %" },
      { path: "filters.maxSingleHolderPercent", label: "Max single holder %" },
      { path: "filters.maxGraduationAgeSeconds", label: "Max graduation age sec", step: "1" },
      { path: "filters.minVolume5mUsd", label: "Min 5m volume USD" },
      { path: "filters.maxNegativePriceChange5mPercent", label: "Max negative 5m change %" },
      { path: "filters.securityCheckMinLiquidityUsd", label: "Security min liquidity USD" },
      { path: "filters.securityCheckVolumeMultiplier", label: "Security volume multiplier" },
      { path: "filters.maxTransferFeePercent", label: "Max transfer fee %" },
    ],
  },
  {
    section: "exit",
    title: "Exit",
    description: "Managed exit guardrails.",
    fields: [
      { path: "exits.stopLossPercent", label: "Stop loss %" },
      { path: "exits.tp1Multiplier", label: "TP1 multiplier" },
      { path: "exits.tp2Multiplier", label: "TP2 multiplier" },
      { path: "exits.tp1SellFraction", label: "TP1 sell fraction" },
      { path: "exits.tp2SellFraction", label: "TP2 sell fraction" },
      { path: "exits.postTp1RetracePercent", label: "Post TP1 retrace %" },
      { path: "exits.trailingStopPercent", label: "Trailing stop %" },
      { path: "exits.timeStopMinutes", label: "Time stop minutes" },
      { path: "exits.timeStopMinReturnPercent", label: "Min return at time stop %" },
      { path: "exits.timeLimitMinutes", label: "Hard time limit minutes" },
    ],
  },
  {
    section: "advanced",
    title: "Advanced",
    description: "Cadence internals.",
    fields: [
      { path: "cadence.discoveryIntervalMs", label: "US-hours discovery interval" },
      { path: "cadence.offHoursDiscoveryIntervalMs", label: "Off-hours discovery interval" },
      { path: "cadence.evaluationIntervalMs", label: "Queued evaluation interval" },
      { path: "cadence.idleEvaluationIntervalMs", label: "Idle evaluation interval" },
      { path: "cadence.exitIntervalMs", label: "Exit interval" },
      { path: "cadence.entryDelayMs", label: "Entry delay" },
      { path: "cadence.evaluationConcurrency", label: "Evaluation concurrency" },
    ],
  },
];

const fieldHelp: Partial<Record<string, string>> = {
  "tradeMode": "This applies immediately. LIVE still respects the startup hold and normal runtime guardrails.",
  "strategy.livePresetId": "Primary automatic preset for live discovery and evaluation.",
  "strategy.dryRunPresetId": "Default preset for discovery-lab and manual testing passes.",
  "strategy.heliusWatcherEnabled": "Only useful when watched program ids are configured.",
  "capital.capitalUsd": "Changing capital while positions are open is blocked server-side.",
  "capital.positionSizeUsd": "This is the base ticket before adaptive sizing or manual overrides.",
  "capital.maxOpenPositions": "Hard cap for simultaneous managed positions.",
  "filters.maxGraduationAgeSeconds": "Controls how old a graduated token can be and still qualify.",
  "exits.timeLimitMinutes": "Useful session cap for fast meme trading. Keep this aligned with your intended 5-60 minute workflow.",
};


const hotDiscoveryFields: Array<{
  path: string;
  label: string;
  detail: string;
  suggestions?: Array<{ label: string; value: number }>;
}> = [
  {
    path: "filters.maxGraduationAgeSeconds",
    label: "Graduation window",
    detail: "Keep the desk focused on very recent graduates.",
    suggestions: [
      { label: "1h", value: 3600 },
      { label: "2h", value: 7200 },
      { label: "4h", value: 14400 },
    ],
  },
  {
    path: "filters.maxMarketCapUsd",
    label: "Max market cap",
    detail: "Cap the desk to smaller continuation setups.",
    suggestions: [
      { label: "150k", value: 150000 },
      { label: "250k", value: 250000 },
      { label: "500k", value: 500000 },
    ],
  },
  {
    path: "filters.minLiquidityUsd",
    label: "Min liquidity",
    detail: "Avoid thin names that do not exit cleanly.",
    suggestions: [
      { label: "8k", value: 8000 },
      { label: "10k", value: 10000 },
      { label: "15k", value: 15000 },
    ],
  },
  {
    path: "filters.minVolume5mUsd",
    label: "Min 5m volume",
    detail: "Require immediate tape activity.",
    suggestions: [
      { label: "1.5k", value: 1500 },
      { label: "2k", value: 2000 },
      { label: "3k", value: 3000 },
    ],
  },
  {
    path: "filters.minUniqueBuyers5m",
    label: "Min buyers 5m",
    detail: "Prefer breadth over one-wallet bursts.",
    suggestions: [
      { label: "15", value: 15 },
      { label: "20", value: 20 },
      { label: "25", value: 25 },
    ],
  },
  {
    path: "filters.minBuySellRatio",
    label: "Min buy/sell ratio",
    detail: "Keep positive flow pressure.",
    suggestions: [
      { label: "1.1", value: 1.1 },
      { label: "1.25", value: 1.25 },
      { label: "1.4", value: 1.4 },
    ],
  },
  {
    path: "filters.maxTop10HolderPercent",
    label: "Top10 holder cap",
    detail: "Block concentrated cap tables.",
    suggestions: [
      { label: "25%", value: 25 },
      { label: "30%", value: 30 },
      { label: "35%", value: 35 },
    ],
  },
  {
    path: "filters.maxSingleHolderPercent",
    label: "Single holder cap",
    detail: "Reduce one-wallet dump risk.",
    suggestions: [
      { label: "8%", value: 8 },
      { label: "10%", value: 10 },
      { label: "12%", value: 12 },
    ],
  },
  {
    path: "exits.stopLossPercent",
    label: "Stop loss",
    detail: "Hard downside guardrail.",
    suggestions: [
      { label: "15%", value: 15 },
      { label: "20%", value: 20 },
      { label: "25%", value: 25 },
    ],
  },
  {
    path: "exits.timeLimitMinutes",
    label: "Session cap",
    detail: "Align managed exits with short live sessions.",
    suggestions: [
      { label: "5m", value: 5 },
      { label: "10m", value: 10 },
      { label: "15m", value: 15 },
      { label: "30m", value: 30 },
      { label: "60m", value: 60 },
    ],
  },
  {
    path: "cadence.entryDelayMs",
    label: "Entry delay",
    detail: "Give the tape a short settle window before evaluation.",
    suggestions: [
      { label: "5s", value: 5000 },
      { label: "15s", value: 15000 },
      { label: "30s", value: 30000 },
    ],
  },
];

type SettingsClientProps = {
  initial: BotSettings;
  grafanaHref: string | null;
  sectionIds?: SectionId[];
  header?: {
    eyebrow: string;
    title: string;
    description: string;
  };
  contextLink?: {
    href: string;
    label: string;
  };
  strategyLinkHref?: string;
  saveBarLabel?: string;
  emptySectionTitle?: string;
  emptySectionDetail?: string;
  editorMode?: SettingsEditorMode;
};

export function SettingsClient({
  initial,
  grafanaHref,
  sectionIds,
  header,
  contextLink,
  strategyLinkHref,
  saveBarLabel,
  emptySectionTitle,
  emptySectionDetail,
  editorMode = "default",
}: SettingsClientProps) {
  const allowedSectionIds = sectionIds ?? fieldGroups.map((group) => group.section);
  const [serverSettings, setServerSettings] = useState(initial);
  const [values, setValues] = useState(initial);
  const [activeSection, setActiveSection] = useState<SectionId>(() => preferredSection(allowedSectionIds));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const hydrated = useHydrated();

  const changedPaths = useMemo(
    () => diffPaths(serverSettings as unknown as Record<string, unknown>, values as unknown as Record<string, unknown>),
    [serverSettings, values],
  );
  const localDirty = changedPaths.length > 0;
  const availableSections = fieldGroups.filter((group) => allowedSectionIds.includes(group.section));
  const selectedGroup = availableSections.find((group) => group.section === activeSection) ?? availableSections[0];
  const pageHeader = header ?? {
    eyebrow: "Settings",
    title: "Live controls",
    description: "Lean operator surface for the active trading workflow.",
  };
  const pageContextLink = contextLink ?? {
    href: discoveryLabRoutes.results,
    label: "Discovery lab",
  };
  const resolvedStrategyLinkHref = strategyLinkHref ?? discoveryLabRoutes.results;

  const applySettings = () => startTransition(async () => {
    try {
      const next = await fetchJson<BotSettings>("/settings", {
        method: "POST",
        body: JSON.stringify(values),
      });
      setServerSettings(next);
      setValues(next);
      setMessage("Settings applied.");
      setError(null);
      window.dispatchEvent(new CustomEvent("desk-refresh"));
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "failed to apply settings");
      setMessage(null);
    }
  });

  const resetLocal = () => {
    setValues(serverSettings);
    setMessage(null);
    setError(null);
  };

  const updatePath = (path: string, rawValue: string | boolean | number) => {
    setValues((current) => {
      const next = structuredClone(current);
      const segments = path.split(".");
      let target: Record<string, unknown> = next as unknown as Record<string, unknown>;
      while (segments.length > 1) {
        const segment = segments.shift()!;
        target = target[segment] as Record<string, unknown>;
      }
      const finalSegment = segments[0]!;

      if (typeof rawValue === "boolean") {
        target[finalSegment] = rawValue;
      } else if (path.endsWith("PresetId") || path === "tradeMode") {
        target[finalSegment] = rawValue;
      } else {
        target[finalSegment] = Number(rawValue);
      }

      return next;
    });
  };

  return (
    <div className="space-y-5">
      <CompactPageHeader
        eyebrow={pageHeader.eyebrow}
        title={pageHeader.title}
        description={pageHeader.description}
        badges={(
          <>
            <StatusPill value={localDirty ? "changed" : "stable"} />
            <Badge variant={values.tradeMode === "LIVE" ? "warning" : "default"}>{values.tradeMode}</Badge>
          </>
        )}
        actions={(
          <>
            <a href={pageContextLink.href} className={buttonVariants({ variant: "secondary", size: "sm" })}>
              {pageContextLink.label}
            </a>
            {grafanaHref ? (
              <a
                href={grafanaHref}
                target="_blank"
                rel="noreferrer"
                className={buttonVariants({ variant: "default", size: "sm" })}
                title="Open configuration analytics in Grafana"
              >
                Open Grafana
                <ArrowUpRight className="h-4 w-4" />
              </a>
            ) : null}
          </>
        )}
      >
        <CompactStatGrid
          className="xl:grid-cols-5"
          items={
            editorMode === "hot-discovery"
              ? [
                  { label: "Scope", value: "Discovery", detail: localDirty ? "Unsaved changes" : "No pending edits", tone: localDirty ? "warning" : "default" },
                  { label: "Changed", value: formatInteger(changedPaths.length), detail: localDirty ? "Ready to apply" : "No local edits", tone: localDirty ? "warning" : "default" },
                  { label: "Graduation window", value: formatMinutesFromSeconds(values.filters.maxGraduationAgeSeconds), detail: "Recent grads only", tone: "accent" },
                  { label: "Session cap", value: `${formatInteger(values.exits.timeLimitMinutes)}m`, detail: "Managed exit ceiling", tone: "default" },
                  { label: "Entry delay", value: `${formatInteger(values.cadence.entryDelayMs / 1000)}s`, detail: "Discovery to evaluation gap", tone: "default" },
                ]
              : [
                  { label: "Changed", value: formatInteger(changedPaths.length), detail: localDirty ? "Ready to apply" : "No local edits", tone: localDirty ? "warning" : "default" },
                  { label: "Mode", value: values.tradeMode, detail: `Max ${formatInteger(values.capital.maxOpenPositions)} open`, tone: values.tradeMode === "LIVE" ? "warning" : "default" },
                  { label: "Capital", value: `$${formatInteger(values.capital.capitalUsd)}`, detail: `$${formatInteger(values.capital.positionSizeUsd)} ticket`, tone: "default" },
                  { label: "Cadence", value: `${formatInteger(values.cadence.discoveryIntervalMs / 1000)}s`, detail: "Discovery interval", tone: "default" },
                ]
          }
        />
      </CompactPageHeader>

      {error ? (
        <div className="rounded-[16px] border border-[rgba(251,113,133,0.25)] bg-[rgba(251,113,133,0.08)] px-5 py-4 text-sm text-[var(--danger)]">
          {error}
        </div>
      ) : null}

      {message ? (
        <div className="rounded-[16px] border border-[rgba(163,230,53,0.25)] bg-[rgba(163,230,53,0.08)] px-5 py-4 text-sm text-[var(--success)]">
          {message}
        </div>
      ) : null}

      {editorMode === "hot-discovery" ? (
        <>
          <Panel title="Hot parameters" eyebrow="Direct apply">
            <div className="mb-4 rounded-[14px] border border-[rgba(163,230,53,0.18)] bg-[rgba(163,230,53,0.08)] px-4 py-3 text-sm text-text-primary">
              Optimize for pump.fun and recent graduates here. These edits apply directly to active runtime settings, so keep the desk paused if you are changing live-sensitive values mid-session.
            </div>
            <div className="grid gap-2 xl:grid-cols-2">
              {hotDiscoveryFields.map((field) => (
                <HotParameterRow
                  key={field.path}
                  label={field.label}
                  detail={field.detail}
                  path={field.path}
                  value={readValue(values, field.path)}
                  activeValue={readValue(serverSettings, field.path)}
                  suggestions={field.suggestions}
                  help={fieldHelp[field.path]}
                  onChange={updatePath}
                />
              ))}
            </div>
          </Panel>

          <details className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-[16px] border border-bg-border bg-bg-secondary px-4 py-3 text-sm font-medium text-text-primary">
              <span>More controls</span>
              <span className="text-xs text-text-secondary group-open:hidden">Open</span>
              <span className="hidden text-xs text-text-secondary group-open:inline">Close</span>
            </summary>
            <div className="mt-4 space-y-4">
              <div className="flex flex-wrap gap-2">
                {availableSections.map((section) => (
                  <button
                    key={section.section}
                    type="button"
                    onClick={() => setActiveSection(section.section)}
                    className={clsx(
                      "rounded-full border px-3 py-1.5 text-sm transition",
                      activeSection === section.section
                        ? "border-[rgba(163,230,53,0.28)] bg-[#121511] text-text-primary"
                        : "border-bg-border bg-bg-hover/30 text-text-secondary hover:bg-bg-hover/50",
                    )}
                  >
                    {section.title}
                  </button>
                ))}
              </div>
              {selectedGroup ? (
                <SectionEditor
                  group={selectedGroup}
                  values={values}
                  serverSettings={serverSettings}
                  onChange={updatePath}
                  strategyLinkHref={resolvedStrategyLinkHref}
                />
              ) : null}
            </div>
          </details>
        </>
      ) : (
        <section className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {availableSections.map((section) => {
              const sectionChanged = section.fields.filter((field) => changedPaths.includes(field.path)).length;
              return (
                <button
                  key={section.section}
                  type="button"
                  onClick={() => setActiveSection(section.section)}
                  className={clsx(
                    "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition",
                    activeSection === section.section
                      ? "border-[rgba(163,230,53,0.28)] bg-[#121511] text-text-primary"
                      : "border-bg-border bg-bg-hover/30 text-text-secondary hover:bg-bg-hover/50",
                  )}
                >
                  <span>{section.title}</span>
                  {sectionChanged > 0 ? <Badge variant="warning">{sectionChanged}</Badge> : null}
                </button>
              );
            })}
          </div>
          {selectedGroup ? (
            <SectionEditor
              group={selectedGroup}
              values={values}
              serverSettings={serverSettings}
              onChange={updatePath}
              strategyLinkHref={resolvedStrategyLinkHref}
            />
          ) : (
            <Panel title="Settings" eyebrow="Empty">
              <EmptyState
                title={emptySectionTitle ?? "No sections available"}
                detail={emptySectionDetail ?? "This surface does not expose any editable sections."}
              />
            </Panel>
          )}
        </section>
      )}

      <div className="sticky bottom-4 z-20 rounded-[16px] border border-bg-border bg-bg-secondary p-3 shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="text-sm font-medium text-text-primary">{saveBarLabel ?? "Apply settings directly."}</div>
            <div className="mt-1 text-xs text-text-secondary">
              Active {safeClientTimestamp(new Date().toISOString(), hydrated, "Syncing...")}
              {localDirty ? ` · ${formatInteger(changedPaths.length)} local change(s)` : " · No pending local edits"}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={resetLocal} disabled={isPending || !localDirty} variant="ghost" title="Reset local edits back to active settings">
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>
            <Button onClick={applySettings} disabled={isPending || !localDirty} variant="default" title="Apply local settings immediately">
              <Save className={cn("h-4 w-4", isPending && "animate-spin")} />
              {isPending ? "Applying…" : "Apply now"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionEditor(props: {
  group: (typeof fieldGroups)[number];
  values: BotSettings;
  serverSettings: BotSettings;
  onChange: (path: string, value: string | boolean | number) => void;
  strategyLinkHref: string;
}) {
  return (
    <Panel title={props.group.title} eyebrow="Editor">
      {props.group.section === "strategy" ? (
        <div className="mb-4 rounded-[14px] border border-[rgba(163,230,53,0.2)] bg-[rgba(163,230,53,0.08)] px-4 py-3 text-sm text-text-primary">
          Discovery-lab run calibration applies directly to active settings now.
          <a href={props.strategyLinkHref} className="ml-2 font-semibold text-accent underline underline-offset-2">Open discovery results</a>
        </div>
      ) : null}
      <div className="mb-4 text-sm text-text-secondary">{props.group.description}</div>
      <div className="grid gap-3 md:grid-cols-2">
        {props.group.fields.map((field) => {
          const value = readValue(props.values, field.path);
          const activeValue = readValue(props.serverSettings, field.path);
          const changed = !isSameValue(value, activeValue);
          const help = fieldHelp[field.path];

          if (field.kind === "checkbox") {
            return (
              <label key={field.path} className={fieldCardClassName(changed)}>
                <FieldLabel label={field.label} changed={changed} help={help} />
                <div className="mt-2.5 flex items-center gap-3 rounded-[12px] border border-bg-border bg-bg-primary/65 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={Boolean(value)}
                    onChange={(event) => props.onChange(field.path, event.target.checked)}
                    className="h-4 w-4 rounded border-bg-border bg-bg-primary"
                  />
                  <span className="text-sm text-text-primary">{Boolean(value) ? "Enabled" : "Disabled"}</span>
                </div>
                <FieldDiff path={field.path} activeValue={activeValue} value={value} />
              </label>
            );
          }

          if (field.kind === "select") {
            return (
              <label key={field.path} className={fieldCardClassName(changed)}>
                <FieldLabel label={field.label} changed={changed} help={help} />
                <select
                  value={String(value)}
                  onChange={(event) => props.onChange(field.path, event.target.value)}
                  className="mt-2.5 h-10 w-full rounded-[12px] border border-bg-border bg-[#0f0f10] px-3 py-2 text-sm text-text-primary outline-none transition focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent)_65%,transparent)]"
                >
                  {field.options?.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <FieldDiff path={field.path} activeValue={activeValue} value={value} />
              </label>
            );
          }

          return (
            <label key={field.path} className={fieldCardClassName(changed)}>
              <FieldLabel label={field.label} changed={changed} help={help} />
              <div className="mt-2.5 flex items-center gap-3 rounded-[12px] border border-bg-border bg-bg-primary/65 px-3 py-2.5">
                <input
                  type="number"
                  step={field.step}
                  value={String(value)}
                  onChange={(event) => props.onChange(field.path, event.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none"
                />
                <span className="text-xs uppercase tracking-[0.16em] text-text-muted">{fieldUnit(field.path) || "value"}</span>
              </div>
              <FieldDiff path={field.path} activeValue={activeValue} value={value} />
            </label>
          );
        })}
      </div>
    </Panel>
  );
}

function HotParameterRow(props: {
  label: string;
  detail: string;
  path: string;
  value: string | number | boolean;
  activeValue: string | number | boolean;
  suggestions?: Array<{ label: string; value: number }>;
  help?: string;
  onChange: (path: string, value: string | boolean | number) => void;
}) {
  const changed = !isSameValue(props.value, props.activeValue);

  return (
    <div className="rounded-[14px] border border-bg-border bg-bg-hover/30 px-4 py-3">
      <div className="grid gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-text-primary">{props.label}</span>
            {props.help ? <HelpTooltip text={props.help} /> : null}
            {changed ? <Badge variant="warning">Changed</Badge> : null}
          </div>
          <div className="mt-1 text-xs leading-5 text-text-secondary">{props.detail}</div>
        </div>
        <div className="grid gap-2 md:grid-cols-[8.5rem_minmax(0,1fr)] xl:grid-cols-[8.5rem_minmax(0,1fr)_auto]">
          <div className="rounded-[12px] border border-bg-border bg-bg-primary/45 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.16em] text-text-muted">Active</div>
            <div className="mt-1 text-sm font-medium text-text-primary">{smartFormatValue(props.path, props.activeValue)}</div>
          </div>
          <div className="rounded-[12px] border border-bg-border bg-bg-primary/65 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.16em] text-text-muted">Now</div>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="number"
                value={String(props.value)}
                onChange={(event) => props.onChange(props.path, event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none"
              />
              <span className="text-[10px] uppercase tracking-[0.16em] text-text-muted">{fieldUnit(props.path) || "value"}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {props.suggestions?.map((suggestion) => (
              <button
                key={suggestion.label}
                type="button"
                onClick={() => props.onChange(props.path, suggestion.value)}
                className="rounded-full border border-bg-border bg-bg-primary/55 px-2.5 py-1 text-[11px] text-text-secondary transition hover:bg-bg-hover/60 hover:text-text-primary"
              >
                {suggestion.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function fieldCardClassName(changed: boolean) {
  return clsx(
    "block rounded-[14px] border px-3 py-3 transition",
    changed ? "border-[rgba(163,230,53,0.2)] bg-[rgba(163,230,53,0.06)]" : "border-bg-border bg-bg-hover/30",
  );
}

function FieldLabel(props: { label: string; changed: boolean; help?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="block text-xs uppercase tracking-[0.18em] text-text-muted">{props.label}</span>
          {props.help ? <HelpTooltip text={props.help} /> : null}
          {props.changed ? <StatusPill value="changed" /> : null}
        </div>
      </div>
    </div>
  );
}

function FieldDiff(props: {
  path: string;
  activeValue: string | number | boolean;
  value: string | number | boolean;
}) {
  if (isSameValue(props.activeValue, props.value)) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-text-muted">
      <span>Active</span>
      <span className="font-mono text-text-primary">{smartFormatValue(props.path, props.activeValue)}</span>
      <span>→</span>
      <span className="font-mono text-text-primary">{smartFormatValue(props.path, props.value)}</span>
    </div>
  );
}

function readValue(settings: BotSettings, path: string): string | number | boolean {
  return path.split(".").reduce<unknown>((current, segment) => (current as Record<string, unknown>)[segment], settings as unknown) as string | number | boolean;
}

function isSameValue(left: string | number | boolean, right: string | number | boolean) {
  return String(left) === String(right);
}

function diffPaths(left: Record<string, unknown>, right: Record<string, unknown>, prefix = ""): string[] {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  const changed: string[] = [];

  for (const key of keys) {
    const path = prefix ? `${prefix}.${key}` : key;
    const leftValue = left[key];
    const rightValue = right[key];

    if (isPlainObject(leftValue) && isPlainObject(rightValue)) {
      changed.push(...diffPaths(leftValue, rightValue, path));
      continue;
    }

    if (JSON.stringify(leftValue) !== JSON.stringify(rightValue)) {
      changed.push(path);
    }
  }

  return changed;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function preferredSection(allowedSectionIds: SectionId[]): SectionId {
  return allowedSectionIds[0] ?? "capital";
}

function fieldUnit(path: string) {
  if (/Usd$/.test(path) || path.includes("capitalUsd") || path.includes("positionSizeUsd")) return "USD";
  if (/Percent$/.test(path) || path.includes("Fraction")) return "%";
  if (/Minutes$/.test(path)) return "min";
  if (/Seconds$/.test(path)) return "sec";
  if (/IntervalMs$/.test(path) || /DurationMs$/.test(path) || /pollIntervalMs$/.test(path)) return "ms";
  return "";
}

function formatMinutesFromSeconds(seconds: number) {
  if (seconds % 3600 === 0) {
    return `${seconds / 3600}h`;
  }
  return `${Math.round(seconds / 60)}m`;
}

function safeClientTimestamp(value: string | null | undefined, hydrated: boolean, fallback = "—") {
  if (!value) {
    return fallback;
  }
  return hydrated ? formatTimestamp(value) : "Syncing...";
}

function HelpTooltip(props: { text: string }) {
  return (
    <Tooltip.Provider delayDuration={120}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button type="button" className="inline-flex h-4 w-4 items-center justify-center text-text-muted transition hover:text-text-primary" aria-label="Field help">
            <CircleHelp className="h-3.5 w-3.5" />
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="top"
            sideOffset={8}
            className="max-w-xs rounded-[12px] border border-bg-border bg-[#111214] px-3 py-2 text-xs leading-5 text-text-primary shadow-2xl"
          >
            {props.text}
            <Tooltip.Arrow className="fill-[#111214]" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
