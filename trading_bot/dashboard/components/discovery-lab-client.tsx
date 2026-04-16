"use client";

import * as Tabs from "@radix-ui/react-tabs";
import clsx from "clsx";
import TextareaAutosize from "react-textarea-autosize";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  CircleDashed,
  CopyPlus,
  FlaskConical,
  ListFilter,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Plus,
  Save,
  Search,
  ShieldAlert,
  Star,
  SquareTerminal,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { DiscoveryLabResearchSummary, DiscoveryLabResultsBoard } from "@/components/discovery-lab-results-board";
import { CompactPageHeader, EmptyState, Panel, ScanStat, StatusPill } from "@/components/dashboard-primitives";
import { fetchJson } from "@/lib/api";
import { discoveryLabRoutes } from "@/lib/dashboard-routes";
import { formatInteger, formatTimestamp, smartFormatValue } from "@/lib/format";
import { clamp } from "@/lib/utils";
import type {
  BotSettings,
  DiscoveryLabApplyLiveStrategyResponse,
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
  LiveStrategySettings,
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
  { key: "maxGraduationAgeSeconds", label: "Max graduation age seconds" },
  { key: "maxNegativePriceChange5mPercent", label: "Max negative 5m change %" },
];

const THRESHOLD_FIELD_CONFIG: Record<keyof DiscoveryLabThresholdOverrides, { unit: string; step: number; suggestions: number[] }> = {
  minLiquidityUsd: { unit: "USD", step: 500, suggestions: [5000, 10000, 15000] },
  maxMarketCapUsd: { unit: "USD", step: 50000, suggestions: [1_000_000, 1_500_000, 2_000_000] },
  minHolders: { unit: "holders", step: 1, suggestions: [30, 45, 60] },
  minVolume5mUsd: { unit: "USD", step: 250, suggestions: [1500, 2000, 3000] },
  minUniqueBuyers5m: { unit: "buyers", step: 1, suggestions: [10, 15, 20] },
  minBuySellRatio: { unit: "ratio", step: 0.05, suggestions: [1, 1.1, 1.25] },
  maxTop10HolderPercent: { unit: "%", step: 1, suggestions: [35, 42, 50] },
  maxSingleHolderPercent: { unit: "%", step: 1, suggestions: [18, 22, 25] },
  maxGraduationAgeSeconds: { unit: "seconds", step: 60, suggestions: [600, 1200, 1800] },
  maxNegativePriceChange5mPercent: { unit: "%", step: 0.5, suggestions: [8, 12, 15] },
};

const PROFILE_OPTIONS: Array<{ value: DiscoveryLabPackDraft["defaultProfile"]; label: string; detail: string }> = [
  { value: "runtime", label: "Runtime", detail: "Closest to live guardrails" },
  { value: "high-value", label: "High value", detail: "Selective quality-first research" },
  { value: "scalp", label: "Scalp", detail: "Fast tape and post-grad continuation" },
];

const SORT_OPTION_GROUPS: Array<{ label: string; options: Array<{ value: string; label: string; detail: string }> }> = [
  {
    label: "Timing",
    options: [
      { value: "last_trade_unix_time", label: "Last trade", detail: "Freshest live tape first" },
      { value: "graduated_time", label: "Graduated time", detail: "Newest graduates first" },
      { value: "creation_time", label: "Creation time", detail: "Newest token creation first" },
      { value: "recent_listing_time", label: "Recent listing", detail: "Newest listings first" },
      { value: "progress_percent", label: "Progress %", detail: "Further-along bonding curve first" },
    ],
  },
  {
    label: "Structure",
    options: [
      { value: "liquidity", label: "Liquidity", detail: "Routing depth and structure" },
      { value: "market_cap", label: "Market cap", detail: "Bigger caps first" },
      { value: "fdv", label: "FDV", detail: "Higher fully diluted valuation first" },
      { value: "holder", label: "Holders", detail: "Broader holder base first" },
    ],
  },
  {
    label: "Volume",
    options: [
      { value: "volume_1m_usd", label: "Volume 1m", detail: "Immediate burst" },
      { value: "volume_5m_usd", label: "Volume 5m", detail: "Immediate flow" },
      { value: "volume_30m_usd", label: "Volume 30m", detail: "Sustained breadth" },
      { value: "volume_1h_usd", label: "Volume 1h", detail: "Broader participation" },
      { value: "volume_2h_usd", label: "Volume 2h", detail: "Medium horizon flow" },
      { value: "volume_4h_usd", label: "Volume 4h", detail: "Longer intraday flow" },
      { value: "volume_8h_usd", label: "Volume 8h", detail: "Session breadth" },
      { value: "volume_24h_usd", label: "Volume 24h", detail: "Day-wide flow" },
      { value: "volume_7d_usd", label: "Volume 7d", detail: "Week-wide flow" },
      { value: "volume_30d_usd", label: "Volume 30d", detail: "Month-wide flow" },
    ],
  },
  {
    label: "Volume Change",
    options: [
      { value: "volume_1m_change_percent", label: "Volume change 1m", detail: "Fastest acceleration" },
      { value: "volume_5m_change_percent", label: "Volume change 5m", detail: "Short-window acceleration" },
      { value: "volume_30m_change_percent", label: "Volume change 30m", detail: "Half-hour flow acceleration" },
      { value: "volume_1h_change_percent", label: "Volume change 1h", detail: "One-hour flow acceleration" },
      { value: "volume_2h_change_percent", label: "Volume change 2h", detail: "Two-hour flow acceleration" },
      { value: "volume_4h_change_percent", label: "Volume change 4h", detail: "Four-hour flow acceleration" },
      { value: "volume_8h_change_percent", label: "Volume change 8h", detail: "Session flow acceleration" },
      { value: "volume_24h_change_percent", label: "Volume change 24h", detail: "Day flow acceleration" },
      { value: "volume_7d_change_percent", label: "Volume change 7d", detail: "Week flow acceleration" },
      { value: "volume_30d_change_percent", label: "Volume change 30d", detail: "Month flow acceleration" },
    ],
  },
  {
    label: "Price Change",
    options: [
      { value: "price_change_1m_percent", label: "Price change 1m", detail: "Immediate price impulse" },
      { value: "price_change_5m_percent", label: "Price change 5m", detail: "Short-window price impulse" },
      { value: "price_change_30m_percent", label: "Price change 30m", detail: "Strength and reclaim bias" },
      { value: "price_change_1h_percent", label: "Price change 1h", detail: "One-hour price strength" },
      { value: "price_change_2h_percent", label: "Price change 2h", detail: "Two-hour price strength" },
      { value: "price_change_4h_percent", label: "Price change 4h", detail: "Four-hour price strength" },
      { value: "price_change_8h_percent", label: "Price change 8h", detail: "Session price strength" },
      { value: "price_change_24h_percent", label: "Price change 24h", detail: "Day price strength" },
      { value: "price_change_7d_percent", label: "Price change 7d", detail: "Week price strength" },
      { value: "price_change_30d_percent", label: "Price change 30d", detail: "Month price strength" },
    ],
  },
  {
    label: "Trades",
    options: [
      { value: "trade_1m_count", label: "Trades 1m", detail: "Instant tape count" },
      { value: "trade_5m_count", label: "Trades 5m", detail: "Fast tape count" },
      { value: "trade_30m_count", label: "Trades 30m", detail: "Half-hour tape count" },
      { value: "trade_1h_count", label: "Trades 1h", detail: "One-hour tape count" },
      { value: "trade_2h_count", label: "Trades 2h", detail: "Two-hour tape count" },
      { value: "trade_4h_count", label: "Trades 4h", detail: "Four-hour tape count" },
      { value: "trade_8h_count", label: "Trades 8h", detail: "Session tape count" },
      { value: "trade_24h_count", label: "Trades 24h", detail: "Day-wide tape count" },
      { value: "trade_7d_count", label: "Trades 7d", detail: "Week-wide tape count" },
      { value: "trade_30d_count", label: "Trades 30d", detail: "Month-wide tape count" },
    ],
  },
];

const SORT_OPTIONS = SORT_OPTION_GROUPS.flatMap((group) => group.options);

const STRATEGY_LIMIT_SUGGESTIONS = [50, 100, 150, 200];
const LOOKBACK_SUGGESTIONS = [10, 20, 30, 60, 240];
const LAST_TRADE_SUGGESTIONS = [2, 3, 5, 10];
const PROVIDER_FILTER_LIMIT = 5;

type DiscoveryView = "results" | "builder";
type PackageTab = "basics" | "thresholds";
export type DiscoveryLabRequestedSection = "overview" | "studio" | "run-lab" | "results" | "config";
type MarketRegimeLoadState = "loading" | "ready" | "unavailable";
type StructuredFilterFieldKind = "number" | "relative_minutes" | "boolean" | "text";
type StructuredFilterField = {
  key: string;
  label: string;
  description: string;
  group: string;
  kind: StructuredFilterFieldKind;
  unit?: string;
  step?: number;
  suggestions?: number[];
  allowNow?: boolean;
  placeholder?: string;
};
type MarketRegimeSuggestion = {
  label: string;
  summary: string | null;
  observedAt: string | null;
  suggestedThresholdOverrides: DiscoveryLabThresholdOverrides;
  fetchDiagnostics: {
    queryCount: number;
    returnedCount: number;
    selectedCount: number;
    goodCount: number;
    rejectCount: number;
    selectionRatePercent: number | null;
    passRatePercent: number | null;
    winnerHitRatePercent: number | null;
    strongestQueries: Array<{
      key: string;
      source: string;
      recipeName: string;
      returnedCount: number;
      goodCount: number;
      rejectCount: number;
      winnerHitRatePercent: number | null;
    }>;
  } | null;
  optimizationSuggestions: Array<{
    id: string;
    label: string;
    objective: "expand" | "balance" | "tighten";
    summary: string;
    thresholdOverrides: DiscoveryLabThresholdOverrides;
  }>;
};
type StrategyFocusArea = "timing" | "liquidity" | "flow" | "participation" | "momentum" | "concentration";

const DISCOVERY_LAB_FAVORITES_STORAGE_KEY = "graduation-control.discovery-lab.favorite-pack-ids";

const STRUCTURED_FILTER_FIELDS: StructuredFilterField[] = [
  {
    key: "graduated",
    label: "Graduated only",
    description: "Force the Birdeye query to only return graduated names.",
    group: "Stage",
    kind: "boolean",
  },
  {
    key: "creator",
    label: "Creator",
    description: "Limit the query to a specific creator address.",
    group: "Identity",
    kind: "text",
    placeholder: "Creator wallet",
  },
  {
    key: "platform_id",
    label: "Platform id",
    description: "Limit the query to a specific Birdeye platform id.",
    group: "Identity",
    kind: "text",
    placeholder: "pump_fun",
  },
  {
    key: "min_progress_percent",
    label: "Min progress %",
    description: "Require a minimum bonding-curve progress percent.",
    group: "Stage",
    kind: "number",
    unit: "%",
    step: 1,
    suggestions: [50, 75, 90],
  },
  {
    key: "max_progress_percent",
    label: "Max progress %",
    description: "Exclude names already too far along the bonding curve.",
    group: "Stage",
    kind: "number",
    unit: "%",
    step: 1,
    suggestions: [85, 95, 99],
  },
  {
    key: "min_graduated_time",
    label: "Graduated within last",
    description: "Relative lookback window for graduation time.",
    group: "Timing",
    kind: "relative_minutes",
    unit: "min",
    step: 1,
    suggestions: LOOKBACK_SUGGESTIONS,
  },
  {
    key: "max_graduated_time",
    label: "Exclude newest graduates",
    description: "Set `0` for now or a larger number to avoid the first minutes.",
    group: "Timing",
    kind: "relative_minutes",
    unit: "min",
    step: 1,
    suggestions: [0, 2, 5, 10],
    allowNow: true,
  },
  {
    key: "min_creation_time",
    label: "Created within last",
    description: "Relative lookback window for token creation time.",
    group: "Timing",
    kind: "relative_minutes",
    unit: "min",
    step: 1,
    suggestions: [10, 30, 60, 240, 1440],
  },
  {
    key: "max_creation_time",
    label: "Exclude newest creations",
    description: "Set `0` for now or increase it to avoid newborn names.",
    group: "Timing",
    kind: "relative_minutes",
    unit: "min",
    step: 1,
    suggestions: [0, 2, 5, 10],
    allowNow: true,
  },
  {
    key: "min_recent_listing_time",
    label: "Listed within last",
    description: "Relative lookback window for recent listing time.",
    group: "Timing",
    kind: "relative_minutes",
    unit: "min",
    step: 1,
    suggestions: [10, 30, 60, 240, 1440],
  },
  {
    key: "max_recent_listing_time",
    label: "Exclude newest listings",
    description: "Set `0` for now or increase it to avoid the newest listings.",
    group: "Timing",
    kind: "relative_minutes",
    unit: "min",
    step: 1,
    suggestions: [0, 2, 5, 10],
    allowNow: true,
  },
  {
    key: "min_last_trade_unix_time",
    label: "Last trade within",
    description: "Keep the tape fresh enough for the current setup.",
    group: "Timing",
    kind: "relative_minutes",
    unit: "min",
    step: 1,
    suggestions: LAST_TRADE_SUGGESTIONS,
  },
  {
    key: "max_last_trade_unix_time",
    label: "Exclude newest last trade",
    description: "Use this only when you deliberately want to avoid immediate prints.",
    group: "Timing",
    kind: "relative_minutes",
    unit: "min",
    step: 1,
    suggestions: [0, 1, 2, 5],
    allowNow: true,
  },
  {
    key: "min_liquidity",
    label: "Min liquidity",
    description: "Require enough routing depth before deep evaluation.",
    group: "Liquidity",
    kind: "number",
    unit: "USD",
    step: 500,
    suggestions: [8000, 12000, 16000],
  },
  {
    key: "max_liquidity",
    label: "Max liquidity",
    description: "Cap liquidity when you want smaller caps or thinner books.",
    group: "Liquidity",
    kind: "number",
    unit: "USD",
    step: 500,
    suggestions: [25000, 50000, 100000],
  },
  {
    key: "min_market_cap",
    label: "Min market cap",
    description: "Require a minimum market cap floor.",
    group: "Capital",
    kind: "number",
    unit: "USD",
    step: 10000,
    suggestions: [100000, 250000, 500000],
  },
  {
    key: "max_market_cap",
    label: "Max market cap",
    description: "Cap market cap when you want tighter post-grad size ranges.",
    group: "Capital",
    kind: "number",
    unit: "USD",
    step: 10000,
    suggestions: [1000000, 1500000, 2500000],
  },
  {
    key: "min_fdv",
    label: "Min FDV",
    description: "Require a minimum fully diluted valuation floor.",
    group: "Capital",
    kind: "number",
    unit: "USD",
    step: 10000,
    suggestions: [100000, 250000, 500000],
  },
  {
    key: "max_fdv",
    label: "Max FDV",
    description: "Cap fully diluted valuation when sizing for smaller setups.",
    group: "Capital",
    kind: "number",
    unit: "USD",
    step: 10000,
    suggestions: [1000000, 1500000, 2500000],
  },
  {
    key: "min_holder",
    label: "Min holders",
    description: "Require holder breadth before deep evaluation.",
    group: "Structure",
    kind: "number",
    unit: "wallets",
    step: 1,
    suggestions: [40, 60, 80],
  },
  ...buildIntervalFilterFields("volume", "Volume", "USD", [
    ["1m", [1000, 1500, 2500]],
    ["5m", [1500, 2000, 3000]],
    ["30m", [12000, 20000, 30000]],
    ["1h", [18000, 25000, 40000]],
    ["2h", []],
    ["4h", []],
    ["8h", []],
    ["24h", []],
    ["7d", []],
    ["30d", []],
  ]),
  ...buildIntervalChangeFilterFields("volume", "Volume change", [
    ["1m", [5, 10, 20]],
    ["5m", [10, 20, 30]],
    ["30m", [15, 25, 40]],
    ["1h", [20, 35, 50]],
    ["2h", []],
    ["4h", []],
    ["8h", []],
    ["24h", []],
    ["7d", []],
    ["30d", []],
  ]),
  ...buildIntervalChangeFilterFields("price", "Price change", [
    ["1m", [2, 4, 8]],
    ["5m", [4, 8, 12]],
    ["30m", [8, 15, 25]],
    ["1h", [12, 20, 35]],
    ["2h", []],
    ["4h", []],
    ["8h", []],
    ["24h", []],
    ["7d", []],
    ["30d", []],
  ]),
  ...buildIntervalTradeFilterFields([
    ["1m", [10, 20, 30]],
    ["5m", [30, 45, 60]],
    ["30m", [150, 250, 400]],
    ["1h", [250, 400, 600]],
    ["2h", []],
    ["4h", []],
    ["8h", []],
    ["24h", []],
    ["7d", []],
    ["30d", []],
  ]),
];

const STRUCTURED_FILTER_FIELD_MAP = Object.fromEntries(
  STRUCTURED_FILTER_FIELDS.map((field) => [field.key, field]),
) as Record<string, StructuredFilterField>;

const STRUCTURED_FILTER_GROUPS = [
  "Stage",
  "Timing",
  "Identity",
  "Liquidity",
  "Capital",
  "Structure",
  "Volume",
  "Volume change",
  "Price change",
  "Trades",
];

const PROVIDER_FILTER_KEYS = new Set(["source", ...STRUCTURED_FILTER_FIELDS.map((field) => field.key)]);

function mapRequestedSectionToView(
  requestedSection: DiscoveryLabRequestedSection | null | undefined,
  hasCompletedSelection: boolean,
): DiscoveryView {
  if (requestedSection === "run-lab") {
    return "results";
  }
  if (requestedSection === "results") {
    return "results";
  }
  if (requestedSection === "studio" || requestedSection === "config") {
    return "builder";
  }
  return hasCompletedSelection ? "results" : "builder";
}

function mapRequestedSectionToPackageTab(
  requestedSection: DiscoveryLabRequestedSection | null | undefined,
): PackageTab | null {
  if (requestedSection === "studio") {
    return "basics";
  }
  if (requestedSection === "config") {
    return "thresholds";
  }
  return null;
}

function routeForRequestedSection(section: DiscoveryLabRequestedSection) {
  switch (section) {
    case "studio":
      return discoveryLabRoutes.studio;
    case "run-lab":
      return discoveryLabRoutes.results;
    case "results":
      return discoveryLabRoutes.results;
    case "config":
      return discoveryLabRoutes.config;
    case "overview":
    default:
      return discoveryLabRoutes.overview;
  }
}

function inferRequestedSectionFromState(
  activeView: DiscoveryView,
  packageTab: PackageTab,
): DiscoveryLabRequestedSection {
  if (activeView === "results") {
    return "results";
  }
  return packageTab === "thresholds" ? "config" : "studio";
}

export function DiscoveryLabClient(props: {
  initialCatalog: DiscoveryLabCatalog;
  initialRuntimeSnapshot: DiscoveryLabRuntimeSnapshot;
  requestedSection?: DiscoveryLabRequestedSection | null;
}) {
  const { initialCatalog, initialRuntimeSnapshot, requestedSection } = props;
  const router = useRouter();
  const initialPack = initialCatalog.packs[0] ?? null;
  const initialCompletedRun = initialCatalog.recentRuns.find((run) => run.status === "COMPLETED") ?? null;
  const initialSelectedRun = requestedSection === "results"
    ? initialCompletedRun
    : initialCatalog.activeRun ?? initialCatalog.recentRuns[0] ?? initialCompletedRun;
  const initialHasCompletedSelection = initialSelectedRun?.status === "COMPLETED";
  const [catalog, setCatalog] = useState(initialCatalog);
  const [runtimeSnapshot, setRuntimeSnapshot] = useState(initialRuntimeSnapshot);
  const [selectedPackId, setSelectedPackId] = useState(initialPack?.id ?? "");
  const [draftKind, setDraftKind] = useState<"created" | "custom">(initialPack?.kind ?? "custom");
  const [draft, setDraft] = useState<DiscoveryLabPackDraft>(() => toDraft(initialPack));
  const [paramTexts, setParamTexts] = useState<Record<number, string>>(() => buildParamTextsFromRecipes(initialPack?.recipes ?? []));
  const [issues, setIssues] = useState<DiscoveryLabValidationIssue[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [allowOverfiltered, setAllowOverfiltered] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState(initialSelectedRun?.id ?? "");
  const [runDetail, setRunDetail] = useState<DiscoveryLabRunDetail | null>(null);
  const [activeView, setActiveView] = useState<DiscoveryView>(() => (
    mapRequestedSectionToView(requestedSection, initialHasCompletedSelection)
  ));
  const [packageTab, setPackageTab] = useState<PackageTab>(() => (
    mapRequestedSectionToPackageTab(requestedSection) ?? "basics"
  ));
  const [selectedRecipeIndex, setSelectedRecipeIndex] = useState(0);
  const [strategySearch, setStrategySearch] = useState("");
  const [marketRegimeLoadState, setMarketRegimeLoadState] = useState<MarketRegimeLoadState>("loading");
  const [marketRegimeSuggestion, setMarketRegimeSuggestion] = useState<MarketRegimeSuggestion | null>(null);
  const [selectedOptimizationId, setSelectedOptimizationId] = useState("");
  const [liveStrategyDraft, setLiveStrategyDraft] = useState<LiveStrategySettings>(initialRuntimeSnapshot.settings.strategy.liveStrategy);
  const [isPending, startTransition] = useTransition();
  const [hasHydrated, setHasHydrated] = useState(false);
  const [favoritePackIds, setFavoritePackIds] = useState<string[]>([]);
  const [showSupportRail, setShowSupportRail] = useState(false);
  const [filterFieldToAdd, setFilterFieldToAdd] = useState("");
  const [validationOpen, setValidationOpen] = useState(false);
  const lastRequestedSectionRef = useRef<DiscoveryLabRequestedSection | null | undefined>(requestedSection);

  const selectedPack = catalog.packs.find((pack) => pack.id === selectedPackId) ?? null;
  const sortedPacks = useMemo(
    () => [...catalog.packs].sort((left, right) => {
      const leftFavorite = favoritePackIds.includes(left.id);
      const rightFavorite = favoritePackIds.includes(right.id);
      if (leftFavorite !== rightFavorite) {
        return Number(rightFavorite) - Number(leftFavorite);
      }
      if (left.kind !== right.kind) {
        return left.kind === "created" ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    }),
    [catalog.packs, favoritePackIds],
  );
  const loadedFromCreatedPack = draftKind === "created";
  const readOnly = false;
  const validationErrors = issues.filter((issue) => issue.level === "error");
  const normalizedRecipes = useMemo(() => buildNormalizedRecipes(draft.recipes, paramTexts), [draft.recipes, paramTexts]);
  const selectedRecipe = draft.recipes[selectedRecipeIndex] ?? null;
  const selectedDerivedRecipe = normalizedRecipes[selectedRecipeIndex] ?? null;
  const recipeCountError = draft.recipes.length === 0 ? "Add at least one strategy before validating, saving, or running." : null;
  const editorBlockingError = recipeCountError;
  const suggestedPackName = derivePackNameFromDraft(draft, paramTexts);
  const draftTitle = draft.name.trim() || suggestedPackName || displayPackName(selectedPack);
  const loadedPackageName = selectedPack ? displayPackName(selectedPack) : draft.name.trim() || suggestedPackName || "New custom package";
  const selectedRunSummary = catalog.recentRuns.find((run) => run.id === selectedRunId) ?? null;
  const latestCompletedRun = catalog.recentRuns.find((run) => run.status === "COMPLETED") ?? null;
  const completedRunDetail = runDetail?.status === "COMPLETED" ? runDetail : null;
  const completedRunSummary = selectedRunSummary?.status === "COMPLETED" ? selectedRunSummary : null;
  const hasCompletedSelection = Boolean(completedRunDetail || completedRunSummary || initialHasCompletedSelection);

  useEffect(() => {
    if (!selectedRunId) {
      setRunDetail(null);
      return;
    }
    void loadRun(selectedRunId);
  }, [selectedRunId]);

  useEffect(() => {
    if (requestedSection === "results") {
      if (completedRunDetail || completedRunSummary) {
        return;
      }
      if (latestCompletedRun && latestCompletedRun.id !== selectedRunId) {
        setSelectedRunId(latestCompletedRun.id);
        return;
      }
      if (!latestCompletedRun && selectedRunId) {
        setSelectedRunId("");
      }
      return;
    }
    if (activeView === "results" && !hasCompletedSelection) {
      setActiveView("builder");
    }
  }, [activeView, completedRunDetail, completedRunSummary, hasCompletedSelection, latestCompletedRun, requestedSection, selectedRunId]);

  useEffect(() => {
    if (requestedSection === lastRequestedSectionRef.current) {
      return;
    }
    lastRequestedSectionRef.current = requestedSection;
    setActiveView(mapRequestedSectionToView(requestedSection, hasCompletedSelection));
    const nextPackageTab = mapRequestedSectionToPackageTab(requestedSection);
    if (nextPackageTab) {
      setPackageTab(nextPackageTab);
    }
  }, [hasCompletedSelection, requestedSection]);

  useEffect(() => {
    if (selectedRecipeIndex < draft.recipes.length) {
      return;
    }
    setSelectedRecipeIndex(Math.max(0, draft.recipes.length - 1));
  }, [draft.recipes.length, selectedRecipeIndex]);

  useEffect(() => {
    setFilterFieldToAdd("");
  }, [selectedRecipeIndex]);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  useEffect(() => {
    if (!hasHydrated || typeof window === "undefined") {
      return;
    }
    try {
      const raw = window.localStorage.getItem(DISCOVERY_LAB_FAVORITES_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setFavoritePackIds(parsed.filter((value): value is string => typeof value === "string"));
      }
    } catch {
      setFavoritePackIds([]);
    }
  }, [hasHydrated]);

  useEffect(() => {
    if (!hasHydrated || typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(DISCOVERY_LAB_FAVORITES_STORAGE_KEY, JSON.stringify(favoritePackIds));
  }, [favoritePackIds, hasHydrated]);

  useEffect(() => {
    if (issues.length > 0) {
      setValidationOpen(true);
    }
  }, [issues.length]);

  useEffect(() => {
    void loadActiveSettings();
  }, []);

  useEffect(() => {
    const runId = selectedRunId || runDetail?.id || catalog.activeRun?.id || "";
    if (!runId) {
      setMarketRegimeSuggestion(null);
      setSelectedOptimizationId("");
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

  const nextStep = loadedFromCreatedPack
    ? "Created pack loaded into the working draft. Tune it, then save a workspace copy if you want a local variant."
    : dirty
      ? "Validate next, then save or run."
      : "Tune a threshold or strategy, or run the draft.";

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
  const showRunOutputPanel = Boolean(activeRun || report || completedRunDetail);
  const showLogPanel = Boolean(
    activeRun || stdoutLines.length > 0 || stderrLines.length > 0,
  );
  const commandPreview = buildRunCommandPreview(draft, allowOverfiltered);
  const canApplyRunCalibration = Boolean(
    completedRunDetail
    && (completedRunDetail.strategyCalibration?.calibrationSummary?.winnerCount ?? 0) > 0,
  );
  const calibrationSummary = completedRunDetail?.strategyCalibration?.calibrationSummary ?? null;

  const filteredRecipeIndexes = useMemo(() => {
    const query = strategySearch.trim().toLowerCase();
    return normalizedRecipes
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
  }, [normalizedRecipes, paramTexts, strategySearch]);

  const selectedRecipeIssue = selectedDerivedRecipe ? getRecipeIssue(selectedDerivedRecipe, paramTexts[selectedRecipeIndex] ?? "{}") : null;
  const selectedRecipeParamEntries = selectedRecipe
    ? getRecipeParamEntries(paramTexts[selectedRecipeIndex] ?? "{}")
    : null;
  const selectedRecipeForm = selectedRecipe
    ? parseStructuredRecipeForm(paramTexts[selectedRecipeIndex] ?? "{}")
    : null;
  const selectedRecipeFilterFields = selectedRecipeForm
    ? selectedRecipeForm.presentFilterKeys
      .map((key) => STRUCTURED_FILTER_FIELD_MAP[key])
      .filter((field): field is StructuredFilterField => Boolean(field))
    : [];
  const availableRecipeFilterFields = selectedRecipeForm
    ? STRUCTURED_FILTER_GROUPS.map((group) => ({
      group,
      fields: STRUCTURED_FILTER_FIELDS.filter((field) => field.group === group && !selectedRecipeForm.presentFilterKeys.includes(field.key)),
    })).filter((entry) => entry.fields.length > 0)
    : [];
  const selectedRecipeProviderFilterCount = selectedRecipeForm
    ? countStructuredProviderFilters(selectedRecipeForm)
    : 0;
  const activeViewSummary = activeView === "builder"
      ? `${draft.recipes.length} strategy${draft.recipes.length === 1 ? "" : "ies"} · ${dirty ? "unsaved changes" : "draft synced"}`
    : completedRunDetail
        ? `${formatInteger(completedRunDetail.winnerCount ?? completedRunDetail.report?.winners.length ?? 0)} winners · ${formatInteger(completedRunDetail.evaluationCount ?? completedRunDetail.report?.deepEvaluations.length ?? 0)} evaluations`
        : "No completed run selected";
  const currentSection = requestedSection ?? inferRequestedSectionFromState(activeView, packageTab);
  const sectionTitle = currentSection === "studio"
    ? ""
    : currentSection === "results"
      ? "Results"
      : currentSection === "config"
        ? "Configuration"
        : "Discovery overview";
  const sectionDescription = currentSection === "studio"
    ? ""
    : currentSection === "results"
      ? "Run, monitor, and review the current lab from one compact surface."
      : currentSection === "config"
        ? "Tune threshold posture and discovery-owned runtime settings."
        : "Choose the next lab step from the overview.";
  const sectionContextChips = currentSection === "studio"
    ? [loadedPackageName, `${draft.recipes.length} strategies`]
    : currentSection === "config"
      ? [`${selectedRecipeProviderFilterCount}/${PROVIDER_FILTER_LIMIT} filters on selected strategy`, draft.defaultProfile ?? "runtime"]
      : currentSection === "results"
        ? [
          activeRun?.packName ?? completedRunDetail?.packName ?? "No selected run",
          activeRun?.status ?? (completedRunDetail
            ? `${formatInteger(completedRunDetail.winnerCount ?? completedRunDetail.report?.winners.length ?? 0)} winners`
            : "Awaiting a completed run"),
        ]
        : [];
  const strategyFocusAreas = useMemo(() => deriveStrategyFocusAreas(normalizedRecipes), [normalizedRecipes]);
  const selectedOptimizationSuggestion = useMemo(() => {
    if (!marketRegimeSuggestion) {
      return null;
    }
    return marketRegimeSuggestion.optimizationSuggestions.find((suggestion) => suggestion.id === selectedOptimizationId)
      ?? marketRegimeSuggestion.optimizationSuggestions[0]
      ?? null;
  }, [marketRegimeSuggestion, selectedOptimizationId]);
  const relevantThresholdFields = useMemo(
    () => deriveRelevantThresholdFields(
      strategyFocusAreas,
      selectedOptimizationSuggestion?.thresholdOverrides ?? marketRegimeSuggestion?.suggestedThresholdOverrides,
    ),
    [marketRegimeSuggestion?.suggestedThresholdOverrides, selectedOptimizationSuggestion?.thresholdOverrides, strategyFocusAreas],
  );
  const regimeFocusChips = useMemo(() => {
    const chips = [
      formatRecipeModeLabel(summarizeDominantMode(normalizedRecipes)),
      ...strategyFocusAreas.slice(0, 3).map(humanizeFocusArea),
    ];
    return Array.from(new Set(chips.filter(Boolean)));
  }, [normalizedRecipes, strategyFocusAreas]);
  const liveCalibrationRows = useMemo(() => {
    if (!calibrationSummary) {
      return [];
    }
    return [
      { label: "Live profile", value: calibrationSummary.derivedProfile ?? "Pending" },
      { label: "Winner score", value: calibrationSummary.avgWinnerScore ?? "—" },
      { label: "Winner market cap", value: calibrationSummary.avgWinnerMarketCapUsd ?? "—" },
      { label: "Winner 5m volume", value: calibrationSummary.avgWinnerVolume5mUsd ?? "—" },
      { label: "Winner grad age", value: calibrationSummary.avgWinnerTimeSinceGraduationMin ?? "—" },
      { label: "Confidence", value: calibrationSummary.calibrationConfidence ?? "—" },
    ];
  }, [calibrationSummary]);

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
    if (requestedSection === "results") {
      const currentSelection = next.recentRuns.find((run) => run.id === selectedRunId) ?? null;
      if (currentSelection?.status === "COMPLETED") {
        return;
      }
      const nextCompletedRun = next.recentRuns.find((run) => run.status === "COMPLETED") ?? null;
      setSelectedRunId(nextCompletedRun?.id ?? "");
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

  async function loadActiveSettings() {
    try {
      const settings = await fetchJson<BotSettings>("/settings");
      setLiveStrategyDraft(settings.strategy.liveStrategy);
    } catch {
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
        setSelectedOptimizationId("");
        setMarketRegimeLoadState("unavailable");
        return;
      }
      setMarketRegimeSuggestion(parsed);
      setSelectedOptimizationId(parsed.optimizationSuggestions[0]?.id ?? "");
      setMarketRegimeLoadState("ready");
    } catch {
      if (cancelled) {
        return;
      }
      setMarketRegimeSuggestion(null);
      setSelectedOptimizationId("");
      setMarketRegimeLoadState("unavailable");
    }
  }

  function updateLiveStrategyDraft(mutator: (current: LiveStrategySettings) => LiveStrategySettings) {
    setLiveStrategyDraft((current) => sanitizeLiveStrategy(mutator(current)));
  }

  function applyRunToLiveStrategyDraft() {
    if (!runDetail) {
      return;
    }
    startTransition(async () => {
      try {
        const response = await fetchJson<DiscoveryLabApplyLiveStrategyResponse>("/operator/discovery-lab/apply-live-strategy", {
          method: "POST",
          body: JSON.stringify({ runId: runDetail.id }),
        });
        await loadActiveSettings();
        setLiveStrategyDraft(sanitizeLiveStrategy(response.strategy));
        setMessage(`Run calibration applied to the active live strategy at ${response.strategy.capitalModifierPercent}% capital modifier.`);
        setError(null);
      } catch (issue) {
        setError(issue instanceof Error ? issue.message : "failed to apply discovery-lab run to live strategy");
        setMessage(null);
      }
    });
  }

  function activateSection(section: DiscoveryLabRequestedSection) {
    setActiveView(mapRequestedSectionToView(section, hasCompletedSelection));
    const nextPackageTab = mapRequestedSectionToPackageTab(section);
    if (nextPackageTab) {
      setPackageTab(nextPackageTab);
    }
    if (requestedSection && requestedSection !== section) {
      router.push(routeForRequestedSection(section));
    }
  }

  function saveLiveStrategyDraft() {
    startTransition(async () => {
      try {
        const nextLiveStrategy = sanitizeLiveStrategy(liveStrategyDraft);
        const nextSettings = await fetchJson<BotSettings>("/settings", {
          method: "POST",
          body: JSON.stringify({
            strategy: {
              liveStrategy: nextLiveStrategy,
            },
          }),
        });
        setLiveStrategyDraft(nextSettings.strategy.liveStrategy);
        setMessage("Live strategy updated.");
        setError(null);
      } catch (issue) {
        setError(issue instanceof Error ? issue.message : "failed to save live strategy");
        setMessage(null);
      }
    });
  }

  function focusPackageEditor(nextTab: PackageTab = "basics") {
    setPackageTab(nextTab);
    activateSection(nextTab === "thresholds" ? "config" : "studio");
  }

  function focusStrategies(index = 0) {
    setSelectedRecipeIndex(index);
    activateSection("studio");
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

  function toggleFavoritePack(packId: string) {
    setFavoritePackIds((current) => current.includes(packId)
      ? current.filter((value) => value !== packId)
      : [...current, packId]);
  }

  function createBlankPack() {
    const starterRecipe = createBlankRecipe(0);
    setSelectedPackId("");
    setDraftKind("custom");
    setDraft({
      ...toDraft(null),
      recipes: [starterRecipe],
    });
    setParamTexts(buildParamTextsFromRecipes([starterRecipe]));
    setIssues([]);
    setMessage("Started a new custom package with one editable strategy.");
    setError(null);
    setSelectedRecipeIndex(0);
    focusStrategies(0);
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
    const suggestion = selectedOptimizationSuggestion;
    if (!suggestion) {
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
        ...suggestion.thresholdOverrides,
      },
    }));
    activateSection("config");
    setMessage(`Applied ${suggestion.label.toLowerCase()} overrides to the draft thresholds.`);
    setError(null);
  }

  function materializeDraft(): DiscoveryLabPackDraft | null {
    try {
      if (editorBlockingError) {
      setError(editorBlockingError);
      setMessage(null);
      focusStrategies(0);
      return null;
      }
      const parsedRecipes = materializeRecipes(draft.recipes, paramTexts);
      const normalizedName = draft.name.trim() || derivePackNameFromDraft(draft, paramTexts, parsedRecipes);
      return {
        ...draft,
        name: normalizedName,
        description: draft.description?.trim() ?? "",
        recipes: parsedRecipes,
      };
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "strategy params must be valid JSON objects");
      setMessage(null);
      activateSection(currentSection === "config" ? "config" : "studio");
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
        setError(formatDiscoveryWriteError(issue, "validate the draft"));
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
        setError(formatDiscoveryWriteError(issue, "save the package"));
        setMessage(null);
      }
    });
  }

  function deletePack() {
    if (!draft.id) {
      return;
    }
    if (!window.confirm(`Delete custom package "${draft.name || selectedPack?.name || "current draft"}"?`)) {
      return;
    }
    startTransition(async () => {
      try {
        await fetchJson<{ ok: true }>("/operator/discovery-lab/packs/delete", {
          method: "POST",
          body: JSON.stringify({ packId: draft.id }),
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
        setError(formatDiscoveryWriteError(issue, "delete the package"));
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
        activateSection("results");
      } catch (issue) {
        setError(formatDiscoveryWriteError(issue, "start the discovery run"));
        setMessage(null);
      }
    });
  }

  function addStrategy() {
    const nextRecipe = createBlankRecipe(draft.recipes.length);
    setDraft((current) => ({
      ...current,
      recipes: [...current.recipes, nextRecipe],
    }));
    setParamTexts((current) => ({
      ...current,
      [Object.keys(current).length]: JSON.stringify(nextRecipe.params, null, 2),
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
          name: "",
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

  function addStructuredFilter(fieldKey: string) {
    if (!selectedRecipe || !STRUCTURED_FILTER_FIELD_MAP[fieldKey]) {
      return;
    }
    addStructuredRecipeFilter(selectedRecipeIndex, setParamTexts, fieldKey);
    setFilterFieldToAdd("");
    setMessage(`Added ${STRUCTURED_FILTER_FIELD_MAP[fieldKey].label} to the strategy filters.`);
    setError(null);
  }

  function removeStructuredFilter(fieldKey: string) {
    if (!selectedRecipe || !STRUCTURED_FILTER_FIELD_MAP[fieldKey]) {
      return;
    }
    removeStructuredRecipeFilter(selectedRecipeIndex, setParamTexts, fieldKey);
    setMessage(`Removed ${STRUCTURED_FILTER_FIELD_MAP[fieldKey].label} from the strategy filters.`);
    setError(null);
  }

  function openRun(run: DiscoveryLabRunSummary) {
    setSelectedRunId(run.id);
    activateSection("results");
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

  const workbenchPanel = currentSection === "studio" ? null : (
    <CompactPageHeader
      eyebrow="Discovery lab"
      title={sectionTitle}
      description={sectionDescription}
      badges={(
        <>
          <StatusPill value={runDetail?.status ?? activeRun?.status ?? "idle"} />
          {activeView === "builder" ? <StatusPill value={dirty ? "changed" : "synced"} /> : null}
          {editorBlockingError ? <StatusPill value="needs attention" /> : null}
        </>
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-text-secondary">{activeViewSummary}</span>
        {sectionContextChips.map((chip) => (
          <span key={chip} className="meta-chip">{chip}</span>
        ))}
        {currentSection === "results" && completedRunDetail?.completedAt ? (
          <span className="meta-chip">Completed {safeFormatTimestamp(completedRunDetail.completedAt, hasHydrated)}</span>
        ) : null}
      </div>
    </CompactPageHeader>
  );

  const actionBar = (
    <section className="sticky top-[calc(var(--shell-header-height)+0.45rem)] z-20 rounded-[14px] border border-bg-border bg-[var(--surface-sticky)] px-2.5 py-2 backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
          {currentSection === "studio"
            ? "Studio actions"
            : currentSection === "config"
              ? "Config actions"
              : "Results actions"}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {activeView === "builder" ? (
            <>
              <button onClick={createBlankPack} className="btn-ghost inline-flex items-center gap-2" disabled={isPending}>
                <Plus className="h-4 w-4" />
                New
              </button>
              <button onClick={cloneCurrentPack} className="btn-ghost inline-flex items-center gap-2" disabled={isPending}>
                <CopyPlus className="h-4 w-4" />
                Clone
              </button>
              <button onClick={deletePack} className="btn-ghost inline-flex items-center gap-2" disabled={isPending || !draft.id}>
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
              <button onClick={runValidation} className="btn-ghost inline-flex items-center gap-2" disabled={isPending || editorBlocked}>
                <ShieldAlert className="h-4 w-4" />
                Validate
              </button>
              <button onClick={savePack} className="btn-ghost inline-flex items-center gap-2" disabled={isPending || editorBlocked}>
                <Save className="h-4 w-4" />
                Save package
              </button>
              <button onClick={startRun} className="btn-primary inline-flex items-center gap-2" disabled={runBusy || editorBlocked}>
                <Play className="h-4 w-4" />
                Run
              </button>
            </>
          ) : null}

          {activeView === "results" ? (
            <>
              <button onClick={startRun} className="btn-primary inline-flex items-center gap-2" disabled={runBusy || editorBlocked}>
                <Play className="h-4 w-4" />
                {runBusy ? "Run in progress" : "Run"}
              </button>
              {completedRunDetail ? (
                <button onClick={loadRunPackSnapshot} className="btn-ghost inline-flex items-center gap-2" disabled={isPending}>
                  <ArrowUpRight className="h-4 w-4" />
                  Tune in studio
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setShowSupportRail((current) => !current)}
                className="btn-ghost hidden items-center gap-2 xl:inline-flex"
              >
                {showSupportRail ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
                {showSupportRail ? "Hide run rail" : "Show run rail"}
              </button>
              {canApplyRunCalibration ? (
                <>
                  <button
                    onClick={applyRunToLiveStrategyDraft}
                    className="btn-ghost inline-flex items-center gap-2"
                    disabled={isPending}
                  >
                    <WandSparkles className="h-4 w-4" />
                    Apply live model
                  </button>
                  <button
                    onClick={saveLiveStrategyDraft}
                    className="btn-primary inline-flex items-center gap-2"
                    disabled={isPending}
                  >
                    <Save className="h-4 w-4" />
                    Save live model
                  </button>
                </>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </section>
  );

  const packageEditorPanel = (
    <Panel
      title="Pack setup"
      eyebrow={draftTitle}
      description="Choose a pack, set defaults, then edit strategies."
      action={<StatusPill value={draft.defaultProfile ?? "high-value"} />}
    >
      <div className="rounded-[16px] border border-bg-border bg-[#0d0f10] p-4">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_auto] xl:items-end">
          <Field label="Package library">
            <select
              value={selectedPackId || "__draft__"}
              onChange={(event) => {
                if (event.target.value === "__draft__") {
                  return;
                }
                const nextPack = catalog.packs.find((pack) => pack.id === event.target.value);
                if (nextPack) {
                  selectPack(nextPack);
                }
              }}
              className={inputClassName}
            >
              <option value="__draft__">Current working draft</option>
              <optgroup label="Favorites">
                {sortedPacks.filter((pack) => favoritePackIds.includes(pack.id)).map((pack) => (
                  <option key={pack.id} value={pack.id}>★ {displayPackName(pack)}</option>
                ))}
              </optgroup>
              <optgroup label="Created packs">
                {sortedPacks.filter((pack) => pack.kind === "created").map((pack) => (
                  <option key={pack.id} value={pack.id}>{displayPackName(pack)}</option>
                ))}
              </optgroup>
              <optgroup label="Workspace packs">
                {sortedPacks.filter((pack) => pack.kind === "custom").map((pack) => (
                  <option key={pack.id} value={pack.id}>{displayPackName(pack)}</option>
                ))}
              </optgroup>
            </select>
          </Field>

          <div className="flex flex-wrap items-end gap-2">
            {selectedPack ? (
              <button
                type="button"
                onClick={() => toggleFavoritePack(selectedPack.id)}
                className="btn-ghost inline-flex items-center gap-2"
              >
                <Star className={favoritePackIds.includes(selectedPack.id) ? "h-4 w-4 fill-current" : "h-4 w-4"} />
                {favoritePackIds.includes(selectedPack.id) ? "Unfavorite" : "Favorite"}
              </button>
            ) : null}
            {selectedPack ? (
              <button
                type="button"
                onClick={() => cloneLibraryPack(selectedPack)}
                className="btn-ghost inline-flex items-center gap-2"
              >
                <CopyPlus className="h-4 w-4" />
                Branch selected
              </button>
            ) : null}
            {runDetail ? (
              <button
                type="button"
                onClick={loadRunPackSnapshot}
                className="btn-ghost inline-flex items-center gap-2"
                disabled={isPending}
              >
                <ArrowUpRight className="h-4 w-4" />
                Load run snapshot
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {favoritePackIds.length > 0 ? (
            <span className="meta-chip">{formatInteger(favoritePackIds.length)} favorites</span>
          ) : null}
          <span className="meta-chip">{loadedFromCreatedPack ? "Created draft" : "Custom draft"}</span>
          {draft.targetPnlBand?.label ? <span className="meta-chip">{draft.targetPnlBand.label}</span> : null}
          <span className="meta-chip">{formatInteger((draft.defaultSources ?? []).length)} sources</span>
          <span className="meta-chip">{formatInteger(draft.recipes.length)} strategies</span>
          <span className="meta-chip">{editorBlockingError ? "Needs attention" : dirty ? "Validate or run" : "Ready"}</span>
        </div>
        {favoritePackIds.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {sortedPacks.filter((pack) => favoritePackIds.includes(pack.id)).map((pack) => (
              <button
                key={pack.id}
                type="button"
                onClick={() => selectPack(pack)}
                className={choiceChipClassName(selectedPackId === pack.id)}
              >
                <Star className="h-3.5 w-3.5 fill-current" />
                {displayPackName(pack)}
              </button>
            ))}
          </div>
        ) : null}
        <div className="mt-3 text-xs text-text-secondary">{nextStep}</div>
        {(draft.thesis || draft.description) ? (
          <details className="mt-4 rounded-[14px] border border-bg-border bg-[#101012] px-3 py-3">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">Pack context</div>
                <div className="mt-1 text-sm font-semibold text-text-primary">{formatTargetPnlBand(draft.targetPnlBand)}</div>
              </div>
              <span className="meta-chip">Open</span>
            </summary>
            <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(14rem,0.7fr)]">
              <div className="text-sm text-text-secondary">{draft.thesis ?? draft.description}</div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">Target profit band</div>
                <div className="mt-2 text-sm font-semibold text-text-primary">{formatTargetPnlBand(draft.targetPnlBand)}</div>
                <div className="mt-1 text-xs text-text-secondary">Strategies below are staged across continuation ranges.</div>
              </div>
            </div>
          </details>
        ) : null}
      </div>

      <Tabs.Root
        value={packageTab}
        onValueChange={(value) => activateSection((value as PackageTab) === "thresholds" ? "config" : "studio")}
      >
        <Tabs.List className="mt-5 inline-flex flex-wrap gap-2 rounded-[16px] border border-bg-border bg-[#0f0f10] p-2">
          <SecondaryTabTrigger value="basics" label="Basics" detail="Name, profile, source defaults" />
          <SecondaryTabTrigger value="thresholds" label="Thresholds" detail="Guardrails with suggestions" />
        </Tabs.List>

        <Tabs.Content value="basics" className="mt-5 outline-none">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <div className="space-y-4">
              <Field label="Package name">
                <input
                  value={draft.name}
                  onChange={(event) => {
                    setDraft((current) => ({ ...current, name: event.target.value }));
                  }}
                  placeholder={suggestedPackName}
                  className={inputClassName}
                />
                <div className="mt-2 text-xs text-text-muted">
                  Leave blank to auto-name from profile, sources, and the strategy mix.
                </div>
              </Field>

              <Field label="Description">
                <TextareaAutosize
                  value={draft.description ?? ""}
                  onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                  className={bodyTextareaClassName}
                  minRows={4}
                />
              </Field>
            </div>

            <div className="space-y-4">
              <Field label="Profile">
                <div className="grid gap-2">
                  {PROFILE_OPTIONS.filter((option) => catalog.profiles.includes(option.value ?? "high-value")).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setDraft((current) => ({ ...current, defaultProfile: option.value }))}
                      className={choiceCardClassName(draft.defaultProfile === option.value)}
                    >
                      <div className="text-sm font-semibold text-text-primary">{option.label}</div>
                      <div className="mt-1 text-xs leading-5 text-text-secondary">{option.detail}</div>
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Default sources">
                <div className="flex flex-wrap gap-2">
                  {catalog.knownSources.map((source) => {
                    const active = (draft.defaultSources ?? []).includes(source);
                    return (
                      <button
                        type="button"
                        key={source}
                        onClick={() => toggleSource(source, setDraft)}
                        className={choiceChipClassName(active)}
                      >
                        {humanizeLabel(source)}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 text-xs text-text-muted">Strategies inherit these unless you explicitly override a source at recipe level.</div>
              </Field>
            </div>
          </div>
        </Tabs.Content>

        <Tabs.Content value="thresholds" className="mt-5 outline-none">
          <div className="space-y-5">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <div className="rounded-[16px] border border-bg-border bg-[#101012] p-4">
                <div className="text-sm font-semibold text-text-primary">Dynamic threshold model</div>
                <div className="mt-1 text-sm leading-6 text-text-secondary">
                  These are pack-level runtime gates, not the only signal source. The run still returns token-level market cap, time since graduation, liquidity, holder breadth, trade intensity, price change, and wallet concentration so downstream review, regime guidance, and sizing can stay dynamic.
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {[
                    "Market cap",
                    "Time since graduation",
                    "Liquidity",
                    "Volume 5m / 30m / 1h",
                    "Unique wallets",
                    "Buy / sell ratio",
                    "Top10 concentration",
                    "Largest holder",
                    "Price change",
                  ].map((item) => (
                    <span key={item} className="meta-chip">{item}</span>
                  ))}
                </div>
                <div className="mt-4 rounded-[14px] border border-bg-border bg-[#0d0d0f] px-4 py-3 text-xs leading-6 text-text-secondary">
                  Use these gates to keep the lab inside the right neighborhood. Use the strategy filter sets above to express the actual 2 to 5 search variants you want to test together.
                </div>
              </div>

              <div className="rounded-[16px] border border-bg-border bg-[#101012] p-4">
                <div className="text-sm font-semibold text-text-primary">Dynamic guidance available today</div>
                <div className="mt-3 space-y-2 text-sm text-text-secondary">
                  <div>Market regime suggestions can apply threshold overrides to the draft without silently changing live settings.</div>
                  <div>Completed runs already return the fields needed for dynamic review: market cap, graduation age, price, liquidity, holders, volume, buy/sell ratio, and holder concentration.</div>
                  <div>Results already derive suggested capital and exit guidance from runtime cash, position pressure, and the current token metrics.</div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <ThresholdGroupPanel
                title="Liquidity and size"
                description="Keep the pack inside the part of the market you actually want to trade."
              >
                {THRESHOLD_FIELDS.filter((field) => ["minLiquidityUsd", "maxMarketCapUsd", "minVolume5mUsd"].includes(field.key)).map((field) => (
                  <ThresholdControlCard
                    key={field.key}
                    label={field.label}
                    unit={THRESHOLD_FIELD_CONFIG[field.key].unit}
                    value={draft.thresholdOverrides?.[field.key]}
                    step={THRESHOLD_FIELD_CONFIG[field.key].step}
                    suggestions={THRESHOLD_FIELD_CONFIG[field.key].suggestions}
                    onChange={(value) => setDraft((current) => ({
                      ...current,
                      thresholdOverrides: {
                        ...(current.thresholdOverrides ?? {}),
                        [field.key]: value,
                      },
                    }))}
                  />
                ))}
              </ThresholdGroupPanel>

              <ThresholdGroupPanel
                title="Participation"
                description="Control breadth and tape quality before deep evaluation burns cycles."
              >
                {THRESHOLD_FIELDS.filter((field) => ["minHolders", "minUniqueBuyers5m", "minBuySellRatio"].includes(field.key)).map((field) => (
                  <ThresholdControlCard
                    key={field.key}
                    label={field.label}
                    unit={THRESHOLD_FIELD_CONFIG[field.key].unit}
                    value={draft.thresholdOverrides?.[field.key]}
                    step={THRESHOLD_FIELD_CONFIG[field.key].step}
                    suggestions={THRESHOLD_FIELD_CONFIG[field.key].suggestions}
                    onChange={(value) => setDraft((current) => ({
                      ...current,
                      thresholdOverrides: {
                        ...(current.thresholdOverrides ?? {}),
                        [field.key]: value,
                      },
                    }))}
                  />
                ))}
              </ThresholdGroupPanel>

              <ThresholdGroupPanel
                title="Concentration and drawdown"
                description="Keep holder concentration and pullback risk inside a usable band."
              >
                {THRESHOLD_FIELDS.filter((field) => ["maxTop10HolderPercent", "maxSingleHolderPercent", "maxNegativePriceChange5mPercent"].includes(field.key)).map((field) => (
                  <ThresholdControlCard
                    key={field.key}
                    label={field.label}
                    unit={THRESHOLD_FIELD_CONFIG[field.key].unit}
                    value={draft.thresholdOverrides?.[field.key]}
                    step={THRESHOLD_FIELD_CONFIG[field.key].step}
                    suggestions={THRESHOLD_FIELD_CONFIG[field.key].suggestions}
                    onChange={(value) => setDraft((current) => ({
                      ...current,
                      thresholdOverrides: {
                        ...(current.thresholdOverrides ?? {}),
                        [field.key]: value,
                      },
                    }))}
                  />
                ))}
              </ThresholdGroupPanel>
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
      title="Regime guidance"
      description="Review fetch yield, winner capture, and one-click threshold suggestions after a run."
      action={selectedOptimizationSuggestion ? (
        <button
          onClick={applyMarketRegimeSuggestion}
          className="btn-ghost inline-flex items-center gap-2"
          disabled={readOnly}
        >
          <WandSparkles className="h-4 w-4" />
          Apply
        </button>
      ) : null}
    >
      {marketRegimeLoadState === "loading" ? (
        <div className="text-sm text-text-secondary">Loading market regime suggestions...</div>
      ) : marketRegimeSuggestion ? (
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill value={marketRegimeSuggestion.label} />
            {regimeFocusChips.map((chip) => (
              <span key={chip} className="meta-chip">{chip}</span>
            ))}
            {marketRegimeSuggestion.observedAt ? (
              <span className="text-xs text-text-muted">{safeFormatTimestamp(marketRegimeSuggestion.observedAt, hasHydrated)}</span>
            ) : null}
          </div>
          {marketRegimeSuggestion.summary ? (
            <div className="text-text-secondary">{marketRegimeSuggestion.summary}</div>
          ) : null}
          {marketRegimeSuggestion.fetchDiagnostics ? (
            <div className="grid gap-3 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="rounded-[16px] border border-bg-border bg-[#101012] p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">Initial fetch yield</div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <SummaryStat label="Returned" value={formatInteger(marketRegimeSuggestion.fetchDiagnostics.returnedCount)} />
                  <SummaryStat label="Selected" value={formatInteger(marketRegimeSuggestion.fetchDiagnostics.selectedCount)} />
                  <SummaryStat label="Winners" value={formatInteger(marketRegimeSuggestion.fetchDiagnostics.goodCount)} />
                  <SummaryStat label="Rejects" value={formatInteger(marketRegimeSuggestion.fetchDiagnostics.rejectCount)} />
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-3">
                  <SummaryRow label="Selection rate" value={formatPercentValue(marketRegimeSuggestion.fetchDiagnostics.selectionRatePercent)} />
                  <SummaryRow label="Winner hit rate" value={formatPercentValue(marketRegimeSuggestion.fetchDiagnostics.winnerHitRatePercent)} />
                  <SummaryRow label="Pass rate" value={formatPercentValue(marketRegimeSuggestion.fetchDiagnostics.passRatePercent)} />
                </div>
              </div>

              <div className="rounded-[16px] border border-bg-border bg-[#101012] p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">Best initial filters</div>
                <div className="mt-3 space-y-2">
                  {marketRegimeSuggestion.fetchDiagnostics.strongestQueries.length > 0 ? marketRegimeSuggestion.fetchDiagnostics.strongestQueries.map((query) => (
                    <div key={query.key} className="rounded-[12px] border border-bg-border bg-[#0d0d0f] px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-text-primary">{query.recipeName}</div>
                          <div className="mt-1 text-xs text-text-secondary">
                            {humanizeLabel(query.source)} · {formatInteger(query.goodCount)} winners / {formatInteger(query.returnedCount)} returned
                          </div>
                        </div>
                        <div className="text-right text-xs text-text-secondary">
                          <div>Hit rate</div>
                          <div className="mt-1 text-sm font-semibold text-text-primary">{formatPercentValue(query.winnerHitRatePercent)}</div>
                        </div>
                      </div>
                    </div>
                  )) : (
                    <div className="text-sm text-text-secondary">Complete a run to compare which initial filters brought winners versus rejects.</div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
          {marketRegimeSuggestion.optimizationSuggestions.length > 0 ? (
            <div className="rounded-[16px] border border-bg-border bg-[#101012] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">Suggested filter sets</div>
                  <div className="mt-1 text-sm text-text-secondary">Choose the next threshold posture based on whether you want more tokens, more balance, or cleaner quality.</div>
                </div>
              </div>
              <div className="mt-3 grid gap-3 lg:grid-cols-3">
                {marketRegimeSuggestion.optimizationSuggestions.map((suggestion) => {
                  const active = suggestion.id === (selectedOptimizationSuggestion?.id ?? "");
                  return (
                    <button
                      type="button"
                      key={suggestion.id}
                      onClick={() => setSelectedOptimizationId(suggestion.id)}
                      className={clsx(
                        "rounded-[14px] border px-3 py-3 text-left transition",
                        active
                          ? "border-[rgba(163,230,53,0.3)] bg-[#11130f]"
                          : "border-bg-border bg-[#0d0d0f] hover:border-[rgba(255,255,255,0.12)]",
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-text-primary">{suggestion.label}</div>
                        <StatusPill value={suggestion.objective} />
                      </div>
                      <div className="mt-2 text-xs leading-5 text-text-secondary">{suggestion.summary}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="rounded-[16px] border border-bg-border bg-[#101012] p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">Selected filter suggestion</div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {relevantThresholdFields.length > 0 ? relevantThresholdFields.map((field) => (
                  <SummaryRow
                    key={field.key}
                    label={field.label}
                    value={(selectedOptimizationSuggestion?.thresholdOverrides ?? marketRegimeSuggestion.suggestedThresholdOverrides)[field.key] ?? "No override"}
                  />
                )) : (
                  <div className="text-sm text-text-secondary">No strategy-linked threshold suggestions are available yet.</div>
                )}
              </div>
            </div>

            <div className="rounded-[16px] border border-bg-border bg-[#101012] p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">Live handoff signals</div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {liveCalibrationRows.length > 0 ? liveCalibrationRows.map((row) => (
                  <SummaryRow key={row.label} label={row.label} value={row.value} />
                )) : (
                  <div className="text-sm text-text-secondary">Run a pack with winners to stage live-facing score, cap, volume, and timing guidance here.</div>
                )}
              </div>
            </div>
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
      title="Strategies"
      eyebrow="Editor"
      description="Keep one strategy selected, shape its query plan and filters, and use JSON only for exceptions."
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
                const recipe = normalizedRecipes[index];
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
                      <div className="text-sm font-semibold text-text-primary">{recipe.name}</div>
                      <StatusPill value={issue ?? "ready"} />
                    </div>
                    <div className="mt-2 text-xs text-text-secondary">
                      {formatRecipeModeLabel(recipe.mode)} · {getRecipeFilterSummary(paramTexts[index] ?? "{}")} · deep eval {recipe.deepEvalLimit ?? "default"}
                    </div>
                    {recipe.targetPnlBand?.label ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="meta-chip">{recipe.targetPnlBand.label}</span>
                      </div>
                    ) : null}
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
                  <div className="text-sm font-semibold text-text-primary">{selectedDerivedRecipe?.name ?? `Strategy ${selectedRecipeIndex + 1}`}</div>
                  <div className="mt-1 text-sm leading-6 text-text-secondary">
                    Names and stage are derived from the active filter set when the pack is validated, saved, or run.
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
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-4">
                <SummaryStat label="Position" value={`${selectedRecipeIndex + 1} / ${draft.recipes.length}`} />
                <SummaryStat label="Stage" value={formatRecipeModeLabel(selectedDerivedRecipe?.mode ?? selectedRecipe.mode)} />
                <SummaryStat label="Target PnL" value={formatTargetPnlBand(selectedDerivedRecipe?.targetPnlBand ?? selectedRecipe.targetPnlBand)} />
                <SummaryStat label="Status" value={selectedRecipeIssue ?? "Ready"} compact />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_12rem]">
              <div className="rounded-[16px] border border-bg-border bg-[#101012] px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Auto name</div>
                <div className="mt-2 text-sm font-semibold text-text-primary">{selectedDerivedRecipe?.name ?? `Strategy ${selectedRecipeIndex + 1}`}</div>
                <div className="mt-1 text-xs leading-5 text-text-secondary">
                  Driven by stage, ranking, source, and the current filter mix.
                </div>
              </div>
              <Field label="Deep eval limit">
                <StructuredNumberField
                  value={selectedRecipe.deepEvalLimit}
                  step={1}
                  unit="rows"
                  suggestions={[15, 25, 40]}
                  onChange={(value) => updateRecipe(selectedRecipeIndex, setDraft, { deepEvalLimit: value ?? undefined })}
                />
              </Field>
            </div>

            <Field label="Description">
              <TextareaAutosize
                value={selectedRecipe.description ?? ""}
                onChange={(event) => updateRecipe(selectedRecipeIndex, setDraft, { description: event.target.value })}
                className={bodyTextareaClassName}
                minRows={3}
              />
            </Field>

            <RecipeSectionCard title="Query plan" description="Choose how the recipe ranks candidates, where it pulls from, and how wide the first pass should be.">
              <div className="mb-4 flex flex-wrap gap-2">
                <span className="meta-chip">{formatRecipeModeLabel(selectedDerivedRecipe?.mode ?? selectedRecipe.mode)}</span>
                <span className="meta-chip">{selectedDerivedRecipe?.name ?? `Strategy ${selectedRecipeIndex + 1}`}</span>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Field label="Sort metric">
                  <select
                    value={selectedRecipeForm?.sort_by ?? "last_trade_unix_time"}
                    onChange={(event) => updateStructuredRecipeForm(selectedRecipeIndex, setParamTexts, { sort_by: event.target.value })}
                    className={inputClassName}
                  >
                    {SORT_OPTION_GROUPS.map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.options.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <div className="mt-2 text-xs text-text-muted">
                    {SORT_OPTIONS.find((option) => option.value === (selectedRecipeForm?.sort_by ?? "last_trade_unix_time"))?.detail}
                  </div>
                </Field>

                <Field label="Sort direction">
                  <div className="flex flex-wrap gap-2">
                    {["desc", "asc"].map((direction) => (
                      <button
                        key={direction}
                        type="button"
                        onClick={() => updateStructuredRecipeForm(selectedRecipeIndex, setParamTexts, { sort_type: direction as "asc" | "desc" })}
                        className={choiceChipClassName((selectedRecipeForm?.sort_type ?? "desc") === direction)}
                      >
                        {direction === "desc" ? "Highest first" : "Lowest first"}
                      </button>
                    ))}
                  </div>
                </Field>

                <Field label="Source override">
                  <select
                    value={selectedRecipeForm?.source ?? ""}
                    onChange={(event) => updateStructuredRecipeForm(selectedRecipeIndex, setParamTexts, { source: event.target.value })}
                    className={inputClassName}
                  >
                    <option value="">Inherit pack sources</option>
                    <option value="all">All sources</option>
                    {catalog.knownSources.map((source) => (
                      <option key={source} value={source}>{humanizeLabel(source)}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Result limit">
                  <StructuredNumberField
                    value={selectedRecipeForm?.limit}
                    step={1}
                    unit="rows"
                    suggestions={STRATEGY_LIMIT_SUGGESTIONS}
                    onChange={(value) => updateStructuredRecipeForm(selectedRecipeIndex, setParamTexts, { limit: value == null ? "" : String(value) })}
                  />
                </Field>
              </div>
            </RecipeSectionCard>

            <RecipeSectionCard title="Field filters" description="Pick a Birdeye field first, then set its value. Only active values count against the provider filter ceiling.">
              <div className="space-y-4">
                <div className="flex flex-col gap-3 rounded-[14px] border border-bg-border bg-[#0d0d0f] px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-text-primary">Provider filter ceiling</div>
                    <div className="mt-1 text-xs leading-5 text-text-secondary">
                      The repo currently treats Birdeye meme-list queries as safe up to {PROVIDER_FILTER_LIMIT} concurrent provider-side filters per recipe.
                    </div>
                  </div>
                  <div className={clsx(
                    "rounded-full border px-3 py-1.5 text-xs font-semibold",
                    selectedRecipeProviderFilterCount > PROVIDER_FILTER_LIMIT
                      ? "border-[rgba(251,113,133,0.28)] bg-[rgba(251,113,133,0.12)] text-[var(--danger)]"
                      : selectedRecipeProviderFilterCount === PROVIDER_FILTER_LIMIT
                        ? "border-[rgba(250,204,21,0.28)] bg-[rgba(250,204,21,0.12)] text-[var(--warning)]"
                        : "border-[rgba(163,230,53,0.24)] bg-[rgba(163,230,53,0.1)] text-accent"
                  )}>
                    {selectedRecipeProviderFilterCount} / {PROVIDER_FILTER_LIMIT} active filters
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_16rem]">
                  <div className="space-y-3">
                    {selectedRecipeFilterFields.length > 0 ? selectedRecipeFilterFields.map((field) => (
                      <StructuredFilterCard
                        key={field.key}
                        field={field}
                        value={selectedRecipeForm?.filters[field.key] ?? ""}
                        onChange={(value) => updateStructuredRecipeFilter(selectedRecipeIndex, setParamTexts, field.key, value)}
                        onRemove={() => removeStructuredFilter(field.key)}
                      />
                    )) : (
                      <EmptyState title="No provider filters yet" detail="Add only the fields that matter for this strategy instead of carrying the whole filter surface at once." />
                    )}
                  </div>

                  <div className="rounded-[16px] border border-bg-border bg-[#101012] p-4">
                    <div className="text-sm font-semibold text-text-primary">Add filter</div>
                    <div className="mt-1 text-xs leading-5 text-text-secondary">Select one field, then fill in its value. Unsupported experiments can still drop to JSON below.</div>
                    <select
                      value={filterFieldToAdd}
                      onChange={(event) => {
                        const nextField = event.target.value;
                        setFilterFieldToAdd(nextField);
                        if (nextField) {
                          addStructuredFilter(nextField);
                        }
                      }}
                      className="mt-3 w-full rounded-[12px] border border-bg-border bg-[#0d0d0f] px-3 py-2 text-sm text-text-primary outline-none"
                    >
                      <option value="">Select a filter field</option>
                      {availableRecipeFilterFields.map((group) => (
                        <optgroup key={group.group} label={group.group}>
                          {group.fields.map((field) => (
                            <option key={field.key} value={field.key}>{field.label}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>

                    <div className="mt-4 space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">Current path</div>
                      <SummaryRow label="Sort" value={SORT_OPTIONS.find((option) => option.value === selectedRecipeForm?.sort_by)?.label ?? selectedRecipeForm?.sort_by ?? "Sort"} />
                      <SummaryRow label="Filters" value={`${selectedRecipeProviderFilterCount}/${PROVIDER_FILTER_LIMIT}`} />
                      <SummaryRow label="Visible fields" value={selectedRecipeFilterFields.length} />
                    </div>
                  </div>
                </div>
              </div>
            </RecipeSectionCard>

            <details className="rounded-[16px] border border-bg-border bg-[#101012]">
              <summary className="cursor-pointer list-none px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-text-primary">Advanced params</div>
                    <div className="mt-1 text-xs text-text-secondary">Use raw JSON only for unsupported provider filters or one-off experiments.</div>
                  </div>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      formatSelectedStrategyParams();
                    }}
                    className="btn-ghost inline-flex items-center gap-2"
                  >
                    <WandSparkles className="h-4 w-4" />
                    Format JSON
                  </button>
                </div>
              </summary>
              <div className="border-t border-bg-border px-4 py-4">
                <Field label="Params JSON">
                  <TextareaAutosize
                    value={paramTexts[selectedRecipeIndex] ?? "{}"}
                    onChange={(event) => setParamTexts((current) => ({ ...current, [selectedRecipeIndex]: event.target.value }))}
                    className={jsonTextareaClassName}
                    minRows={12}
                  />
                  {selectedRecipeIssue === "Invalid JSON" ? (
                    <div className="mt-2 text-xs text-[var(--danger)]">Strategy params must be a valid JSON object.</div>
                  ) : null}
                </Field>

                <div className="rounded-[16px] border border-bg-border bg-[#0d0d0f] p-4">
                  <div className="text-sm font-semibold text-text-primary">Active params</div>
                  {selectedRecipeParamEntries ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedRecipeParamEntries.length > 0 ? selectedRecipeParamEntries.map(([key, value]) => (
                        <span key={key} className="rounded-full border border-bg-border bg-[#101012] px-3 py-1.5 text-xs text-text-secondary">
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
            </details>
          </div>
        ) : (
          <EmptyState title="No strategy selected" detail="Add a strategy to start shaping a runnable package." />
        )}
      </div>
    </Panel>
  );

  const validationPanel = (
    <details
      open={validationOpen}
      onToggle={(event) => setValidationOpen((event.currentTarget as HTMLDetailsElement).open)}
      className="rounded-[16px] border border-bg-border bg-[#101012]"
    >
      <summary className="cursor-pointer list-none px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-text-primary">Validation</div>
            <div className="mt-1 text-xs text-text-secondary">
              {issues.length > 0 ? `${issues.length} issue${issues.length === 1 ? "" : "s"} captured` : "Run validation when the draft is ready."}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {issues.length > 0 ? <StatusPill value={validationErrors.length > 0 ? "needs fixes" : "warnings only"} /> : <StatusPill value="idle" />}
            <span className="meta-chip">{validationOpen ? "Open" : "Collapsed"}</span>
          </div>
        </div>
      </summary>
      <div className="border-t border-bg-border px-4 py-4">
        {issues.length > 0 ? (
          <div className="space-y-2">
            {issues.map((issue, index) => (
              <div key={`${issue.path}-${index}`} className="rounded-[12px] border border-bg-border bg-[#0d0f10] px-3 py-3 text-sm">
                <div className="flex items-center gap-2">
                  <StatusPill value={issue.level} />
                  <span className="font-medium text-text-primary">{issue.path}</span>
                </div>
                <div className="mt-2 text-text-secondary">{issue.message}</div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No findings yet" detail="Run validation after editing a package to catch filter ceilings or pack issues." />
        )}
      </div>
    </details>
  );

  const builderGuidancePanel = (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {validationPanel}
      {regimeSuggestionPanel}
    </div>
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

  const logPanel = (
    <Panel title="Live log" description="Secondary evidence from the local process.">
      <details className="group rounded-[14px] border border-bg-border bg-[#0d0f10]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-text-primary">
          <span>stdout + stderr</span>
          <span className="text-xs text-text-secondary group-open:hidden">Open</span>
          <span className="hidden text-xs text-text-secondary group-open:inline">Close</span>
        </summary>
        <div className="border-t border-bg-border px-4 py-4">
          <div className="space-y-4">
            <LogBlock title="stdout" lines={stdoutLines} tone="default" />
            <LogBlock title="stderr" lines={stderrLines} tone="critical" />
          </div>
        </div>
      </details>
    </Panel>
  );

  const runOutputPanel = (
    <details className="rounded-[16px] border border-bg-border bg-[#101012]">
      <summary className="cursor-pointer list-none px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-text-primary">Run outputs</div>
            <div className="mt-1 text-xs text-text-secondary">Open only when you need the persisted report structure and field inventory.</div>
          </div>
          <span className="meta-chip">{report ? `${formatInteger(report.deepEvaluations.length)} deep evaluations` : "After run"}</span>
        </div>
      </summary>
      <div className="border-t border-bg-border px-4 py-4">
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-[14px] border border-bg-border bg-[#0d0d0f] p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">Persisted structures</div>
            <div className="mt-3 grid gap-2">
              <SummaryRow label="Query summaries" value={report?.querySummaries.length ?? "After run"} />
              <SummaryRow label="Source summaries" value={report?.sourceSummaries.length ?? "After run"} />
              <SummaryRow label="Winners" value={report?.winners.length ?? "After run"} />
              <SummaryRow label="Deep evaluations" value={report?.deepEvaluations.length ?? "After run"} />
              <SummaryRow label="Calibration draft" value={completedRunDetail?.strategyCalibration ? "Available" : "When winners exist"} />
            </div>
          </div>

          <div className="rounded-[14px] border border-bg-border bg-[#0d0d0f] p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">Token fields returned</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                "Price",
                "Liquidity",
                "Market cap",
                "Holders",
                "Volume 1m / 5m / 30m",
                "Trades 1m / 5m",
                "Price change 1m / 5m / 30m",
                "Unique wallets 5m / 24h",
                "Buy / sell ratio",
                "Top10 holder %",
                "Largest holder %",
                "Time since graduation",
                "Time since creation",
              ].map((item) => (
                <span key={item} className="meta-chip">{item}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </details>
  );

  const runCockpitPanel = (
    <Panel
      title="Run center"
      eyebrow="Live progress"
      description="Start, monitor, and reopen discovery runs from one compact surface."
      tone={activeRun?.status === "FAILED" ? "critical" : activeRun ? "warning" : "passive"}
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="space-y-4">
          <div className="rounded-[16px] border border-bg-border bg-[#101012] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-text-primary">{activeRun?.packName ?? "No active run"}</div>
                <div className="mt-1 text-xs text-text-secondary">
                  {activeRun ? `${activeRun.sources.join(", ")} · ${activeRun.profile}` : "Start a run from this page to launch the local discovery script."}
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
                detail={completedRunDetail?.completedAt ? `Completed ${safeFormatTimestamp(completedRunDetail.completedAt, hasHydrated)}.` : "Results stay on this page once available."}
                active={Boolean(activeRun && activeRun.status !== "RUNNING" && !completedRunDetail?.completedAt)}
                complete={Boolean(completedRunDetail?.completedAt)}
              />
            </div>
          </div>

          <details className="rounded-[16px] border border-bg-border bg-[#0d0d0f]">
            <summary className="cursor-pointer list-none px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
                  <SquareTerminal className="h-4 w-4" />
                  CLI launch
                </div>
                <span className="meta-chip">Open command</span>
              </div>
            </summary>
            <div className="border-t border-bg-border px-4 py-4">
              <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-6 text-text-secondary">
                {commandPreview}
              </pre>
            </div>
          </details>
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
    <Tabs.Root
      value={activeView}
      onValueChange={(value) => activateSection(inferRequestedSectionFromState(value as DiscoveryView, packageTab))}
    >
      <div className="flex flex-col gap-4">
        {workbenchPanel}
        {actionBar}
        {messageBanner}

        <Tabs.Content value="builder" className="space-y-4 outline-none">
          <div className="space-y-4">
            {packageEditorPanel}
            {strategyStudioPanel}
            {builderGuidancePanel}
          </div>
        </Tabs.Content>

        <Tabs.Content value="results" className="space-y-4 outline-none">
          <div className={clsx("grid gap-4", showSupportRail ? "xl:grid-cols-[minmax(0,1fr)_18rem]" : "xl:grid-cols-1")}>
            <div className="space-y-4">
              {runCockpitPanel}
              {(showRunOutputPanel || showLogPanel) ? (
                <details className="rounded-[18px] border border-bg-border bg-[#101112]">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
                    <div>
                      <div className="section-kicker">Run evidence</div>
                      <div className="mt-2 text-sm font-semibold text-text-primary">Open only for logs, outputs, and process detail.</div>
                    </div>
                    <span className="meta-chip">Collapsed by default</span>
                  </summary>
                  <div className="space-y-4 border-t border-bg-border px-5 py-4">
                    {showRunOutputPanel ? runOutputPanel : null}
                    {showLogPanel ? logPanel : null}
                  </div>
                </details>
              ) : null}
            </div>
            {showSupportRail ? (
              <div className="space-y-4">
                {runsPanel}
              </div>
            ) : null}
          </div>

          {!completedRunDetail ? (
            <EmptyState title="No completed run selected" detail="Use the run rail above to reopen any completed run, or start a new one from this page." />
          ) : null}

          {completedRunDetail ? (
            <DiscoveryLabResultsBoard
              runDetail={completedRunDetail}
              runtimeSnapshot={runtimeSnapshot}
              onRuntimeSnapshotChange={setRuntimeSnapshot}
            />
          ) : null}

          {completedRunDetail ? (
            <details className="rounded-[18px] border border-bg-border bg-[#101112]">
              <summary className="cursor-pointer list-none px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="section-kicker">Live strategy staging</div>
                    <div className="mt-2 text-sm font-semibold text-text-primary">Open only when you want to tune and apply the live model built from this run.</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="meta-chip">{liveStrategyDraft.enabled ? "Enabled" : "Disabled"}</span>
                    <span className="meta-chip">{calibrationSummary?.derivedProfile ?? liveStrategyDraft.dominantMode ?? "mixed"}</span>
                    <span className="meta-chip">{`${liveStrategyDraft.capitalModifierPercent}% capital`}</span>
                  </div>
                </div>
              </summary>
              <div className="border-t border-bg-border px-5 py-4">
                <div className="space-y-3">
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                    <ScanStat
                      label="Mode"
                      value={liveStrategyDraft.enabled ? "Enabled" : "Disabled"}
                      detail="Active baseline"
                      tone={liveStrategyDraft.enabled ? "accent" : "default"}
                    />
                    <ScanStat
                      label="Source"
                      value={liveStrategyDraft.sourceRunId ?? "No source run"}
                      detail={`Pack ${liveStrategyDraft.packName ?? "none"}`}
                      tone={liveStrategyDraft.sourceRunId ? "default" : "warning"}
                    />
                    <ScanStat
                      label="Profile"
                      value={calibrationSummary?.derivedProfile ?? liveStrategyDraft.dominantMode ?? "mixed"}
                      detail={`Confidence ${calibrationSummary?.calibrationConfidence ?? "—"}`}
                    />
                    <ScanStat
                      label="Capital"
                      value={`${liveStrategyDraft.capitalModifierPercent}%`}
                      detail={formatLivePresetLabel(liveStrategyDraft.dominantPresetId)}
                    />
                  </div>

                  <div className="grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
                    <div className="space-y-3">
                      <label className="flex items-center gap-2 rounded-[12px] border border-bg-border bg-[#101012] px-3 py-2 text-sm text-text-secondary">
                        <input
                          type="checkbox"
                          checked={liveStrategyDraft.enabled}
                          onChange={(event) => updateLiveStrategyDraft((current) => ({ ...current, enabled: event.target.checked }))}
                          className="h-4 w-4"
                        />
                        Enable live strategy pack
                      </label>

                      <Field label="Live preset basis">
                        <div className="rounded-[12px] border border-bg-border bg-[#101012] px-3 py-2 text-sm text-text-secondary">
                          {formatLivePresetLabel(liveStrategyDraft.dominantPresetId)}
                        </div>
                        <div className="mt-2 text-xs text-text-muted">
                          Derived from the calibrated strategy mix. Discovery lab no longer stages a separate preset fallback here.
                        </div>
                      </Field>

                      <Field label="Capital modifier %">
                        <input
                          type="number"
                          min={40}
                          max={180}
                          step={1}
                          value={liveStrategyDraft.capitalModifierPercent}
                          onChange={(event) => updateLiveStrategyDraft((current) => ({
                            ...current,
                            capitalModifierPercent: Number(event.target.value),
                          }))}
                          className={inputClassName}
                        />
                      </Field>
                    </div>

                    <div className="space-y-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <CompactLiveField
                          label="Stop loss %"
                          value={liveStrategyDraft.exitOverrides.stopLossPercent}
                          min={4}
                          max={35}
                          step={0.1}
                          onChange={(value) => updateLiveStrategyDraft((current) => ({
                            ...current,
                            exitOverrides: { ...current.exitOverrides, stopLossPercent: value },
                          }))}
                        />
                        <CompactLiveField
                          label="TP1 multiplier"
                          value={liveStrategyDraft.exitOverrides.tp1Multiplier}
                          min={1.05}
                          max={2.2}
                          step={0.01}
                          onChange={(value) => updateLiveStrategyDraft((current) => ({
                            ...current,
                            exitOverrides: { ...current.exitOverrides, tp1Multiplier: value },
                          }))}
                        />
                        <CompactLiveField
                          label="TP2 multiplier"
                          value={liveStrategyDraft.exitOverrides.tp2Multiplier}
                          min={1.2}
                          max={3.5}
                          step={0.01}
                          onChange={(value) => updateLiveStrategyDraft((current) => ({
                            ...current,
                            exitOverrides: { ...current.exitOverrides, tp2Multiplier: value },
                          }))}
                        />
                        <CompactLiveField
                          label="Trailing stop %"
                          value={liveStrategyDraft.exitOverrides.trailingStopPercent}
                          min={4}
                          max={30}
                          step={0.1}
                          onChange={(value) => updateLiveStrategyDraft((current) => ({
                            ...current,
                            exitOverrides: { ...current.exitOverrides, trailingStopPercent: value },
                          }))}
                        />
                        <CompactLiveField
                          label="Time stop min"
                          value={liveStrategyDraft.exitOverrides.timeStopMinutes}
                          min={1}
                          max={30}
                          step={0.5}
                          onChange={(value) => updateLiveStrategyDraft((current) => ({
                            ...current,
                            exitOverrides: { ...current.exitOverrides, timeStopMinutes: value },
                          }))}
                        />
                        <CompactLiveField
                          label="Time limit min"
                          value={liveStrategyDraft.exitOverrides.timeLimitMinutes}
                          min={2}
                          max={60}
                          step={0.5}
                          onChange={(value) => updateLiveStrategyDraft((current) => ({
                            ...current,
                            exitOverrides: { ...current.exitOverrides, timeLimitMinutes: value },
                          }))}
                        />
                      </div>

                      <div className="rounded-[14px] border border-bg-border bg-[#0f1112] px-3 py-3">
                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Calibration</div>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2 text-sm">
                          <SummaryRow label="Winners" value={calibrationSummary?.winnerCount ?? "—"} />
                          <SummaryRow label="Avg score" value={calibrationSummary?.avgWinnerScore ?? "—"} />
                          <SummaryRow label="Avg 5m volume" value={calibrationSummary?.avgWinnerVolume5mUsd ?? "—"} />
                          <SummaryRow label="Avg grad age (min)" value={calibrationSummary?.avgWinnerTimeSinceGraduationMin ?? "—"} />
                          <SummaryRow label="Volume strength" value={calibrationSummary?.volumeStrength ?? "—"} />
                          <SummaryRow label="Freshness" value={calibrationSummary?.graduationFreshness ?? "—"} />
                          <SummaryRow label="Confidence" value={calibrationSummary?.calibrationConfidence ?? "—"} />
                          <SummaryRow label="Profile" value={calibrationSummary?.derivedProfile ?? "—"} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </details>
          ) : null}

          <details className="rounded-[18px] border border-bg-border bg-bg-hover/20">
            <summary className="cursor-pointer list-none px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="section-kicker">Secondary synthesis</div>
                  <div className="mt-2 text-sm font-semibold text-text-primary">Research summary</div>
                </div>
                <span className="meta-chip">Collapsed by default</span>
              </div>
            </summary>
            <div className="border-t border-bg-border/80 p-1">
              <DiscoveryLabResearchSummary runDetail={runDetail} />
            </div>
          </details>
        </Tabs.Content>
      </div>
    </Tabs.Root>
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
    <div className={clsx("rounded-[14px] border border-bg-border bg-[#101012] px-3 py-2.5", props.compact ? "min-h-[5.5rem]" : "")}>
      <div className="scorecard-grid">
        <div className="scorecard-label">{props.label}</div>
        <div className={clsx("scorecard-value wrap-anywhere", props.compact ? "text-sm font-medium leading-5" : "text-[1.15rem] font-semibold tracking-tight")}>
          {String(props.value)}
        </div>
        {props.compact ? <div className="scorecard-detail text-[11px]">Latest process signal</div> : <div />}
      </div>
    </div>
  );
}

function SummaryRow(props: { label: string; value: unknown }) {
  return (
    <div className="rounded-[14px] border border-bg-border bg-[#0d0d0f] px-3 py-3">
      <div className="scorecard-grid">
        <div className="scorecard-label wrap-anywhere">{props.label}</div>
        <div className="scorecard-value wrap-anywhere text-sm">{smartFormatValue(props.label, props.value)}</div>
        <div />
      </div>
    </div>
  );
}

function formatTargetPnlBand(
  band?: {
    label: string;
    minPercent?: number;
    maxPercent?: number;
  } | null,
): string {
  if (!band) {
    return "Unset";
  }
  if (band.label.trim().length > 0) {
    return band.label;
  }
  if (typeof band.minPercent === "number" && typeof band.maxPercent === "number") {
    return `${band.minPercent}-${band.maxPercent}%`;
  }
  if (typeof band.minPercent === "number") {
    return `${band.minPercent}%+`;
  }
  if (typeof band.maxPercent === "number") {
    return `<=${band.maxPercent}%`;
  }
  return "Unset";
}

function formatPercentValue(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "—";
  }
  return `${value.toFixed(1)}%`;
}

type StructuredRecipeForm = {
  sort_by: string;
  sort_type: "asc" | "desc";
  source: string;
  limit: string;
  filters: Record<string, string>;
  presentFilterKeys: string[];
  extras: Record<string, string | number | boolean | null>;
};

function RecipeSectionCard(props: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[16px] border border-bg-border bg-[#101012] p-4">
      <div className="mb-4">
        <div className="text-sm font-semibold text-text-primary">{props.title}</div>
        <div className="mt-1 text-xs leading-5 text-text-secondary">{props.description}</div>
      </div>
      {props.children}
    </div>
  );
}

function ThresholdGroupPanel(props: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[16px] border border-bg-border bg-[#101012] p-4">
      <div className="mb-4">
        <div className="text-sm font-semibold text-text-primary">{props.title}</div>
        <div className="mt-1 text-xs leading-5 text-text-secondary">{props.description}</div>
      </div>
      <div className="space-y-3">{props.children}</div>
    </div>
  );
}

function StructuredNumberField(props: {
  value: string | number | undefined;
  step: number;
  unit: string;
  suggestions: number[];
  onChange: (value: number | null) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="relative">
        <input
          value={props.value ?? ""}
          onChange={(event) => props.onChange(event.target.value === "" ? null : Number(event.target.value))}
          type="number"
          step={props.step}
          className={clsx(inputClassName, "pr-14")}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] uppercase tracking-[0.12em] text-text-muted">
          {props.unit}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {props.suggestions.map((suggestion) => (
          <button
            key={`${props.unit}-${suggestion}`}
            type="button"
            onClick={() => props.onChange(suggestion)}
            className="rounded-full border border-bg-border bg-[#0d0d0f] px-2.5 py-1 text-[11px] text-text-secondary transition hover:border-[rgba(163,230,53,0.22)] hover:text-text-primary"
          >
            {formatSuggestedValue(suggestion, props.unit)}
          </button>
        ))}
        <button
          type="button"
          onClick={() => props.onChange(null)}
          className="rounded-full border border-bg-border bg-[#0d0d0f] px-2.5 py-1 text-[11px] text-text-secondary transition hover:border-[rgba(255,255,255,0.14)] hover:text-text-primary"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

function StructuredFilterCard(props: {
  field: StructuredFilterField;
  value: string;
  onChange: (value: string) => void;
  onRemove: () => void;
}) {
  const suggestionButtons = props.field.suggestions ?? [];

  return (
    <div className="rounded-[16px] border border-bg-border bg-[#101012] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-text-primary">{props.field.label}</div>
          <div className="mt-1 text-xs leading-5 text-text-secondary">{props.field.description}</div>
        </div>
        <button type="button" onClick={props.onRemove} className="btn-ghost inline-flex items-center gap-2">
          <Trash2 className="h-4 w-4" />
          Remove
        </button>
      </div>

      <div className="mt-4">
        {props.field.kind === "boolean" ? (
          <div className="flex flex-wrap gap-2">
            {[
              { value: "true", label: "True" },
              { value: "false", label: "False" },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => props.onChange(option.value)}
                className={choiceChipClassName(props.value === option.value)}
              >
                {option.label}
              </button>
            ))}
            <button type="button" onClick={() => props.onChange("")} className="btn-ghost inline-flex items-center gap-2">
              Clear
            </button>
          </div>
        ) : props.field.kind === "text" ? (
          <input
            value={props.value}
            onChange={(event) => props.onChange(event.target.value)}
            placeholder={props.field.placeholder}
            className={inputClassName}
          />
        ) : (
          <StructuredNumberField
            value={props.value}
            step={props.field.step ?? 1}
            unit={props.field.unit ?? "value"}
            suggestions={suggestionButtons}
            onChange={(value) => props.onChange(value == null ? "" : String(value))}
          />
        )}
      </div>
    </div>
  );
}

function ThresholdControlCard(props: {
  label: string;
  unit: string;
  value: number | undefined;
  step: number;
  suggestions: number[];
  onChange: (value: number | undefined) => void;
}) {
  return (
    <div className="rounded-[16px] border border-bg-border bg-[#101012] p-4">
      <div className="scorecard-label wrap-anywhere">{props.label}</div>
      <div className="mt-3">
        <StructuredNumberField
          value={props.value}
          step={props.step}
          unit={props.unit}
          suggestions={props.suggestions}
          onChange={(value) => props.onChange(value == null ? undefined : value)}
        />
      </div>
    </div>
  );
}

function CompactLiveField(props: {
  label: string;
  value: number | undefined;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="rounded-[12px] border border-bg-border bg-[#0f1011] px-3 py-2">
      <div className="scorecard-label wrap-anywhere">{props.label}</div>
      <input
        type="number"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value ?? ""}
        onChange={(event) => props.onChange(Number(event.target.value))}
        className="mt-2 w-full rounded-[10px] border border-bg-border bg-[#0b0c0d] px-2 py-1.5 text-sm text-text-primary outline-none"
      />
    </label>
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

function choiceCardClassName(active: boolean) {
  return clsx(
    "w-full rounded-[14px] border px-3 py-3 text-left transition",
    active
      ? "border-[rgba(163,230,53,0.3)] bg-[#11130f]"
      : "border-bg-border bg-[#0d0f10] hover:border-[rgba(255,255,255,0.12)]",
  );
}

function choiceChipClassName(active: boolean) {
  return clsx(
    "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
    active
      ? "border-[rgba(163,230,53,0.3)] bg-[#11130f] text-text-primary"
      : "border-bg-border bg-[#101012] text-text-secondary hover:text-text-primary",
  );
}

function parseStructuredRecipeForm(value: string): StructuredRecipeForm {
  const params = safeParseParams(value);
  const form: StructuredRecipeForm = {
    sort_by: typeof params.sort_by === "string" ? params.sort_by : "last_trade_unix_time",
    sort_type: params.sort_type === "asc" ? "asc" : "desc",
    source: typeof params.source === "string" ? params.source : "",
    limit: toEditableString(params.limit),
    filters: {},
    presentFilterKeys: [],
    extras: {},
  };

  for (const field of STRUCTURED_FILTER_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(params, field.key)) {
      form.presentFilterKeys.push(field.key);
    }
    form.filters[field.key] = parseStructuredFilterValue(field, params[field.key]);
  }

  const knownKeys = new Set(["sort_by", "sort_type", "source", "limit", ...STRUCTURED_FILTER_FIELDS.map((field) => field.key)]);

  for (const [key, rawValue] of Object.entries(params)) {
    if (!knownKeys.has(key)) {
      form.extras[key] = rawValue;
    }
  }

  return form;
}

function updateStructuredRecipeForm(
  index: number,
  setParamTexts: React.Dispatch<React.SetStateAction<Record<number, string>>>,
  patch: Partial<StructuredRecipeForm>,
) {
  setParamTexts((current) => {
    const nextForm = { ...parseStructuredRecipeForm(current[index] ?? "{}"), ...patch };
    return {
      ...current,
      [index]: JSON.stringify(serializeStructuredRecipeForm(nextForm), null, 2),
    };
  });
}

function updateStructuredRecipeFilter(
  index: number,
  setParamTexts: React.Dispatch<React.SetStateAction<Record<number, string>>>,
  fieldKey: string,
  value: string,
) {
  setParamTexts((current) => {
    const nextForm = parseStructuredRecipeForm(current[index] ?? "{}");
    if (!nextForm.presentFilterKeys.includes(fieldKey)) {
      nextForm.presentFilterKeys = [...nextForm.presentFilterKeys, fieldKey];
    }
    nextForm.filters = {
      ...nextForm.filters,
      [fieldKey]: value,
    };
    return {
      ...current,
      [index]: JSON.stringify(serializeStructuredRecipeForm(nextForm), null, 2),
    };
  });
}

function addStructuredRecipeFilter(
  index: number,
  setParamTexts: React.Dispatch<React.SetStateAction<Record<number, string>>>,
  fieldKey: string,
) {
  setParamTexts((current) => {
    const nextForm = parseStructuredRecipeForm(current[index] ?? "{}");
    if (!nextForm.presentFilterKeys.includes(fieldKey)) {
      nextForm.presentFilterKeys = [...nextForm.presentFilterKeys, fieldKey];
    }
    return {
      ...current,
      [index]: JSON.stringify(serializeStructuredRecipeForm(nextForm), null, 2),
    };
  });
}

function removeStructuredRecipeFilter(
  index: number,
  setParamTexts: React.Dispatch<React.SetStateAction<Record<number, string>>>,
  fieldKey: string,
) {
  setParamTexts((current) => {
    const nextForm = parseStructuredRecipeForm(current[index] ?? "{}");
    nextForm.presentFilterKeys = nextForm.presentFilterKeys.filter((key) => key !== fieldKey);
    const nextFilters = { ...nextForm.filters };
    delete nextFilters[fieldKey];
    nextForm.filters = nextFilters;
    return {
      ...current,
      [index]: JSON.stringify(serializeStructuredRecipeForm(nextForm), null, 2),
    };
  });
}

function serializeStructuredRecipeForm(form: StructuredRecipeForm): Record<string, string | number | boolean | null> {
  const next: Record<string, string | number | boolean | null> = {
    ...form.extras,
    sort_by: form.sort_by || "last_trade_unix_time",
    sort_type: form.sort_type || "desc",
  };

  setOptionalString(next, "source", form.source);
  setOptionalNumber(next, "limit", form.limit);
  for (const fieldKey of form.presentFilterKeys) {
    const field = STRUCTURED_FILTER_FIELD_MAP[fieldKey];
    if (!field) {
      continue;
    }
    applyStructuredFilterValue(next, field, form.filters[field.key] ?? "");
  }

  return Object.fromEntries(
    Object.entries(next).filter(([, value]) => value !== undefined && value !== ""),
  );
}

function setOptionalNumber(target: Record<string, string | number | boolean | null>, key: string, value: string) {
  if (value.trim().length === 0) {
    delete target[key];
    return;
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    target[key] = numeric;
  }
}

function setOptionalString(target: Record<string, string | number | boolean | null>, key: string, value: string) {
  if (value.trim().length === 0) {
    delete target[key];
    return;
  }
  target[key] = value.trim();
}

function setOptionalRelative(target: Record<string, string | number | boolean | null>, key: string, value: string, allowNow = false) {
  if (value.trim().length === 0) {
    delete target[key];
    return;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    delete target[key];
    return;
  }
  const rounded = Math.round(numeric);
  target[key] = allowNow && rounded === 0 ? "now" : `now-${rounded * 60}`;
}

function parseRelativeMinutes(value: string | number | boolean | null | undefined): string {
  if (value === "now") {
    return "0";
  }
  if (typeof value === "string") {
    const match = /^now-(\d+)$/.exec(value.trim());
    if (match) {
      return String(Math.round(Number(match[1]) / 60));
    }
  }
  return "";
}

function toEditableString(value: string | number | boolean | null | undefined): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "string") {
    return value;
  }
  return "";
}

function getRecipeFilterSummary(value: string): string {
  const form = parseStructuredRecipeForm(value);
  const activeCount = countStructuredProviderFilters(form);
  const sortLabel = SORT_OPTIONS.find((option) => option.value === form.sort_by)?.label ?? "Sort";
  return `${sortLabel} · ${activeCount} filters`;
}

function formatSuggestedValue(value: number, unit: string) {
  if (unit === "USD") {
    return value >= 1000 ? `$${Math.round(value / 1000)}k` : `$${value}`;
  }
  if (unit === "%") {
    return `${value}%`;
  }
  if (unit === "ratio") {
    return value.toFixed(2).replace(/\.?0+$/, "");
  }
  if (unit === "min") {
    return value === 0 ? "Now" : `${value}m`;
  }
  return String(value);
}

function buildIntervalFilterFields(
  prefix: "volume",
  group: string,
  unit: string,
  intervals: Array<[string, number[]]>,
): StructuredFilterField[] {
  return intervals.map(([interval, suggestions]) => ({
    key: `min_${prefix}_${interval}_usd`,
    label: `Min ${prefix} ${interval.toUpperCase()}`,
    description: `Require at least this much ${prefix} over ${interval}.`,
    group,
    kind: "number",
    unit,
    step: 100,
    suggestions,
  }));
}

function buildIntervalChangeFilterFields(
  prefix: "volume" | "price",
  group: string,
  intervals: Array<[string, number[]]>,
): StructuredFilterField[] {
  return intervals.map(([interval, suggestions]) => ({
    key: `min_${prefix}_change_${interval}_percent`,
    label: `Min ${prefix} change ${interval.toUpperCase()}`,
    description: `Require at least this much ${prefix} change over ${interval}.`,
    group,
    kind: "number",
    unit: "%",
    step: 0.5,
    suggestions,
  }));
}

function buildIntervalTradeFilterFields(intervals: Array<[string, number[]]>): StructuredFilterField[] {
  return intervals.map(([interval, suggestions]) => ({
    key: `min_trade_${interval}_count`,
    label: `Min trades ${interval.toUpperCase()}`,
    description: `Require at least this many trades over ${interval}.`,
    group: "Trades",
    kind: "number",
    unit: "trades",
    step: 1,
    suggestions,
  }));
}

function parseStructuredFilterValue(field: StructuredFilterField, value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (field.kind === "relative_minutes") {
    return parseRelativeMinutes(value);
  }
  if (field.kind === "boolean") {
    return typeof value === "boolean" ? String(value) : "";
  }
  if (field.kind === "text") {
    return typeof value === "string" ? value : "";
  }
  return toEditableString(value);
}

function applyStructuredFilterValue(
  target: Record<string, string | number | boolean | null>,
  field: StructuredFilterField,
  value: string,
) {
  const normalized = value.trim();
  if (normalized.length === 0) {
    target[field.key] = null;
    return;
  }

  if (field.kind === "relative_minutes") {
    setOptionalRelative(target, field.key, normalized, field.allowNow);
    return;
  }

  if (field.kind === "boolean") {
    if (normalized === "true" || normalized === "false") {
      target[field.key] = normalized === "true";
      return;
    }
    target[field.key] = null;
    return;
  }

  if (field.kind === "text") {
    setOptionalString(target, field.key, normalized);
    return;
  }

  setOptionalNumber(target, field.key, normalized);
}

function countStructuredProviderFilters(form: StructuredRecipeForm): number {
  return Object.entries(serializeStructuredRecipeForm(form))
    .filter(([key, value]) => PROVIDER_FILTER_KEYS.has(key) && value !== null && value !== "")
    .length;
}

function humanizeLabel(value: string) {
  return value
    .replace(/_dot_/g, ".")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function normalizeOptionalNumber(value: number | undefined, min: number, max: number): number | undefined {
  if (!Number.isFinite(value ?? NaN)) {
    return undefined;
  }
  return clamp(Number(value), min, max);
}

function sanitizeLiveStrategy(input: LiveStrategySettings): LiveStrategySettings {
  const exits = input.exitOverrides;
  let tp1SellFraction = normalizeOptionalNumber(exits.tp1SellFraction, 0.1, 0.9);
  let tp2SellFraction = normalizeOptionalNumber(exits.tp2SellFraction, 0.05, 0.6);

  if (tp1SellFraction !== undefined && tp2SellFraction !== undefined && tp1SellFraction + tp2SellFraction > 1) {
    const scale = 1 / (tp1SellFraction + tp2SellFraction);
    tp1SellFraction = tp1SellFraction * scale;
    tp2SellFraction = tp2SellFraction * scale;
  }

  const tp1Multiplier = normalizeOptionalNumber(exits.tp1Multiplier, 1.05, 2.2);
  let tp2Multiplier = normalizeOptionalNumber(exits.tp2Multiplier, 1.2, 3.5);
  if (tp1Multiplier !== undefined && tp2Multiplier !== undefined && tp2Multiplier <= tp1Multiplier) {
    tp2Multiplier = clamp(tp1Multiplier + 0.05, 1.2, 3.5);
  }

  const timeStopMinutes = normalizeOptionalNumber(exits.timeStopMinutes, 1, 30);
  let timeLimitMinutes = normalizeOptionalNumber(exits.timeLimitMinutes, 2, 60);
  if (timeStopMinutes !== undefined && timeLimitMinutes !== undefined && timeLimitMinutes < timeStopMinutes) {
    timeLimitMinutes = timeStopMinutes;
  }

  return {
    ...input,
    capitalModifierPercent: clamp(Math.round(input.capitalModifierPercent), 40, 180),
    exitOverrides: {
      ...exits,
      stopLossPercent: normalizeOptionalNumber(exits.stopLossPercent, 4, 35),
      tp1Multiplier,
      tp2Multiplier,
      tp1SellFraction,
      tp2SellFraction,
      postTp1RetracePercent: normalizeOptionalNumber(exits.postTp1RetracePercent, 3, 25),
      trailingStopPercent: normalizeOptionalNumber(exits.trailingStopPercent, 4, 30),
      timeStopMinutes,
      timeStopMinReturnPercent: normalizeOptionalNumber(exits.timeStopMinReturnPercent, 0, 25),
      timeLimitMinutes,
    },
  };
}

function derivePackNameFromDraft(
  draft: DiscoveryLabPackDraft,
  paramTexts: Record<number, string>,
  parsedRecipes?: DiscoveryLabRecipe[],
): string {
  const recipes = parsedRecipes ?? buildNormalizedRecipes(draft.recipes, paramTexts);
  const profile = (draft.defaultProfile ?? "high-value").toUpperCase();
  const modeTag = summarizeRecipeModes(recipes);
  const sourceTag = summarizeSources(draft.defaultSources ?? ["pump_dot_fun"]);
  const thresholds = draft.thresholdOverrides ?? {};
  const chips: string[] = [];

  if (typeof thresholds.minLiquidityUsd === "number") {
    chips.push(`L${formatCompactThreshold(thresholds.minLiquidityUsd)}`);
  }
  if (typeof thresholds.minVolume5mUsd === "number") {
    chips.push(`V5${formatCompactThreshold(thresholds.minVolume5mUsd)}`);
  }
  if (typeof thresholds.maxMarketCapUsd === "number") {
    chips.push(`MC${formatCompactThreshold(thresholds.maxMarketCapUsd)}`);
  }
  if (typeof thresholds.minBuySellRatio === "number") {
    chips.push(`R${formatCompactNumber(thresholds.minBuySellRatio)}`);
  }
  if (typeof thresholds.minUniqueBuyers5m === "number") {
    chips.push(`UB${Math.round(thresholds.minUniqueBuyers5m)}`);
  }

  const providerFilters = recipes.reduce((total, recipe) => total + countRecipeProviderFilters(recipe.params), 0);
  if (providerFilters > 0) {
    chips.push(`F${providerFilters}`);
  }

  const suffix = chips.length > 0 ? ` ${chips.join(" ")}` : "";
  return `${modeTag} ${profile} ${sourceTag}${suffix}`.trim().slice(0, 96);
}

function buildNormalizedRecipes(recipes: DiscoveryLabRecipe[], paramTexts: Record<number, string>): DiscoveryLabRecipe[] {
  return ensureUniqueRecipeNames(
    recipes.map((recipe, index) => normalizeRecipeDraft(recipe, paramTexts[index] ?? "{}", index)),
  );
}

function materializeRecipes(recipes: DiscoveryLabRecipe[], paramTexts: Record<number, string>): DiscoveryLabRecipe[] {
  return ensureUniqueRecipeNames(
    recipes.map((recipe, index) => materializeRecipeDraft(recipe, paramTexts[index] ?? "{}", index)),
  );
}

function normalizeRecipeDraft(recipe: DiscoveryLabRecipe, paramText: string, index: number): DiscoveryLabRecipe {
  const params = safeParseParams(paramText);
  const mode = deriveRecipeModeFromParams(params, recipe.mode);
  return {
    ...recipe,
    name: deriveRecipeName({ index, mode, params }),
    mode,
    description: recipe.description?.trim(),
    params,
  };
}

function materializeRecipeDraft(recipe: DiscoveryLabRecipe, paramText: string, index: number): DiscoveryLabRecipe {
  const params = cleanRecipeParams(parseRecipeParams(paramText));
  const mode = deriveRecipeModeFromParams(params, recipe.mode);
  return {
    ...recipe,
    name: deriveRecipeName({ index, mode, params }),
    mode,
    description: recipe.description?.trim(),
    params,
  };
}

function ensureUniqueRecipeNames(recipes: DiscoveryLabRecipe[]): DiscoveryLabRecipe[] {
  const seen = new Map<string, number>();
  return recipes.map((recipe) => {
    const baseName = recipe.name.trim() || "Strategy";
    const nextCount = (seen.get(baseName) ?? 0) + 1;
    seen.set(baseName, nextCount);
    return nextCount === 1
      ? { ...recipe, name: baseName }
      : { ...recipe, name: `${baseName} #${nextCount}`.slice(0, 96) };
  });
}

function safeParseParams(value: string | undefined): DiscoveryLabRecipe["params"] {
  if (!value || value.trim().length === 0) {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as DiscoveryLabRecipe["params"];
  } catch {
    return {};
  }
}

function deriveRecipeModeFromParams(
  params: DiscoveryLabRecipe["params"],
  fallback: DiscoveryLabRecipe["mode"] = "graduated",
): DiscoveryLabRecipe["mode"] {
  if (params.graduated === true || params.min_graduated_time !== undefined || params.max_graduated_time !== undefined) {
    return "graduated";
  }
  if (params.graduated === false || params.min_progress_percent !== undefined || params.max_progress_percent !== undefined) {
    return "pregrad";
  }
  if (params.sort_by === "graduated_time") {
    return "graduated";
  }
  if (params.sort_by === "progress_percent") {
    return "pregrad";
  }
  return fallback;
}

function deriveRecipeName(input: {
  index: number;
  mode: DiscoveryLabRecipe["mode"];
  params: DiscoveryLabRecipe["params"];
}): string {
  const sortLabel = SORT_OPTIONS.find((option) => option.value === input.params.sort_by)?.label ?? "Last trade";
  const sourceTag = typeof input.params.source === "string" && input.params.source.trim().length > 0
    ? humanizeLabel(input.params.source)
    : "Pack sources";
  const signalLabels = STRUCTURED_FILTER_FIELDS
    .filter((field) => PROVIDER_FILTER_KEYS.has(field.key) && input.params[field.key] !== undefined && input.params[field.key] !== null && input.params[field.key] !== "")
    .map((field) => field.label)
    .filter((label) => label !== "Graduated only")
    .slice(0, 2);
  const parts = [
    formatRecipeModeLabel(input.mode),
    sortLabel,
    sourceTag,
    ...signalLabels,
  ];
  return parts.join(" · ").slice(0, 96) || `Strategy ${input.index + 1}`;
}

function formatRecipeModeLabel(mode: DiscoveryLabRecipe["mode"]): string {
  return mode === "pregrad" ? "Pre-grad" : "Post-grad";
}

function summarizeRecipeModes(recipes: DiscoveryLabRecipe[]): string {
  const modes = new Set(recipes.map((recipe) => recipe.mode));
  if (modes.size === 0) {
    return "PACK";
  }
  if (modes.size > 1) {
    return "MIX";
  }
  return modes.has("pregrad") ? "PRE" : "GRAD";
}

function summarizeSources(sources: string[]): string {
  const normalized = sources
    .map((source) => source.replace(/_dot_/g, ".").replace(/_/g, ""))
    .slice(0, 2);
  return normalized.length > 0 ? normalized.join("+") : "pump";
}

function formatCompactThreshold(value: number): string {
  if (value >= 1_000_000) {
    return `${formatCompactNumber(value / 1_000_000)}M`;
  }
  if (value >= 1_000) {
    return `${formatCompactNumber(value / 1_000)}K`;
  }
  return `${Math.round(value)}`;
}

function formatCompactNumber(value: number): string {
  if (value >= 100) {
    return `${Math.round(value)}`;
  }
  if (value >= 10) {
    return value.toFixed(1).replace(/\.0$/, "");
  }
  return value.toFixed(2).replace(/\.?0+$/, "");
}

function countRecipeProviderFilters(params: DiscoveryLabRecipe["params"]): number {
  return Object.entries(params)
    .filter(([key]) => key.startsWith("min_") || key.startsWith("max_") || key === "source" || key === "creator" || key === "platform_id")
    .filter(([, value]) => value !== null && value !== "" && value !== undefined)
    .length;
}

function summarizeDominantMode(recipes: DiscoveryLabRecipe[]): DiscoveryLabRecipe["mode"] {
  const counts = recipes.reduce<Record<DiscoveryLabRecipe["mode"], number>>((acc, recipe) => {
    acc[recipe.mode] += 1;
    return acc;
  }, { graduated: 0, pregrad: 0 });
  return counts.pregrad > counts.graduated ? "pregrad" : "graduated";
}

function deriveStrategyFocusAreas(recipes: DiscoveryLabRecipe[]): StrategyFocusArea[] {
  const areas = new Set<StrategyFocusArea>();
  for (const recipe of recipes) {
    for (const key of Object.keys(recipe.params)) {
      if (key.includes("graduated") || key.includes("progress") || key.includes("creation") || key.includes("last_trade")) {
        areas.add("timing");
      }
      if (key.includes("liquidity") || key.includes("market_cap") || key.includes("fdv")) {
        areas.add("liquidity");
      }
      if (key.includes("volume") || key.includes("trade")) {
        areas.add("flow");
      }
      if (key.includes("holder") || key.includes("unique") || key.includes("buy_sell")) {
        areas.add("participation");
      }
      if (key.includes("price_change")) {
        areas.add("momentum");
      }
      if (key.includes("top10") || key.includes("single_holder")) {
        areas.add("concentration");
      }
    }
  }
  return Array.from(areas);
}

function deriveRelevantThresholdFields(
  focusAreas: StrategyFocusArea[],
  overrides?: DiscoveryLabThresholdOverrides,
): Array<{ key: keyof DiscoveryLabThresholdOverrides; label: string }> {
  const keys = new Set<keyof DiscoveryLabThresholdOverrides>(["minLiquidityUsd", "maxMarketCapUsd"]);

  for (const area of focusAreas) {
    if (area === "flow" || area === "momentum") {
      keys.add("minVolume5mUsd");
      keys.add("maxNegativePriceChange5mPercent");
    }
    if (area === "participation") {
      keys.add("minHolders");
      keys.add("minUniqueBuyers5m");
      keys.add("minBuySellRatio");
    }
    if (area === "concentration") {
      keys.add("maxTop10HolderPercent");
      keys.add("maxSingleHolderPercent");
    }
  }

  if (overrides) {
    for (const field of THRESHOLD_FIELDS) {
      if (overrides[field.key] !== undefined) {
        keys.add(field.key);
      }
    }
  }

  return THRESHOLD_FIELDS.filter((field) => keys.has(field.key));
}

function humanizeFocusArea(area: StrategyFocusArea): string {
  switch (area) {
    case "timing":
      return "Timing";
    case "liquidity":
      return "Liquidity";
    case "flow":
      return "Flow";
    case "participation":
      return "Participation";
    case "momentum":
      return "Momentum";
    case "concentration":
      return "Concentration";
    default:
      return area;
  }
}

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
  const optimizationSuggestions = parseOptimizationSuggestions(
    root.optimizationSuggestions,
    suggestion?.optimizationSuggestions,
    marketRegime?.optimizationSuggestions,
    data?.optimizationSuggestions,
  );
  return {
    label: firstString(contexts, ["regime", "marketRegime", "label", "name"]) ?? "Suggested regime",
    summary: firstString(contexts, ["summary", "description", "rationale", "notes", "reason"]),
    observedAt: firstString(contexts, ["observedAt", "asOf", "timestamp", "generatedAt", "updatedAt"]),
    suggestedThresholdOverrides: thresholdOverrides,
    fetchDiagnostics: parseFetchDiagnostics(
      root.fetchDiagnostics,
      suggestion?.fetchDiagnostics,
      marketRegime?.fetchDiagnostics,
      data?.fetchDiagnostics,
    ),
    optimizationSuggestions,
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

function parseFetchDiagnostics(...values: unknown[]): MarketRegimeSuggestion["fetchDiagnostics"] {
  for (const value of values) {
    const source = asRecord(value);
    if (!source) {
      continue;
    }
    return {
      queryCount: asFiniteNumber(source.queryCount) ?? 0,
      returnedCount: asFiniteNumber(source.returnedCount) ?? 0,
      selectedCount: asFiniteNumber(source.selectedCount) ?? 0,
      goodCount: asFiniteNumber(source.goodCount) ?? 0,
      rejectCount: asFiniteNumber(source.rejectCount) ?? 0,
      selectionRatePercent: asFiniteNumber(source.selectionRatePercent),
      passRatePercent: asFiniteNumber(source.passRatePercent),
      winnerHitRatePercent: asFiniteNumber(source.winnerHitRatePercent),
      strongestQueries: asArray(source.strongestQueries)
        .map(asRecord)
        .filter((row): row is Record<string, unknown> => Boolean(row))
        .map((row) => ({
          key: asString(row.key) ?? "",
          source: asString(row.source) ?? "unknown",
          recipeName: asString(row.recipeName) ?? "unknown",
          returnedCount: asFiniteNumber(row.returnedCount) ?? 0,
          goodCount: asFiniteNumber(row.goodCount) ?? 0,
          rejectCount: asFiniteNumber(row.rejectCount) ?? 0,
          winnerHitRatePercent: asFiniteNumber(row.winnerHitRatePercent),
        })),
    };
  }
  return null;
}

function parseOptimizationSuggestions(...values: unknown[]): MarketRegimeSuggestion["optimizationSuggestions"] {
  for (const value of values) {
    const suggestions = asArray(value)
      .map(asRecord)
      .filter((row): row is Record<string, unknown> => Boolean(row))
      .map((row, index) => {
        const thresholdOverrides = firstThresholdOverrides(
          row.thresholdOverrides,
          row.suggestedThresholdOverrides,
          row.overrides,
        );
        if (!thresholdOverrides) {
          return null;
        }
        const objective = asString(row.objective);
        const normalizedObjective: "expand" | "balance" | "tighten" = objective === "expand" || objective === "tighten"
          ? objective
          : "balance";
        return {
          id: asString(row.id) ?? `${asString(row.label) ?? "suggestion"}-${index}`,
          label: asString(row.label) ?? "Suggested filters",
          objective: normalizedObjective,
          summary: asString(row.summary) ?? "Suggested threshold posture from the current run.",
          thresholdOverrides,
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));
    if (suggestions.length > 0) {
      return suggestions;
    }
  }
  return [];
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function formatLivePresetLabel(
  value: "FIRST_MINUTE_POSTGRAD_CONTINUATION" | "LATE_CURVE_MIGRATION_SNIPE" | null,
): string {
  if (value === "LATE_CURVE_MIGRATION_SNIPE") {
    return "Late-Curve Migration Snipe";
  }
  if (value === "FIRST_MINUTE_POSTGRAD_CONTINUATION") {
    return "First-Minute Post-Grad Continuation";
  }
  return "Derived from winners";
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
      name: "",
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
    thesis: pack.thesis,
    targetPnlBand: pack.targetPnlBand,
    defaultSources: pack.defaultSources,
    defaultProfile: pack.defaultProfile,
    thresholdOverrides: pack.thresholdOverrides,
    recipes: pack.recipes,
  };
}

function createBlankRecipe(_index: number): DiscoveryLabRecipe {
  return {
    name: "",
    mode: "graduated",
    description: "",
    params: {
      graduated: true,
      sort_by: "last_trade_unix_time",
      sort_type: "desc",
      limit: 100,
    },
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

function cleanRecipeParams(params: Record<string, string | number | boolean | null>) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== null && value !== "" && value !== undefined),
  ) as Record<string, string | number | boolean | null>;
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

function formatDiscoveryWriteError(issue: unknown, action: string) {
  const fallback = `Failed to ${action}.`;
  const message = issue instanceof Error ? issue.message.trim() : "";
  return message.length > 0 ? message : fallback;
}

function safeFormatTimestamp(value: string | null, hasHydrated: boolean): string {
  return hasHydrated ? formatTimestamp(value) : "Syncing...";
}
