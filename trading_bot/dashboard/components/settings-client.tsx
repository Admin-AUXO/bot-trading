"use client";

import { useMemo, useState, useTransition } from "react";
import { Gauge, Save, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { fetchJson } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import type { BotSettings } from "@/lib/types";
import { PageHero, Panel, StatCard } from "@/components/dashboard-primitives";

export function SettingsClient({ initial }: { initial: BotSettings }) {
  const [baseline, setBaseline] = useState(initial);
  const [settings, setSettings] = useState(initial);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty = useMemo(() => JSON.stringify(settings) !== JSON.stringify(baseline), [baseline, settings]);

  const save = () => startTransition(async () => {
    try {
      const next = await fetchJson<BotSettings>("/settings", {
        method: "POST",
        body: JSON.stringify(settings),
      });
      setBaseline(next);
      setSettings(next);
      setSaveError(null);
      setSaveMessage("Runtime config saved.");
    } catch (error) {
      setSaveMessage(null);
      setSaveError(error instanceof Error ? error.message : "save failed");
    }
  });

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Runtime controls"
        title="Tune thresholds without pretending the env file is a control panel"
        description="These values persist in runtime config. Sizing and thresholds are editable here; cadence is shown separately so you can read the lane without accidentally rewriting it."
        aside={(
          <div className="grid gap-3">
            <MiniMetric label="Trade mode" value={settings.tradeMode} />
            <MiniMetric label="US discovery" value={`${formatNumber(settings.cadence.discoveryIntervalMs / 1000)} sec`} />
            <MiniMetric label="Evaluation concurrency" value={formatNumber(settings.cadence.evaluationConcurrency)} />
          </div>
        )}
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Capital" value={`$${formatNumber(settings.capital.capitalUsd)}`} detail="Current capital baseline" tone="accent" icon={Gauge} />
        <StatCard label="Position size" value={`$${formatNumber(settings.capital.positionSizeUsd)}`} detail={`Max ${formatNumber(settings.capital.maxOpenPositions)} open positions`} tone="default" icon={SlidersHorizontal} />
        <StatCard label="Security gate" value={`$${formatNumber(settings.filters.securityCheckMinLiquidityUsd)}`} detail={`${formatNumber(settings.filters.securityCheckVolumeMultiplier)}x volume trigger`} tone="warning" icon={ShieldCheck} />
        <StatCard label="Dirty state" value={dirty ? "Unsaved" : "Clean"} detail={dirty ? "Local edits differ from persisted config" : "No pending config edits"} tone={dirty ? "warning" : "success"} icon={Save} />
      </section>

      {saveError ? (
        <div className="panel-muted rounded-2xl border-accent-red/20 bg-accent-red/8 px-5 py-4 text-sm text-accent-red">
          Save failed: {saveError}
        </div>
      ) : null}

      {saveMessage ? (
        <div className="panel-muted rounded-2xl border-accent-green/20 bg-accent-green/8 px-5 py-4 text-sm text-accent-green">
          {saveMessage}
        </div>
      ) : null}

      <section className="grid gap-6 2xl:grid-cols-[1fr_1.15fr_1fr]">
        <Panel title="Capital and cadence" eyebrow="Desk shape">
          <div className="space-y-5">
            <NumberField label="Capital USD" value={settings.capital.capitalUsd} onChange={(value) => setSettings({ ...settings, capital: { ...settings.capital, capitalUsd: value } })} />
            <NumberField label="Position size USD" value={settings.capital.positionSizeUsd} onChange={(value) => setSettings({ ...settings, capital: { ...settings.capital, positionSizeUsd: value } })} />
            <NumberField label="Max open positions" value={settings.capital.maxOpenPositions} onChange={(value) => setSettings({ ...settings, capital: { ...settings.capital, maxOpenPositions: value } })} />
            <ReadOnlyField label="US-hours discovery interval" value={`${formatNumber(settings.cadence.discoveryIntervalMs / 1000)} sec`} />
            <ReadOnlyField label="Off-hours discovery interval" value={`${formatNumber(settings.cadence.offHoursDiscoveryIntervalMs / 1000)} sec`} />
            <ReadOnlyField label="Queued evaluation interval" value={`${formatNumber(settings.cadence.evaluationIntervalMs / 1000)} sec`} />
            <ReadOnlyField label="Idle evaluation interval" value={`${formatNumber(settings.cadence.idleEvaluationIntervalMs / 1000)} sec`} />
            <ReadOnlyField label="Exit interval" value={`${formatNumber(settings.cadence.exitIntervalMs / 1000)} sec`} />
            <ReadOnlyField label="Entry delay" value={`${formatNumber(settings.cadence.entryDelayMs / 1000)} sec`} />
            <ReadOnlyField label="Evaluation concurrency" value={formatNumber(settings.cadence.evaluationConcurrency)} />
          </div>
        </Panel>

        <Panel title="Entry filters" eyebrow="What gets through">
          <div className="space-y-5">
            <NumberField label="Min liquidity USD" value={settings.filters.minLiquidityUsd} onChange={(value) => setSettings({ ...settings, filters: { ...settings.filters, minLiquidityUsd: value } })} />
            <NumberField label="Max market cap USD" value={settings.filters.maxMarketCapUsd} onChange={(value) => setSettings({ ...settings, filters: { ...settings.filters, maxMarketCapUsd: value } })} />
            <NumberField label="Min holders" value={settings.filters.minHolders} onChange={(value) => setSettings({ ...settings, filters: { ...settings.filters, minHolders: value } })} />
            <NumberField label="Min unique buyers 5m" value={settings.filters.minUniqueBuyers5m} onChange={(value) => setSettings({ ...settings, filters: { ...settings.filters, minUniqueBuyers5m: value } })} />
            <NumberField label="Min buy/sell ratio" value={settings.filters.minBuySellRatio} onChange={(value) => setSettings({ ...settings, filters: { ...settings.filters, minBuySellRatio: value } })} />
            <NumberField label="Max top10 holder %" value={settings.filters.maxTop10HolderPercent} onChange={(value) => setSettings({ ...settings, filters: { ...settings.filters, maxTop10HolderPercent: value } })} />
            <NumberField label="Max single holder %" value={settings.filters.maxSingleHolderPercent} onChange={(value) => setSettings({ ...settings, filters: { ...settings.filters, maxSingleHolderPercent: value } })} />
            <NumberField label="Max graduation age sec" value={settings.filters.maxGraduationAgeSeconds} onChange={(value) => setSettings({ ...settings, filters: { ...settings.filters, maxGraduationAgeSeconds: value } })} />
            <NumberField label="Min 5m volume USD" value={settings.filters.minVolume5mUsd} onChange={(value) => setSettings({ ...settings, filters: { ...settings.filters, minVolume5mUsd: value } })} />
            <NumberField label="Max negative 5m change %" value={settings.filters.maxNegativePriceChange5mPercent} onChange={(value) => setSettings({ ...settings, filters: { ...settings.filters, maxNegativePriceChange5mPercent: value } })} />
            <NumberField label="Security min liquidity USD" value={settings.filters.securityCheckMinLiquidityUsd} onChange={(value) => setSettings({ ...settings, filters: { ...settings.filters, securityCheckMinLiquidityUsd: value } })} />
            <NumberField label="Security volume multiplier" value={settings.filters.securityCheckVolumeMultiplier} onChange={(value) => setSettings({ ...settings, filters: { ...settings.filters, securityCheckVolumeMultiplier: value } })} />
            <NumberField label="Max transfer fee %" value={settings.filters.maxTransferFeePercent} onChange={(value) => setSettings({ ...settings, filters: { ...settings.filters, maxTransferFeePercent: value } })} />
          </div>
        </Panel>

        <Panel title="Exit controls" eyebrow="How edge gets kept">
          <div className="space-y-5">
            <NumberField label="Stop loss %" value={settings.exits.stopLossPercent} onChange={(value) => setSettings({ ...settings, exits: { ...settings.exits, stopLossPercent: value } })} />
            <NumberField label="TP1 multiplier" value={settings.exits.tp1Multiplier} onChange={(value) => setSettings({ ...settings, exits: { ...settings.exits, tp1Multiplier: value } })} />
            <NumberField label="TP2 multiplier" value={settings.exits.tp2Multiplier} onChange={(value) => setSettings({ ...settings, exits: { ...settings.exits, tp2Multiplier: value } })} />
            <NumberField label="TP1 sell fraction" value={settings.exits.tp1SellFraction} onChange={(value) => setSettings({ ...settings, exits: { ...settings.exits, tp1SellFraction: value } })} />
            <NumberField label="TP2 sell fraction" value={settings.exits.tp2SellFraction} onChange={(value) => setSettings({ ...settings, exits: { ...settings.exits, tp2SellFraction: value } })} />
            <NumberField label="Post TP1 retrace %" value={settings.exits.postTp1RetracePercent} onChange={(value) => setSettings({ ...settings, exits: { ...settings.exits, postTp1RetracePercent: value } })} />
            <NumberField label="Trailing stop %" value={settings.exits.trailingStopPercent} onChange={(value) => setSettings({ ...settings, exits: { ...settings.exits, trailingStopPercent: value } })} />
            <NumberField label="Time stop min" value={settings.exits.timeStopMinutes} onChange={(value) => setSettings({ ...settings, exits: { ...settings.exits, timeStopMinutes: value } })} />
            <NumberField label="Min return at time stop %" value={settings.exits.timeStopMinReturnPercent} onChange={(value) => setSettings({ ...settings, exits: { ...settings.exits, timeStopMinReturnPercent: value } })} />
            <NumberField label="Hard time limit min" value={settings.exits.timeLimitMinutes} onChange={(value) => setSettings({ ...settings, exits: { ...settings.exits, timeLimitMinutes: value } })} />
          </div>
        </Panel>
      </section>

      <div className="flex justify-end">
        <button
          onClick={save}
          className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
          disabled={pending || !dirty}
        >
          {pending ? "Saving..." : dirty ? "Save runtime config" : "Runtime config saved"}
        </button>
      </div>
    </div>
  );
}

function NumberField(props: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs uppercase tracking-[0.3em] text-text-muted">{props.label}</span>
      <input
        type="number"
        step="any"
        value={props.value}
        onChange={(event) => props.onChange(Number(event.target.value))}
        className="w-full rounded-2xl border border-bg-border bg-bg-hover/35 px-4 py-3 text-sm text-text-primary outline-none transition focus:border-accent-blue"
      />
    </label>
  );
}

function ReadOnlyField(props: { label: string; value: string }) {
  return (
    <div className="panel-muted rounded-2xl px-4 py-3">
      <div className="text-xs uppercase tracking-[0.3em] text-text-muted">{props.label}</div>
      <div className="mt-2 text-sm font-medium text-text-primary">{props.value}</div>
    </div>
  );
}

function MiniMetric(props: { label: string; value: string }) {
  return (
    <div className="micro-stat rounded-[22px] px-4 py-3">
      <div className="micro-stat-label">{props.label}</div>
      <div className="mt-2 text-sm font-medium text-text-primary">{props.value}</div>
    </div>
  );
}
