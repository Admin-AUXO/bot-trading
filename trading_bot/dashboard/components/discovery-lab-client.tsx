"use client";

import {
  ChevronDown,
  ChevronUp,
  Copy,
  Play,
  Plus,
  Save,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  CompactPageHeader,
  CompactStatGrid,
  ScanStat,
  StatusPill,
} from "@/components/dashboard-primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  FILTER_FIELDS,
  getFilterField,
  groupFilterFields,
  groupSortOptions,
  parseStructuredRecipeForm,
  safeParseParams,
  SORT_OPTIONS,
  updateParamText,
} from "@/components/discovery-lab/recipe-form-schema";
import { fetchJson } from "@/lib/api";
import {
  formatCompactCurrency,
  formatInteger,
} from "@/lib/format";
import { cn } from "@/components/ui/cn";
import { ErrorBoundary } from "@/components/error-boundary";
import type {
  DiscoveryLabCatalog,
  DiscoveryLabPack,
  DiscoveryLabPackDraft,
  DiscoveryLabRecipe,
  DiscoveryLabRuntimeSnapshot,
  DiscoveryLabThresholdOverrides,
  DiscoveryLabValidationIssue,
  DiscoveryLabValidationResponse,
  WorkbenchCreateRunResponse,
  WorkbenchPackDetailPayload,
  WorkbenchPackListPayload,
  WorkbenchPackSummary,
  WorkbenchRunListPayload,
  WorkbenchRunSummary,
} from "@/lib/types";

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

export function DiscoveryLabClient(props: {
  initialCatalog: DiscoveryLabCatalog;
  initialRuntimeSnapshot: DiscoveryLabRuntimeSnapshot;
}) {
  const { initialCatalog, initialRuntimeSnapshot } = props;
  const router = useRouter();

  const [catalog, setCatalog] = useState(initialCatalog);
  const [runtimeSnapshot, setRuntimeSnapshot] = useState(initialRuntimeSnapshot);
  const [selectedPackId, setSelectedPackId] = useState(initialCatalog.packs[0]?.id ?? "");
  const [draft, setDraft] = useState<DiscoveryLabPackDraft>(() => toDraft(initialCatalog.packs[0] ?? null));
  const [paramTexts, setParamTexts] = useState<Record<number, string>>(() => buildParamTextsFromRecipes(initialCatalog.packs[0]?.recipes ?? []));
  const [issues, setIssues] = useState<DiscoveryLabValidationIssue[]>([]);
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null);
  const [selectedRecipeIndex, setSelectedRecipeIndex] = useState(0);
  const [isPending, startTransition] = useTransition();

  const selectedPack = catalog.packs.find(p => p.id === selectedPackId) ?? null;
  const activeRun = catalog.activeRun;
  const latestCompletedRun = catalog.recentRuns.find((run) => run.status === "COMPLETED") ?? null;
  const runBusy = Boolean(isPending || activeRun?.status === "RUNNING");
  const selectedRecipe = draft.recipes[selectedRecipeIndex];
  const selectedForm = selectedRecipe ? parseStructuredRecipeForm(paramTexts[selectedRecipeIndex] ?? "{}") : null;
  const editorBlocked = draft.recipes.length === 0;
  const dirty = selectedPack && JSON.stringify(draft) !== JSON.stringify(toDraft(selectedPack));

  useEffect(() => {
    if (!catalog.activeRun) return;
    const timer = window.setInterval(() => void reloadCatalog(), 3000);
    return () => window.clearInterval(timer);
  }, [catalog.activeRun?.id]);

  async function reloadCatalog() {
    const [next, nextRuntime] = await Promise.all([
      fetchStudioCatalog(),
      fetchJson<DiscoveryLabRuntimeSnapshot>("/status"),
    ]);
    setCatalog(next);
    setRuntimeSnapshot(nextRuntime);
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
        const response = await fetchJson<DiscoveryLabValidationResponse>("/operator/packs/validate", {
          method: "POST",
          body: JSON.stringify({ draft: payload, allowOverfiltered: false }),
        });
        setIssues(response.issues);
        setDraft(response.pack);
        setParamTexts(buildParamTextsFromRecipes(response.pack.recipes));
        setToast({ message: response.ok ? "Validation passed" : `${response.issues.length} issue(s) found` });
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
        const existingId = normalizeId(payload.id);
        const detail = await fetchJson<WorkbenchPackDetailPayload>(
          existingId
            ? `/operator/packs/${encodeURIComponent(existingId)}`
            : "/operator/packs",
          {
            method: existingId ? "PATCH" : "POST",
            body: JSON.stringify(payload),
          },
        );
        const saved = detail.pack;
        if (!saved) {
          throw new Error("Saved pack is missing from response");
        }
        const [nextCatalog, nextRuntime] = await Promise.all([
          fetchStudioCatalog(),
          fetchJson<DiscoveryLabRuntimeSnapshot>("/status"),
        ]);
        setCatalog(nextCatalog);
        setRuntimeSnapshot(nextRuntime);
        setSelectedPackId(saved.id);
        setDraft(toDraft(saved));
        setParamTexts(buildParamTextsFromRecipes(saved.recipes));
        setToast({ message: "Pack saved" });
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
        const packId = await ensurePackIdForRun(payload);
        const next = await fetchJson<WorkbenchCreateRunResponse>(`/operator/packs/${encodeURIComponent(packId)}/runs`, {
          method: "POST",
          body: JSON.stringify({
            sources: payload.defaultSources ?? [],
            profile: payload.defaultProfile ?? "high-value",
            thresholdOverrides: payload.thresholdOverrides,
            allowOverfiltered: false,
          }),
        });
        const runId = next.runId ?? next.id ?? next.run?.id ?? null;
        if (!runId) {
          throw new Error("Run started but id is missing");
        }
        await reloadCatalog();
        setToast({ message: "Run started" });
        router.push(`/discovery-lab/results?runId=${encodeURIComponent(runId)}`);
      } catch (err) {
        setToast({ message: err instanceof Error ? err.message : "Run failed", error: true });
      }
    });
  }

  async function ensurePackIdForRun(payload: DiscoveryLabPackDraft): Promise<string> {
    const existingId = normalizeId(payload.id);
    if (existingId) {
      return existingId;
    }

    const detail = await fetchJson<WorkbenchPackDetailPayload>("/operator/packs", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const createdPack = detail.pack;
    if (!createdPack) {
      throw new Error("Pack save failed before run start");
    }

    setSelectedPackId(createdPack.id);
    setDraft(toDraft(createdPack));
    setParamTexts(buildParamTextsFromRecipes(createdPack.recipes));
    return createdPack.id;
  }

  function selectPack(pack: DiscoveryLabPack) {
    setSelectedPackId(pack.id);
    setDraft(toDraft(pack));
    setParamTexts(buildParamTextsFromRecipes(pack.recipes));
    setIssues([]);
    setSelectedRecipeIndex(0);
  }

  function resetToNewPack(seed?: DiscoveryLabPackDraft) {
    const nextDraft = seed ? toEditableCopy(seed) : createEmptyDraft();
    setSelectedPackId("");
    setDraft(nextDraft);
    setParamTexts(buildParamTextsFromRecipes(nextDraft.recipes));
    setIssues([]);
    setSelectedRecipeIndex(0);
  }

  function addStrategy() {
    const nextRecipe = createBlankRecipe();
    setDraft(d => ({ ...d, recipes: [...d.recipes, nextRecipe] }));
    setParamTexts(pt => { const updated: Record<number, string> = { ...pt }; updated[Object.keys(pt).length] = JSON.stringify(nextRecipe.params, null, 2); return updated; });
    setSelectedRecipeIndex(draft.recipes.length);
  }

  function duplicatePack() {
    resetToNewPack(draft);
    setToast({ message: "Pack duplicated into a new editable draft" });
  }

  function createNewPack() {
    resetToNewPack();
    setToast({ message: "Started a new pack draft" });
  }

  function deletePack() {
    if (!selectedPack || selectedPack.kind !== "custom") {
      setToast({ message: "Only custom packs can be deleted", error: true });
      return;
    }
    startTransition(async () => {
      try {
        await fetchJson<{ ok: true }>(`/operator/packs/${encodeURIComponent(selectedPack.id)}`, {
          method: "DELETE",
        });
        const [next, nextRuntime] = await Promise.all([
          fetchStudioCatalog(),
          fetchJson<DiscoveryLabRuntimeSnapshot>("/status"),
        ]);
        setCatalog(next);
        setRuntimeSnapshot(nextRuntime);
        const fallback = next.packs[0] ?? null;
        setSelectedPackId(fallback?.id ?? "");
        setDraft(toDraft(fallback));
        setParamTexts(buildParamTextsFromRecipes(fallback?.recipes ?? []));
        setIssues([]);
        setSelectedRecipeIndex(0);
        setToast({ message: "Pack deleted" });
      } catch (err) {
        setToast({ message: err instanceof Error ? err.message : "Delete failed", error: true });
      }
    });
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

  return (
    <ErrorBoundary>
    <div className="flex flex-col gap-4">
      <CompactPageHeader
        eyebrow="Discovery lab"
        title="Studio"
        description={draft.name?.trim() || "Pack editor"}
        badges={(
          <>
            {dirty ? <Badge variant="warning">Unsaved</Badge> : null}
            <StatusPill value={runBusy ? "RUNNING" : latestCompletedRun ? "COMPLETED" : "ready"} />
          </>
        )}
        actions={(
          <>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => router.push("/discovery-lab/results")}
            >
              Results
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => router.push("/discovery-lab/config")}
            >
              Live config
            </Button>
          </>
        )}
      >
        <CompactStatGrid
          className="xl:grid-cols-6"
          items={[
            {
              label: "Pack",
              value: draft.name?.trim() || "Draft",
              detail: selectedPack ? displayPackName(selectedPack) : "Unsaved workspace",
              tone: dirty ? "warning" : "default",
            },
            {
              label: "Strategies",
              value: formatInteger(draft.recipes.length),
              detail: `${formatInteger(Object.keys(selectedForm?.filters ?? {}).length)} filters on active recipe`,
              tone: "accent",
            },
            {
              label: "Sources",
              value: formatInteger((draft.defaultSources ?? []).length),
              detail: draft.defaultProfile ? `${draft.defaultProfile} profile` : "No profile",
              tone: "default",
            },
            {
              label: "Overrides",
              value: formatInteger(
                Object.values(draft.thresholdOverrides ?? {}).filter((value) => value !== undefined && value !== null).length,
              ),
              detail: "Live handoff edits",
              tone: "default",
            },
            {
              label: "Run focus",
              value: activeRun?.packName ?? latestCompletedRun?.packName ?? "Idle",
              detail: activeRun ? "Polling active run" : latestCompletedRun ? "Latest completed run" : "No recent run",
              tone: activeRun ? "warning" : latestCompletedRun ? "accent" : "default",
            },
            {
              label: "Desk",
              value: `${formatInteger(runtimeSnapshot.openPositions)} open`,
              detail: `${formatCompactCurrency(runtimeSnapshot.botState.cashUsd)} cash · ${runtimeSnapshot.botState.tradeMode}`,
              tone: runtimeSnapshot.openPositions > 0 ? "warning" : "default",
            },
          ]}
        />
      </CompactPageHeader>

      {toast && (
        <div className={cn(
          "rounded-lg border px-3 py-2 text-sm",
          toast.error ? "border-danger/30 bg-danger/5 text-danger" : "border-accent/30 bg-accent/5 text-text-primary"
        )}>
          {toast.message}
        </div>
      )}

      <ConfigTab
        draft={draft}
        catalog={catalog}
        activeRun={activeRun}
        latestCompletedRun={latestCompletedRun}
        paramTexts={paramTexts}
        selectedPackId={selectedPackId}
        selectedRecipeIndex={selectedRecipeIndex}
        selectedForm={selectedForm}
        issues={issues}
        isPending={isPending}
        runBusy={runBusy}
        selectedPack={selectedPack}
        editorBlocked={editorBlocked}
        onDraftChange={setDraft}
        onParamTextsChange={setParamTexts}
        onSelectedRecipeIndexChange={setSelectedRecipeIndex}
        onSelectPack={selectPack}
        onCreateNewPack={createNewPack}
        onDuplicatePack={duplicatePack}
        onDeletePack={deletePack}
        onAddStrategy={addStrategy}
        onRemoveStrategy={removeStrategy}
        onMoveStrategy={moveStrategy}
        onStartRun={startRun}
        onRunValidation={runValidation}
        onSavePack={savePack}
        onOpenResults={(runId) => router.push(`/discovery-lab/results?runId=${encodeURIComponent(runId)}`)}
      />
    </div>
    </ErrorBoundary>
  );
}

function ConfigTab({
  draft,
  catalog,
  activeRun,
  latestCompletedRun,
  paramTexts,
  selectedPackId,
  selectedRecipeIndex,
  selectedForm,
  issues,
  isPending,
  runBusy,
  selectedPack,
  editorBlocked,
  onDraftChange,
  onParamTextsChange,
  onSelectedRecipeIndexChange,
  onSelectPack,
  onCreateNewPack,
  onDuplicatePack,
  onDeletePack,
  onAddStrategy,
  onRemoveStrategy,
  onMoveStrategy,
  onStartRun,
  onRunValidation,
  onSavePack,
  onOpenResults,
}: {
  draft: DiscoveryLabPackDraft;
  catalog: DiscoveryLabCatalog;
  activeRun: DiscoveryLabCatalog["activeRun"];
  latestCompletedRun: DiscoveryLabCatalog["recentRuns"][number] | null;
  paramTexts: Record<number, string>;
  selectedPackId: string;
  selectedRecipeIndex: number;
  selectedForm: ReturnType<typeof parseStructuredRecipeForm> | null;
  issues: DiscoveryLabValidationIssue[];
  isPending: boolean;
  runBusy: boolean;
  selectedPack: DiscoveryLabPack | null;
  editorBlocked: boolean;
  onDraftChange: (d: DiscoveryLabPackDraft) => void;
  onParamTextsChange: (p: Record<number, string>) => void;
  onSelectedRecipeIndexChange: (i: number) => void;
  onSelectPack: (p: DiscoveryLabPack) => void;
  onCreateNewPack: () => void;
  onDuplicatePack: () => void;
  onDeletePack: () => void;
  onAddStrategy: () => void;
  onRemoveStrategy: (i: number) => void;
  onMoveStrategy: (i: number, d: -1 | 1) => void;
  onStartRun: () => void;
  onRunValidation: () => void;
  onSavePack: () => void;
  onOpenResults: (runId: string) => void;
}) {
  const thresholdCount = Object.values(draft.thresholdOverrides ?? {}).filter((value) => value !== undefined && value !== null).length;
  const focusRun = activeRun ?? latestCompletedRun;
  const activeFilterEntries = Object.entries(selectedForm?.filters ?? {});
  const providerFilterCount = activeFilterEntries.filter(([, value]) => value.trim().length > 0).length;
  const customFilterCount = activeFilterEntries.filter(([key, value]) => key !== "graduated" && value.trim().length > 0).length;
  const groupedSortOptions = groupSortOptions(SORT_OPTIONS);
  const groupedFilterFields = groupFilterFields(FILTER_FIELDS);

  return (
    <div className="space-y-4">
      <Card className="border-[#2a2a35] bg-[#111318]">
        <CardContent className="grid gap-3 px-4 py-4 xl:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-[0.18em] text-text-muted">Pack workspace</div>
            <Select
              value={selectedPackId || "__draft__"}
              onChange={(event) => {
                if (event.target.value === "__draft__") return;
                const pack = catalog.packs.find((candidate) => candidate.id === event.target.value);
                if (pack) onSelectPack(pack);
              }}
              className="h-9 text-xs"
            >
              <option value="__draft__">Draft workspace</option>
              {catalog.packs.map((pack) => (
                <option key={pack.id} value={pack.id}>
                  {displayPackName(pack)}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <ScanStat label="Strategies" value={formatInteger(draft.recipes.length)} detail="Editable query shapes" />
            <ScanStat label="Sources" value={formatInteger((draft.defaultSources ?? []).length)} detail="Launch scope" />
            <ScanStat
              label={focusRun ? "Run focus" : "Filters"}
              value={focusRun ? focusRun.packName : formatInteger(providerFilterCount)}
              detail={
                focusRun
                  ? `${focusRun.status.toLowerCase()} · ${focusRun.winnerCount !== null ? `${formatInteger(focusRun.winnerCount)} win` : "running"}`
                  : `${formatInteger(customFilterCount)} custom + stage`
              }
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 xl:col-span-2 xl:justify-between">
            <Badge variant={selectedPack?.kind === "custom" ? "warning" : "default"} className="text-[10px] uppercase">
              {selectedPack?.kind ?? "draft"}
            </Badge>
            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              <Button size="sm" variant="secondary" onClick={onSavePack} disabled={isPending || editorBlocked}>
                <Save className="h-4 w-4 mr-1" />
                Save
              </Button>
              <Button size="sm" onClick={onStartRun} disabled={runBusy || editorBlocked}>
                <Play className="h-4 w-4 mr-1" />
                {runBusy ? "Running..." : "Run"}
              </Button>
              {focusRun ? (
                <Button size="sm" variant="ghost" onClick={() => onOpenResults(focusRun.id)}>
                  {activeRun ? "Monitor run" : "Open latest"}
                </Button>
              ) : null}
              <details className="group relative">
                <summary className="flex h-9 cursor-pointer list-none items-center rounded-[10px] border border-bg-border bg-[#141517] px-3 text-sm font-medium text-text-primary transition hover:border-bg-border/80 hover:bg-[#1a1b1e]">
                  More tools
                </summary>
                <div className="absolute right-0 z-20 mt-2 flex min-w-[11rem] flex-col gap-1 rounded-[12px] border border-bg-border bg-[#101012] p-2 shadow-2xl">
                  <Button size="sm" variant="ghost" onClick={onCreateNewPack} disabled={isPending} className="justify-start">
                    <Plus className="h-4 w-4 mr-1" />
                    New
                  </Button>
                  <Button size="sm" variant="ghost" onClick={onDuplicatePack} disabled={isPending || editorBlocked} className="justify-start">
                    <Copy className="h-4 w-4 mr-1" />
                    Duplicate
                  </Button>
                  <Button size="sm" variant="ghost" onClick={onRunValidation} disabled={isPending || editorBlocked} className="justify-start">
                    <ShieldAlert className="h-4 w-4 mr-1" />
                    Validate
                  </Button>
                  {selectedPack?.kind === "custom" ? (
                    <Button size="sm" variant="ghost" onClick={onDeletePack} disabled={isPending} className="justify-start text-[var(--danger)] hover:text-[var(--danger)]">
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete
                    </Button>
                  ) : null}
                </div>
              </details>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)]">
        <Card className="border-[#2a2a35] bg-[#111318]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Pack Details</CardTitle>
            <CardDescription className="text-xs">Name, target, thesis.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 lg:grid-cols-2">
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">Pack name</label>
              <Input
                value={draft.name ?? ""}
                onChange={(event) => onDraftChange({ ...draft, name: event.target.value })}
                placeholder="Created - Early Grad Scalp"
                className="h-9"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">Target band</label>
              <Input
                value={draft.targetPnlBand?.label ?? ""}
                onChange={(event) => onDraftChange({
                  ...draft,
                  targetPnlBand: {
                    label: event.target.value,
                    minPercent: draft.targetPnlBand?.minPercent,
                    maxPercent: draft.targetPnlBand?.maxPercent,
                  },
                })}
                placeholder="30-60% fast scalp"
                className="h-9"
              />
            </div>
            <div className="lg:col-span-2">
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">Description</label>
              <Textarea
                value={draft.description ?? ""}
                onChange={(event) => onDraftChange({ ...draft, description: event.target.value })}
                placeholder="What the pack is trying to find."
                className="min-h-[88px]"
              />
            </div>
            <div className="lg:col-span-2">
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">Thesis</label>
              <Textarea
                value={draft.thesis ?? ""}
                onChange={(event) => onDraftChange({ ...draft, thesis: event.target.value })}
                placeholder="Why this shape should survive into manual or automatic trading."
                className="min-h-[112px]"
              />
            </div>
          </CardContent>
        </Card>
        <div className="grid gap-4">
          <Card className="border-[#2a2a35] bg-[#111318]">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-text-muted">Run Defaults</CardTitle>
              <CardDescription className="text-xs">Launch posture.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">Profile</label>
                <div className="flex flex-wrap gap-2">
                  {PROFILE_OPTIONS.map(opt => (
                    <ChoiceChip key={opt.value} active={draft.defaultProfile === opt.value}
                      onClick={() => onDraftChange({ ...draft, defaultProfile: opt.value })}>
                      {opt.label}
                    </ChoiceChip>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">Sources</label>
                <div className="flex flex-wrap gap-1">
                  {catalog.knownSources.map(source => (
                    <ChoiceChip key={source} active={(draft.defaultSources ?? []).includes(source)}
                      onClick={() => {
                        const sources = draft.defaultSources ?? [];
                        onDraftChange({ ...draft, defaultSources: sources.includes(source) ? sources.filter(s => s !== source) : [...sources, source] });
                      }}>
                      {humanizeLabel(source)}
                    </ChoiceChip>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <details className="group rounded-[16px] border border-[#2a2a35] bg-[#111318]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-6 py-4">
              <div>
                <div className="text-sm font-semibold text-text-primary">Threshold overrides</div>
                <div className="mt-1 text-xs text-text-secondary">Live handoff gates. Keep closed unless you are tuning.</div>
              </div>
              <Badge variant="default">{formatInteger(thresholdCount)}</Badge>
            </summary>
            <div className="border-t border-bg-border px-6 py-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {THRESHOLD_FIELDS.slice(0, 8).map(field => (
                  <div key={field.key}>
                    <label className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">{field.label}</label>
                    <NumberInput value={draft.thresholdOverrides?.[field.key]} step={field.step} unit={field.unit} suggestions={field.suggestions}
                      onChange={v => onDraftChange({ ...draft, thresholdOverrides: { ...(draft.thresholdOverrides ?? {}), [field.key]: v ?? undefined } })} />
                  </div>
                ))}
              </div>
            </div>
          </details>
        </div>
      </div>

      <Card className="border-[#2a2a35] bg-[#111318]">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm">Strategies ({draft.recipes.length})</CardTitle>
              <CardDescription className="text-xs">Stack on the left. Active recipe on the right.</CardDescription>
            </div>
            <Button size="sm" variant="secondary" onClick={onAddStrategy} disabled={isPending}>
              <Plus className="h-4 w-4 mr-1" />
              Add Strategy
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 xl:grid-cols-[17rem_minmax(0,1fr)]">
            <div className="space-y-2">
              {draft.recipes.map((recipe, index) => {
                const form = parseStructuredRecipeForm(paramTexts[index] ?? "{}");
                const sortLabel = SORT_OPTIONS.find((option) => option.value === form.sort_by)?.label ?? "Sort";
                return (
                  <button key={index} type="button" onClick={() => onSelectedRecipeIndexChange(index)}
                    className={cn(
                      "w-full rounded-[14px] border px-3 py-2.5 text-left text-xs transition-colors",
                      selectedRecipeIndex === index ? "border-accent/50 bg-accent/5 text-text-primary" : "border-[#2a2a35] bg-[#1a1a1f] text-text-secondary hover:border-[#3a3a45]"
                    )}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{recipe.name || `Strategy ${index + 1}`}</span>
                      <Badge variant="default" className="text-[10px]">{recipe.mode}</Badge>
                    </div>
                    <div className="mt-1 text-[10px] text-text-muted">{sortLabel} · limit {form.limit || "100"} · {Object.keys(form.filters).length} filters</div>
                  </button>
                );
              })}
            </div>

            {draft.recipes[selectedRecipeIndex] && (
              <div className="space-y-3 rounded-[16px] border border-[#2a2a35] bg-[#0d0f14] p-3.5">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-text-primary">
                      {draft.recipes[selectedRecipeIndex].name || `Strategy ${selectedRecipeIndex + 1}`}
                    </span>
                    <div className="mt-1 text-[11px] text-text-muted">Keep the query tight enough to matter.</div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => onMoveStrategy(selectedRecipeIndex, -1)} disabled={selectedRecipeIndex === 0}
                      className="p-1 text-text-muted hover:text-text-primary disabled:opacity-50">
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button onClick={() => onMoveStrategy(selectedRecipeIndex, 1)} disabled={selectedRecipeIndex === draft.recipes.length - 1}
                      className="p-1 text-text-muted hover:text-text-primary disabled:opacity-50">
                      <ChevronDown className="h-4 w-4" />
                    </button>
                    <button onClick={() => onRemoveStrategy(selectedRecipeIndex)}
                      className="p-1 text-text-muted hover:text-danger">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="lg:col-span-2">
                    <label className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">Strategy name</label>
                    <Input
                      value={draft.recipes[selectedRecipeIndex].name ?? ""}
                      onChange={(event) => onDraftChange({
                        ...draft,
                        recipes: draft.recipes.map((recipe, index) =>
                          index === selectedRecipeIndex ? { ...recipe, name: event.target.value } : recipe,
                        ),
                      })}
                      placeholder={`Strategy ${selectedRecipeIndex + 1}`}
                      className="h-9"
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">Strategy note</label>
                    <Textarea
                      value={draft.recipes[selectedRecipeIndex].description ?? ""}
                      onChange={(event) => onDraftChange({
                        ...draft,
                        recipes: draft.recipes.map((recipe, index) =>
                          index === selectedRecipeIndex ? { ...recipe, description: event.target.value } : recipe,
                        ),
                      })}
                      placeholder="Describe the discovery shape, session fit, or why this belongs in manual or auto follow-through."
                      className="min-h-[82px]"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">Stage</label>
                    <div className="flex gap-1">
                      <ChoiceChip active={draft.recipes[selectedRecipeIndex].mode === "graduated"}
                        onClick={() => onDraftChange({ ...draft, recipes: draft.recipes.map((r, i) => i === selectedRecipeIndex ? { ...r, mode: "graduated" } : r) })}>Post-grad</ChoiceChip>
                      <ChoiceChip active={draft.recipes[selectedRecipeIndex].mode === "pregrad"}
                        onClick={() => onDraftChange({ ...draft, recipes: draft.recipes.map((r, i) => i === selectedRecipeIndex ? { ...r, mode: "pregrad" } : r) })}>Pre-grad</ChoiceChip>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">Sort</label>
                    <Select value={selectedForm?.sort_by ?? "trade_1m_count"} onChange={e => onParamTextsChange(updateParamText(paramTexts, selectedRecipeIndex, f => ({ ...f, sort_by: e.target.value })))}
                      className="h-9 text-xs">
                      {groupedSortOptions.map((group) => (
                        <optgroup key={group.label} label={group.label}>
                          {group.values.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </optgroup>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">Limit</label>
                    <Select
                      value={selectedForm?.limit || "100"}
                      onChange={e => onParamTextsChange(updateParamText(paramTexts, selectedRecipeIndex, f => ({ ...f, limit: e.target.value })))}
                      className="h-9 text-xs"
                    >
                      <option value="50">50</option>
                      <option value="75">75</option>
                      <option value="100">100</option>
                    </Select>
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <label className="block text-[10px] uppercase tracking-wider text-text-muted">
                      Filters ({providerFilterCount})
                    </label>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant={customFilterCount >= 4 ? "warning" : "default"} className="text-[10px]">
                        {formatInteger(customFilterCount)} custom
                      </Badge>
                      <Badge variant={providerFilterCount >= 5 ? "warning" : "default"} className="text-[10px]">
                        {formatInteger(providerFilterCount)}/5 provider-side
                      </Badge>
                    </div>
                  </div>
                  <div className="mb-2 text-[11px] text-text-muted">
                    Every repo-supported package filter is editable here. Relative time filters accept values like <code>now-900</code>.
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {activeFilterEntries.map(([key, value]) => {
                      const field = getFilterField(key);
                      return (
                        <FilterCard key={key} field={field} value={value}
                          onChange={v => onParamTextsChange(updateParamText(paramTexts, selectedRecipeIndex, f => ({ ...f, filters: { ...f.filters, [key]: v } })))}
                          onRemove={() => onParamTextsChange(updateParamText(paramTexts, selectedRecipeIndex, f => { const filters = { ...f.filters }; delete filters[key]; return { ...f, filters }; }))} />
                      );
                    })}
                  </div>
                  <Select value="" onChange={e => {
                    if (e.target.value) onParamTextsChange(updateParamText(paramTexts, selectedRecipeIndex, f => ({ ...f, filters: { ...f.filters, [e.target.value]: "" } })));
                  }} className="mt-2 h-9 text-xs">
                    <option value="">+ Add filter</option>
                    {groupedFilterFields.map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.values
                          .filter((field) => !selectedForm?.filters[field.key])
                          .map((field) => (
                            <option key={field.key} value={field.key}>{field.label}</option>
                          ))}
                      </optgroup>
                    ))}
                  </Select>
                </div>
              </div>
            )}
        </CardContent>
      </Card>

      {issues.length > 0 && (
        <details className="group rounded-[16px] border border-[#2a2a35] bg-[#111318]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-6 py-4">
            <div>
              <div className="text-sm font-semibold text-[#f43f5e]">Validation issues</div>
              <div className="mt-1 text-xs text-text-secondary">Keep collapsed unless validation fails.</div>
            </div>
            <Badge variant="danger">{issues.length}</Badge>
          </summary>
          <div className="space-y-1 border-t border-bg-border px-6 py-4">
            {issues.slice(0, 5).map((issue, i) => (
              <div key={i} className="flex items-center gap-2 rounded bg-[#1a1a1f] px-2 py-1 text-xs">
                <Badge variant={issue.level === "error" ? "danger" : "warning"} className="text-[10px]">{issue.level}</Badge>
                <span className="text-text-secondary">{issue.message}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

async function fetchStudioCatalog(): Promise<DiscoveryLabCatalog> {
  const [packsPayload, runsPayload] = await Promise.all([
    fetchJson<WorkbenchPackListPayload | WorkbenchPackSummary[]>("/operator/packs?limit=100"),
    fetchJson<WorkbenchRunListPayload | WorkbenchRunSummary[]>("/operator/runs?limit=30"),
  ]);
  const packSummaries = normalizePackListPayload(packsPayload);
  const runSummaries = normalizeRunListPayload(runsPayload);
  const packs = await Promise.all(packSummaries.map((pack) => fetchPackForStudio(pack)));
  const packKindById = new Map(packs.map((pack) => [pack.id, pack.kind]));
  const runs = runSummaries.map((run) => toDiscoveryRunSummary(run, packKindById.get(run.packId)));
  const knownSourceSet = new Set<string>(["pump_dot_fun"]);

  for (const pack of packs) {
    for (const source of pack.defaultSources ?? []) {
      const normalized = normalizeId(source);
      if (normalized) knownSourceSet.add(normalized);
    }
  }
  for (const run of runs) {
    for (const source of run.sources ?? []) {
      const normalized = normalizeId(source);
      if (normalized) knownSourceSet.add(normalized);
    }
  }

  return {
    packs,
    activeRun: runs.find((run) => run.status === "RUNNING") ?? null,
    recentRuns: runs,
    profiles: ["runtime", "high-value", "scalp"],
    knownSources: [...knownSourceSet],
  };
}

async function fetchPackForStudio(summary: WorkbenchPackSummary): Promise<DiscoveryLabPack> {
  try {
    const detail = await fetchJson<WorkbenchPackDetailPayload>(`/operator/packs/${encodeURIComponent(summary.id)}`);
    if (detail.pack) {
      return detail.pack;
    }
  } catch {
  }

  return {
    id: summary.id,
    kind: summary.kind,
    name: summary.name,
    description: summary.description ?? "",
    thesis: summary.thesis ?? undefined,
    defaultProfile: summary.defaultProfile ?? "high-value",
    defaultSources: summary.defaultSources ?? [],
    thresholdOverrides: {},
    recipes: [],
    updatedAt: summary.updatedAt,
    sourcePath: summary.sourcePath ?? "db://discovery-lab-pack",
  };
}

function normalizePackListPayload(payload: WorkbenchPackListPayload | WorkbenchPackSummary[]): WorkbenchPackSummary[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  return Array.isArray(payload.packs) ? payload.packs : [];
}

function normalizeRunListPayload(payload: WorkbenchRunListPayload | WorkbenchRunSummary[]): WorkbenchRunSummary[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  return Array.isArray(payload.runs) ? payload.runs : [];
}

function toDiscoveryRunSummary(
  run: WorkbenchRunSummary,
  packKind: DiscoveryLabPack["kind"] | undefined,
): DiscoveryLabCatalog["recentRuns"][number] {
  return {
    id: run.id,
    status: run.status,
    createdAt: run.createdAt,
    startedAt: run.startedAt ?? run.createdAt,
    completedAt: run.completedAt ?? null,
    appliedToLiveAt: run.appliedToLiveAt ?? null,
    appliedConfigVersionId: run.appliedConfigVersionId ?? null,
    packId: run.packId,
    packName: run.packName,
    packKind: packKind ?? "custom",
    profile: run.profile ?? "high-value",
    sources: run.sources ?? [],
    allowOverfiltered: run.allowOverfiltered ?? false,
    queryCount: null,
    winnerCount: run.winnerCount ?? null,
    evaluationCount: run.evaluationCount ?? null,
    errorMessage: run.errorMessage ?? null,
  };
}

function normalizeId(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

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
      <Input
        type="number"
        step={step}
        value={value ?? ""}
        onChange={e => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className="h-9 border-[#2a2a35] bg-[#111318] text-sm"
      />
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

function FilterCard({ field, value, onChange, onRemove }: { field: ReturnType<typeof getFilterField>; value: string; onChange: (v: string) => void; onRemove: () => void }) {
  return (
    <div className="flex items-start gap-2 rounded-[12px] border border-[#2a2a35] bg-[#111318] p-2.5">
      <div className="min-w-0 flex-1">
        <div className="text-xs text-text-secondary">{field.label}</div>
        {field.kind === "boolean" ? (
          <div className="flex gap-1 mt-1">
            {["true", "false"].map(v => <ChoiceChip key={v} active={value === v} onClick={() => onChange(v)}>{v === "true" ? "Yes" : "No"}</ChoiceChip>)}
          </div>
        ) : field.kind === "text" ? (
          <Input value={value} onChange={e => onChange(e.target.value)} placeholder={field.placeholder} className="mt-1 h-8 text-xs" />
        ) : (
          <NumberInput value={value} step={field.step ?? 1} unit={field.unit ?? ""} suggestions={field.suggestions ?? []}
            onChange={v => onChange(v == null ? "" : String(v))} />
        )}
      </div>
      <button type="button" onClick={onRemove} className="text-text-muted hover:text-danger"><X className="h-4 w-4" /></button>
    </div>
  );
}

function displayPackName(pack?: Pick<DiscoveryLabPack, "id" | "name"> | null): string {
  const name = pack?.name?.trim();
  if (name && name.length > 0) return name;
  if (!pack?.id) return "Default";
  return pack.id.replace(/^discovery-lab\.recipes\.?/, "").replace(/^discovery-lab/, "default").replace(/[._-]+/g, " ").trim() || "Default";
}

function toDraft(pack?: DiscoveryLabPack | null): DiscoveryLabPackDraft {
  if (!pack) return createEmptyDraft();
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

function createEmptyDraft(): DiscoveryLabPackDraft {
  return {
    name: "",
    description: "",
    thesis: "",
    targetPnlBand: { label: "" },
    defaultSources: ["pump_dot_fun"],
    defaultProfile: "high-value",
    thresholdOverrides: {},
    recipes: [createBlankRecipe()],
  };
}

function toEditableCopy(draft: DiscoveryLabPackDraft): DiscoveryLabPackDraft {
  return {
    ...draft,
    id: undefined,
    name: draft.name?.trim() ? `${draft.name} Copy` : "",
    recipes: draft.recipes.length > 0 ? draft.recipes : [createBlankRecipe()],
  };
}

function createBlankRecipe(): DiscoveryLabRecipe {
  return { name: "", mode: "graduated", description: "", params: { graduated: true, sort_by: "trade_1m_count", sort_type: "desc", limit: 100 } };
}

function buildParamTextsFromRecipes(recipes: DiscoveryLabRecipe[]): Record<number, string> {
  return Object.fromEntries(recipes.map((recipe, index) => [index, JSON.stringify(recipe.params, null, 2)]));
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
