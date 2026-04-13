"use client";

import clsx from "clsx";
import { useMemo, useState, useTransition } from "react";
import { ArrowUpRight, FilePenLine, FlaskConical, Rocket, ShieldCheck } from "lucide-react";
import { fetchJson } from "@/lib/api";
import { formatInteger, formatTimestamp, smartFormatValue } from "@/lib/format";
import type { BotSettings, SettingsControlState } from "@/lib/types";
import { PageHero, Panel, StatusPill } from "@/components/dashboard-primitives";

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
    description: "Preset selection.",
    fields: [
      { path: "strategy.livePresetId", label: "Live preset", kind: "select", options: strategyOptions },
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
  "strategy.livePresetId": "Live mode can be conservative while dry run keeps researching the dirtier edge.",
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

export function SettingsClient({ initial, grafanaHref }: { initial: SettingsControlState; grafanaHref: string | null }) {
  const [serverState, setServerState] = useState(initial);
  const [draftValues, setDraftValues] = useState<BotSettings>(initial.draft ?? initial.active);
  const [activeSection, setActiveSection] = useState<SectionId>("capital");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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

  const selectedGroup = fieldGroups.find((group) => group.section === activeSection) ?? fieldGroups[0];
  const draftBehindActive = Boolean(
    serverState.draft
    && serverState.basedOnUpdatedAt
    && serverState.basedOnUpdatedAt !== serverState.activeUpdatedAt,
  );

  return (
    <div className="space-y-5">
      <PageHero
        eyebrow="Settings"
        title="Settings"
        description={undefined}
        meta={<StatusPill value={serverState.validation.ok ? "pass" : "fail"} />}
        actions={grafanaHref ? (
          <a
            href={grafanaHref}
            target="_blank"
            rel="noreferrer"
            className="btn-primary inline-flex items-center gap-2"
            title="Open configuration analytics in Grafana"
          >
            Open Grafana
            <ArrowUpRight className="h-4 w-4" />
          </a>
        ) : null}
        aside={(
          <div className="panel-muted rounded-[16px] p-4">
            <div className="section-kicker">Active</div>
            <div className="mt-4 grid gap-3">
              <SummaryRow label="Updated" value={formatTimestamp(serverState.activeUpdatedAt)} />
              <SummaryRow label="Draft" value={serverState.draft ? "Open" : "None"} />
              <SummaryRow label="Changed paths" value={formatInteger(serverState.changedPaths.length)} />
            </div>
          </div>
        )}
      />

      <section className="grid gap-6 2xl:grid-cols-[1.18fr_0.82fr]">
        <Panel title="Promotion rail" eyebrow="Draft -> Review -> Promote">
          <div className="grid gap-3 lg:grid-cols-4">
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
                    ? `${serverState.dryRun.safeToPromote ? "Pass" : "Blocked"} ${formatTimestamp(serverState.dryRun.ranAt)}`
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
        </Panel>

        <Panel title="Summary" eyebrow="Current" tone={draftBehindActive ? "warning" : "passive"}>
          <div className="grid gap-3 sm:grid-cols-2">
            <SummaryRow label="Draft" value={serverState.draft ? "Open" : "None"} />
            <SummaryRow label="Local edits" value={localDirty ? "Unsaved" : "Synced"} />
            <SummaryRow label="Live paths" value={formatInteger(serverState.liveAffectingPaths.length)} />
            <SummaryRow label="Dry run" value={serverState.dryRun ? formatTimestamp(serverState.dryRun.ranAt) : "None"} />
          </div>
          {draftBehindActive ? (
            <div className="mt-3 rounded-[14px] border border-[rgba(250,204,21,0.18)] bg-[rgba(250,204,21,0.08)] px-4 py-3 text-sm text-text-primary">
              Active settings changed after this draft. Re-check before promote.
            </div>
          ) : null}
        </Panel>
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

      <section className="grid gap-6 xl:grid-cols-[0.24fr_0.76fr]">
        <Panel title="Sections" eyebrow="Edit surface">
          <div className="space-y-2">
            {serverState.sections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                title={`Open ${section.label}`}
                className={`w-full rounded-[14px] border px-4 py-3 text-left transition ${
                  activeSection === section.id
                    ? "border-[rgba(163,230,53,0.28)] bg-[#121511] text-text-primary"
                    : "border-bg-border bg-bg-hover/30 text-text-secondary hover:bg-bg-hover/50"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{section.label}</span>
                  <StatusPill value={section.editable ? "editable" : "read-only"} />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                  <span>{formatInteger(section.paths.length)} paths</span>
                  <span>{formatInteger(serverState.changedPaths.filter((path) => section.paths.includes(path)).length)} changed</span>
                  {serverState.liveAffectingPaths.some((path) => section.paths.includes(path)) ? <span className="meta-chip !px-2 !py-1 text-[10px]">Live</span> : null}
                </div>
              </button>
            ))}
          </div>
        </Panel>

        <Panel title={selectedGroup.title} eyebrow={selectedGroup.description} tone={selectedGroup.section === "advanced" ? "passive" : "default"}>
          <div className="grid gap-4 md:grid-cols-2">
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
                      "block rounded-[16px] border px-4 py-4 transition",
                      isChangedFromActive ? "border-[rgba(163,230,53,0.2)] bg-[rgba(163,230,53,0.06)]" : "border-bg-border bg-bg-hover/30",
                    )}
                    title={help}
                  >
                    <FieldLabel
                      label={field.label}
                      isChangedFromActive={isChangedFromActive}
                      isUnsaved={isUnsaved}
                      isLiveAffecting={isLiveAffecting}
                    />
                    <select
                      value={String(value)}
                      onChange={(event) => updatePath(field.path, event.target.value)}
                      className="mt-3 w-full rounded-[12px] border border-bg-border bg-bg-primary/65 px-4 py-3 text-sm text-text-primary outline-none transition focus:border-accent"
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
                      "block rounded-[16px] border px-4 py-4 transition",
                      isChangedFromActive ? "border-[rgba(163,230,53,0.2)] bg-[rgba(163,230,53,0.06)]" : "border-bg-border bg-bg-hover/30",
                    )}
                    title={help}
                  >
                    <FieldLabel
                      label={field.label}
                      isChangedFromActive={isChangedFromActive}
                      isUnsaved={isUnsaved}
                      isLiveAffecting={isLiveAffecting}
                    />
                    <div className="mt-3 flex items-center gap-3 rounded-[12px] border border-bg-border bg-bg-primary/65 px-4 py-3">
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
                  <div key={field.path} className="rounded-[14px] border border-bg-border bg-bg-primary/45 px-4 py-3 opacity-80">
                    <div className="micro-stat-label">{field.label}</div>
                    <div className="mt-2 text-sm font-medium text-text-primary">{smartFormatValue(field.path, value)}</div>
                  </div>
                );
              }

              return (
                <label
                  key={field.path}
                  className={clsx(
                    "block rounded-[16px] border px-4 py-4 transition",
                    isChangedFromActive ? "border-[rgba(163,230,53,0.2)] bg-[rgba(163,230,53,0.06)]" : "border-bg-border bg-bg-hover/30",
                    issues.length > 0 && "border-[rgba(251,113,133,0.2)] bg-[rgba(251,113,133,0.06)]",
                  )}
                  title={help}
                >
                  <FieldLabel
                    label={field.label}
                    isChangedFromActive={isChangedFromActive}
                    isUnsaved={isUnsaved}
                    isLiveAffecting={isLiveAffecting}
                  />
                  <input
                    type="number"
                    step={field.step ?? "any"}
                    value={String(value)}
                    onChange={(event) => updatePath(field.path, event.target.value)}
                    className="mt-3 w-full rounded-[12px] border border-bg-border bg-bg-primary/65 px-4 py-3 text-sm text-text-primary outline-none transition focus:border-accent"
                  />
                  <FieldDiff path={field.path} activeValue={activeValue} value={value} issues={issues} />
                </label>
              );
            })}
          </div>
        </Panel>
      </section>

      <section className="grid gap-6 2xl:grid-cols-[0.9fr_1.1fr]">
        <Panel title="Validation summary" eyebrow="Structural issues" tone={serverState.validation.issues.length > 0 ? "critical" : "passive"}>
          {serverState.validation.issues.length === 0 ? (
            <div className="rounded-[14px] border border-bg-border bg-bg-hover/40 px-4 py-4 text-sm text-text-secondary">
              No blocking issue.
            </div>
          ) : (
            <div className="space-y-3">
              {serverState.validation.issues.map((issue) => (
                <div key={`${issue.path}-${issue.message}`} className="rounded-[14px] border border-bg-border bg-bg-hover/40 px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.24em] text-text-muted">{issue.path || "settings"}</div>
                  <div className="mt-2 text-sm text-text-primary">{issue.message}</div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Dry-run review" eyebrow="Promotion gate" tone={serverState.dryRun?.safeToPromote ? "passive" : "warning"}>
          {serverState.dryRun ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <StatusPill value={serverState.dryRun.safeToPromote ? "ready" : "blocked"} />
                <span className="text-sm text-text-secondary">Ran {formatTimestamp(serverState.dryRun.ranAt)}</span>
              </div>
              <ReviewMetric label="Current gate" value={serverState.dryRun.currentGate.allowed ? "Allowed" : serverState.dryRun.currentGate.reason ?? "Blocked"} />
              <ReviewMetric label="Draft gate" value={serverState.dryRun.draftGate.allowed ? "Allowed" : serverState.dryRun.draftGate.reason ?? "Blocked"} />
              <ReviewMetric label="No new blocker" value={serverState.dryRun.noNewBlocker ? "Yes" : "No"} />
              <ReviewMetric label="Queued candidates" value={String(serverState.dryRun.queuedCandidates)} />
              <ReviewMetric label="Open positions" value={String(serverState.dryRun.openPositions)} />
            </div>
          ) : (
            <div className="rounded-[14px] border border-bg-border bg-bg-hover/40 px-4 py-4 text-sm text-text-secondary">
              No dry run yet.
            </div>
          )}
        </Panel>
      </section>

      <div className="sticky bottom-4 z-20 rounded-[16px] border border-bg-border bg-bg-secondary p-4 shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="text-sm font-medium text-text-primary">Save, dry run, promote.</div>
            <div className="mt-1 text-sm text-text-secondary">
              Active {formatTimestamp(serverState.activeUpdatedAt)}.
              {serverState.basedOnUpdatedAt ? ` Draft base ${formatTimestamp(serverState.basedOnUpdatedAt)}.` : ""}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={discardDraft} disabled={isPending || (!serverState.draft && !localDirty)} className="btn-ghost border border-bg-border disabled:cursor-not-allowed disabled:opacity-50" title="Throw away the current draft">
              Discard draft
            </button>
            <button onClick={saveDraft} disabled={isPending || !localDirty} className="btn-ghost border border-bg-border disabled:cursor-not-allowed disabled:opacity-50" title="Persist the current draft">
              Save draft
            </button>
            <button onClick={runDryRun} disabled={isPending || !serverState.draft || !serverState.validation.ok} className="btn-ghost border border-bg-border disabled:cursor-not-allowed disabled:opacity-50" title="Run the dry-run promotion gate">
              Run dry run
            </button>
            <button onClick={promote} disabled={isPending || !canPromote} className="btn-primary disabled:cursor-not-allowed disabled:opacity-50" title="Promote the reviewed draft to active">
              Promote active
            </button>
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
    <div className={`rounded-[16px] border px-4 py-4 ${toneClass}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="section-kicker">{props.title}</div>
        <Icon className="h-4 w-4 text-text-secondary" />
      </div>
      <div className="mt-3">
        <StatusPill value={props.status === "idle" ? "waiting" : props.status} />
      </div>
      <div className="mt-3 text-sm leading-6 text-text-secondary">{props.detail}</div>
    </div>
  );
}

function SummaryRow(props: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-bg-border bg-bg-primary/55 px-3 py-3">
      <div className="text-xs uppercase tracking-[0.18em] text-text-muted">{props.label}</div>
      <div className="mt-2 text-sm font-semibold text-text-primary">{props.value}</div>
    </div>
  );
}

function ReviewMetric(props: { label: string; value: string }) {
  return (
    <div className="micro-stat">
      <div className="micro-stat-label">{props.label}</div>
      <div className="mt-2 text-sm font-medium text-text-primary">{props.value}</div>
    </div>
  );
}

function FieldLabel(props: {
  label: string;
  isChangedFromActive: boolean;
  isUnsaved: boolean;
  isLiveAffecting: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <span className="block text-xs uppercase tracking-[0.3em] text-text-muted">{props.label}</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {props.isChangedFromActive ? <StatusPill value="changed" /> : <span className="meta-chip !px-2 !py-1 text-[10px]">Active match</span>}
          {props.isUnsaved ? <span className="meta-chip !px-2 !py-1 text-[10px]">Unsaved</span> : null}
          {props.isLiveAffecting ? <span className="meta-chip !px-2 !py-1 text-[10px]">Live gate</span> : null}
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
  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
        <span>Active</span>
        <span className="font-mono text-text-primary">{smartFormatValue(props.path, props.activeValue)}</span>
        <span>→</span>
        <span className="font-mono text-text-primary">{smartFormatValue(props.path, props.value)}</span>
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
