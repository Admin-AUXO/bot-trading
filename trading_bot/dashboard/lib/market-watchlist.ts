export const MARKET_WATCHLIST_KEY = "market-watchlist";

export function readMarketWatchlist(): Set<string> {
  if (typeof window === "undefined") {
    return new Set();
  }

  try {
    const raw = window.localStorage.getItem(MARKET_WATCHLIST_KEY);
    const parsed = raw ? JSON.parse(raw) as unknown : [];
    if (!Array.isArray(parsed)) {
      return new Set();
    }
    return new Set(parsed.filter((value): value is string => typeof value === "string"));
  } catch {
    return new Set();
  }
}

export function writeMarketWatchlist(values: Iterable<string>): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(MARKET_WATCHLIST_KEY, JSON.stringify([...values]));
}
