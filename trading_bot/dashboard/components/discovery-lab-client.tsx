"use client";

import * as Tabs from "@radix-ui/react-tabs";
import clsx from "clsx";
import TextareaAutosize from "react-textarea-autosize";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  CircleDashed,
  CopyPlus,
  FlaskConical,
  Layers3,
  ListFilter,
  Play,
  Plus,
  Save,
  Search,
  ShieldAlert,
  SquareTerminal,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { DiscoveryLabResearchSummary, DiscoveryLabResultsBoard } from "@/components/discovery-lab-results-board";
import { EmptyState, Panel, StatusPill } from "@/components/dashboard-primitives";
import { fetchJson } from "@/lib/api";
import { formatInteger, formatTimestamp, smartFormatValue } from "@/lib/format";
import type {
  DiscoveryLabCatalog,
  DiscoveryLabPack,
  DiscoveryLabPackDraft,
  DiscoveryLabRecipe,
  DiscoveryLabRuntimeSnapshot,
  DiscoveryLabRunDetail,
  DiscoveryLabRunSummary,
  DiscoveryLabThresholdOverrides,
  DiscoveryLabValidationIssue,
  DiscoveryLabValidationResponse,
} from "@/lib/types";

const THRESHOLD_FIELDS: Array<{ key: keyof DiscoveryLabThresholdOverrides; label: string }> = [
  { key: "minLiquidityUsd", label: "Min liquidity USD" },
  { key: "maxMarketCapUsd", label: "Max market cap USD" },
  { key: "minHolders", label: "Min holders" },
  { key: "minVolume5mUsd", label: "Min 5m volume USD" },
  { key: "minUniqueBuyers5m", label: "Min unique buyers 5m" },
  { key: "minBuySellRatio", label: "Min buy / sell ratio" },
  { key: "maxTop10HolderPercent", label: "Max top10 holder %" },
  { key: "maxSingleHolderPercent", label: "Max single holder %" },
  { key: "maxNegativePriceChange5mPercent", label: "Max negative 5m change %" },
];

type DiscoveryView = "results" | "builder" | "runs";
type PackageTab = "basics" | "thresholds";
type MarketRegimeLoadState = "loading" | "ready" | "unavailable";
type MarketRegimeSuggestion = {
  label: string;
  summary: string | null;
  observedAt: string | null;
  thresholdOverrides: DiscoveryLabThresholdOverrides;
};

const DISCOVERY_VIEWS: Array<{
  id: DiscoveryView;
  label: string;
  detail: string;
  icon: typeof Layers3;
}> = [
  { id: "results", label: "Results", detail: "Latest run evidence and winners", icon: FlaskConical },
  { id: "builder", label: "Builder", detail: "Package + strategy editing in one place", icon: ListFilter },
  { id: "runs", label: "Runs", detail: "Launches, history, and live logs", icon: SquareTerminal },
];

export function DiscoveryLabClient(props: {
  initialCatalog: DiscoveryLabCatalog;
  initialRuntimeSnapshot: DiscoveryLabRuntimeSnapshot;
}) {
  const { initialCatalog, initialRuntimeSnapshot } = props;
  const initialPack = initialCatalog.packs[0] ?? null;
  const [catalog, setCatalog] = useState(initialCatalog);
  const [runtimeSnapshot, setRuntimeSnapshot] = useState(initialRuntimeSnapshot);
  const [selectedPackId, setSelectedPackId] = useState(initialPack?.id ?? "");
  const [draftKind, setDraftKind] = useState<"builtin" | "custom">(initialPack?.kind ?? "custom");
  const [draft, setDraft] = useState<DiscoveryLabPackDraft>(() => toDraft(initialPack));
  const [paramTexts, setParamTexts] = useState<Record<number, string>>(() => buildParamTextsFromRecipes(initialPack?.recipes ?? []));
  const [issues, setIssues] = useState<DiscoveryLabValidationIssue[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [allowOverfiltered, setAllowOverfiltered] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState(initialCatalog.activeRun?.id ?? initialCatalog.recentRuns[0]?.id ?? "");
  const [runDetail, setRunDetail] = useState<DiscoveryLabRunDetail | null>(null);
  const [activeView, setActiveView] = useState<DiscoveryView>("results");
  const [packageTab, setPackageTab] = useState<PackageTab>("basics");
  const [selectedRecipeIndex, setSelectedRecipeIndex] = useState(0);
  const [strategySearch, setStrategySearch] = useState("");
  const [marketRegimeLoadState, setMarketRegimeLoadState] = useState<MarketRegimeLoadState>("loading");
  const [marketRegimeSuggestion, setMarketRegimeSuggestion] = useState<MarketRegimeSuggestion | null>(null);
  const [isPending, startTransition] = useTransition();
  const [hasHydrated, setHasHydrated] = useState(false);

  const selectedPack = catalog.packs.find((pack) => pack.id === selectedPackId) ?? null;
  const readOnly = draftKind === "builtin";
  const validationErrors = issues.filter((issue) => issue.level === "error");
  const selectedRecipe = draft.recipes[selectedRecipeIndex] ?? null;
  const packNameError = draft.name.trim().length === 0 ? "Package name is required before validating, saving, or running." : null;
  const recipeCountError = draft.recipes.length === 0 ? "Add at least one strategy before validating, saving, or running." : null;
  const blankRecipeIndex = draft.recipes.findIndex((recipe) => recipe.name.trim().length === 0);
  const recipeNameError = blankRecipeIndex >= 0 ? `Strategy ${blankRecipeIndex + 1} needs a name before validating, saving, or running.` : null;
  const editorBlockingError = packNameError ?? recipeCountError ?? recipeNameError;
  const draftTitle = draft.name.trim() || displayPackName(selectedPack);
  const loadedPackageName = selectedPack ? displayPackName(selectedPack) : draft.name.trim() || "New custom package";

  useEffect(() => {
    if (!selectedRunId) {
      setRunDetail(null);
      return;
    }
    void loadRun(selectedRunId);
  }, [selectedRunId]);

  useEffect(() => {
    if (selectedRecipeIndex < draft.recipes.length) {
      return;
    }
    setSelectedRecipeIndex(Math.max(0, draft.recipes.length - 1));
  }, [draft.recipes.length, selectedRecipeIndex]);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  useEffect(() => {
    const runId = selectedRunId || runDetail?.id || catalog.activeRun?.id || "";
    if (!runId) {
      setMarketRegimeSuggestion(null);
      setMarketRegimeLoadState("unavailable");
      return;
    }

    let cancelled = false;

    async function pollRegime() {
      await loadMarketRegime(runId, cancelled);
    }

    void pollRegime();
    const timer = window.setInterval(() => {
      void pollRegime();
    }, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [catalog.activeRun?.id, runDetail?.id, selectedRunId]);

  useEffect(() => {
    if (runDetail?.status !== "RUNNING") {
      return;
    }
    const timer = window.setInterval(() => {
      void loadRun(runDetail.id, true);
    }, 3_000);
    return () => window.clearInterval(timer);
  }, [runDetail?.id, runDetail?.status]);

  useEffect(() => {
    if (!catalog.activeRun) {
      return;
    }
    const timer = window.setInterval(() => {
      void reloadCatalog(catalog.activeRun?.id);
    }, 3_000);
    return () => window.clearInterval(timer);
  }, [catalog.activeRun?.id]);

  const dirty = useMemo(() => {
    const baseline = selectedPack ? JSON.stringify(toDraft(selectedPack)) : "";
    return JSON.stringify(draft) !== baseline || JSON.stringify(paramTexts) !== JSON.stringify(buildParamTextsFromRecipes(selectedPack?.recipes ?? []));
  }, [draft, paramTexts, selectedPack]);

  const nextStep = readOnly
    ? "Run this starter as-is, or clone it into a custom draft before changing thresholds or strategies."
    : dirty
      ? "Validate the draft next, then save it or launch a run."
      : "Tune a threshold or strategy, or launch the current draft directly.";

  const activeRun = useMemo(() => {
    if (runDetail?.status === "RUNNING") {
      return runDetail;
    }
    if (!catalog.activeRun) {
      return null;
    }
    if (runDetail?.id === catalog.activeRun.id) {
      return runDetail;
    }
    return catalog.activeRun;
  }, [catalog.activeRun, runDetail]);

  const runBusy = Boolean(isPending || catalog.activeRun?.status === "RUNNING" || runDetail?.status === "RUNNING");
  const editorBlocked = Boolean(editorBlockingError);
  const lastStdoutLine = lastNonEmptyLine(runDetail?.stdout);
  const lastStderrLine = lastNonEmptyLine(runDetail?.stderr);
  const stdoutLines = collectLogLines(runDetail?.stdout);
  const stderrLines = collectLogLines(runDetail?.stderr);
  const report = runDetail?.report ?? null;
  const commandPreview = buildRunCommandPreview(draft, allowOverfiltered);

  const filteredRecipeIndexes = useMemo(() => {
    const query = strategySearch.trim().toLowerCase();
    return draft.recipes
      .map((recipe, index) => ({ recipe, index }))
      .filter(({ recipe, index }) => {
        if (!query) {
          return true;
        }
        return [
          recipe.name,
          recipe.description ?? "",
          recipe.mode,
          paramTexts[index] ?? "",
        ].join(" ").toLowerCase().includes(query);
      })
      .map(({ index }) => index);
  }, [draft.recipes, paramTexts, strategySearch]);

  const selectedRecipeIssue = selectedRecipe ? getRecipeIssue(selectedRecipe, paramTexts[selectedRecipeIndex] ?? "{}") : null;
  const selectedRecipeParamEntries = selectedRecipe
    ? getRecipeParamEntries(paramTexts[selectedRecipeIndex] ?? "{}")
    : null;

  async function reloadCatalog(nextRunId?: string) {
    const [next, nextRuntime] = await Promise.all([
      fetchJson<DiscoveryLabCatalog>("/operator/discovery-lab/catalog"),
      fetchJson<DiscoveryLabRuntimeSnapshot>("/status"),
    ]);
    setCatalog(next);
    setRuntimeSnapshot(nextRuntime);
    if (nextRunId) {
      setSelectedRunId(nextRunId);
      return;
    }
    if (next.activeRun) {
      setSelectedRunId(next.activeRun.id);
      return;
    }
    if (!selectedRunId && next.recentRuns[0]) {
      setSelectedRunId(next.recentRuns[0].id);
    }
  }

  async function loadRun(runId: string, silent = false) {
    try {
      const next = await fetchJson<DiscoveryLabRunDetail>(`/operator/discovery-lab/runs/${runId}`);
      setRunDetail(next);
      if (next.status !== "RUNNING") {
        await reloadCatalog(runId);
      }
    } catch (issue) {
      if (!silent) {
        setError(issue instanceof Error ? issue.message : "failed to load discovery lab run");
      }
    }
  }

  async function loadMarketRegime(runId: string, cancelled = false) {
    setMarketRegimeLoadState("loading");
    try {
      const payload = await fetchJson<unknown>(`/operator/discovery-lab/market-regime?runId=${encodeURIComponent(runId)}`);
      if (cancelled) {
        return;
      }
      const parsed = parseMarketRegimeSuggestion(payload);
      if (!parsed) {
        setMarketRegimeSuggestion(null);
        setMarketRegimeLoadState("unavailable");
        return;
      }
      setMarketRegimeSuggestion(parsed);
      setMarketRegimeLoadState("ready");
    } catch {
      if (cancelled) {
        return;
      }
      setMarketRegimeSuggestion(null);
      setMarketRegimeLoadState("unavailable");
    }
  }

  function focusPackageEditor(nextTab: PackageTab = "basics") {
    setActiveView("builder");
    setPackageTab(nextTab);
  }

  function focusStrategies(index = 0) {
    setActiveView("builder");
    setSelectedRecipeIndex(index);
  }

  function selectPack(pack: DiscoveryLabPack) {
    setSelectedPackId(pack.id);
    setDraftKind(pack.kind);
    setDraft(toDraft(pack));
    setParamTexts(buildParamTextsFromRecipes(pack.recipes));
    setIssues([]);
    setMessage(null);
    setError(null);
    setSelectedRecipeIndex(0);
    focusPackageEditor("basics");
  }

  function createBlankPack() {
    setSelectedPackId("");
    setDraftKind("custom");
    setDraft(toDraft(null));
    setParamTexts({});
    setIssues([]);
    setMessage("Started a new custom package.");
    setError(null);
    setSelectedRecipeIndex(0);
    focusPackageEditor("basics");
  }

  function cloneCurrentPack() {
    const next = materializeDraft();
    if (!next) return;
    setSelectedPackId("");
    setDraft({
      ...next,
      id: undefined,
      name: `${next.name} Copy`,
    });
    setDraftKind("custom");
    setIssues([]);
    setMessage("Cloned into an editable custom draft.");
    setError(null);
    focusPackageEditor("basics");
  }

  function cloneLibraryPack(pack: DiscoveryLabPack) {
    setSelectedPackId("");
    setDraftKind("custom");
    setDraft({
      ...toDraft(pack),
      id: undefined,
      name: `${displayPackName(pack)} Copy`,
    });
    setParamTexts(buildParamTextsFromRecipes(pack.recipes));
    setIssues([]);
    setMessage(`Cloned ${displayPackName(pack)} into an editable custom draft.`);
    setError(null);
    focusStrategies(0);
  }

  function loadRunPackSnapshot() {
    if (!runDetail) {
      return;
    }
    const nextPack = {
      ...runDetail.packSnapshot,
      kind: "custom" as const,
    };
    setSelectedPackId("");
    setDraftKind("custom");
    setDraft(toDraft(nextPack));
    setParamTexts(buildParamTextsFromRecipes(nextPack.recipes));
    setIssues([]);
    setMessage(`Loaded ${runDetail.packName} from the selected run into an editable draft.`);
    setError(null);
    focusStrategies(0);
  }

  function applyMarketRegimeSuggestion() {
    if (!marketRegimeSuggestion) {
      return;
    }
    if (readOnly) {
      setMessage("Clone or create a custom draft before applying market regime thresholds.");
      setError(null);
      return;
    }
    setDraft((current) => ({
      ...current,
      thresholdOverrides: {
        ...(current.thresholdOverrides ?? {}),
        ...marketRegimeSuggestion.thresholdOverrides,
      },
    }));
    setPackageTab("thresholds");
    setMessage(`Applied ${Object.keys(marketRegimeSuggestion.thresholdOverrides).length} market regime threshold overrides.`);
    setError(null);
  }

  function materializeDraft(): DiscoveryLabPackDraft | null {
    try {
      if (editorBlockingError) {
        setError(editorBlockingError);
        setMessage(null);
        if (packNameError) {
          focusPackageEditor("basics");
        } else {
          focusStrategies(blankRecipeIndex >= 0 ? blankRecipeIndex : 0);
        }
        return null;
      }
      const normalizedName = draft.name.trim();
      return {
        ...draft,
        name: normalizedName,
        description: draft.description?.trim() ?? "",
        recipes: draft.recipes.map((recipe, index) => ({
          ...recipe,
          name: recipe.name.trim(),
          description: recipe.description?.trim(),
          params: parseRecipeParams(paramTexts[index] ?? "{}"),
        })),
      };
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "strategy params must be valid JSON objects");
      setMessage(null);
      setActiveView("builder");
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
          body: JSON.stringify({ draft: payload, allowOverfiltered }),
        });
        setIssues(response.issues);
        setDraft(response.pack);
        setParamTexts(buildParamTextsFromRecipes(response.pack.recipes));
        setMessage(response.ok ? "Draft passed validation." : "Draft has issues to fix.");
        setError(null);
      } catch (issue) {
        setError(issue instanceof Error ? issue.message : "failed to validate draft");
        setMessage(null);
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
        setDraftKind("custom");
        setDraft(toDraft(saved));
        setParamTexts(buildParamTextsFromRecipes(saved.recipes));
        setMessage("Custom package saved.");
        setError(null);
        focusPackageEditor("basics");
      } catch (issue) {
        setError(issue instanceof Error ? issue.message : "failed to save custom package");
        setMessage(null);
      }
    });
  }

  function deletePack() {
    if (!selectedPack || selectedPack.kind !== "custom") {
      return;
    }
    if (!window.confirm(`Delete custom package "${selectedPack.name}"?`)) {
      return;
    }
    startTransition(async () => {
      try {
        await fetchJson<{ ok: true }>("/operator/discovery-lab/packs/delete", {
          method: "POST",
          body: JSON.stringify({ packId: selectedPack.id }),
        });
        const next = await fetchJson<DiscoveryLabCatalog>("/operator/discovery-lab/catalog");
        setCatalog(next);
        const fallback = next.packs[0] ?? null;
        if (fallback) {
          selectPack(fallback);
        } else {
          createBlankPack();
        }
        setMessage("Custom package deleted.");
        setError(null);
      } catch (issue) {
        setError(issue instanceof Error ? issue.message : "failed to delete custom package");
        setMessage(null);
      }
    });
  }

  function startRun() {
    const payload = materializeDraft();
    if (!payload) return;
    setMessage("Starting local discovery lab run...");
    setError(null);
    startTransition(async () => {
      try {
        const next = await fetchJson<DiscoveryLabRunDetail>("/operator/discovery-lab/run", {
          method: "POST",
          body: JSON.stringify({
            draft: payload,
            sources: payload.defaultSources,
            profile: payload.defaultProfile,
            thresholdOverrides: payload.thresholdOverrides,
            allowOverfiltered,
          }),
        });
        setRunDetail(next);
        setSelectedRunId(next.id);
        await reloadCatalog(next.id);
        setMessage("Discovery lab run started.");
        setError(null);
        setActiveView("runs");
      } catch (issue) {
        setError(issue instanceof Error ? issue.message : "failed to start discovery lab run");
        setMessage(null);
      }
    });
  }

  function addStrategy() {
    setDraft((current) => ({
      ...current,
      recipes: [...current.recipes, createBlankRecipe(current.recipes.length)],
    }));
    setParamTexts((current) => ({
      ...current,
      [Object.keys(current).length]: "{}",
    }));
    const nextIndex = draft.recipes.length;
    setSelectedRecipeIndex(nextIndex);
    focusStrategies(nextIndex);
    setMessage("Added a new strategy.");
    setError(null);
  }

  function duplicateStrategy() {
    const sourceRecipe = draft.recipes[selectedRecipeIndex];
    if (!sourceRecipe) {
      return;
    }
    const nextIndex = draft.recipes.length;
    setDraft((current) => ({
      ...current,
      recipes: [
        ...current.recipes,
        {
          ...sourceRecipe,
          name: `${sourceRecipe.name || `strategy_${selectedRecipeIndex + 1}`} Copy`,
        },
      ],
    }));
    setParamTexts((current) => ({
      ...current,
      [nextIndex]: paramTexts[selectedRecipeIndex] ?? "{}",
    }));
    setSelectedRecipeIndex(nextIndex);
    focusStrategies(nextIndex);
    setMessage("Duplicated the selected strategy.");
    setError(null);
  }

  function removeStrategy(index: number) {
    setDraft((current) => ({
      ...current,
      recipes: current.recipes.filter((_, recipeIndex) => recipeIndex !== index),
    }));
    setParamTexts((current) => Object.fromEntries(
      Object.entries(current)
        .filter(([key]) => Number(key) !== index)
        .map(([key, value]) => [Number(key) > index ? Number(key) - 1 : Number(key), value]),
    ));
    setSelectedRecipeIndex((current) => Math.max(0, current > index ? current - 1 : current === index ? index - 1 : current));
    setMessage("Removed the selected strategy.");
    setError(null);
  }

  function moveStrategy(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= draft.recipes.length) {
      return;
    }
    setDraft((current) => ({
      ...current,
      recipes: moveItem(current.recipes, index, targetIndex),
    }));
    setParamTexts((current) => reorderParamTexts(current, index, targetIndex));
    setSelectedRecipeIndex(targetIndex);
    setMessage(direction < 0 ? "Moved strategy up." : "Moved strategy down.");
    setError(null);
  }

  function formatSelectedStrategyParams() {
    if (!selectedRecipe) {
      return;
    }
    try {
      const parsed = parseRecipeParams(paramTexts[selectedRecipeIndex] ?? "{}");
      setParamTexts((current) => ({
        ...current,
        [selectedRecipeIndex]: JSON.stringify(parsed, null, 2),
      }));
      setMessage("Formatted strategy params JSON.");
      setError(null);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "strategy params must be a JSON object");
      setMessage(null);
    }
  }

  function openRun(run: DiscoveryLabRunSummary) {
    setSelectedRunId(run.id);
    setActiveView(run.status === "COMPLETED" ? "results" : "runs");
  }

  const messageBanner = message || error ? (
    <div
      className={clsx(
        "rounded-[16px] border px-4 py-3 text-sm",
        error
          ? "border-[rgba(251,113,133,0.24)] bg-[#151013]"
          : "border-[var(--line)] bg-[#111214]",
      )}
    >
      <div className="flex flex-wrap gap-3">
        {message ? <span className="text-text-primary">{message}</span> : null}
        {error ? <span className="text-[var(--danger)]">{error}</span> : null}
      </div>
    </div>
  ) : null;

  const headerPanel = (
    <section className="panel-strong rounded-[22px] p-5 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="section-kicker text-accent">Discovery lab</p>
            <StatusPill value={runDetail?.status ?? activeRun?.status ?? "idle"} />
            <StatusPill value={readOnly ? "starter" : "custom"} />
            <StatusPill value={dirty ? "changed" : "synced"} />
            {editorBlockingError ? <StatusPill value="needs attention" /> : null}
          </div>
          <h1 className="mt-2 font-display text-[1.45rem] font-semibold tracking-[-0.03em] text-text-primary md:text-[1.65rem]">
            Discovery lab workbench
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Results first, compact edits, and one action rail.
          </p>
        </div>
        <div className="text-xs text-text-muted">
          {loadedPackageName} · {formatInteger(draft.recipes.length)} strategies
        </div>
      </div>

      <div className="mt-4 overflow-auto pb-1">
        <Tabs.List className="flex min-w-max gap-2 rounded-[18px] border border-bg-border bg-[#0f0f10] p-2 lg:min-w-0">
          {DISCOVERY_VIEWS.map((view) => (
            <DiscoveryTabTrigger key={view.id} value={view.id} label={view.label} detail={view.detail} icon={view.icon} />
          ))}
        </Tabs.List>
      </div>
    </section>
  );

  const actionBar = (
    <section className="sticky top-3 z-20 rounded-[18px] border border-bg-border bg-[#0f0f10f2] px-3 py-3 backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={createBlankPack} className="btn-ghost inline-flex items-center gap-2" disabled={isPending}>
          <Plus className="h-4 w-4" />
          New
        </button>
        <button onClick={cloneCurrentPack} className="btn-ghost inline-flex items-center gap-2" disabled={isPending}>
          <CopyPlus className="h-4 w-4" />
          Clone
        </button>
        <button onClick={deletePack} className="btn-ghost inline-flex items-center gap-2" disabled={isPending || selectedPack?.kind !== "custom"}>
          <Trash2 className="h-4 w-4" />
          Delete
        </button>
        <button onClick={runValidation} className="btn-ghost inline-flex items-center gap-2" disabled={isPending || editorBlocked}>
          <ShieldAlert className="h-4 w-4" />
          Validate
        </button>
        <button onClick={savePack} className="btn-ghost inline-flex items-center gap-2" disabled={isPending || readOnly || editorBlocked}>
          <Save className="h-4 w-4" />
          Save
        </button>
        <button onClick={startRun} className="btn-primary inline-flex items-center gap-2" disabled={runBusy || editorBlocked}>
          <Play className="h-4 w-4" />
          {runBusy ? "Run in progress" : "Run"}
        </button>
        {runDetail ? (
          <button onClick={loadRunPackSnapshot} className="btn-ghost inline-flex items-center gap-2" disabled={isPending}>
            <ArrowUpRight className="h-4 w-4" />
            Load run package
          </button>
        ) : null}
      </div>
    </section>
  );

  const libraryPanel = (
    <Panel
      title="Package library"
      description="Built-in packages stay read-only. Clone one or start a blank custom package to experiment."
    >
      <div className="space-y-2">
        {catalog.packs.map((pack) => (
          <button
            type="button"
            key={pack.id}
            onClick={() => selectPack(pack)}
            className={clsx(
              "w-full rounded-[14px] border px-3 py-3 text-left transition",
              selectedPackId === pack.id
                ? "border-[rgba(163,230,53,0.3)] bg-[#11130f]"
                : "border-bg-border bg-[#101012] hover:border-[rgba(255,255,255,0.12)]",
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-text-primary">{displayPackName(pack)}</div>
              <StatusPill value={pack.kind} />
            </div>
            <div className="mt-2 text-xs text-text-secondary">
              {pack.recipes.length} strategies · {pack.defaultProfile}
            </div>
            {pack.description ? <div className="mt-2 line-clamp-2 text-xs text-text-muted">{pack.description}</div> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-2 rounded-[10px] border border-bg-border bg-[#0d0d0f] px-3 py-2 text-xs font-semibold text-text-secondary">
                {selectedPackId === pack.id ? "Loaded" : pack.kind === "builtin" ? "Use starter" : "Use custom"}
              </span>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  cloneLibraryPack(pack);
                }}
                className="inline-flex items-center gap-2 rounded-[10px] border border-bg-border bg-[#0d0d0f] px-3 py-2 text-xs font-semibold text-text-secondary transition hover:text-text-primary"
              >
                Clone
              </button>
            </div>
          </button>
        ))}
      </div>
    </Panel>
  );

  const packageEditorPanel = (
    <Panel
      title={draftTitle}
      eyebrow="Package editor"
      description={readOnly ? "Built-in packages stay locked. Clone or start a custom package to edit." : "Tune basics and thresholds with split tabs instead of a stacked rail."}
      action={<StatusPill value={draft.defaultProfile ?? "high-value"} />}
    >
      <div className="rounded-[16px] border border-bg-border bg-[#101012] px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-text-primary">
              {readOnly ? "Starter package loaded" : "Custom draft loaded"}
            </div>
            <div className="mt-1 text-sm leading-6 text-text-secondary">{nextStep}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill value={readOnly ? "starter" : "custom"} />
            {editorBlockingError ? <StatusPill value="needs attention" /> : null}
          </div>
        </div>
      </div>

      <Tabs.Root value={packageTab} onValueChange={(value) => setPackageTab(value as PackageTab)}>
        <Tabs.List className="mt-5 inline-flex flex-wrap gap-2 rounded-[16px] border border-bg-border bg-[#0f0f10] p-2">
          <SecondaryTabTrigger value="basics" label="Basics" detail="Name, profile, sources, description" />
          <SecondaryTabTrigger value="thresholds" label="Thresholds" detail="Grade overrides and safety tuning" />
        </Tabs.List>

        <Tabs.Content value="basics" className="mt-5 outline-none">
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Package name">
              <input
                value={draft.name}
                onChange={(event) => {
                  setDraft((current) => ({ ...current, name: event.target.value }));
                  if (error === "Package name is required before validating, saving, or running." && event.target.value.trim().length > 0) {
                    setError(null);
                  }
                }}
                disabled={readOnly}
                className={clsx(inputClassName, packNameError ? "border-[rgba(251,113,133,0.32)]" : "")}
              />
              {packNameError ? <div className="mt-2 text-xs text-[var(--danger)]">{packNameError}</div> : null}
            </Field>

            <Field label="Profile">
              <select
                value={draft.defaultProfile ?? "high-value"}
                onChange={(event) => setDraft((current) => ({ ...current, defaultProfile: event.target.value as DiscoveryLabPackDraft["defaultProfile"] }))}
                disabled={readOnly}
                className={inputClassName}
              >
                {catalog.profiles.map((profile) => <option key={profile} value={profile}>{profile}</option>)}
              </select>
            </Field>

            <Field label="Description" className="lg:col-span-2">
              <TextareaAutosize
                value={draft.description ?? ""}
                onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                disabled={readOnly}
                className={bodyTextareaClassName}
                minRows={3}
              />
            </Field>

            <Field label="Sources" className="lg:col-span-2">
              <div className="flex flex-wrap gap-2">
                {catalog.knownSources.map((source) => {
                  const active = (draft.defaultSources ?? []).includes(source);
                  return (
                    <button
                      type="button"
                      key={source}
                      onClick={() => toggleSource(source, setDraft)}
                      disabled={readOnly}
                      className={clsx(
                        "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                        active
                          ? "border-[rgba(163,230,53,0.3)] bg-[#11130f] text-text-primary"
                          : "border-bg-border bg-[#101012] text-text-secondary",
                      )}
                    >
                      {source}
                    </button>
                  );
                })}
              </div>
            </Field>
          </div>
        </Tabs.Content>

        <Tabs.Content value="thresholds" className="mt-5 outline-none">
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {THRESHOLD_FIELDS.map((field) => (
                <Field key={field.key} label={field.label}>
                  <input
                    value={draft.thresholdOverrides?.[field.key] ?? ""}
                    onChange={(event) => setDraft((current) => ({
                      ...current,
                      thresholdOverrides: {
                        ...(current.thresholdOverrides ?? {}),
                        [field.key]: event.target.value === "" ? undefined : Number(event.target.value),
                      },
                    }))}
                    disabled={readOnly}
                    type="number"
                    step="any"
                    className={inputClassName}
                  />
                </Field>
              ))}
            </div>

            <div className="rounded-[16px] border border-bg-border bg-[#101012] p-4">
              <div className="text-sm font-semibold text-text-primary">Threshold summary</div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {THRESHOLD_FIELDS.map((field) => (
                  <SummaryRow
                    key={field.key}
                    label={field.label}
                    value={draft.thresholdOverrides?.[field.key] ?? "Default runtime"}
                  />
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={allowOverfiltered}
                onChange={(event) => setAllowOverfiltered(event.target.checked)}
                className="h-4 w-4"
              />
              Allow provider filter-limit warnings during validation and runs
            </label>
          </div>
        </Tabs.Content>
      </Tabs.Root>
    </Panel>
  );

  const regimeSuggestionPanel = (
    <Panel
      title="Market regime suggestions"
      description="Placeholder integration for `/operator/discovery-lab/market-regime` threshold guidance."
      action={marketRegimeSuggestion ? (
        <button
          onClick={applyMarketRegimeSuggestion}
          className="btn-ghost inline-flex items-center gap-2"
          disabled={readOnly}
        >
          <WandSparkles className="h-4 w-4" />
          Apply to draft
        </button>
      ) : null}
    >
      {marketRegimeLoadState === "loading" ? (
        <div className="text-sm text-text-secondary">Loading market regime suggestions...</div>
      ) : marketRegimeSuggestion ? (
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill value={marketRegimeSuggestion.label} />
            {marketRegimeSuggestion.observedAt ? (
              <span className="text-xs text-text-muted">{safeFormatTimestamp(marketRegimeSuggestion.observedAt, hasHydrated)}</span>
            ) : null}
          </div>
          {marketRegimeSuggestion.summary ? (
            <div className="text-text-secondary">{marketRegimeSuggestion.summary}</div>
          ) : null}
          <div className="grid gap-2 md:grid-cols-2">
            {THRESHOLD_FIELDS.filter((field) => marketRegimeSuggestion.thresholdOverrides[field.key] !== undefined).map((field) => (
              <SummaryRow
                key={field.key}
                label={field.label}
                value={marketRegimeSuggestion.thresholdOverrides[field.key]}
              />
            ))}
          </div>
          {readOnly ? (
            <div className="text-xs text-text-muted">Clone or create a custom draft to apply these overrides.</div>
          ) : null}
        </div>
      ) : (
        <div className="text-sm text-text-secondary">No market regime suggestions are available right now.</div>
      )}
    </Panel>
  );

  const strategyStudioPanel = (
    <Panel
      title="Strategy studio"
      description="Search, add, remove, reorder, and edit strategies from one master-detail surface."
      action={(
        <div className="flex flex-wrap gap-2">
          <button onClick={addStrategy} className="btn-ghost inline-flex items-center gap-2" disabled={isPending || readOnly}>
            <Plus className="h-4 w-4" />
            Add strategy
          </button>
          <button onClick={duplicateStrategy} className="btn-ghost inline-flex items-center gap-2" disabled={isPending || readOnly || !selectedRecipe}>
            <CopyPlus className="h-4 w-4" />
            Duplicate
          </button>
          <button
            onClick={() => selectedRecipe ? removeStrategy(selectedRecipeIndex) : undefined}
            className="btn-ghost inline-flex items-center gap-2"
            disabled={readOnly || !selectedRecipe}
          >
            <Trash2 className="h-4 w-4" />
            Remove
          </button>
        </div>
      )}
    >
      <div className="grid gap-4 xl:grid-cols-[20rem_minmax(0,1fr)]">
        <div className="space-y-3">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              value={strategySearch}
              onChange={(event) => setStrategySearch(event.target.value)}
              placeholder="Search strategies"
              className="w-full rounded-[12px] border border-bg-border bg-[#0d0d0f] py-2 pl-9 pr-3 text-sm text-text-primary outline-none"
            />
          </label>

          <div className="rounded-[16px] border border-bg-border bg-[#0d0d0f] p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-text-primary">Strategy list</div>
              <span className="text-xs text-text-muted">
                {formatInteger(filteredRecipeIndexes.length)} / {formatInteger(draft.recipes.length)}
              </span>
            </div>
            <div className="mt-3 space-y-2 xl:max-h-[42rem] xl:overflow-auto xl:pr-1">
              {filteredRecipeIndexes.length > 0 ? filteredRecipeIndexes.map((index) => {
                const recipe = draft.recipes[index];
                const issue = getRecipeIssue(recipe, paramTexts[index] ?? "{}");
                const active = selectedRecipeIndex === index;
                return (
                  <button
                    type="button"
                    key={`${recipe.name}-${index}`}
                    onClick={() => setSelectedRecipeIndex(index)}
                    className={clsx(
                      "w-full rounded-[14px] border px-3 py-3 text-left transition",
                      active
                        ? "border-[rgba(163,230,53,0.3)] bg-[#11130f]"
                        : "border-bg-border bg-[#101012] hover:border-[rgba(255,255,255,0.12)]",
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-text-primary">{recipe.name || `Strategy ${index + 1}`}</div>
                      <StatusPill value={issue ?? "ready"} />
                    </div>
                    <div className="mt-2 text-xs text-text-secondary">
                      {recipe.mode} · {countActiveParams(paramTexts[index] ?? "{}")} params · deep eval {recipe.deepEvalLimit ?? "default"}
                    </div>
                    {recipe.description ? <div className="mt-2 line-clamp-2 text-xs text-text-muted">{recipe.description}</div> : null}
                  </button>
                );
              }) : (
                <EmptyState title="No strategies match" detail="Change the search or add a new strategy." />
              )}
            </div>
          </div>
        </div>

        {selectedRecipe ? (
          <div className="space-y-4">
            <div className="rounded-[16px] border border-bg-border bg-[#101012] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-text-primary">{selectedRecipe.name || `Strategy ${selectedRecipeIndex + 1}`}</div>
                  <div className="mt-1 text-sm leading-6 text-text-secondary">
                    One strategy equals one discovery query recipe. Edit the metadata here and keep params structured below.
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => moveStrategy(selectedRecipeIndex, -1)}
                    className="btn-ghost inline-flex items-center gap-2"
                    disabled={readOnly || selectedRecipeIndex === 0}
                  >
                    <ArrowUp className="h-4 w-4" />
                    Move up
                  </button>
                  <button
                    onClick={() => moveStrategy(selectedRecipeIndex, 1)}
                    className="btn-ghost inline-flex items-center gap-2"
                    disabled={readOnly || selectedRecipeIndex === draft.recipes.length - 1}
                  >
                    <ArrowDown className="h-4 w-4" />
                    Move down
                  </button>
                  <button onClick={formatSelectedStrategyParams} className="btn-ghost inline-flex items-center gap-2" disabled={readOnly}>
                    <WandSparkles className="h-4 w-4" />
                    Format JSON
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <SummaryStat label="Position" value={`${selectedRecipeIndex + 1} / ${draft.recipes.length}`} />
                <SummaryStat label="Params" value={countActiveParams(paramTexts[selectedRecipeIndex] ?? "{}")} />
                <SummaryStat label="Status" value={selectedRecipeIssue ?? "Ready"} />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-[minmax(0,1.5fr)_11rem_12rem]">
              <Field label="Strategy name">
                <input
                  value={selectedRecipe.name}
                  onChange={(event) => {
                    updateRecipe(selectedRecipeIndex, setDraft, { name: event.target.value });
                    if (error?.startsWith("Strategy ") && event.target.value.trim().length > 0) {
                      setError(null);
                    }
                  }}
                  disabled={readOnly}
                  className={clsx(inputClassName, selectedRecipe.name.trim().length === 0 ? "border-[rgba(251,113,133,0.32)]" : "")}
                />
                {selectedRecipe.name.trim().length === 0 ? (
                  <div className="mt-2 text-xs text-[var(--danger)]">Strategy name is required.</div>
                ) : null}
              </Field>

              <Field label="Mode">
                <select
                  value={selectedRecipe.mode}
                  onChange={(event) => updateRecipe(selectedRecipeIndex, setDraft, { mode: event.target.value as typeof selectedRecipe.mode })}
                  disabled={readOnly}
                  className={inputClassName}
                >
                  <option value="graduated">graduated</option>
                  <option value="pregrad">pregrad</option>
                </select>
              </Field>

              <Field label="Deep eval limit">
                <input
                  value={selectedRecipe.deepEvalLimit ?? ""}
                  onChange={(event) => updateRecipe(selectedRecipeIndex, setDraft, { deepEvalLimit: event.target.value === "" ? undefined : Number(event.target.value) })}
                  disabled={readOnly}
                  type="number"
                  className={inputClassName}
                />
              </Field>
            </div>

            <Field label="Description">
              <TextareaAutosize
                value={selectedRecipe.description ?? ""}
                onChange={(event) => updateRecipe(selectedRecipeIndex, setDraft, { description: event.target.value })}
                disabled={readOnly}
                className={bodyTextareaClassName}
                minRows={3}
              />
            </Field>

            <Field label="Params JSON">
              <TextareaAutosize
                value={paramTexts[selectedRecipeIndex] ?? "{}"}
                onChange={(event) => setParamTexts((current) => ({ ...current, [selectedRecipeIndex]: event.target.value }))}
                disabled={readOnly}
                className={jsonTextareaClassName}
                minRows={14}
              />
              {selectedRecipeIssue === "Invalid JSON" ? (
                <div className="mt-2 text-xs text-[var(--danger)]">Strategy params must be a valid JSON object.</div>
              ) : null}
            </Field>

            <div className="rounded-[16px] border border-bg-border bg-[#101012] p-4">
              <div className="text-sm font-semibold text-text-primary">Active params</div>
              {selectedRecipeParamEntries ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedRecipeParamEntries.length > 0 ? selectedRecipeParamEntries.map(([key, value]) => (
                    <span key={key} className="rounded-full border border-bg-border bg-[#0d0d0f] px-3 py-1.5 text-xs text-text-secondary">
                      <span className="font-semibold text-text-primary">{key}</span>: {String(value)}
                    </span>
                  )) : (
                    <span className="text-sm text-text-secondary">No params set yet.</span>
                  )}
                </div>
              ) : (
                <div className="mt-3 text-sm text-[var(--danger)]">Fix JSON before params can be previewed.</div>
              )}
            </div>
          </div>
        ) : (
          <EmptyState title="No strategy selected" detail="Add a strategy to start shaping a runnable package." />
        )}
      </div>
    </Panel>
  );

  const validationPanel = issues.length > 0 ? (
    <Panel title="Validation findings" tone={validationErrors.length > 0 ? "critical" : "warning"}>
      <div className="space-y-2">
        {issues.map((issue, index) => (
          <div key={`${issue.path}-${index}`} className="rounded-[12px] border border-bg-border bg-[#101012] px-3 py-3 text-sm">
            <div className="flex items-center gap-2">
              <StatusPill value={issue.level} />
              <span className="font-medium text-text-primary">{issue.path}</span>
            </div>
            <div className="mt-2 text-text-secondary">{issue.message}</div>
          </div>
        ))}
      </div>
    </Panel>
  ) : (
    <Panel title="Validation findings" tone="passive">
      <EmptyState title="No findings yet" detail="Run validation after editing a package to catch filter ceilings and naming mistakes." />
    </Panel>
  );

  const runsPanel = (
    <Panel title="Run history" description="One active run at a time. Click any run to reopen it on the same page.">
      <div className="space-y-2">
        {catalog.recentRuns.length > 0 ? catalog.recentRuns.map((run) => (
          <button
            type="button"
            key={run.id}
            onClick={() => openRun(run)}
            className={clsx(
              "w-full rounded-[14px] border px-3 py-3 text-left transition",
              selectedRunId === run.id
                ? "border-[rgba(163,230,53,0.3)] bg-[#11130f]"
                : "border-bg-border bg-[#101012] hover:border-[rgba(255,255,255,0.12)]",
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-text-primary">{run.packName}</div>
              <StatusPill value={run.status} />
            </div>
            <div className="mt-2 text-xs text-text-secondary">{safeFormatTimestamp(run.startedAt, hasHydrated)}</div>
            <div className="mt-2 text-xs text-text-muted">
              {run.evaluationCount !== null ? `${formatInteger(run.evaluationCount)} evals` : "Still running"}
              {run.winnerCount !== null ? ` · ${formatInteger(run.winnerCount)} winners` : ""}
            </div>
          </button>
        )) : (
          <EmptyState title="No runs yet" detail="Run the lab once and the history shelf will populate here." />
        )}
      </div>
    </Panel>
  );

  const runSummaryPanel = (
    <Panel title="Run summary">
      {runDetail ? (
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <StatusPill value={runDetail.status} />
            <span className="text-text-secondary">{runDetail.packName}</span>
          </div>
          <div className="text-text-secondary">Sources: {runDetail.sources.join(", ")}</div>
          <div className="text-text-secondary">Profile: {runDetail.profile}</div>
          <div className="text-text-secondary">Started: {safeFormatTimestamp(runDetail.startedAt, hasHydrated)}</div>
          {runDetail.completedAt ? <div className="text-text-secondary">Completed: {safeFormatTimestamp(runDetail.completedAt, hasHydrated)}</div> : null}
          {runDetail.errorMessage ? <div className="text-[var(--danger)]">{runDetail.errorMessage}</div> : null}
          {runDetail.stderr ? (
            <a
              href={`data:text/plain;charset=utf-8,${encodeURIComponent(runDetail.stderr)}`}
              target="_blank"
              rel="noreferrer"
              className="btn-ghost inline-flex items-center gap-2"
            >
              Open stderr
              <ArrowUpRight className="h-4 w-4" />
            </a>
          ) : null}
        </div>
      ) : (
        <EmptyState title="No run selected" detail="Pick a run or start one." />
      )}
    </Panel>
  );

  const logPanel = (
    <Panel title="Live log" description="Stdout and stderr stream here while the local run is active.">
      <div className="space-y-4">
        <LogBlock title="stdout" lines={stdoutLines} tone="default" />
        <LogBlock title="stderr" lines={stderrLines} tone="critical" />
      </div>
    </Panel>
  );

  const runCockpitPanel = (
    <Panel
      title="Run center"
      eyebrow="Live progress"
      description="The dashboard starts the existing local script and polls the persisted run record every 3 seconds."
      tone={activeRun?.status === "FAILED" ? "critical" : activeRun ? "warning" : "passive"}
      action={runDetail ? (
        <button onClick={() => setActiveView("results")} className="btn-ghost inline-flex items-center gap-2">
          <FlaskConical className="h-4 w-4" />
          Open results
        </button>
      ) : null}
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="space-y-4">
          <div className="rounded-[16px] border border-bg-border bg-[#101012] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-text-primary">{activeRun?.packName ?? "No active run"}</div>
                <div className="mt-1 text-xs text-text-secondary">
                  {activeRun ? `${activeRun.sources.join(", ")} · ${activeRun.profile}` : "Run lab to start the local discovery script."}
                </div>
              </div>
              <StatusPill value={activeRun?.status ?? "idle"} />
            </div>
            <div className="mt-4 space-y-3">
              <RunStep
                title="Launch request"
                detail="Button click reaches the backend operator route."
                active={Boolean(activeRun)}
                complete={Boolean(activeRun)}
              />
              <RunStep
                title="Local process"
                detail={activeRun?.status === "RUNNING" ? "npm run lab:discovery is active." : "Waiting for a running child process."}
                active={activeRun?.status === "RUNNING"}
                complete={Boolean(activeRun && activeRun.status !== "RUNNING")}
              />
              <RunStep
                title="Report file"
                detail={report ? `${formatInteger(report.queryCount)} queries graded.` : "Report lands when the CLI finishes."}
                active={Boolean(activeRun && !report)}
                complete={Boolean(report)}
              />
              <RunStep
                title="Review results"
                detail={runDetail?.completedAt ? `Completed ${safeFormatTimestamp(runDetail.completedAt, hasHydrated)}.` : "Results stay on this page once available."}
                active={Boolean(activeRun && activeRun.status !== "RUNNING" && !runDetail?.completedAt)}
                complete={Boolean(runDetail?.completedAt)}
              />
            </div>
          </div>

          <div className="rounded-[16px] border border-bg-border bg-[#0d0d0f] p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
              <SquareTerminal className="h-4 w-4" />
              CLI launch
            </div>
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-6 text-text-secondary">
              {commandPreview}
            </pre>
          </div>
        </div>

        <div className="grid gap-3">
          <SummaryStat label="Queries" value={activeRun?.queryCount ?? report?.queryCount ?? "Pending"} />
          <SummaryStat label="Evaluations" value={activeRun?.evaluationCount ?? report?.deepEvaluations.length ?? "Pending"} />
          <SummaryStat label="Winners" value={activeRun?.winnerCount ?? report?.winners.length ?? "Pending"} />
          <SummaryStat label="Latest output" value={lastStdoutLine ?? lastStderrLine ?? "No log output yet"} compact />
        </div>
      </div>
    </Panel>
  );

  return (
    <Tabs.Root value={activeView} onValueChange={(value) => setActiveView(value as DiscoveryView)}>
      <div className="flex flex-col gap-4">
        {headerPanel}
        {actionBar}
        {messageBanner}

        <Tabs.Content value="builder" className="space-y-4 outline-none">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="space-y-4">
              {regimeSuggestionPanel}
              {packageEditorPanel}
              {strategyStudioPanel}
            </div>
            <div className="space-y-4">
              {libraryPanel}
              {validationPanel}
            </div>
          </div>
        </Tabs.Content>

        <Tabs.Content value="runs" className="space-y-4 outline-none">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="space-y-4">
              {runCockpitPanel}
              {logPanel}
            </div>
            <div className="space-y-4">
              {runsPanel}
              {runSummaryPanel}
            </div>
          </div>
        </Tabs.Content>

        <Tabs.Content value="results" className="space-y-4 outline-none">
          <Panel
            title="Results"
            description="Deduplicated winners first, then supporting run context."
            action={runDetail ? (
              <button onClick={() => setActiveView("runs")} className="btn-ghost inline-flex items-center gap-2">
                <SquareTerminal className="h-4 w-4" />
                Open runs
              </button>
            ) : null}
          >
            {runDetail ? (
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill value={runDetail.status} />
                <span className="meta-chip">{runDetail.packName}</span>
                <span className="meta-chip">{runDetail.profile}</span>
                <span className="meta-chip">{runDetail.sources.join(", ")}</span>
                {runDetail.completedAt ? <span className="meta-chip">Completed {safeFormatTimestamp(runDetail.completedAt, hasHydrated)}</span> : null}
              </div>
            ) : (
              <EmptyState title="No run selected" detail="Pick a completed run to populate the full-width results tab." />
            )}
          </Panel>

          <DiscoveryLabResultsBoard runDetail={runDetail} runtimeSnapshot={runtimeSnapshot} />

          <DiscoveryLabResearchSummary runDetail={runDetail} />
        </Tabs.Content>
      </div>
    </Tabs.Root>
  );
}

function DiscoveryTabTrigger(props: {
  value: DiscoveryView;
  label: string;
  detail: string;
  icon: typeof Layers3;
}) {
  const Icon = props.icon;
  return (
    <Tabs.Trigger
      value={props.value}
      className="group flex min-w-[12rem] items-start gap-3 rounded-[14px] border border-transparent bg-transparent px-4 py-3 text-left text-text-secondary transition data-[state=active]:border-[rgba(163,230,53,0.3)] data-[state=active]:bg-[#11130f] data-[state=active]:text-text-primary lg:min-w-0"
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary transition group-data-[state=active]:text-accent" />
      <div className="min-w-0">
        <div className="text-sm font-semibold">{props.label}</div>
        <div className="mt-1 text-xs leading-5 text-text-muted">{props.detail}</div>
      </div>
    </Tabs.Trigger>
  );
}

function SecondaryTabTrigger(props: { value: PackageTab; label: string; detail: string }) {
  return (
    <Tabs.Trigger
      value={props.value}
      className="rounded-[12px] border border-transparent px-4 py-3 text-left text-sm font-semibold text-text-secondary transition data-[state=active]:border-[rgba(163,230,53,0.3)] data-[state=active]:bg-[#11130f] data-[state=active]:text-text-primary"
    >
      <div>{props.label}</div>
      <div className="mt-1 text-xs font-normal leading-5 text-text-muted">{props.detail}</div>
    </Tabs.Trigger>
  );
}

function RunStep(props: { title: string; detail: string; active: boolean; complete: boolean }) {
  return (
    <div className="flex gap-3">
      <div className="pt-0.5">
        <div
          className={clsx(
            "flex h-6 w-6 items-center justify-center rounded-full border",
            props.complete
              ? "border-[rgba(163,230,53,0.28)] bg-[rgba(163,230,53,0.12)] text-[var(--success)]"
              : props.active
                ? "border-[rgba(250,204,21,0.24)] bg-[rgba(250,204,21,0.12)] text-[var(--warning)]"
                : "border-bg-border bg-[#0d0d0f] text-text-muted",
          )}
        >
          <CircleDashed className={clsx("h-3.5 w-3.5", props.active ? "animate-spin" : "")} />
        </div>
      </div>
      <div>
        <div className="text-sm font-semibold text-text-primary">{props.title}</div>
        <div className="text-xs leading-5 text-text-secondary">{props.detail}</div>
      </div>
    </div>
  );
}

function SummaryStat(props: { label: string; value: string | number; compact?: boolean }) {
  return (
    <div className={clsx("rounded-[16px] border border-bg-border bg-[#101012] p-4", props.compact ? "min-h-[7.75rem]" : "")}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">{props.label}</div>
      <div className={clsx("mt-3 text-sm text-text-primary", props.compact ? "leading-6" : "text-2xl font-semibold tracking-tight")}>
        {String(props.value)}
      </div>
    </div>
  );
}

function SummaryRow(props: { label: string; value: unknown }) {
  return (
    <div className="rounded-[14px] border border-bg-border bg-[#0d0d0f] px-3 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">{props.label}</div>
      <div className="mt-2 text-sm text-text-primary">{smartFormatValue(props.label, props.value)}</div>
    </div>
  );
}

function LogBlock(props: { title: string; lines: string[]; tone: "default" | "critical" }) {
  return (
    <div className={clsx(
      "overflow-hidden rounded-[16px] border",
      props.tone === "critical" ? "border-[rgba(251,113,133,0.24)] bg-[#141013]" : "border-bg-border bg-[#0d0d0f]",
    )}>
      <div className="border-b border-white/6 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted">
        {props.title}
      </div>
      <div className="max-h-[20rem] overflow-auto px-4 py-3">
        {props.lines.length > 0 ? (
          <pre className="whitespace-pre-wrap font-mono text-xs leading-6 text-text-secondary">
            {props.lines.join("\n")}
          </pre>
        ) : (
          <div className="text-xs text-text-muted">No {props.title} output yet.</div>
        )}
      </div>
    </div>
  );
}

function Field(props: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={clsx("block", props.className)}>
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">{props.label}</div>
      {props.children}
    </label>
  );
}

const inputClassName = "w-full rounded-[12px] border border-bg-border bg-[#0d0d0f] px-3 py-2 text-sm text-text-primary outline-none";
const bodyTextareaClassName = `${inputClassName} min-h-[7rem] resize-y`;
const jsonTextareaClassName = `${inputClassName} min-h-[14rem] resize-y font-mono text-xs`;

function parseMarketRegimeSuggestion(payload: unknown): MarketRegimeSuggestion | null {
  const root = asRecord(payload);
  if (!root) {
    return null;
  }
  const suggestion = asRecord(root.suggestion);
  const marketRegime = asRecord(root.marketRegime);
  const data = asRecord(root.data);
  const thresholdOverrides = firstThresholdOverrides(
    root.suggestedThresholdOverrides,
    root.thresholdOverrides,
    root.overrides,
    suggestion?.suggestedThresholdOverrides,
    suggestion?.thresholdOverrides,
    suggestion?.overrides,
    marketRegime?.suggestedThresholdOverrides,
    marketRegime?.thresholdOverrides,
    marketRegime?.overrides,
    data?.suggestedThresholdOverrides,
    data?.thresholdOverrides,
    data?.overrides,
  );
  if (!thresholdOverrides) {
    return null;
  }
  const contexts = [suggestion, marketRegime, data, root];
  return {
    label: firstString(contexts, ["regime", "marketRegime", "label", "name"]) ?? "Suggested regime",
    summary: firstString(contexts, ["summary", "description", "rationale", "notes", "reason"]),
    observedAt: firstString(contexts, ["observedAt", "asOf", "timestamp", "generatedAt", "updatedAt"]),
    thresholdOverrides,
  };
}

function firstThresholdOverrides(...values: unknown[]): DiscoveryLabThresholdOverrides | null {
  for (const value of values) {
    const parsed = parseThresholdOverrides(value);
    if (parsed) {
      return parsed;
    }
  }
  return null;
}

function parseThresholdOverrides(value: unknown): DiscoveryLabThresholdOverrides | null {
  const source = asRecord(value);
  if (!source) {
    return null;
  }
  const next: DiscoveryLabThresholdOverrides = {};
  for (const field of THRESHOLD_FIELDS) {
    const raw = source[field.key];
    if (typeof raw === "number" && Number.isFinite(raw)) {
      next[field.key] = raw;
    }
  }
  return Object.keys(next).length > 0 ? next : null;
}

function firstString(values: Array<Record<string, unknown> | null>, keys: string[]): string | null {
  for (const value of values) {
    if (!value) {
      continue;
    }
    for (const key of keys) {
      const candidate = value[key];
      if (typeof candidate === "string" && candidate.trim().length > 0) {
        return candidate.trim();
      }
    }
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function displayPackName(pack?: Pick<DiscoveryLabPack, "id" | "name"> | null): string {
  const name = pack?.name?.trim();
  if (name && name.length > 0) {
    return name;
  }
  if (!pack?.id) {
    return "Default";
  }
  const label = pack.id
    .replace(/^discovery-lab\.recipes\.?/, "")
    .replace(/^discovery-lab/, "default")
    .replace(/[._-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
  return label || "Default";
}

function toDraft(pack?: DiscoveryLabPack | null): DiscoveryLabPackDraft {
  if (!pack) {
    return {
      name: "New custom package",
      description: "",
      defaultSources: ["pump_dot_fun"],
      defaultProfile: "high-value",
      thresholdOverrides: {},
      recipes: [],
    };
  }
  return {
    id: pack.kind === "custom" ? pack.id : undefined,
    name: displayPackName(pack),
    description: pack.description,
    defaultSources: pack.defaultSources,
    defaultProfile: pack.defaultProfile,
    thresholdOverrides: pack.thresholdOverrides,
    recipes: pack.recipes,
  };
}

function createBlankRecipe(index: number): DiscoveryLabRecipe {
  return {
    name: `strategy_${index + 1}`,
    mode: "graduated",
    description: "",
    params: {},
  };
}

function buildParamTextsFromRecipes(recipes: DiscoveryLabRecipe[]): Record<number, string> {
  return Object.fromEntries(recipes.map((recipe, index) => [index, JSON.stringify(recipe.params, null, 2)]));
}

function parseRecipeParams(value: string): Record<string, string | number | boolean | null> {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("strategy params must be a JSON object");
  }
  return parsed as Record<string, string | number | boolean | null>;
}

function updateRecipe(
  index: number,
  setDraft: React.Dispatch<React.SetStateAction<DiscoveryLabPackDraft>>,
  patch: Partial<DiscoveryLabPackDraft["recipes"][number]>,
) {
  setDraft((current) => ({
    ...current,
    recipes: current.recipes.map((recipe, recipeIndex) => recipeIndex === index ? { ...recipe, ...patch } : recipe),
  }));
}

function toggleSource(source: string, setDraft: React.Dispatch<React.SetStateAction<DiscoveryLabPackDraft>>) {
  setDraft((current) => {
    const existing = new Set(current.defaultSources ?? []);
    if (existing.has(source)) {
      existing.delete(source);
    } else {
      existing.add(source);
    }
    return {
      ...current,
      defaultSources: [...existing],
    };
  });
}

function moveItem<T>(values: T[], from: number, to: number): T[] {
  const next = [...values];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

function reorderParamTexts(values: Record<number, string>, from: number, to: number): Record<number, string> {
  const ordered = Object.keys(values)
    .map((key) => Number(key))
    .sort((left, right) => left - right)
    .map((key) => values[key] ?? "{}");
  const next = moveItem(ordered, from, to);
  return Object.fromEntries(next.map((value, index) => [index, value]));
}

function buildRunCommandPreview(draft: DiscoveryLabPackDraft, allowOverfiltered: boolean): string {
  const sources = (draft.defaultSources?.length ? draft.defaultSources : ["pump_dot_fun"]).join(",");
  const profile = draft.defaultProfile ?? "high-value";
  const thresholdArgs = Object.entries(draft.thresholdOverrides ?? {})
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `--${toKebabCase(key)} ${String(value)}`)
    .join(" ");
  return [
    "npm run lab:discovery --",
    "--recipes <generated-run-package.json>",
    `--profile ${profile}`,
    `--sources ${sources}`,
    thresholdArgs,
    allowOverfiltered ? "--allow-overfiltered" : "",
    "--out <generated-run-report.json>",
  ].filter(Boolean).join(" ");
}

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

function collectLogLines(value?: string): string[] {
  return (value ?? "")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .slice(-40);
}

function lastNonEmptyLine(value?: string): string | null {
  const lines = collectLogLines(value);
  return lines.length > 0 ? lines[lines.length - 1] : null;
}

function countActiveParams(value: string): string {
  try {
    const parsed = parseRecipeParams(value);
    return formatInteger(Object.entries(parsed).filter(([, item]) => item !== null && item !== "").length);
  } catch {
    return "Invalid";
  }
}

function getRecipeIssue(recipe: DiscoveryLabRecipe, paramsText: string): string | null {
  if (recipe.name.trim().length === 0) {
    return "Needs name";
  }
  try {
    parseRecipeParams(paramsText);
    return null;
  } catch {
    return "Invalid JSON";
  }
}

function getRecipeParamEntries(value: string): Array<[string, string | number | boolean | null]> | null {
  try {
    return Object.entries(parseRecipeParams(value)).filter(([, item]) => item !== null && item !== "");
  } catch {
    return null;
  }
}

function safeFormatTimestamp(value: string | null, hasHydrated: boolean): string {
  return hasHydrated ? formatTimestamp(value) : "Syncing...";
}
