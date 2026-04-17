"use client";

import {
  ChevronDown,
  ChevronUp,
  Plus,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import type { DiscoveryLabRecipe } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/components/ui/cn";

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

interface RecipeEditorProps {
  draft: DiscoveryLabPackDraft;
  paramTexts: Record<number, string>;
  selectedRecipeIndex: number;
  builderOpen: boolean;
  isPending: boolean;
  onDraftChange: (draft: DiscoveryLabPackDraft) => void;
  onParamTextsChange: (paramTexts: Record<number, string>) => void;
  onSelectedRecipeIndexChange: (index: number) => void;
  onBuilderOpenChange: (open: boolean) => void;
}

export function RecipeEditor({
  draft,
  paramTexts,
  selectedRecipeIndex,
  builderOpen,
  isPending,
  onDraftChange,
  onParamTextsChange,
  onSelectedRecipeIndexChange,
  onBuilderOpenChange,
}: RecipeEditorProps) {
  const selectedRecipe = draft.recipes[selectedRecipeIndex];
  const selectedForm = selectedRecipe ? parseStructuredRecipeForm(paramTexts[selectedRecipeIndex] ?? "{}") : null;

  return (
    <Card className="border-[#2a2a35] bg-[#111318]">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm">Strategies ({draft.recipes.length})</CardTitle>
            <CardDescription className="text-xs">Configure discovery recipes</CardDescription>
          </div>
          <Button size="sm" variant="secondary" onClick={() => onBuilderOpenChange(!builderOpen)}>
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
              <RecipeEditorHeader
                recipe={selectedRecipe}
                index={selectedRecipeIndex}
                total={draft.recipes.length}
                onMoveUp={() => moveStrategy(selectedRecipeIndex, -1)}
                onMoveDown={() => moveStrategy(selectedRecipeIndex, 1)}
                onRemove={() => removeStrategy(selectedRecipeIndex)}
                canMoveUp={selectedRecipeIndex > 0}
                canMoveDown={selectedRecipeIndex < draft.recipes.length - 1}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <ModeSelector
                  value={selectedRecipe.mode}
                  onChange={(mode) => updateRecipeMode(selectedRecipeIndex, mode)}
                />
                <SortSelector
                  value={selectedForm?.sort_by ?? "last_trade_unix_time"}
                  onChange={(sort_by) => updateParamTextFn(selectedRecipeIndex, (f) => ({ ...f, sort_by }))}
                />
              </div>
              <FilterSection
                filters={selectedForm?.filters ?? {}}
                onFilterChange={(filters) => updateParamTextFn(selectedRecipeIndex, (f) => ({ ...f, filters }))}
                onAddFilter={(key) => updateParamTextFn(selectedRecipeIndex, (f) => ({ ...f, filters: { ...f.filters, [key]: "" } }))}
                onRemoveFilter={(key) => {
                  const filters = { ...selectedForm?.filters };
                  delete filters[key];
                  updateParamTextFn(selectedRecipeIndex, (f) => ({ ...f, filters }));
                }}
              />
            </div>
          )}
          <RecipeList
            recipes={draft.recipes}
            paramTexts={paramTexts}
            selectedIndex={selectedRecipeIndex}
            onSelect={onSelectedRecipeIndexChange}
          />
        </CardContent>
      )}
    </Card>
  );
}

interface RecipeEditorHeaderProps {
  recipe: DiscoveryLabRecipe;
  index: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

function RecipeEditorHeader({ recipe, index, total, onMoveUp, onMoveDown, onRemove, canMoveUp, canMoveDown }: RecipeEditorHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium text-text-primary">
        {recipe.name || `Strategy ${index + 1}`}
      </span>
      <div className="flex gap-1">
        <button onClick={onMoveUp} disabled={!canMoveUp} className="p-1 text-text-muted hover:text-text-primary disabled:opacity-50">
          <ChevronUp className="h-4 w-4" />
        </button>
        <button onClick={onMoveDown} disabled={!canMoveDown} className="p-1 text-text-muted hover:text-text-primary disabled:opacity-50">
          <ChevronDown className="h-4 w-4" />
        </button>
        <button onClick={onRemove} className="p-1 text-text-muted hover:text-danger">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

interface ModeSelectorProps {
  value: "graduated" | "pregrad";
  onChange: (mode: "graduated" | "pregrad") => void;
}

function ModeSelector({ value, onChange }: ModeSelectorProps) {
  return (
    <div>
      <label className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">Mode</label>
      <div className="flex gap-1">
        <ChoiceChip active={value === "graduated"} onClick={() => onChange("graduated")}>Post-grad</ChoiceChip>
        <ChoiceChip active={value === "pregrad"} onClick={() => onChange("pregrad")}>Pre-grad</ChoiceChip>
      </div>
    </div>
  );
}

interface SortSelectorProps {
  value: string;
  onChange: (sort_by: string) => void;
}

function SortSelector({ value, onChange }: SortSelectorProps) {
  return (
    <div>
      <label className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">Sort</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded-md border border-[#2a2a35] bg-[#1a1a1f] px-2 py-1 text-xs text-text-primary outline-none"
      >
        {SORT_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </select>
    </div>
  );
}

interface FilterSectionProps {
  filters: Record<string, string>;
  onFilterChange: (filters: Record<string, string>) => void;
  onAddFilter: (key: string) => void;
  onRemoveFilter: (key: string) => void;
}

function FilterSection({ filters, onFilterChange, onAddFilter, onRemoveFilter }: FilterSectionProps) {
  return (
    <div>
      <label className="mb-1 block text-[10px] uppercase tracking-wider text-text-muted">
        Filters ({Object.keys(filters).length})
      </label>
      <div className="space-y-1">
        {Object.entries(filters).filter(([k]) => !["sort_by", "sort_type", "limit", "source", "graduated"].includes(k)).map(([key, value]) => {
          const field = FILTER_FIELD_MAP[key];
          if (!field) return null;
          return (
            <FilterCard
              key={key}
              field={field}
              value={value}
              onChange={(v) => onFilterChange({ ...filters, [key]: v })}
              onRemove={() => onRemoveFilter(key)}
            />
          );
        })}
      </div>
      <select
        value=""
        onChange={e => {
          if (e.target.value) onAddFilter(e.target.value);
        }}
        className="mt-2 w-full rounded-md border border-[#2a2a35] bg-[#1a1a1f] px-2 py-1 text-xs text-text-primary outline-none"
      >
        <option value="">+ Add filter</option>
        {FILTER_FIELDS.filter(f => !["sort_by", "sort_type", "limit", "source", "graduated"].includes(f.key) && !filters[f.key]).map(f => (
          <option key={f.key} value={f.key}>{f.label}</option>
        ))}
      </select>
    </div>
  );
}

interface RecipeListProps {
  recipes: DiscoveryLabRecipe[];
  paramTexts: Record<number, string>;
  selectedIndex: number;
  onSelect: (index: number) => void;
}

function RecipeList({ recipes, paramTexts, selectedIndex, onSelect }: RecipeListProps) {
  return (
    <div className="space-y-1">
      {recipes.map((recipe, index) => {
        const form = parseStructuredRecipeForm(paramTexts[index] ?? "{}");
        const sortLabel = SORT_OPTIONS.find(o => o.value === form.sort_by)?.label ?? "Sort";
        return (
          <button
            key={index}
            type="button"
            onClick={() => onSelect(index)}
            className={cn(
              "w-full rounded-md border px-3 py-2 text-left text-xs transition-colors",
              selectedIndex === index ? "border-accent/50 bg-accent/5 text-text-primary" : "border-[#2a2a35] bg-[#1a1a1f] text-text-secondary hover:border-[#3a3a45]"
            )}
          >
            <div className="flex items-center justify-between">
              <span>{recipe.name || `Strategy ${index + 1}`}</span>
              <Badge variant="default" className="text-[10px]">{recipe.mode}</Badge>
            </div>
            <div className="mt-0.5 text-[10px] text-text-muted">{sortLabel} · {Object.keys(form.filters).length} filters</div>
          </button>
        );
      })}
    </div>
  );
}

export function createBlankRecipe(): DiscoveryLabRecipe {
  return { name: "", mode: "graduated", description: "", params: { graduated: true, sort_by: "last_trade_unix_time", sort_type: "desc", limit: 100 } };
}

export function buildParamTextsFromRecipes(recipes: DiscoveryLabRecipe[]): Record<number, string> {
  return Object.fromEntries(recipes.map((recipe, index) => [index, JSON.stringify(recipe.params, null, 2)]));
}

function safeParseParams(value: string): Record<string, string | number | boolean | null> {
  if (!value?.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return (parsed && typeof parsed === "object" && !Array.isArray(parsed)) ? parsed : {};
  } catch { return {}; }
}

export function parseStructuredRecipeForm(value: string): {
  sort_by: string;
  sort_type: "asc" | "desc";
  source: string;
  limit: string;
  filters: Record<string, string>;
} {
  const params = safeParseParams(value);
  return {
    sort_by: typeof params.sort_by === "string" ? params.sort_by : "last_trade_unix_time",
    sort_type: params.sort_type === "asc" ? "asc" : "desc",
    source: typeof params.source === "string" ? params.source : "",
    limit: String(params.limit ?? ""),
    filters: Object.fromEntries(Object.entries(params).filter(([k]) => k.startsWith("min_") || k.startsWith("max_") || k === "graduated" || k === "creator").map(([k, v]) => [k, String(v ?? "")])),
  };
}

function serializeRecipeForm(form: { sort_by: string; sort_type: "asc" | "desc"; source: string; limit: string; filters: Record<string, string> }): Record<string, string | number | boolean | null> {
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

export function updateParamText(paramTexts: Record<number, string>, index: number, mutator: (form: ReturnType<typeof parseStructuredRecipeForm>) => ReturnType<typeof parseStructuredRecipeForm>): Record<number, string> {
  const form = parseStructuredRecipeForm(paramTexts[index] ?? "{}");
  const updated: Record<number, string> = { ...paramTexts };
  updated[index] = JSON.stringify(serializeRecipeForm(mutator(form)), null, 2);
  return updated;
}

function ChoiceChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={cn(
      "inline-flex items-center rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
      active ? "border-accent/50 bg-accent/10 text-accent" : "border-[#2a2a35] bg-[#1a1a1f] text-text-secondary hover:text-text-primary hover:border-[#3a3a45]"
    )}>{children}</button>
  );
}

interface FilterCardProps {
  field: typeof FILTER_FIELDS[number];
  value: string;
  onChange: (v: string) => void;
  onRemove: () => void;
}

function FilterCard({ field, value, onChange, onRemove }: FilterCardProps) {
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

interface NumberInputProps {
  value: string | number | undefined;
  step: number;
  unit: string;
  suggestions: number[];
  onChange: (v: number | null) => void;
}

function NumberInput({ value, step, unit, suggestions, onChange }: NumberInputProps) {
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

function formatSuggestedValue(value: number, unit: string): string {
  if (unit === "USD") return value >= 1000 ? `$${Math.round(value / 1000)}k` : `$${value}`;
  if (unit === "%") return `${value}%`;
  if (unit === "min") return value === 0 ? "Now" : `${value}m`;
  return String(value);
}

type DiscoveryLabPackDraft = {
  name: string;
  defaultSources?: string[];
  defaultProfile?: string;
  recipes: DiscoveryLabRecipe[];
  thresholdOverrides?: Record<string, unknown>;
};

