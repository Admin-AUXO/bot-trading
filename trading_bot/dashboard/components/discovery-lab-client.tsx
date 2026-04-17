"use client";

import clsx from "clsx";
import {
  ChevronDown,
  ChevronUp,
  CircleDashed,
  ExternalLink,
  Play,
  PlayCircle,
  Plus,
  Save,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
  Trophy,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { EmptyState, Panel, ScanStat, StatusPill } from "@/components/dashboard-primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { fetchJson } from "@/lib/api";
import {
  formatCompactCurrency,
  formatInteger,
  formatNumber,
  formatPercent,
} from "@/lib/format";
import { cn } from "@/components/ui/cn";
import type {
  BotSettings,
  DiscoveryLabApplyLiveStrategyResponse,
  DiscoveryLabCatalog,
  DiscoveryLabPack,
  DiscoveryLabPackDraft,
  DiscoveryLabRecipe,
  DiscoveryLabRunDetail,
  DiscoveryLabRunReport,
  DiscoveryLabRuntimeSnapshot,
  DiscoveryLabThresholdOverrides,
  DiscoveryLabValidationIssue,
  DiscoveryLabValidationResponse,
  LiveStrategySettings,
} from "@/lib/types";

// ============================================================================
// CONSTANTS
// ============================================================================

const PROFILE_OPTIONS: Array<{ value: DiscoveryLabPackDraft["defaultProfile"]; label: string }> = [
  { value: "runtime", label: "Runtime" },
  { value: "high-value", label: "High Value" },
  { value: "scalp", label: "Scalp" },
];

const THRESHOLD_FIELDS: Array<{ key: keyof DiscoveryLabThresholdOverrides; label: string; unit: string; step: number; suggestions: number[] }> = [
  { key: "minLiquidityUsd", label: "Min Liquidity", unit: "USD", step: 500, suggestions: [5000, 10000, 15000] },
  { key: "maxMarketCapUsd", label: "Max Market Cap", unit: "USD", step: 50000, suggestions: [1000000, 1500000, 2000000] },
  { key: "minHolders", label: "Min Holders", unit: "holders", step: 1, suggestions: [30, 45, 60] },
  { key: "minVolume5mUsd", label: "Min 5m Vol", unit: "USD", step: 250, suggestions: [1500, 2000, 3000] },
  { key: "minUniqueBuyers5m", label: "Min Buyers", unit: "buyers", step: 1, suggestions: [10, 15, 20] },
  { key: "minBuySellRatio", label: "Min B/S", unit: "ratio", step: 0.05, suggestions: [1, 1.1, 1.25] },
  { key: "maxTop10HolderPercent", label: "Max Top10%", unit: "%", step: 1, suggestions: [35, 42, 50] },
  { key: "maxSingleHolderPercent", label: "Max Single%", unit: "%", step: 1, suggestions: [18, 22, 25] },
];

const SORT_OPTIONS = [
  { value: "last_trade_unix_time", label: "Last Trade" },
  { value: "graduated_time", label: "Graduated" },
  { value: "volume_5m_usd", label: "Volume 5m" },
  { value: "price_change_5m_percent", label: "Price 5m" },
  { value: "liquidity", label: "Liquidity" },
  { value: "market_cap", label: "Market Cap" },
];

const FILTER_FIELDS = [
  { key: "graduated", label: "Graduated Only", kind: "boolean" as const },
  { key: "min_progress_percent", label: "Min Progress", kind: "number" as const, unit: "%", step: 1, suggestions: [50, 75, 90] },
  { key: "min_liquidity", label: "Min Liquidity", kind: "number" as const, unit: "USD", step: 500, suggestions: [8000, 12000, 16000] },
  { key: "max_liquidity", label: "Max Liquidity", kind: "number" as const, unit: "USD", step: 500, suggestions: [25000, 50000, 100000] },
  { key: "min_market_cap", label: "Min Market Cap", kind: "number" as const, unit: "USD", step: 10000, suggestions: [100000, 250000, 500000] },
  { key: "min_holder", label: "Min Holders", kind: "number" as const, unit: "wallets", step: 1, suggestions: [40, 60, 80] },
  { key: "min_volume_5m_usd", label: "Min 5m Vol", kind: "number" as const, unit: "USD", step: 250, suggestions: [1500, 2000, 3000] },
  { key: "creator", label: "Creator", kind: "text" as const, placeholder: "Wallet" },
];

const FILTER_FIELD_MAP = Object.fromEntries(FILTER_FIELDS.map(f => [f.key, f]));

// ============================================================================
// TYPES
// ============================================================================

type StructuredRecipeForm = {
  sort_by: string;
  sort_type: "asc" | "desc";
  source: string;
  limit: string;
  filters: Record<string, string>;
};

type TokenBoardRow = {
  mint: string;
  symbol: string;
  source: string;
  recipe: string;
  passed: boolean;
  grade: string;
  playScore: number;
  entryScore: number;
  liquidityUsd: number | null;
  volume5mUsd: number | null;
  priceChange5mPercent: number | null;
  top10HolderPercent: number | null;
  timeSinceGraduationMin: number | null;
  rejectReason: string | null;
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function displayPackName(pack?: Pick<DiscoveryLabPack, "id" | "name"> | null): string {
  const name = pack?.name?.trim();
  if (name && name.length > 0) return name;
  if (!pack?.id) return "Default";
  return pack.id.replace(/^discovery-lab\.recipes\.?/, "").replace(/^discovery-lab/, "default").replace(/[._-]+/g, " ").trim() || "Default";
}

function toDraft(pack?: DiscoveryLabPack | null): DiscoveryLabPackDraft {
  if (!pack) return { name: "", description: "", defaultSources: ["pump_dot_fun"], defaultProfile: "high-value", thresholdOverrides: {}, recipes: [] };
  return {
    id: pack.kind === "custom" ? pack.id : undefined,
    name: displayPackName(pack),
    description: pack.description,
    thesis: pack.thesis,
    targetPnlBand: pack.targetPnlBand,
    defaultSources: pack.defaultSources,
    defaultProfile: pack.defaultProfile,
    thresholdOverrides: pack.thresholdOverrides,
    recipes: pack.recipes,
  };
}

function createBlankRecipe(): DiscoveryLabRecipe {
  return { name: "", mode: "graduated", description: "", params: { graduated: true, sort_by: "last_trade_unix_time", sort_type: "desc", limit: 100 } };
}

function buildParamTextsFromRecipes(recipes: DiscoveryLabRecipe[]): Record<number, string> {
  return Object.fromEntries(recipes.map((recipe, index) => [index, JSON.stringify(recipe.params, null, 2)]));
}

function safeParseParams(value: string): Record<string, string | number | boolean | null> {
  if (!value?.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return (parsed && typeof parsed === "object" && !Array.isArray(parsed)) ? parsed : {};
  } catch { return {}; }
}

function parseStructuredRecipeForm(value: string): StructuredRecipeForm {
  const params = safeParseParams(value);
  return {
    sort_by: typeof params.sort_by === "string" ? params.sort_by : "last_trade_unix_time",
    sort_type: params.sort_type === "asc" ? "asc" : "desc",
    source: typeof params.source === "string" ? params.source : "",
    limit: String(params.limit ?? ""),
    filters: Object.fromEntries(Object.entries(params).filter(([k]) => k.startsWith("min_") || k.startsWith("max_") || k === "graduated" || k === "creator").map(([k, v]) => [k, String(v ?? "")])),
  };
}

function serializeRecipeForm(form: StructuredRecipeForm): Record<string, string | number | boolean | null> {
  const result: Record<string, string | number | boolean | null> = { sort_by: form.sort_by, sort_type: form.sort_type };
  if (form.source.trim()) result.source = form.source;
  if (form.limit.trim()) result.limit = Number(form.limit) || 100;
  for (const [key, value] of Object.entries(form.filters)) {
    if (value.trim()) {
      const field = FILTER_FIELD_MAP[key];
      if (field?.kind === "number") result[key] = Number(value) || 0;
      else if (field?.kind === "boolean") result[key] = value === "true";
      else result[key] = value;
    }
  }
  return result;
}

function updateParamText(paramTexts: Record<number, string>, index: number, mutator: (form: StructuredRecipeForm) => StructuredRecipeForm): Record<number, string> {
  const form = parseStructuredRecipeForm(paramTexts[index] ?? "{}");
  const updated: Record<number, string> = { ...paramTexts };
  updated[index] = JSON.stringify(serializeRecipeForm(mutator(form)), null, 2);
  return updated;
}

function collectLogLines(value?: string): string[] {
  return (value ?? "").split("\n").map(l => l.trimEnd()).filter(l => l.length > 0).slice(-20);
}

function lastNonEmptyLine(value?: string): string | null {
  const lines = collectLogLines(value);
  return lines.length > 0 ? lines[lines.length - 1] : null;
}

function formatSuggestedValue(value: number, unit: string): string {
  if (unit === "USD") return value >= 1000 ? `$${Math.round(value / 1000)}k` : `$${value}`;
  if (unit === "%") return `${value}%`;
  if (unit === "min") return value === 0 ? "Now" : `${value}m`;
  return String(value);
}

function humanizeLabel(value: string): string {
  return value.replace(/_dot_/g, ".").replace(/_/g, " ").replace(/\b\w/g, m => m.toUpperCase());
}

function buildTokenRows(report: DiscoveryLabRunReport | null): TokenBoardRow[] {
  if (!report) return [];
  const byMint = new Map<string, TokenBoardRow>();
  for (const eval_ of report.deepEvaluations) {
    const existing = byMint.get(eval_.mint);
    if (!existing || eval_.playScore > existing.playScore) {
      byMint.set(eval_.mint, {
        mint: eval_.mint,
        symbol: eval_.symbol,
        source: eval_.source,
        recipe: eval_.recipeName,
        passed: eval_.pass,
        grade: eval_.grade,
        playScore: eval_.playScore,
        entryScore: eval_.entryScore,
        liquidityUsd: eval_.liquidityUsd,
        volume5mUsd: eval_.volume5mUsd,
        priceChange5mPercent: eval_.priceChange5mPercent,
        top10HolderPercent: eval_.top10HolderPercent,
        timeSinceGraduationMin: eval_.timeSinceGraduationMin,
        rejectReason: eval_.rejectReason,
      });
    }
  }
  return Array.from(byMint.values());
}

function buildRunCommandPreview(draft: DiscoveryLabPackDraft): string {
  const sources = (draft.defaultSources?.length ? draft.defaultSources : ["pump_dot_fun"]).join(",");
  const profile = draft.defaultProfile ?? "high-value";
  return `Profile: ${profile} | Sources: ${sources} | Strategies: ${draft.recipes.length}`;
}

function sanitizeLiveStrategy(input: LiveStrategySettings): LiveStrategySettings {
  const exits = input.exitOverrides;
  return {
    ...input,
    capitalModifierPercent: Math.min(180, Math.max(40, input.capitalModifierPercent)),
    exitOverrides: {
      ...exits,
      stopLossPercent: Math.min(35, Math.max(4, exits.stopLossPercent ?? 15)),
    },
  };
}

function truncateMiddle(str: string, start: number, end: number): string {
  if (str.length <= start + end + 3) return str;
  return `${str.slice(0, start)}...${str.slice(-end)}`;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function DiscoveryLabClient(props: {
  initialCatalog: DiscoveryLabCatalog;
  initialRuntimeSnapshot: DiscoveryLabRuntimeSnapshot;
}) {
  const { initialCatalog, initialRuntimeSnapshot } = props;

  // ---------------------------------------------------------------------------
  // CORE STATE
  // ---------------------------------------------------------------------------
  const [catalog, setCatalog] = useState(initialCatalog);
  const [runtimeSnapshot, setRuntimeSnapshot] = useState(initialRuntimeSnapshot);
  const [selectedPackId, setSelectedPackId] = useState(initialCatalog.packs[0]?.id ?? "");
  const [draft, setDraft] = useState<DiscoveryLabPackDraft>(() => toDraft(initialCatalog.packs[0] ?? null));
  const [paramTexts, setParamTexts] = useState<Record<number, string>>(() => buildParamTextsFromRecipes(initialCatalog.packs[0]?.recipes ?? []));
  const [issues, setIssues] = useState<DiscoveryLabValidationIssue[]>([]);
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null);
  const [selectedRunId, setSelectedRunId] = useState(initialCatalog.activeRun?.id ?? "");
  const [runDetail, setRunDetail] = useState<DiscoveryLabRunDetail | null>(null);
  const [selectedRecipeIndex, setSelectedRecipeIndex] = useState(0);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [liveStrategyDraft, setLiveStrategyDraft] = useState<LiveStrategySettings>(initialRuntimeSnapshot.settings.strategy.liveStrategy);
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<"config" | "results">("config");

  // ---------------------------------------------------------------------------
  // DERIVED STATE
  // ---------------------------------------------------------------------------
  const selectedPack = catalog.packs.find(p => p.id === selectedPackId) ?? null;
  const activeRun = runDetail?.status === "RUNNING" ? runDetail : catalog.activeRun ?? null;
  const completedRunDetail = runDetail?.status === "COMPLETED" ? runDetail : null;
  const runBusy = Boolean(isPending || activeRun?.status === "RUNNING");
  const selectedRecipe = draft.recipes[selectedRecipeIndex];
  const selectedForm = selectedRecipe ? parseStructuredRecipeForm(paramTexts[selectedRecipeIndex] ?? "{}") : null;
  const report = runDetail?.report ?? null;
  const tokenRows = useMemo(() => buildTokenRows(report), [report]);
  const editorBlocked = draft.recipes.length === 0;
  const dirty = selectedPack && JSON.stringify(draft) !== JSON.stringify(toDraft(selectedPack));

  // ---------------------------------------------------------------------------
  // EFFECTS
  // ---------------------------------------------------------------------------
  useEffect(() => { if (!selectedRunId) { setRunDetail(null); return; } void loadRun(selectedRunId); }, [selectedRunId]);
  useEffect(() => {
    if (runDetail?.status !== "RUNNING") return;
    const timer = window.setInterval(() => void loadRun(runDetail.id, true), 3000);
    return () => window.clearInterval(timer);
  }, [runDetail?.id, runDetail?.status]);
  useEffect(() => {
    if (!catalog.activeRun) return;
    const timer = window.setInterval(() => void reloadCatalog(), 3000);
    return () => window.clearInterval(timer);
  }, [catalog.activeRun?.id]);
  useEffect(() => {
    if (completedRunDetail && activeTab === "config") {
      setActiveTab("results");
    }
  }, [completedRunDetail?.id]);

  // ---------------------------------------------------------------------------
  // API FUNCTIONS
  // ---------------------------------------------------------------------------
  async function reloadCatalog() {
    const [next, nextRuntime] = await Promise.all([
      fetchJson<DiscoveryLabCatalog>("/operator/discovery-lab/catalog"),
      fetchJson<DiscoveryLabRuntimeSnapshot>("/status"),
    ]);
    setCatalog(next);
    setRuntimeSnapshot(nextRuntime);
    if (next.activeRun && next.activeRun.id !== selectedRunId) setSelectedRunId(next.activeRun.id);
  }

  async function loadRun(runId: string, silent = false) {
    try {
      const next = await fetchJson<DiscoveryLabRunDetail>(`/operator/discovery-lab/runs/${runId}`);
      setRunDetail(next);
      if (next.status !== "RUNNING") await reloadCatalog();
    } catch (err) {
      if (!silent) setToast({ message: err instanceof Error ? err.message : "Failed to load run", error: true });
    }
  }

  function materializeDraft(): DiscoveryLabPackDraft | null {
    if (editorBlocked) { setToast({ message: "Add at least one strategy", error: true }); return null; }
    try {
      const parsedRecipes = draft.recipes.map((recipe, index) => ({ ...recipe, params: safeParseParams(paramTexts[index] ?? "{}") }));
      return { ...draft, recipes: parsedRecipes };
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : "Invalid strategy params", error: true });
      return null;
    }
  }

  function runValidation() {
    const payload = materializeDraft();
    if (!payload) return;
    startTransition(async () => {
      try {
        const response = await fetchJson<DiscoveryLabValidationResponse>("/operator/discovery-lab/validate", {
          method: "POST",
          body: JSON.stringify({ draft: payload, allowOverfiltered: false }),
        });
        setIssues(response.issues);
        setDraft(response.pack);
        setParamTexts(buildParamTextsFromRecipes(response.pack.recipes));
        setToast({ message: response.ok ? "Validation passed ✓" : `${response.issues.length} issue(s) found` });
      } catch (err) {
        setToast({ message: err instanceof Error ? err.message : "Validation failed", error: true });
      }
    });
  }

  function savePack() {
    const payload = materializeDraft();
    if (!payload) return;
    startTransition(async () => {
      try {
        const saved = await fetchJson<DiscoveryLabPack>("/operator/discovery-lab/packs/save", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        await reloadCatalog();
        setSelectedPackId(saved.id);
        setDraft(toDraft(saved));
        setParamTexts(buildParamTextsFromRecipes(saved.recipes));
        setToast({ message: "Pack saved ✓" });
      } catch (err) {
        setToast({ message: err instanceof Error ? err.message : "Save failed", error: true });
      }
    });
  }

  function startRun() {
    const payload = materializeDraft();
    if (!payload) return;
    startTransition(async () => {
      try {
        const next = await fetchJson<DiscoveryLabRunDetail>("/operator/discovery-lab/run", {
          method: "POST",
          body: JSON.stringify({ draft: payload, sources: payload.defaultSources ?? [], profile: payload.defaultProfile ?? "high-value", thresholdOverrides: payload.thresholdOverrides, allowOverfiltered: false }),
        });
        setRunDetail(next);
        setSelectedRunId(next.id);
        await reloadCatalog();
        setActiveTab("results");
        setToast({ message: "Run started ✓" });
      } catch (err) {
        setToast({ message: err instanceof Error ? err.message : "Run failed", error: true });
      }
    });
  }

  function selectPack(pack: DiscoveryLabPack) {
    setSelectedPackId(pack.id);
    setDraft(toDraft(pack));
    setParamTexts(buildParamTextsFromRecipes(pack.recipes));
    setIssues([]);
    setSelectedRecipeIndex(0);
  }

  function addStrategy() {
    const nextRecipe = createBlankRecipe();
    setDraft(d => ({ ...d, recipes: [...d.recipes, nextRecipe] }));
    setParamTexts(pt => { const updated: Record<number, string> = { ...pt }; updated[Object.keys(pt).length] = JSON.stringify(nextRecipe.params, null, 2); return updated; });
    setSelectedRecipeIndex(draft.recipes.length);
    setBuilderOpen(true);
  }

  function removeStrategy(index: number) {
    setDraft(d => ({ ...d, recipes: d.recipes.filter((_, i) => i !== index) }));
    setParamTexts(pt => Object.fromEntries(Object.entries(pt).filter(([k]) => Number(k) !== index).map(([k, v]) => [Number(k) > index ? Number(k) - 1 : Number(k), v])));
    setSelectedRecipeIndex(i => Math.max(0, i >= index ? Math.max(0, i - 1) : i));
  }

  function moveStrategy(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= draft.recipes.length) return;
    setDraft(d => { const recipes = [...d.recipes]; [recipes[index], recipes[targetIndex]] = [recipes[targetIndex], recipes[index]]; return { ...d, recipes }; });
    setParamTexts((pt) => {
      const entries = Object.entries(pt).map(([k, v]) => [Number(k), v] as [number, string]).sort((a, b) => a[0] - b[0]);
      const reordered = [...entries];
      [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
      const result: Record<number, string> = {};
      reordered.forEach(([, v], i) => { result[i] = v; });
      return result;
    });
    setSelectedRecipeIndex(targetIndex);
  }

  function applyLiveStrategy() {
    if (!runDetail) return;
    startTransition(async () => {
      try {
        const response = await fetchJson<DiscoveryLabApplyLiveStrategyResponse>("/operator/discovery-lab/apply-live-strategy", {
          method: "POST",
          body: JSON.stringify({ runId: runDetail.id }),
        });
        setLiveStrategyDraft(sanitizeLiveStrategy(response.strategy));
        const settings = await fetchJson<BotSettings>("/settings");
        setLiveStrategyDraft(sanitizeLiveStrategy(settings.strategy.liveStrategy));
        setToast({ message: `Applied ${response.strategy.capitalModifierPercent}% capital` });
      } catch (err) {
        setToast({ message: err instanceof Error ? err.message : "Apply failed", error: true });
      }
    });
  }

  // ---------------------------------------------------------------------------
  // RENDER HELPERS
  // ---------------------------------------------------------------------------
  function ChoiceChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
      <button type="button" onClick={onClick} className={cn(
        "inline-flex items-center rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
        active ? "border-accent/50 bg-accent/10 text-accent" : "border-[#2a2a35] bg-[#1a1a1f] text-text-secondary hover:text-text-primary hover:border-[#3a3a45]"
      )}>{children}</button>
    );
  }

  function NumberInput({ value, step, unit, suggestions, onChange }: {
    value: string | number | undefined; step: number; unit: string; suggestions: number[];
    onChange: (v: number | null) => void;
  }) {
    return (
      <div className="space-y-1.5">
        <input type="number" step={step} value={value ?? ""} onChange={e => onChange(e.target.value === "" ? null : Number(e.target.value))}
          className="w-full rounded-md border border-[#2a2a35] bg-[#111318] px-3 py-1.5 text-sm text-text-primary outline-none focus:border-accent/50" />
        <div className="flex flex-wrap gap-1">
          {suggestions.map(s => (
            <button key={s} type="button" onClick={() => onChange(s)}
              className="rounded border border-[#2a2a35] bg-[#1a1a1f] px-2 py-0.5 text-[10px] text-text-secondary hover:border-accent/30 hover:text-accent">
              {formatSuggestedValue(s, unit)}
            </button>
          ))}
        </div>
      </div>
    );
  }

  function FilterCard({ field, value, onChange, onRemove }: { field: typeof FILTER_FIELDS[number]; value: string; onChange: (v: string) => void; onRemove: () => void }) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-[#2a2a35] bg-[#111318] p-2">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-text-secondary">{field.label}</div>
          {field.kind === "boolean" ? (
            <div className="flex gap-1 mt-1">
              {["true", "false"].map(v => <ChoiceChip key={v} active={value === v} onClick={() => onChange(v)}>{v === "true" ? "Yes" : "No"}</ChoiceChip>)}
            </div>
          ) : field.kind === "text" ? (
            <Input value={value} onChange={e => onChange(e.target.value)} placeholder={field.placeholder} className="mt-1 h-7 text-xs" />
          ) : (
            <NumberInput value={value} step={field.step} unit={field.unit ?? ""} suggestions={field.suggestions ?? []}
              onChange={v => onChange(v == null ? "" : String(v))} />
          )}
        </div>
        <button type="button" onClick={onRemove} className="text-text-muted hover:text-danger"><X className="h-4 w-4" /></button>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // TAB NAVIGATION
  // ---------------------------------------------------------------------------
  function TabNav({ tabs, value, onChange }: { tabs: { id: string; label: string; count?: number }[]; value: string; onChange: (v: "config" | "results") => void }) {
    return (
      <div className="flex items-center gap-1 rounded-lg bg-[#1a1a1f] p-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id as "config" | "results")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              value === tab.id ? "bg-[#111318] text-text-primary" : "text-text-secondary hover:text-text-primary"
            )}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <Badge variant="default" className="text-[10px]">{tab.count}</Badge>
            )}
          </button>
        ))}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // RUN PROGRESS COMPONENT
  // ---------------------------------------------------------------------------
  function RunProgress() {
    if (!activeRun) return null;
    return (
      <div className="rounded-lg border border-[#2a2a35] bg-[#111318] p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <StatusPill value={activeRun.status} />
            <span className="text-sm text-text-primary">{activeRun.packName}</span>
          </div>
          <span className="text-xs text-text-muted">
            {activeRun.evaluationCount !== null ? `${formatInteger(activeRun.evaluationCount)} evals` : "Running..."}
          </span>
        </div>
        <div className="flex justify-between mt-1 text-[10px] text-text-muted">
          <span>{activeRun.queryCount !== null ? `${formatInteger(activeRun.queryCount)} queries` : ""}</span>
          <span>{activeRun.winnerCount !== null ? `${formatInteger(activeRun.winnerCount)} winners` : ""}</span>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // RESULTS TABLE COMPONENT
  // ---------------------------------------------------------------------------
  function ResultsTable() {
    if (tokenRows.length === 0) {
      return (
        <Card className="border-[#2a2a35] bg-[#111318]">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Trophy className="h-12 w-12 text-text-muted mb-4" />
            <p className="text-text-secondary">No results yet</p>
            <p className="text-xs text-text-muted mt-1">Run a pack to see token results</p>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className="border-[#2a2a35] bg-[#111318]">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-medium">{tokenRows.length} Tokens</CardTitle>
              <CardDescription className="text-xs">
                {tokenRows.filter(r => r.passed).length} passed · {completedRunDetail?.winnerCount ?? 0} winners
              </CardDescription>
            </div>
            {completedRunDetail?.strategyCalibration && (
              <Button size="sm" onClick={applyLiveStrategy} disabled={isPending}>
                <PlayCircle className="h-4 w-4 mr-1" />
                Apply to Live
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[400px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[#111318]">
                <tr className="border-b border-[#2a2a35]">
                  <th className="px-3 py-2 text-left text-xs font-medium text-text-muted">Token</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-text-muted">Status</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-text-muted">Liquidity</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-text-muted">Vol 5m</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-text-muted">Chg 5m</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-text-muted">Score</th>
                  <th className="px-3 py-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {tokenRows.slice(0, 50).map(row => (
                  <tr key={row.mint} className="border-b border-[#1f1f28] hover:bg-[#1a1a22]">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-text-primary">{row.symbol}</span>
                        <span className="text-xs text-text-muted">{truncateMiddle(row.mint, 4, 3)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <Badge variant={row.passed ? "accent" : "danger"} className="text-[10px]">{row.passed ? "PASS" : "FAIL"}</Badge>
                        <Badge variant="default" className="text-[10px]">{row.grade}</Badge>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right text-text-secondary">
                      {row.liquidityUsd !== null ? formatCompactCurrency(row.liquidityUsd) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-text-secondary">
                      {row.volume5mUsd !== null ? formatCompactCurrency(row.volume5mUsd) : "—"}
                    </td>
                    <td className={cn("px-3 py-2 text-right", (row.priceChange5mPercent ?? 0) >= 0 ? "text-[#10b981]" : "text-[#f43f5e]")}>
                      {row.priceChange5mPercent !== null ? formatPercent(row.priceChange5mPercent) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-accent">
                      {formatNumber(row.playScore)}
                    </td>
                    <td className="px-3 py-2">
                      <a href={`https://dexscreener.com/solana/${row.mint}`} target="_blank" rel="noopener noreferrer"
                        className="inline-flex p-1 text-text-muted hover:text-text-primary">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ---------------------------------------------------------------------------
  // CONFIG TAB CONTENT
  // ---------------------------------------------------------------------------
  function ConfigTab() {
    return (
      <div className="space-y-4">
        {/* Quick Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={startRun} disabled={runBusy || editorBlocked}>
            <Play className="h-4 w-4 mr-1" />
            {runBusy ? "Running..." : "Run Lab"}
          </Button>
          <Button size="sm" variant="secondary" onClick={runValidation} disabled={isPending || editorBlocked}>
            <ShieldAlert className="h-4 w-4 mr-1" />
            Validate
          </Button>
          <Button size="sm" variant="secondary" onClick={savePack} disabled={isPending || editorBlocked}>
            <Save className="h-4 w-4 mr-1" />
            Save
          </Button>
          <Separator className="h-6" />
          <select value={selectedPackId || "__draft__"} onChange={e => {
            if (e.target.value === "__draft__") return;
            const pack = catalog.packs.find(p => p.id === e.target.value);
            if (pack) selectPack(pack);
          }} className="h-8 rounded-md border border-[#2a2a35] bg-[#1a1a1f] px-2 text-xs text-text-primary outline-none">
            <option value="__draft__">Draft</option>
            {catalog.packs.map(p => <option key={p.id} value={p.id}>{displayPackName(p)}</option>)}
          </select>
        </div>

        {/* Profile & Sources */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="border-[#2a2a35] bg-[#111318]">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-text-muted">Profile</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                {PROFILE_OPTIONS.map(opt => (
                  <ChoiceChip key={opt.value} active={draft.defaultProfile === opt.value}
                    onClick={() => setDraft(d => ({ ...d, defaultProfile: opt.value }))}>
                    {opt.label}
                  </ChoiceChip>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card className="border-[#2a2a35] bg-[#111318]">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-text-muted">Sources</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1">
                {catalog.knownSources.map(source => (
                  <ChoiceChip key={source} active={(draft.defaultSources ?? []).includes(source)}
                    onClick={() => setDraft(d => {
                      const sources = d.defaultSources ?? [];
                      return { ...d, defaultSources: sources.includes(source) ? sources.filter(s => s !== source) : [...sources, source] };
                    })}>
                    {humanizeLabel(source)}
                  </ChoiceChip>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Strategy Builder */}
        <Card className="border-[#2a2a35] bg-[#111318]">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm">Strategies ({draft.recipes.length})</CardTitle>
                <CardDescription className="text-xs">Configure discovery recipes</CardDescription>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setBuilderOpen(!builderOpen)}>
                <SlidersHorizontal className="h-4 w-4 mr-1" />
                {builderOpen ? "Hide" : "Edit"}
              </Button>
            </div>
          </CardHeader>
          {builderOpen && (
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={addStrategy} disabled={isPending}>
                  <Plus className="h-4 w-4 mr-1" />Add Strategy
                </Button>
              </div>

              {selectedRecipe && (
                <div className="space-y-3 rounded-lg border border-[#2a2a35] bg-[#0d0f14] p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-text-primary">
                      {selectedRecipe.name || `Strategy ${selectedRecipeIndex + 1}`}
                    </span>
                    <div className="flex gap-1">
                      <button onClick={() => moveStrategy(selectedRecipeIndex, -1)} disabled={selectedRecipeIndex === 0}
                        className="p-1 text-text-muted hover:text-text-primary disabled:opacity-50">
                        <ChevronUp className="h-4 w-4" />
                      </button>
                      <button onClick={() => moveStrategy(selectedRecipeIndex, 1)} disabled={selectedRecipeIndex === draft.recipes.length - 1}
                        className="p-1 text-text-muted hover:text-text-primary disabled:opacity-50">
                        <ChevronDown className="h-4 w-4" />
                      </button>
                      <button onClick={() => removeStrategy(selectedRecipeIndex)}
                        className="p-1 text-text-muted hover:text-danger">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">Mode</label>
                      <div className="flex gap-1">
                        <ChoiceChip active={selectedRecipe.mode === "graduated"} onClick={() => setDraft(d => ({ ...d, recipes: d.recipes.map((r, i) => i === selectedRecipeIndex ? { ...r, mode: "graduated" } : r) }))}>Post-grad</ChoiceChip>
                        <ChoiceChip active={selectedRecipe.mode === "pregrad"} onClick={() => setDraft(d => ({ ...d, recipes: d.recipes.map((r, i) => i === selectedRecipeIndex ? { ...r, mode: "pregrad" } : r) }))}>Pre-grad</ChoiceChip>
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">Sort</label>
                      <select value={selectedForm?.sort_by ?? "last_trade_unix_time"} onChange={e => setParamTexts(pt => updateParamText(pt, selectedRecipeIndex, f => ({ ...f, sort_by: e.target.value })))}
                        className="w-full rounded-md border border-[#2a2a35] bg-[#1a1a1f] px-2 py-1 text-xs text-text-primary outline-none">
                        {SORT_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">
                      Filters ({Object.keys(selectedForm?.filters ?? {}).length})
                    </label>
                    <div className="space-y-1">
                      {Object.entries(selectedForm?.filters ?? {}).filter(([k]) => !["sort_by", "sort_type", "limit", "source", "graduated"].includes(k)).map(([key, value]) => {
                        const field = FILTER_FIELD_MAP[key];
                        if (!field) return null;
                        return (
                          <FilterCard key={key} field={field} value={value}
                            onChange={v => setParamTexts(pt => updateParamText(pt, selectedRecipeIndex, f => ({ ...f, filters: { ...f.filters, [key]: v } })))}
                            onRemove={() => setParamTexts(pt => updateParamText(pt, selectedRecipeIndex, f => { const filters = { ...f.filters }; delete filters[key]; return { ...f, filters }; }))} />
                        );
                      })}
                    </div>
                    <select value="" onChange={e => {
                      if (e.target.value) setParamTexts(pt => updateParamText(pt, selectedRecipeIndex, f => ({ ...f, filters: { ...f.filters, [e.target.value]: "" } })));
                    }} className="mt-2 w-full rounded-md border border-[#2a2a35] bg-[#1a1a1f] px-2 py-1 text-xs text-text-primary outline-none">
                      <option value="">+ Add filter</option>
                      {FILTER_FIELDS.filter(f => !["sort_by", "sort_type", "limit", "source", "graduated"].includes(f.key) && !selectedForm?.filters[f.key]).map(f => (
                        <option key={f.key} value={f.key}>{f.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Strategy List */}
              <div className="space-y-1">
                {draft.recipes.map((recipe, index) => {
                  const form = parseStructuredRecipeForm(paramTexts[index] ?? "{}");
                  const sortLabel = SORT_OPTIONS.find(o => o.value === form.sort_by)?.label ?? "Sort";
                  return (
                    <button key={index} type="button" onClick={() => setSelectedRecipeIndex(index)}
                      className={cn(
                        "w-full rounded-md border px-3 py-2 text-left text-xs transition-colors",
                        selectedRecipeIndex === index ? "border-accent/50 bg-accent/5 text-text-primary" : "border-[#2a2a35] bg-[#1a1a1f] text-text-secondary hover:border-[#3a3a45]"
                      )}>
                      <div className="flex items-center justify-between">
                        <span>{recipe.name || `Strategy ${index + 1}`}</span>
                        <Badge variant="default" className="text-[10px]">{recipe.mode}</Badge>
                      </div>
                      <div className="mt-0.5 text-[10px] text-text-muted">{sortLabel} · {Object.keys(form.filters).length} filters</div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          )}
        </Card>

        {/* Threshold Overrides */}
        <Card className="border-[#2a2a35] bg-[#111318]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Threshold Overrides</CardTitle>
            <CardDescription className="text-xs">Fine-tune discovery criteria</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {THRESHOLD_FIELDS.slice(0, 8).map(field => (
                <div key={field.key}>
                  <label className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">{field.label}</label>
                  <NumberInput value={draft.thresholdOverrides?.[field.key]} step={field.step} unit={field.unit} suggestions={field.suggestions}
                    onChange={v => setDraft(d => ({ ...d, thresholdOverrides: { ...(d.thresholdOverrides ?? {}), [field.key]: v ?? undefined } }))} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Validation Issues */}
        {issues.length > 0 && (
          <Card className="border-[#2a2a35] bg-[#111318]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-[#f43f5e]">Issues ({issues.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {issues.slice(0, 5).map((issue, i) => (
                  <div key={i} className="flex items-center gap-2 rounded bg-[#1a1a1f] px-2 py-1 text-xs">
                    <Badge variant={issue.level === "error" ? "danger" : "warning"} className="text-[10px]">{issue.level}</Badge>
                    <span className="text-text-secondary">{issue.message}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // RESULTS TAB CONTENT
  // ---------------------------------------------------------------------------
  function ResultsTab() {
    return (
      <div className="space-y-4">
        <RunProgress />
        <ResultsTable />

        {/* Recent Runs */}
        <Card className="border-[#2a2a35] bg-[#111318]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Recent Runs</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[200px] overflow-auto">
              {catalog.recentRuns.slice(0, 10).map(run => (
                <button key={run.id} type="button" onClick={() => setSelectedRunId(run.id)}
                  className={cn(
                    "flex w-full items-center justify-between border-b border-[#1f1f28] px-3 py-2 text-left transition-colors hover:bg-[#1a1a22]",
                    selectedRunId === run.id && "bg-accent/5"
                  )}>
                  <div className="flex items-center gap-2">
                    <StatusPill value={run.status} />
                    <span className="text-xs text-text-primary">{run.packName}</span>
                  </div>
                  <span className="text-[10px] text-text-muted">
                    {run.evaluationCount !== null ? `${formatInteger(run.evaluationCount)}` : ""} evals
                    {run.winnerCount !== null ? ` · ${formatInteger(run.winnerCount)} won` : ""}
                  </span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // LIVE SESSION PANEL
  // ---------------------------------------------------------------------------
  function LiveSessionPanel() {
    return (
      <Card className="border-accent/30 bg-accent/5">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm flex items-center gap-2">
                <PlayCircle className="h-4 w-4 text-accent" />
                Live Trading Session
              </CardTitle>
              <CardDescription className="text-xs">
                Capital: ${formatCompactCurrency(runtimeSnapshot.botState.capitalUsd)} · Mode: {runtimeSnapshot.botState.tradeMode}
              </CardDescription>
            </div>
            <Badge variant="accent">{runtimeSnapshot.botState.tradeMode}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded bg-[#111318] p-2 text-center">
              <div className="text-lg font-mono text-accent">{runtimeSnapshot.openPositions}</div>
              <div className="text-[10px] text-text-muted">Open Positions</div>
            </div>
            <div className="rounded bg-[#111318] p-2 text-center">
              <div className="text-lg font-mono text-text-primary">
                ${formatCompactCurrency(runtimeSnapshot.botState.cashUsd)}
              </div>
              <div className="text-[10px] text-text-muted">Available Cash</div>
            </div>
            <div className="rounded bg-[#111318] p-2 text-center">
              <div className={cn("text-lg font-mono", runtimeSnapshot.botState.realizedPnlUsd >= 0 ? "text-[#10b981]" : "text-[#f43f5e]")}>
                {runtimeSnapshot.botState.realizedPnlUsd >= 0 ? "+" : ""}{formatCompactCurrency(runtimeSnapshot.botState.realizedPnlUsd)}
              </div>
              <div className="text-[10px] text-text-muted">Realized P&L</div>
            </div>
          </div>
          <Separator className="my-3" />
          <p className="text-xs text-text-secondary">
            Run discovery lab analysis and apply calibration to update live trading parameters.
          </p>
        </CardContent>
      </Card>
    );
  }

  // ---------------------------------------------------------------------------
  // MAIN RENDER
  // ---------------------------------------------------------------------------
  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-accent">Discovery Lab</div>
          <h1 className="text-lg font-semibold text-text-primary">{draft.name || "Strategy Lab"}</h1>
        </div>
        <div className="flex items-center gap-2">
          {dirty && <Badge variant="warning">Unsaved</Badge>}
          <StatusPill value={runBusy ? "RUNNING" : completedRunDetail ? "COMPLETED" : "ready"} />
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={cn(
          "rounded-lg border px-3 py-2 text-sm",
          toast.error ? "border-danger/30 bg-danger/5 text-danger" : "border-accent/30 bg-accent/5 text-text-primary"
        )}>
          {toast.message}
        </div>
      )}

      {/* Live Session */}
      <LiveSessionPanel />

      {/* Tab Navigation */}
      <TabNav
        tabs={[
          { id: "config", label: "Config" },
          { id: "results", label: "Results", count: tokenRows.length },
        ]}
        value={activeTab}
        onChange={setActiveTab}
      />

      {/* Tab Content */}
      {activeTab === "config" ? <ConfigTab /> : <ResultsTab />}
    </div>
  );
}
