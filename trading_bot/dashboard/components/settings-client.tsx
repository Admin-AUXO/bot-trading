"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
import clsx from "clsx";
import { useMemo, useState, useTransition } from "react";
import { ArrowUpRight, CircleHelp, FilePenLine, FlaskConical, Rocket, ShieldCheck } from "lucide-react";
import { fetchJson } from "@/lib/api";
import { discoveryLabRoutes } from "@/lib/dashboard-routes";
import { formatInteger, formatTimestamp, smartFormatValue } from "@/lib/format";
import type { BotSettings, SettingsControlState } from "@/lib/types";
import { useHydrated } from "@/lib/use-hydrated";
import { CompactPageHeader, CompactStatGrid, EmptyState, Panel, StatusPill } from "@/components/dashboard-primitives";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ReviewSection, WorkflowSection } from "@/components/workflow-ui";

type SectionId = SettingsControlState["sections"][number]["id"];

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
      { path: "tradeMode", label: "Trade mode" },
      { path: "capital.capitalUsd", label: "Capital USD" },
      { path: "capital.positionSizeUsd", label: "Position size USD" },
      { path: "capital.maxOpenPositions", label: "Max open positions", step: "1" },
    ],
  },
  {
    section: "strategy",
    title: "Strategy",
    description: "Dry-run and watcher controls.",
    fields: [
      { path: "strategy.dryRunPresetId", label: "Dry-run preset", kind: "select", options: strategyOptions },
      { path: "strategy.heliusWatcherEnabled", label: "Helius watcher", kind: "checkbox" },
    ],
  },
  {
    section: "entry",
    title: "Entry",
    description: "Discovery filters.",
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
    description: "Exit thresholds.",
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
    section: "research",
    title: "Research",
    description: "Dry-run caps.",
    fields: [
      { path: "research.discoveryLimit", label: "Discovery limit", step: "1" },
      { path: "research.fullEvaluationLimit", label: "Deep-evaluation shortlist", step: "1" },
      { path: "research.maxMockPositions", label: "Max mock positions", step: "1" },
      { path: "research.fixedPositionSizeUsd", label: "Fixed ticket USD" },
      { path: "research.pollIntervalMs", label: "Poll interval ms", step: "1000" },
      { path: "research.maxRunDurationMs", label: "Max run window ms", step: "60000" },
      { path: "research.birdeyeUnitCap", label: "Birdeye unit cap", step: "1" },
      { path: "research.heliusUnitCap", label: "Helius unit cap", step: "1" },
    ],
  },
  {
    section: "advanced",
    title: "Advanced",
    description: "Read-only timing.",
    fields: [
      { path: "cadence.discoveryIntervalMs", label: "US-hours discovery interval", readOnly: true },
      { path: "cadence.offHoursDiscoveryIntervalMs", label: "Off-hours discovery interval", readOnly: true },
      { path: "cadence.evaluationIntervalMs", label: "Queued evaluation interval", readOnly: true },
      { path: "cadence.idleEvaluationIntervalMs", label: "Idle evaluation interval", readOnly: true },
      { path: "cadence.exitIntervalMs", label: "Exit interval", readOnly: true },
      { path: "cadence.entryDelayMs", label: "Entry delay", readOnly: true },
      { path: "cadence.evaluationConcurrency", label: "Evaluation concurrency", readOnly: true },
    ],
  },
];

const fieldHelp: Partial<Record<string, string>> = {
  tradeMode: "Changing trade mode is live-affecting and can be blocked while open positions or research activity exist.",
  "strategy.dryRunPresetId": "Dry-run preset controls which recipe the bounded research lane uses.",
  "strategy.heliusWatcherEnabled": "Watcher only helps when program IDs are configured; otherwise it stays inert.",
  "capital.capitalUsd": "Capital changes are gated because they alter available risk budget immediately.",
  "capital.positionSizeUsd": "Ticket size changes alter exposure per entry and need review before promotion.",
  "capital.maxOpenPositions": "Open-position cap changes can change live capacity on the next cycle.",
  "exits.stopLossPercent": "Stop-loss changes alter live downside handling. Dry run before promotion.",
  "exits.trailingStopPercent": "Trailing stop changes change live exit posture, not just reporting.",
  "research.birdeyeUnitCap": "Research unit caps can block or distort dry-run review if set too low.",
  "research.heliusUnitCap": "Research provider caps need a dry-run pass before promotion.",
};

type SettingsClientProps = {
  initial: SettingsControlState;
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
}: SettingsClientProps) {
  const allowedSectionIds = sectionIds ?? fieldGroups.map((group) => group.section);
  const [serverState, setServerState] = useState(initial);
  const [draftValues, setDraftValues] = useState<BotSettings>(initial.draft ?? initial.active);
  const [activeSection, setActiveSection] = useState<SectionId>(() => preferredSection(initial, allowedSectionIds));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const hydrated = useHydrated();

  const baseline = serverState.draft ?? serverState.active;
  const localDirty = useMemo(
    () => JSON.stringify(draftValues) !== JSON.stringify(baseline),
    [baseline, draftValues],
  );

  const saveDraft = () => startTransition(async () => {
    try {
      const next = await fetchJson<SettingsControlState>("/settings/draft", {
        method: "POST",
        body: JSON.stringify(draftValues),
      });
      setServerState(next);
      setDraftValues(next.draft ?? next.active);
      setMessage("Draft saved.");
      setError(null);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "failed to save draft");
      setMessage(null);
    }
  });

  const runDryRun = () => startTransition(async () => {
    try {
      const next = await fetchJson<SettingsControlState>("/settings/dry-run", { method: "POST" });
      setServerState(next);
      setDraftValues(next.draft ?? next.active);
      setMessage("Dry run updated.");
      setError(null);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "failed to run dry run");
      setMessage(null);
    }
  });

  const promote = () => startTransition(async () => {
    try {
      const next = await fetchJson<SettingsControlState>("/settings/promote", { method: "POST" });
      setServerState(next);
      setDraftValues(next.draft ?? next.active);
      setMessage("Draft promoted.");
      setError(null);
      window.dispatchEvent(new CustomEvent("desk-refresh"));
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "failed to promote draft");
      setMessage(null);
    }
  });

  const discardDraft = () => startTransition(async () => {
    try {
      const next = await fetchJson<SettingsControlState>("/settings/draft/discard", { method: "POST" });
      setServerState(next);
      setDraftValues(next.active);
      setMessage("Draft discarded.");
      setError(null);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "failed to discard draft");
      setMessage(null);
    }
  });

  const updatePath = (path: string, rawValue: string | boolean) => {
    setDraftValues((current) => {
      const next = structuredClone(current);
      const segments = path.split(".");
      let target: Record<string, unknown> = next as unknown as Record<string, unknown>;
      while (segments.length > 1) {
        const segment = segments.shift()!;
        target = target[segment] as Record<string, unknown>;
      }
      const finalSegment = segments[0]!;
      if (path === "tradeMode") {
        target[finalSegment] = rawValue as BotSettings["tradeMode"];
      } else if (path.endsWith("PresetId")) {
        target[finalSegment] = rawValue;
      } else if (typeof rawValue === "boolean") {
        target[finalSegment] = rawValue;
      } else {
        target[finalSegment] = Number(rawValue);
      }
      return next;
    });
  };

  const canPromote = Boolean(
    serverState.draft
    && serverState.validation.ok
    && (!serverState.liveAffectingPaths.length || serverState.dryRun?.safeToPromote),
  );

  const availableSections = serverState.sections.filter((section) => allowedSectionIds.includes(section.id));
  const availableFieldGroups = fieldGroups.filter((group) => allowedSectionIds.includes(group.section));
  const selectedGroup = availableFieldGroups.find((group) => group.section === activeSection) ?? availableFieldGroups[0];
  const draftBehindActive = Boolean(
    serverState.draft
    && serverState.basedOnUpdatedAt
    && serverState.basedOnUpdatedAt !== serverState.activeUpdatedAt,
  );
  const activeLiveStrategy = serverState.active.strategy.liveStrategy;
  const draftLiveStrategy = draftValues.strategy.liveStrategy;
  const liveStrategyChanged = !isSameValue(
    JSON.stringify(activeLiveStrategy),
    JSON.stringify(draftLiveStrategy),
  );
  const liveStrategyChangedPaths = serverState.changedPaths.filter((path) => path.startsWith("strategy.liveStrategy"));
  const nonLiveChangedPaths = serverState.changedPaths.filter((path) => !serverState.liveAffectingPaths.includes(path));
  const showLiveStrategyGovernance = allowedSectionIds.includes("strategy") && (activeSection === "strategy" || liveStrategyChanged);
  const showValidationSummary = serverState.validation.issues.length > 0;
  const showDryRunReview = Boolean(serverState.liveAffectingPaths.length || serverState.dryRun);
  const pageHeader = header ?? {
    eyebrow: "Settings",
    title: "Review and promote",
    description: "Compact review rail for draft state, validation, dry run, and promotion.",
  };
  const pageContextLink = contextLink ?? {
    href: discoveryLabRoutes.results,
    label: "Discovery lab",
  };
  const resolvedStrategyLinkHref = strategyLinkHref ?? discoveryLabRoutes.results;

  return (
    <div className="space-y-5">
      <CompactPageHeader
        eyebrow={pageHeader.eyebrow}
        title={pageHeader.title}
        description={pageHeader.description}
        badges={(
          <>
            <StatusPill value={serverState.validation.ok ? "pass" : "fail"} />
            <Badge variant={serverState.draft ? "warning" : "default"}>{serverState.draft ? "Draft open" : "No draft"}</Badge>
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
          className="xl:grid-cols-4"
          items={[
            { label: "Draft", value: serverState.draft ? "Open" : "None", detail: localDirty ? "Unsaved local edits" : `${formatInteger(serverState.changedPaths.length)} changed paths`, tone: serverState.draft ? "accent" : "default" },
            { label: "Validation", value: serverState.validation.ok ? "Pass" : `${serverState.validation.issues.length} issues`, detail: "Structural checks", tone: serverState.validation.ok ? "accent" : "danger" },
            { label: "Dry run", value: serverState.dryRun ? safeClientTimestamp(serverState.dryRun.ranAt, hydrated, "None") : "None", detail: serverState.dryRun?.safeToPromote ? "Promotion-ready" : "Review gate", tone: serverState.dryRun?.safeToPromote ? "accent" : "default" },
            { label: "Live paths", value: formatInteger(serverState.liveAffectingPaths.length), detail: `Active ${safeClientTimestamp(serverState.activeUpdatedAt, hydrated)}`, tone: serverState.liveAffectingPaths.length > 0 ? "warning" : "default" },
          ]}
        />
      </CompactPageHeader>

      <section className="grid gap-4">
        <Panel title="Review rail" eyebrow="Draft -> Review -> Promote" className="xl:sticky xl:top-[calc(var(--shell-header-height)+0.75rem)] xl:z-10">
          <div className="grid gap-2 lg:grid-cols-4">
            <WorkflowStepCard
              title="Draft"
              detail={localDirty ? "Unsaved edits." : serverState.draft ? `${formatInteger(serverState.changedPaths.length)} changed path(s).` : "No draft."}
              status={localDirty ? "warning" : serverState.draft ? "pass" : "idle"}
              icon={FilePenLine}
            />
            <WorkflowStepCard
              title="Validate"
              detail={serverState.validation.ok ? "Checks pass." : `${formatInteger(serverState.validation.issues.length)} issue(s).`}
              status={serverState.validation.ok ? "pass" : "danger"}
              icon={ShieldCheck}
            />
            <WorkflowStepCard
              title="Dry run"
              detail={
                serverState.liveAffectingPaths.length === 0
                  ? "No live path changed."
                  : serverState.dryRun
                    ? `${serverState.dryRun.safeToPromote ? "Pass" : "Blocked"} ${safeClientTimestamp(serverState.dryRun.ranAt, hydrated)}`
                    : "Dry run needed."
              }
              status={
                serverState.liveAffectingPaths.length === 0
                  ? "idle"
                  : serverState.dryRun?.safeToPromote
                    ? "pass"
                    : "warning"
              }
              icon={FlaskConical}
            />
            <WorkflowStepCard
              title="Promote"
              detail={canPromote ? "Ready." : "Blocked."}
              status={canPromote ? "pass" : "warning"}
              icon={Rocket}
            />
          </div>
          {draftBehindActive ? (
            <div className="mt-3 rounded-[14px] border border-[rgba(250,204,21,0.18)] bg-[rgba(250,204,21,0.08)] px-4 py-3 text-sm text-text-primary">
              Active settings changed after this draft. Re-check before promote.
            </div>
          ) : null}
        </Panel>
      </section>

      <section className={clsx("grid gap-4", showLiveStrategyGovernance ? "xl:grid-cols-[1.05fr_0.95fr]" : "xl:grid-cols-1")}>
        {showLiveStrategyGovernance ? (
          <WorkflowSection
            title="Live strategy governance"
            eyebrow="Discovery-owned"
            description="Review active versus draft live models before promotion."
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <LiveStrategyCard
                title="Active live model"
                strategy={activeLiveStrategy}
                paths={[]}
                tone="passive"
                hydrated={hydrated}
              />
              <LiveStrategyCard
                title="Draft live model"
                strategy={draftLiveStrategy}
                paths={liveStrategyChangedPaths}
                tone={liveStrategyChanged ? "warning" : "default"}
                hydrated={hydrated}
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge variant={liveStrategyChanged ? "warning" : "default"}>
                {liveStrategyChanged ? "Live strategy changed in draft" : "Live strategy matches active"}
              </Badge>
              <Badge variant={draftLiveStrategy.enabled ? "accent" : "default"}>
                {draftLiveStrategy.enabled ? "Adaptive live enabled" : "Adaptive live disabled"}
              </Badge>
              {draftLiveStrategy.calibrationSummary?.calibrationConfidence != null ? (
                <Badge variant="default">
                  Confidence {Math.round(draftLiveStrategy.calibrationSummary.calibrationConfidence * 100)}%
                </Badge>
              ) : null}
            </div>
          </WorkflowSection>
        ) : null}

        <WorkflowSection
          title="Promotion review"
          eyebrow="Gate summary"
          description="Promote only when the gate reads clean."
        >
          <div className="grid gap-4">
            <ReviewSection
              step="01"
              title="What changed"
              description="Live-affecting paths should be deliberate. Everything else is secondary."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <ReviewMetric label="Changed paths" value={String(serverState.changedPaths.length)} />
                <ReviewMetric label="Live-affecting" value={String(serverState.liveAffectingPaths.length)} />
                <ReviewMetric label="Live strategy paths" value={String(liveStrategyChangedPaths.length)} />
                <ReviewMetric label="Non-live paths" value={String(nonLiveChangedPaths.length)} />
              </div>
            </ReviewSection>
            <ReviewSection
              step="02"
              title="Promotion blockers"
              description="These checks should all read clean before the draft becomes active."
            >
              <div className="space-y-2">
                <PromotionCheck label="Validation" ok={serverState.validation.ok} detail={serverState.validation.ok ? "No structural issues." : `${serverState.validation.issues.length} issue(s) remain.`} />
                <PromotionCheck label="Dry run freshness" ok={!serverState.liveAffectingPaths.length || Boolean(serverState.dryRun)} detail={!serverState.liveAffectingPaths.length ? "No live-affecting change." : serverState.dryRun ? `Ran ${safeClientTimestamp(serverState.dryRun.ranAt, hydrated)}` : "Dry run required."} />
                <PromotionCheck label="Safe to promote" ok={canPromote} detail={canPromote ? "Promotion gate is clear." : "A live-affecting or validation blocker remains."} />
                <PromotionCheck label="Draft lineage" ok={!draftBehindActive} detail={draftBehindActive ? "Active settings changed after the draft was based." : "Draft is based on the current active snapshot."} />
              </div>
            </ReviewSection>
          </div>
        </WorkflowSection>
      </section>

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

      <section className="grid gap-4 xl:grid-cols-[15rem_minmax(0,1fr)]">
        <Panel title="Sections" eyebrow="Edit surface" className="xl:sticky xl:top-[calc(var(--shell-header-height)+1rem)] xl:self-start">
          <div className="md:hidden">
            <select
              value={activeSection}
              onChange={(event) => setActiveSection(event.target.value as SectionId)}
              className="w-full rounded-[12px] border border-bg-border bg-bg-primary/65 px-4 py-3 text-sm text-text-primary outline-none transition focus:border-accent"
            >
              {availableSections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.label}
                </option>
              ))}
            </select>
          </div>
          <div className="hidden space-y-1.5 md:block">
            {availableSections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                title={`Open ${section.label}`}
                className={`w-full rounded-[12px] border px-3 py-2.5 text-left transition ${
                  activeSection === section.id
                    ? "border-[rgba(163,230,53,0.28)] bg-[#121511] text-text-primary"
                    : "border-bg-border bg-bg-hover/30 text-text-secondary hover:bg-bg-hover/50"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">{section.label}</span>
                  <span className="text-[10px] uppercase tracking-[0.18em] text-text-muted">{section.editable ? "Edit" : "View"}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-text-muted">
                  <span>{formatInteger(serverState.changedPaths.filter((path) => section.paths.includes(path)).length)} changed</span>
                  {serverState.liveAffectingPaths.some((path) => section.paths.includes(path)) ? <span className="meta-chip !px-2 !py-1 text-[10px]">Live</span> : null}
                </div>
              </button>
            ))}
          </div>
        </Panel>

        {selectedGroup ? (
          <WorkflowSection
            title={selectedGroup.title}
            eyebrow="Draft editor"
            description={selectedGroup.description}
            className={selectedGroup.section === "advanced" ? "bg-bg-card/55" : undefined}
          >
            {selectedGroup.section === "strategy" ? (
              <div className="mb-4 rounded-[14px] border border-[rgba(163,230,53,0.2)] bg-[rgba(163,230,53,0.08)] px-4 py-3 text-sm text-text-primary">
                Live strategy packs, calibrated exits, and capital modifiers are now managed from discovery lab results.
                <a href={resolvedStrategyLinkHref} className="ml-2 font-semibold text-accent underline underline-offset-2">Open discovery workflow</a>
              </div>
            ) : null}
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Badge variant="default">{selectedGroup.title}</Badge>
              <Badge variant={serverState.sections.find((section) => section.id === selectedGroup.section)?.editable ? "accent" : "default"}>
                {serverState.sections.find((section) => section.id === selectedGroup.section)?.editable ? "Editable" : "Read-only"}
              </Badge>
              {serverState.liveAffectingPaths.some((path) => selectedGroup.fields.some((field) => path === field.path || path.startsWith(`${field.path}.`))) ? (
                <Badge variant="warning">Live-affecting</Badge>
              ) : null}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {selectedGroup.fields.map((field) => {
                const value = readValue(draftValues, field.path);
                const activeValue = readValue(serverState.active, field.path);
                const baselineValue = readValue(baseline, field.path);
                const isChangedFromActive = !isSameValue(value, activeValue);
                const isUnsaved = !isSameValue(value, baselineValue);
                const isLiveAffecting = serverState.liveAffectingPaths.includes(field.path);
                const issues = serverState.validation.issues.filter((issue) => matchesField(issue.path, field.path));
                const help = fieldHelp[field.path];

                if (field.path === "tradeMode" || field.kind === "select") {
                  return (
                    <label
                      key={field.path}
                      className={clsx(
                        "block rounded-[14px] border px-3 py-3 transition",
                        isChangedFromActive ? "border-[rgba(163,230,53,0.2)] bg-[rgba(163,230,53,0.06)]" : "border-bg-border bg-bg-hover/30",
                      )}
                    >
                      <FieldLabel
                        label={field.label}
                        isChangedFromActive={isChangedFromActive}
                        isUnsaved={isUnsaved}
                        isLiveAffecting={isLiveAffecting}
                        help={help}
                      />
                      <select
                        value={String(value)}
                        onChange={(event) => updatePath(field.path, event.target.value)}
                        className="mt-2.5 h-10 w-full rounded-[12px] border border-bg-border bg-[#0f0f10] px-3 py-2 text-sm text-text-primary outline-none transition focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent)_65%,transparent)]"
                      >
                        {field.path === "tradeMode" ? (
                          <>
                            <option value="DRY_RUN">DRY_RUN</option>
                            <option value="LIVE">LIVE</option>
                          </>
                        ) : (
                          field.options?.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))
                        )}
                      </select>
                      <FieldDiff path={field.path} activeValue={activeValue} value={value} issues={issues} />
                    </label>
                  );
                }

                if (field.kind === "checkbox") {
                  return (
                    <label
                      key={field.path}
                      className={clsx(
                        "block rounded-[14px] border px-3 py-3 transition",
                        isChangedFromActive ? "border-[rgba(163,230,53,0.2)] bg-[rgba(163,230,53,0.06)]" : "border-bg-border bg-bg-hover/30",
                      )}
                    >
                      <FieldLabel
                        label={field.label}
                        isChangedFromActive={isChangedFromActive}
                        isUnsaved={isUnsaved}
                        isLiveAffecting={isLiveAffecting}
                        help={help}
                      />
                      <div className="mt-2.5 flex items-center gap-3 rounded-[12px] border border-bg-border bg-bg-primary/65 px-4 py-3">
                        <input
                          type="checkbox"
                          checked={Boolean(value)}
                          onChange={(event) => updatePath(field.path, event.target.checked)}
                          className="h-4 w-4 rounded border-bg-border bg-bg-primary"
                        />
                        <span className="text-sm text-text-primary">{Boolean(value) ? "Enabled" : "Disabled"}</span>
                      </div>
                      <FieldDiff path={field.path} activeValue={activeValue} value={value} issues={issues} />
                    </label>
                  );
                }

                if (field.readOnly) {
                  return (
                    <div key={field.path} className="rounded-[14px] border border-bg-border bg-bg-primary/45 px-3.5 py-3 opacity-80">
                      <div className="micro-stat-label">{field.label}</div>
                      <div className="mt-1.5 text-sm font-medium text-text-primary">{smartFormatValue(field.path, value)}</div>
                    </div>
                  );
                }

                return (
                  <label
                    key={field.path}
                    className={clsx(
                      "block rounded-[14px] border px-3 py-3 transition",
                      isChangedFromActive ? "border-[rgba(163,230,53,0.2)] bg-[rgba(163,230,53,0.06)]" : "border-bg-border bg-bg-hover/30",
                      issues.length > 0 && "border-[rgba(251,113,133,0.2)] bg-[rgba(251,113,133,0.06)]",
                    )}
                  >
                    <FieldLabel
                      label={field.label}
                      isChangedFromActive={isChangedFromActive}
                      isUnsaved={isUnsaved}
                      isLiveAffecting={isLiveAffecting}
                      help={help}
                    />
                    <div className="mt-2.5 flex items-center gap-2">
                      <Input
                        type="number"
                        step={field.step ?? "any"}
                        value={String(value)}
                        onChange={(event) => updatePath(field.path, event.target.value)}
                        className="bg-bg-primary/65"
                      />
                      <span className="min-w-[3rem] text-right text-xs text-text-muted">{fieldUnit(field.path)}</span>
                    </div>
                    <FieldDiff path={field.path} activeValue={activeValue} value={value} issues={issues} />
                  </label>
                );
              })}
            </div>
          </WorkflowSection>
        ) : (
          <Panel title="Draft editor" eyebrow="Scoped view">
            <EmptyState
              title={emptySectionTitle ?? "No sections available"}
              detail={emptySectionDetail ?? "This settings view does not expose any editable sections."}
            />
          </Panel>
        )}
      </section>

      {showValidationSummary || showDryRunReview ? (
        <section className={clsx("grid gap-4", showValidationSummary && showDryRunReview ? "xl:grid-cols-[0.9fr_1.1fr]" : "xl:grid-cols-1")}>
          {showValidationSummary ? (
            <WorkflowSection title="Validation summary" eyebrow="Structural issues" description="Open only when you need issue-by-issue detail.">
              <details className="group" open={serverState.validation.issues.length <= 2}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-[14px] border border-bg-border bg-bg-hover/35 px-4 py-3 text-sm font-medium text-text-primary">
                  <span>{formatInteger(serverState.validation.issues.length)} validation issue(s)</span>
                  <span className="text-xs text-text-secondary group-open:hidden">Open</span>
                  <span className="hidden text-xs text-text-secondary group-open:inline">Close</span>
                </summary>
                <div className="mt-4 space-y-3">
                  {serverState.validation.issues.map((issue) => (
                    <div key={`${issue.path}-${issue.message}`} className="rounded-[14px] border border-bg-border bg-bg-hover/40 px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.16em] text-text-muted">{issue.path || "settings"}</div>
                      <div className="mt-2 text-sm text-text-primary">{issue.message}</div>
                    </div>
                  ))}
                </div>
              </details>
            </WorkflowSection>
          ) : null}

          {showDryRunReview ? (
            <WorkflowSection title="Dry-run review" eyebrow="Promotion gate" description="Open only when the live gate changed.">
              <details className="group" open={Boolean(serverState.dryRun && !serverState.dryRun.safeToPromote)}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-[14px] border border-bg-border bg-bg-hover/35 px-4 py-3 text-sm font-medium text-text-primary">
                  <span>{serverState.dryRun ? `Dry run ${serverState.dryRun.safeToPromote ? "ready" : "blocked"}` : "No dry run yet"}</span>
                  <span className="text-xs text-text-secondary group-open:hidden">Open</span>
                  <span className="hidden text-xs text-text-secondary group-open:inline">Close</span>
                </summary>
                <div className="mt-4">
                  {serverState.dryRun ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <StatusPill value={serverState.dryRun.safeToPromote ? "ready" : "blocked"} />
                        <span className="text-sm text-text-secondary">Ran {safeClientTimestamp(serverState.dryRun.ranAt, hydrated)}</span>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <ReviewMetric label="Current gate" value={serverState.dryRun.currentGate.allowed ? "Allowed" : serverState.dryRun.currentGate.reason ?? "Blocked"} />
                        <ReviewMetric label="Draft gate" value={serverState.dryRun.draftGate.allowed ? "Allowed" : serverState.dryRun.draftGate.reason ?? "Blocked"} />
                        <ReviewMetric label="No new blocker" value={serverState.dryRun.noNewBlocker ? "Yes" : "No"} />
                        <ReviewMetric label="Queued candidates" value={String(serverState.dryRun.queuedCandidates)} />
                        <ReviewMetric label="Open positions" value={String(serverState.dryRun.openPositions)} />
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-[14px] border border-bg-border bg-bg-hover/40 px-4 py-4 text-sm text-text-secondary">
                      Run a dry run after live-affecting changes.
                    </div>
                  )}
                </div>
              </details>
            </WorkflowSection>
          ) : null}
        </section>
      ) : null}

      <div className="sticky bottom-4 z-20 rounded-[16px] border border-bg-border bg-bg-secondary p-3.5 shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="text-sm font-medium text-text-primary">{saveBarLabel ?? "Save, dry run, promote."}</div>
            <div className="mt-1 text-xs text-text-secondary">
              Active {safeClientTimestamp(serverState.activeUpdatedAt, hydrated)}
              {serverState.basedOnUpdatedAt ? ` · Draft base ${safeClientTimestamp(serverState.basedOnUpdatedAt, hydrated)}` : ""}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={discardDraft} disabled={isPending || (!serverState.draft && !localDirty)} variant="ghost" title="Throw away the current draft">
              Discard
            </Button>
            <Button onClick={saveDraft} disabled={isPending || !localDirty} variant="secondary" title="Persist the current draft">
              Save draft
            </Button>
            <Button onClick={runDryRun} disabled={isPending || !serverState.draft || !serverState.validation.ok} variant="ghost" title="Run the dry-run promotion gate">
              Dry run
            </Button>
            <Button onClick={promote} disabled={isPending || !canPromote} variant="default" title="Promote the reviewed draft to active">
              Promote
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function WorkflowStepCard(props: {
  title: string;
  detail: string;
  status: "pass" | "warning" | "danger" | "idle";
  icon: React.ComponentType<{ className?: string }>;
}) {
  const Icon = props.icon;
  const toneClass = {
    pass: "border-[rgba(163,230,53,0.18)] bg-[rgba(163,230,53,0.08)]",
    warning: "border-[rgba(250,204,21,0.18)] bg-[rgba(250,204,21,0.08)]",
    danger: "border-[rgba(251,113,133,0.2)] bg-[rgba(251,113,133,0.08)]",
    idle: "border-bg-border bg-bg-hover/30",
  }[props.status];

  return (
    <div className={`rounded-[14px] border px-3 py-3 ${toneClass}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="section-kicker">{props.title}</div>
        <Icon className="h-4 w-4 text-text-secondary" />
      </div>
      <div className="mt-2">
        <StatusPill value={props.status === "idle" ? "waiting" : props.status} />
      </div>
      <div className="mt-2 text-sm leading-5 text-text-secondary">{props.detail}</div>
    </div>
  );
}

function LiveStrategyCard(props: {
  title: string;
  strategy: BotSettings["strategy"]["liveStrategy"];
  paths: string[];
  tone: "default" | "warning" | "passive";
  hydrated: boolean;
}) {
  const toneClass = {
    default: "border-bg-border bg-bg-hover/30",
    warning: "border-[rgba(250,204,21,0.18)] bg-[rgba(250,204,21,0.08)]",
    passive: "border-bg-border bg-bg-primary/45",
  }[props.tone];

  return (
    <Card className={toneClass}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-[0.95rem]">{props.title}</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Badge variant={props.strategy.enabled ? "accent" : "default"}>
              {props.strategy.enabled ? "Enabled" : "Disabled"}
            </Badge>
            {props.strategy.dominantPresetId ? (
              <Badge variant="default">{props.strategy.dominantPresetId.replace(/_/g, " ")}</Badge>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid gap-3 sm:grid-cols-2">
          <SummaryRow label="Pack" value={props.strategy.packName ?? "None staged"} />
          <SummaryRow label="Source run" value={props.strategy.sourceRunId ?? "None"} />
          <SummaryRow label="Capital modifier" value={`${props.strategy.capitalModifierPercent}%`} />
          <SummaryRow label="Recipes" value={String(props.strategy.recipes.length)} />
          <SummaryRow label="Dominant mode" value={props.strategy.dominantMode ?? "Unknown"} />
          <SummaryRow label="Updated" value={props.strategy.updatedAt ? safeClientTimestamp(props.strategy.updatedAt, props.hydrated, "Never") : "Never"} />
        </div>
        {props.strategy.calibrationSummary ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <ReviewMetric label="Winners" value={String(props.strategy.calibrationSummary.winnerCount)} />
            <ReviewMetric label="Confidence" value={props.strategy.calibrationSummary.calibrationConfidence == null ? "—" : `${Math.round(props.strategy.calibrationSummary.calibrationConfidence * 100)}%`} />
            <ReviewMetric label="Derived profile" value={props.strategy.calibrationSummary.derivedProfile ?? "—"} />
          </div>
        ) : null}
        {props.paths.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {props.paths.slice(0, 6).map((path) => (
              <Badge key={path} variant="warning">{path.replace("strategy.liveStrategy.", "")}</Badge>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function PromotionCheck(props: { label: string; ok: boolean; detail: string }) {
  return (
    <div className="rounded-[14px] border border-bg-border bg-bg-hover/30 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium text-text-primary">{props.label}</div>
        <Badge variant={props.ok ? "accent" : "warning"}>{props.ok ? "OK" : "Review"}</Badge>
      </div>
      <div className="mt-2 text-xs leading-5 text-text-secondary">{props.detail}</div>
    </div>
  );
}

function SummaryRow(props: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-bg-border bg-bg-primary/55 px-3 py-3">
      <div className="scorecard-grid">
        <div className="scorecard-label wrap-anywhere">{props.label}</div>
        <div className="scorecard-value wrap-anywhere text-sm font-semibold">{props.value}</div>
        <div />
      </div>
    </div>
  );
}

function ReviewMetric(props: { label: string; value: string }) {
  return (
    <div className="micro-stat">
      <div className="scorecard-grid">
        <div className="scorecard-label wrap-anywhere">{props.label}</div>
        <div className="scorecard-value wrap-anywhere text-sm font-medium">{props.value}</div>
        <div />
      </div>
    </div>
  );
}

function FieldLabel(props: {
  label: string;
  isChangedFromActive: boolean;
  isUnsaved: boolean;
  isLiveAffecting: boolean;
  help?: string;
}) {
  const status = props.isLiveAffecting ? "live gate" : props.isUnsaved ? "unsaved" : props.isChangedFromActive ? "changed" : null;

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="block text-xs uppercase tracking-[0.18em] text-text-muted">{props.label}</span>
          {props.help ? <HelpTooltip text={props.help} /> : null}
          {status ? <StatusPill value={status} /> : null}
        </div>
      </div>
    </div>
  );
}

function FieldDiff(props: {
  path: string;
  activeValue: string | number | boolean;
  value: string | number | boolean;
  issues: SettingsControlState["validation"]["issues"];
}) {
  if (isSameValue(props.activeValue, props.value) && props.issues.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
        <span>Active</span>
        <span className="font-mono text-text-primary">{smartFormatValue(props.path, props.activeValue)}</span>
        {!isSameValue(props.activeValue, props.value) ? (
          <>
            <span>→</span>
            <span className="font-mono text-text-primary">{smartFormatValue(props.path, props.value)}</span>
          </>
        ) : null}
      </div>
      {props.issues.length > 0 ? (
        <div className="space-y-1">
          {props.issues.map((issue) => (
            <div key={`${issue.path}-${issue.message}`} className="text-xs text-[var(--danger)]">
              {issue.message}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function readValue(settings: BotSettings, path: string): string | number | boolean {
  return path.split(".").reduce<unknown>((current, segment) => (current as Record<string, unknown>)[segment], settings as unknown) as string | number | boolean;
}

function isSameValue(left: string | number | boolean, right: string | number | boolean) {
  return String(left) === String(right);
}

function matchesField(issuePath: string, fieldPath: string) {
  return issuePath === fieldPath || issuePath.startsWith(`${fieldPath}.`) || fieldPath.startsWith(`${issuePath}.`);
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

function fieldUnit(path: string) {
  if (/Usd$/.test(path) || path.includes("capitalUsd") || path.includes("positionSizeUsd")) return "USD";
  if (/Percent$/.test(path) || path.includes("Fraction")) return "%";
  if (/Minutes$/.test(path)) return "min";
  if (/Seconds$/.test(path)) return "sec";
  if (/IntervalMs$/.test(path) || /DurationMs$/.test(path) || /pollIntervalMs$/.test(path)) return "ms";
  return "";
}

function safeClientTimestamp(value: string | null | undefined, hydrated: boolean, fallback = "—") {
  if (!value) {
    return fallback;
  }
  return hydrated ? formatTimestamp(value) : "Syncing...";
}

function preferredSection(state: SettingsControlState, allowedSectionIds: SectionId[]): SectionId {
  const ordered = state.sections.filter((section) => allowedSectionIds.includes(section.id));
  const liveFirst = ordered.find((section) => state.liveAffectingPaths.some((path) => section.paths.includes(path)));
  if (state.draft && liveFirst) {
    return liveFirst.id;
  }
  const changedFirst = ordered.find((section) => state.changedPaths.some((path) => section.paths.includes(path)));
  if (state.draft && changedFirst) {
    return changedFirst.id;
  }
  return ordered[0]?.id ?? "capital";
}
