type RecipeFieldKind = "number" | "text" | "boolean";

export type RecipeFilterField = {
  key: string;
  label: string;
  kind: RecipeFieldKind;
  group: string;
  unit?: string;
  step?: number;
  suggestions?: number[];
  placeholder?: string;
};

export type RecipeSortOption = {
  value: string;
  label: string;
  group: string;
};

export type StructuredRecipeForm = {
  sort_by: string;
  sort_type: "asc" | "desc";
  source: string;
  limit: string;
  filters: Record<string, string>;
};

const TIME_TEXT_FILTER_KEYS = new Set([
  "min_creation_time",
  "max_creation_time",
  "min_recent_listing_time",
  "max_recent_listing_time",
  "min_last_trade_unix_time",
  "max_last_trade_unix_time",
  "min_graduated_time",
  "max_graduated_time",
]);

const TEXT_FILTER_KEYS = new Set([
  "creator",
  "platform_id",
  ...TIME_TEXT_FILTER_KEYS,
]);

const BOOLEAN_FILTER_KEYS = new Set(["graduated"]);

const BASE_FILTER_FIELDS: RecipeFilterField[] = [
  { key: "graduated", label: "Stage filter", kind: "boolean", group: "Stage" },
  { key: "creator", label: "Creator wallet", kind: "text", group: "Identity", placeholder: "Wallet address" },
  { key: "platform_id", label: "Platform", kind: "text", group: "Identity", placeholder: "pump.fun" },
  { key: "min_progress_percent", label: "Min progress", kind: "number", group: "Stage", unit: "%", step: 1, suggestions: [60, 80, 95] },
  { key: "max_progress_percent", label: "Max progress", kind: "number", group: "Stage", unit: "%", step: 1, suggestions: [85, 95, 99] },
  { key: "min_creation_time", label: "Created after", kind: "text", group: "Timing", placeholder: "now-1800 or unix" },
  { key: "max_creation_time", label: "Created before", kind: "text", group: "Timing", placeholder: "now-300 or unix" },
  { key: "min_recent_listing_time", label: "Listed after", kind: "text", group: "Timing", placeholder: "now-900 or unix" },
  { key: "max_recent_listing_time", label: "Listed before", kind: "text", group: "Timing", placeholder: "now-120 or unix" },
  { key: "min_last_trade_unix_time", label: "Last trade after", kind: "text", group: "Timing", placeholder: "now-180 or unix" },
  { key: "max_last_trade_unix_time", label: "Last trade before", kind: "text", group: "Timing", placeholder: "now-30 or unix" },
  { key: "min_graduated_time", label: "Graduated after", kind: "text", group: "Timing", placeholder: "now-900 or unix" },
  { key: "max_graduated_time", label: "Graduated before", kind: "text", group: "Timing", placeholder: "now-60 or unix" },
  { key: "min_liquidity", label: "Min liquidity", kind: "number", group: "Size", unit: "USD", step: 500, suggestions: [8000, 15000, 25000] },
  { key: "max_liquidity", label: "Max liquidity", kind: "number", group: "Size", unit: "USD", step: 1000, suggestions: [50000, 100000, 250000] },
  { key: "min_market_cap", label: "Min market cap", kind: "number", group: "Size", unit: "USD", step: 10000, suggestions: [100000, 250000, 500000] },
  { key: "max_market_cap", label: "Max market cap", kind: "number", group: "Size", unit: "USD", step: 10000, suggestions: [300000, 750000, 1500000] },
  { key: "min_fdv", label: "Min FDV", kind: "number", group: "Size", unit: "USD", step: 10000, suggestions: [100000, 250000, 500000] },
  { key: "max_fdv", label: "Max FDV", kind: "number", group: "Size", unit: "USD", step: 10000, suggestions: [500000, 1000000, 2000000] },
  { key: "min_holder", label: "Min holders", kind: "number", group: "Participation", unit: "wallets", step: 1, suggestions: [30, 50, 80] },
];

const WINDOW_OPTIONS = [
  ["1m", "1m"],
  ["5m", "5m"],
  ["30m", "30m"],
  ["1h", "1h"],
  ["2h", "2h"],
  ["4h", "4h"],
  ["8h", "8h"],
  ["24h", "24h"],
  ["7d", "7d"],
  ["30d", "30d"],
] as const;

const VOLUME_FIELDS: RecipeFilterField[] = WINDOW_OPTIONS.flatMap(([suffix, label]) => ([
  {
    key: `min_volume_${suffix}_usd`,
    label: `Min volume ${label}`,
    kind: "number",
    group: "Volume",
    unit: "USD",
    step: 250,
    suggestions: [1000, 2500, 5000],
  },
  {
    key: `min_volume_${suffix}_change_percent`,
    label: `Min volume delta ${label}`,
    kind: "number",
    group: "Volume delta",
    unit: "%",
    step: 1,
    suggestions: [10, 25, 50],
  },
]));

const PRICE_FIELDS: RecipeFilterField[] = WINDOW_OPTIONS.map(([suffix, label]) => ({
  key: `min_price_change_${suffix}_percent`,
  label: `Min price delta ${label}`,
  kind: "number",
  group: "Price delta",
  unit: "%",
  step: 1,
  suggestions: [5, 10, 20],
}));

const TRADE_FIELDS: RecipeFilterField[] = WINDOW_OPTIONS.map(([suffix, label]) => ({
  key: `min_trade_${suffix}_count`,
  label: `Min trades ${label}`,
  kind: "number",
  group: "Trades",
  unit: "count",
  step: 1,
  suggestions: [10, 25, 50],
}));

export const FILTER_FIELDS: RecipeFilterField[] = [
  ...BASE_FILTER_FIELDS,
  ...VOLUME_FIELDS,
  ...PRICE_FIELDS,
  ...TRADE_FIELDS,
];

const FILTER_FIELD_MAP = new Map(FILTER_FIELDS.map((field) => [field.key, field]));
const FILTER_KEY_SET = new Set(FILTER_FIELDS.map((field) => field.key));

export const SORT_OPTIONS: RecipeSortOption[] = [
  { value: "last_trade_unix_time", label: "Last trade", group: "Timing" },
  { value: "graduated_time", label: "Graduated time", group: "Timing" },
  { value: "progress_percent", label: "Progress", group: "Timing" },
  { value: "liquidity", label: "Liquidity", group: "Size" },
  { value: "market_cap", label: "Market cap", group: "Size" },
  { value: "fdv", label: "FDV", group: "Size" },
  { value: "holder", label: "Holders", group: "Participation" },
  { value: "volume_1m_usd", label: "Volume 1m", group: "Volume" },
  { value: "volume_5m_usd", label: "Volume 5m", group: "Volume" },
  { value: "volume_30m_usd", label: "Volume 30m", group: "Volume" },
  { value: "volume_1h_usd", label: "Volume 1h", group: "Volume" },
  { value: "volume_24h_usd", label: "Volume 24h", group: "Volume" },
  { value: "volume_1m_change_percent", label: "Volume delta 1m", group: "Volume delta" },
  { value: "volume_5m_change_percent", label: "Volume delta 5m", group: "Volume delta" },
  { value: "volume_30m_change_percent", label: "Volume delta 30m", group: "Volume delta" },
  { value: "volume_1h_change_percent", label: "Volume delta 1h", group: "Volume delta" },
  { value: "volume_24h_change_percent", label: "Volume delta 24h", group: "Volume delta" },
  { value: "price_change_1m_percent", label: "Price delta 1m", group: "Price delta" },
  { value: "price_change_5m_percent", label: "Price delta 5m", group: "Price delta" },
  { value: "price_change_30m_percent", label: "Price delta 30m", group: "Price delta" },
  { value: "price_change_1h_percent", label: "Price delta 1h", group: "Price delta" },
  { value: "price_change_24h_percent", label: "Price delta 24h", group: "Price delta" },
  { value: "trade_1m_count", label: "Trades 1m", group: "Trades" },
  { value: "trade_5m_count", label: "Trades 5m", group: "Trades" },
  { value: "trade_30m_count", label: "Trades 30m", group: "Trades" },
  { value: "trade_1h_count", label: "Trades 1h", group: "Trades" },
  { value: "trade_24h_count", label: "Trades 24h", group: "Trades" },
];

export function parseStructuredRecipeForm(value: string): StructuredRecipeForm {
  const params = safeParseParams(value);
  return {
    sort_by: typeof params.sort_by === "string" ? params.sort_by : "trade_1m_count",
    sort_type: params.sort_type === "asc" ? "asc" : "desc",
    source: typeof params.source === "string" ? params.source : "",
    limit: String(params.limit ?? ""),
    filters: Object.fromEntries(
      Object.entries(params)
        .filter(([key]) => isRecipeFilterKey(key))
        .map(([key, fieldValue]) => [key, String(fieldValue ?? "")]),
    ),
  };
}

export function serializeRecipeForm(form: StructuredRecipeForm): Record<string, string | number | boolean | null> {
  const result: Record<string, string | number | boolean | null> = {
    sort_by: form.sort_by,
    sort_type: form.sort_type,
  };

  if (form.source.trim()) {
    result.source = form.source;
  }

  if (form.limit.trim()) {
    result.limit = Number(form.limit) || 100;
  }

  for (const [key, rawValue] of Object.entries(form.filters)) {
    const value = rawValue.trim();
    if (!value) {
      continue;
    }

    const field = getFilterField(key);
    if (field.kind === "number") {
      result[key] = Number(value) || 0;
      continue;
    }
    if (field.kind === "boolean") {
      result[key] = value === "true";
      continue;
    }
    result[key] = value;
  }

  return result;
}

export function updateParamText(
  paramTexts: Record<number, string>,
  index: number,
  mutator: (form: StructuredRecipeForm) => StructuredRecipeForm,
): Record<number, string> {
  const form = parseStructuredRecipeForm(paramTexts[index] ?? "{}");
  const updated: Record<number, string> = { ...paramTexts };
  updated[index] = JSON.stringify(serializeRecipeForm(mutator(form)), null, 2);
  return updated;
}

export function getFilterField(key: string): RecipeFilterField {
  return FILTER_FIELD_MAP.get(key) ?? inferFilterField(key);
}

export function groupFilterFields(fields: RecipeFilterField[]) {
  return groupBy(fields, (field) => field.group);
}

export function groupSortOptions(options: RecipeSortOption[]) {
  return groupBy(options, (option) => option.group);
}

function inferFilterField(key: string): RecipeFilterField {
  if (BOOLEAN_FILTER_KEYS.has(key)) {
    return {
      key,
      label: "Stage filter",
      kind: "boolean",
      group: "Other",
    };
  }

  if (TEXT_FILTER_KEYS.has(key) || key.endsWith("_time") || key.endsWith("_unix_time") || key.endsWith("_id")) {
    return {
      key,
      label: humanizeRecipeField(key),
      kind: "text",
      group: "Other",
      placeholder: "Value",
    };
  }

  return {
    key,
    label: humanizeRecipeField(key),
    kind: "number",
    group: "Other",
    step: 1,
    suggestions: [],
  };
}

export function safeParseParams(value: string): Record<string, string | number | boolean | null> {
  if (!value.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, string | number | boolean | null>
      : {};
  } catch {
    return {};
  }
}

function isRecipeFilterKey(key: string) {
  return FILTER_KEY_SET.has(key)
    || BOOLEAN_FILTER_KEYS.has(key)
    || TEXT_FILTER_KEYS.has(key)
    || key.startsWith("min_")
    || key.startsWith("max_");
}

function humanizeRecipeField(value: string) {
  return value
    .replace(/^min_/, "Min ")
    .replace(/^max_/, "Max ")
    .replace(/\bfdv\b/gi, "FDV")
    .replace(/\b_id\b/gi, " ID")
    .replace(/_percent/g, " %")
    .replace(/_usd/g, " USD")
    .replace(/_unix_time/g, " time")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function groupBy<T>(items: T[], keySelector: (item: T) => string) {
  const groups = new Map<string, T[]>();

  for (const item of items) {
    const key = keySelector(item);
    const current = groups.get(key);
    if (current) {
      current.push(item);
    } else {
      groups.set(key, [item]);
    }
  }

  return Array.from(groups.entries()).map(([label, values]) => ({ label, values }));
}
