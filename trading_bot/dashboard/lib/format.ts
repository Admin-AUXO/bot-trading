const currencyFormatter = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const compactNumberFormatter = new Intl.NumberFormat("en-GB", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const numberFormatter = new Intl.NumberFormat("en-GB", {
  maximumFractionDigits: 2,
});

const integerFormatter = new Intl.NumberFormat("en-GB", {
  maximumFractionDigits: 0,
});

const timestampFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

const currencyFormatterByDigits = new Map<number, Intl.NumberFormat>();

export function formatTimestamp(value: unknown): string {
  if (!value) return "not yet";
  if (!(typeof value === "string" || typeof value === "number" || value instanceof Date)) {
    return "unknown";
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return timestampFormatter.format(date);
}

export function formatRelativeMinutes(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  return `${numberFormatter.format(numeric)} min`;
}

export function formatCurrency(value: unknown, digits = 2): string {
  if (value === null || value === undefined || value === "") return "—";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  let formatter = currencyFormatterByDigits.get(digits);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    currencyFormatterByDigits.set(digits, formatter);
  }
  return formatter.format(numeric);
}

export function formatCompactCurrency(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  const sign = numeric < 0 ? "-" : "";
  return `${sign}$${compactNumberFormatter.format(Math.abs(numeric))}`;
}

export function formatNumber(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  return numberFormatter.format(numeric);
}

export function formatInteger(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  return integerFormatter.format(numeric);
}

export function formatPercent(value: unknown, digits = 1): string {
  if (value === null || value === undefined || value === "") return "—";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  return `${numeric.toFixed(digits)}%`;
}

export function humanizeKey(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function smartFormatValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  const normalizedKey = key.toLowerCase();
  if (normalizedKey.endsWith("_at") || normalizedKey.endsWith("at") || normalizedKey.includes("date")) {
    return formatTimestamp(value);
  }

  if (normalizedKey.includes("price") || normalizedKey.includes("pnl") || normalizedKey.includes("liquidity")
    || normalizedKey.includes("market_cap") || normalizedKey.includes("fdv") || normalizedKey.includes("amount_usd")
    || normalizedKey.includes("size_usd") || normalizedKey.includes("capital_usd") || normalizedKey.includes("cash_usd")) {
    return formatCurrency(value, normalizedKey.includes("price") ? 6 : 2);
  }

  if (normalizedKey.includes("percent") || normalizedKey.endsWith("_pct")) {
    return formatPercent(value);
  }

  if (normalizedKey.includes("count") || normalizedKey.includes("holders") || normalizedKey.includes("calls")
    || normalizedKey.includes("units") || normalizedKey.includes("wallets") || normalizedKey.includes("trades")
    || normalizedKey.includes("buys") || normalizedKey.includes("sells")) {
    return formatInteger(value);
  }

  if (normalizedKey.includes("latency")) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? `${numeric.toFixed(1)} ms` : "—";
  }

  if (normalizedKey.includes("minutes")) {
    return formatRelativeMinutes(value);
  }

  if (typeof value === "number") {
    return numberFormatter.format(value);
  }

  return String(value);
}

export const formatters = {
  currency: currencyFormatter,
  number: numberFormatter,
};
