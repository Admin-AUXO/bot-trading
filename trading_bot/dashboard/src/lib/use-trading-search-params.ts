import type { CandidateBucket, PositionBookPayload } from "@/lib/types";

/**
 * Shared URL state utilities for the trading desk.
 * Replaces duplicated firstParam and build*Href logic across pages.
 */

export type PositionSort = "priority" | "opened" | "pnl" | "latency";
export type CandidateSort = "recent" | "entry" | "liquidity" | "volume" | "buySell";

export interface TradingSearchParams {
  bucket: CandidateBucket;
  sort: string;
  book: "open" | "closed";
  psort: string;
  pq: string;
}

export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Parse raw Next.js searchParams into a structured TradingSearchParams object.
 */
export function parseTradingSearchParams(raw: Record<string, string | string[] | undefined>): TradingSearchParams {
  const bucket = (firstParam(raw.bucket) ?? "ready") as CandidateBucket;
  const sort = firstParam(raw.sort) ?? "recent";
  const book = (firstParam(raw.book) === "closed" ? "closed" : "open") as "open" | "closed";
  const psort = firstParam(raw.psort) ?? (book === "open" ? "priority" : "opened");
  const pq = firstParam(raw.pq) ?? "";
  return { bucket, sort, book, psort, pq };
}

/**
 * Build the href for the positions detail page from filter state.
 * Matches the signature used by positions-grid.tsx.
 */
export function buildPositionDetailHref(
  id: string,
  book: PositionBookPayload["book"],
  sort: PositionSort,
  query: string,
) {
  const params = new URLSearchParams({ book, sort, focus: id });
  if (query.trim()) {
    params.set("q", query.trim());
  }
  return `/positions/${id}?${params.toString()}`;
}

/**
 * Build the href for the candidates detail page from filter state.
 * Matches the signature used by candidates-grid.tsx.
 */
export function buildCandidateDetailHref(
  id: string,
  bucket: CandidateBucket,
  sort: CandidateSort,
  query: string,
) {
  const params = new URLSearchParams({ bucket, sort, focus: id });
  if (query.trim()) {
    params.set("q", query.trim());
  }
  return `/candidates/${id}?${params.toString()}`;
}

/**
 * Build the back-href from a position detail page to the trading desk.
 */
export function buildPositionBackHref(opts: {
  book?: string;
  sort?: string;
  focus?: string;
  q?: string;
}) {
  const params = new URLSearchParams();
  params.set("bucket", "ready");
  params.set("sort", "recent");
  if (opts.book) params.set("book", opts.book);
  if (opts.sort) params.set("psort", opts.sort);
  if (opts.q && opts.q.trim().length > 0) params.set("pq", opts.q.trim());
  const query = params.toString();
  const hash = opts.focus ? `#position-${opts.focus}` : "";
  return `/operational-desk/trading${query ? `?${query}` : ""}${hash}`;
}

/**
 * Build the back-href from a candidate detail page to the trading desk.
 */
export function buildCandidateBackHref(opts: {
  bucket?: CandidateBucket;
  sort?: string;
  focus?: string;
  q?: string;
}) {
  const params = new URLSearchParams();
  if (opts.bucket) params.set("bucket", opts.bucket);
  if (opts.sort) params.set("sort", opts.sort);
  params.set("book", "open");
  params.set("psort", "priority");
  if (opts.q && opts.q.trim().length > 0) params.set("pq", opts.q.trim());
  const query = params.toString();
  const hash = opts.focus ? `#candidate-${opts.focus}` : "";
  return `/operational-desk/trading${query ? `?${query}` : ""}${hash}`;
}
