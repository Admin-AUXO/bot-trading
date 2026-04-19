"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import type { ReactNode } from "react";
import { useDeferredValue, useMemo, useState } from "react";
import { Copy, RefreshCw, Search, Ticket, Trophy, Waypoints } from "lucide-react";
import { InlineNotice } from "@/components/dashboard-primitives";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { fetchJson } from "@/lib/api";
import { marketRoutes } from "@/lib/dashboard-routes";
import { formatCompactCurrency, formatInteger } from "@/lib/format";
import { buildWorkbenchRunResultRows, summarizeWorkbenchRunResults, type WorkbenchRunOutcome, type WorkbenchRunResultRow } from "@/lib/workbench-run-results";
import type { DiscoveryLabRunDetail } from "@/lib/types";
import { shortMint } from "@/lib/utils";

type FilterId = "all" | "winner" | "pass" | "rejected";

type TicketFieldErrors = {
  positionSizeUsd?: string;
  stopLossPercent?: string;
  tp1Percent?: string;
  tp2Percent?: string;
  timeLimitMinutes?: string;
};

export function WorkbenchRunResultsTable(props: {
  run: DiscoveryLabRunDetail;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterId>("all");
  const [query, setQuery] = useState("");
  const [ticketMint, setTicketMint] = useState<string | null>(null);
  const [positionSizeUsd, setPositionSizeUsd] = useState("");
  const [stopLossPercent, setStopLossPercent] = useState("");
  const [tp1Percent, setTp1Percent] = useState("");
  const [tp2Percent, setTp2Percent] = useState("");
  const [timeLimitMinutes, setTimeLimitMinutes] = useState("");
  const [isSubmittingTicket, setIsSubmittingTicket] = useState(false);
  const [ticketMessage, setTicketMessage] = useState<{
    kind: "success" | "error";
    text: string;
    positionId?: string;
  } | null>(null);
  const [ticketFieldErrors, setTicketFieldErrors] = useState<TicketFieldErrors>({});
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const rows = useMemo(() => buildWorkbenchRunResultRows(props.run), [props.run]);
  const summary = useMemo(() => summarizeWorkbenchRunResults(rows), [rows]);
  const selectedTicketRow = useMemo(
    () => rows.find((row) => row.mint === ticketMint) ?? null,
    [rows, ticketMint],
  );

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (filter === "winner" && row.outcome !== "WINNER") return false;
      if (filter === "pass" && row.outcome !== "PASS") return false;
      if (filter === "rejected" && row.outcome !== "REJECTED") return false;
      if (!deferredQuery) return true;

      const haystack = [
        row.symbol,
        row.mint,
        row.recipeName,
        row.source,
        row.grade,
        row.primaryReason,
        row.rejectReason,
        row.notes,
      ].join(" ").toLowerCase();

      return haystack.includes(deferredQuery);
    });
  }, [deferredQuery, filter, rows]);

  if (!props.run.report) {
    return (
      <div className="rounded-[14px] border border-bg-border bg-bg-hover/20 px-4 py-4 text-sm text-text-secondary">
        No persisted report yet. This run has summary metadata, but no token board to review.
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-[14px] border border-bg-border bg-bg-hover/20 px-4 py-4 text-sm text-text-secondary">
        This run completed without any reviewable token rows. Open a newer run or start a fresh one.
      </div>
    );
  }

  const openTradeTicket = (row: WorkbenchRunResultRow) => {
    setTicketMint(row.mint);
    setPositionSizeUsd(row.suggestedCapitalUsd != null ? String(row.suggestedCapitalUsd) : "");
    setStopLossPercent("");
    setTp1Percent("");
    setTp2Percent("");
    setTimeLimitMinutes("");
    setTicketMessage(null);
    setTicketFieldErrors({});
  };

  function validateTicketField(field: keyof TicketFieldErrors, value: string): string | null {
    if (field === "positionSizeUsd") {
      if (value && toPositiveNumber(value) === null) {
        return "Must be a positive number";
      }
    }
    if (field === "stopLossPercent" || field === "tp1Percent" || field === "tp2Percent") {
      if (value && toPositiveNumber(value) === null) {
        return "Must be a positive number";
      }
      if (value) {
        const num = toPositiveNumber(value);
        if (num !== null && num > 100) {
          return "Must be 100 or less";
        }
      }
    }
    if (field === "timeLimitMinutes") {
      if (value && toPositiveNumber(value) === null) {
        return "Must be a positive number";
      }
    }
    return null;
  }

  function handleTicketFieldBlur(field: keyof TicketFieldErrors, value: string) {
    const error = validateTicketField(field, value);
    setTicketFieldErrors((prev) => ({ ...prev, [field]: error ?? "" }));
  }

  async function submitTradeTicket() {
    if (!selectedTicketRow) {
      return;
    }

    const errors: TicketFieldErrors = {};
    (["positionSizeUsd", "stopLossPercent", "tp1Percent", "tp2Percent", "timeLimitMinutes"] as const).forEach((field) => {
      const value = field === "positionSizeUsd" ? positionSizeUsd
        : field === "stopLossPercent" ? stopLossPercent
        : field === "tp1Percent" ? tp1Percent
        : field === "tp2Percent" ? tp2Percent
        : timeLimitMinutes;
      const error = validateTicketField(field, value);
      if (error) errors[field] = error;
    });

    if (Object.keys(errors).length > 0) {
      setTicketFieldErrors(errors);
      return;
    }

    setIsSubmittingTicket(true);
    setTicketMessage(null);
    try {
      const exitOverrides = compactObject({
        stopLossPercent: toPositiveNumber(stopLossPercent),
        tp1Percent: toPositiveNumber(tp1Percent),
        tp2Percent: toPositiveNumber(tp2Percent),
        timeLimitMinutes: toPositiveNumber(timeLimitMinutes),
      });
      const response = await fetchJson<{ candidateId: string; positionId: string }>(
        `/operator/runs/${encodeURIComponent(props.run.id)}/manual-entry`,
        {
          method: "POST",
          body: JSON.stringify({
            mint: selectedTicketRow.mint,
            positionSizeUsd: toPositiveNumber(positionSizeUsd),
            exitOverrides: Object.keys(exitOverrides).length > 0 ? exitOverrides : undefined,
          }),
        },
      );
      setTicketMessage({
        kind: "success",
        text: `Manual trade opened position ${response.positionId}.`,
        positionId: response.positionId,
      });
      router.refresh();
    } catch (error) {
      setTicketMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "manual trade failed",
      });
    } finally {
      setIsSubmittingTicket(false);
    }
  }

  return (
    <div className="space-y-3">
      {selectedTicketRow ? (
        <div className="rounded-[14px] border border-[rgba(163,230,53,0.18)] bg-[#10140f] p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.14em] text-text-muted">Manual trade ticket</div>
              <div className="mt-1 text-sm font-medium text-text-primary">
                {selectedTicketRow.symbol || shortMint(selectedTicketRow.mint, 4)} · {selectedTicketRow.outcome.toLowerCase()}
              </div>
              <div className="mt-1 text-xs text-text-secondary">{selectedTicketRow.primaryReason}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`${marketRoutes.tokenByMintPrefix}/${encodeURIComponent(selectedTicketRow.mint)}` as Route}
                prefetch={false}
                className="rounded border border-bg-border px-2 py-1 text-[11px] font-medium text-text-secondary hover:text-text-primary"
              >
                Token detail
              </Link>
              <Button type="button" variant="ghost" size="sm" onClick={() => void router.refresh()}>
                <RefreshCw className="h-3 w-3" />
                Refresh
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setTicketMint(null)}>
                Close ticket
              </Button>
            </div>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <TicketField
              label="Size USD"
              value={positionSizeUsd}
              onChange={setPositionSizeUsd}
              error={ticketFieldErrors.positionSizeUsd}
              onBlur={(v) => handleTicketFieldBlur("positionSizeUsd", v)}
              placeholder={selectedTicketRow.suggestedCapitalUsd != null ? String(selectedTicketRow.suggestedCapitalUsd) : "Optional"}
            />
            <TicketField
              label="Stop loss %"
              value={stopLossPercent}
              onChange={setStopLossPercent}
              error={ticketFieldErrors.stopLossPercent}
              onBlur={(v) => handleTicketFieldBlur("stopLossPercent", v)}
              placeholder="Optional"
            />
            <TicketField
              label="TP1 %"
              value={tp1Percent}
              onChange={setTp1Percent}
              error={ticketFieldErrors.tp1Percent}
              onBlur={(v) => handleTicketFieldBlur("tp1Percent", v)}
              placeholder="Optional"
            />
            <TicketField
              label="TP2 %"
              value={tp2Percent}
              onChange={setTp2Percent}
              error={ticketFieldErrors.tp2Percent}
              onBlur={(v) => handleTicketFieldBlur("tp2Percent", v)}
              placeholder="Optional"
            />
            <TicketField
              label="Time limit min"
              value={timeLimitMinutes}
              onChange={setTimeLimitMinutes}
              error={ticketFieldErrors.timeLimitMinutes}
              onBlur={(v) => handleTicketFieldBlur("timeLimitMinutes", v)}
              placeholder="Optional"
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="meta-chip">Capital {formatCompactCurrency(selectedTicketRow.suggestedCapitalUsd)}</span>
            <span className="meta-chip">Liquidity {formatCompactCurrency(selectedTicketRow.liquidityUsd)}</span>
            <span className="meta-chip">Profile {selectedTicketRow.profile ?? "n/a"}</span>
            <span className="meta-chip">Entry {formatDecimal(selectedTicketRow.entryScore)}</span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="secondary" disabled={isSubmittingTicket} onClick={() => void submitTradeTicket()}>
              {isSubmittingTicket ? "Opening..." : "Open manual trade"}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={isSubmittingTicket} onClick={() => void navigator.clipboard.writeText(selectedTicketRow.mint)}>
              <Copy className="h-3 w-3" />
              Copy mint
            </Button>
            <div className="text-xs text-text-muted">
              Winner and pass rows can launch a manual trade directly from review.
            </div>
          </div>

          {ticketMessage ? (
            <InlineNotice tone={ticketMessage.kind === "error" ? "danger" : "accent"} className="mt-3">
              <div className="flex flex-wrap items-center gap-2">
                <span>{ticketMessage.text}</span>
                {ticketMessage.positionId ? (
                  <Link
                    href={`/positions/${encodeURIComponent(ticketMessage.positionId)}` as Route}
                    prefetch={false}
                    className="underline decoration-dotted underline-offset-2"
                  >
                    Open position
                  </Link>
                ) : null}
              </div>
            </InlineNotice>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          <FilterChip active={filter === "all"} label="All" count={summary.total} onClick={() => setFilter("all")} />
          <FilterChip active={filter === "winner"} label="Winners" count={summary.winners} tone="winner" onClick={() => setFilter("winner")} />
          <FilterChip active={filter === "pass"} label="Pass" count={summary.passes} tone="pass" onClick={() => setFilter("pass")} />
          <FilterChip active={filter === "rejected"} label="Rejected" count={summary.rejected} tone="rejected" onClick={() => setFilter("rejected")} />
        </div>
        <label className="relative w-full lg:w-[18rem]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search token, recipe, source, or reason"
            className="pl-8"
          />
        </label>
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        <SummaryCard label="Total" value={summary.total} detail={`${filteredRows.length} visible after filters`} />
        <SummaryCard label="Winners" value={summary.winners} detail="Selected for the winner set" tone="winner" />
        <SummaryCard label="Pass" value={summary.passes} detail="Passed thresholds, not selected" tone="pass" />
        <SummaryCard label="Rejected" value={summary.rejected} detail="Reject reason stays inline" tone="rejected" />
      </div>

      <div className="overflow-hidden rounded-[14px] border border-bg-border bg-bg-card/45">
        <div className="max-h-[34rem] overflow-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-[#090a0b] text-left text-[11px] uppercase tracking-[0.14em] text-text-muted">
              <tr>
                <Th>Outcome</Th>
                <Th>Token</Th>
                <Th>Why</Th>
                <Th>Recipe</Th>
                <Th>Source</Th>
                <Th align="center"><MetricLabel icon={Trophy} label="Play" /></Th>
                <Th align="center"><MetricLabel icon={Waypoints} label="Entry" /></Th>
                <Th align="center">Capital</Th>
                <Th align="center">Liquidity</Th>
                <Th align="center">Vol 5m</Th>
                <Th align="center">Mcap</Th>
                <Th align="center">Grad age</Th>
                <Th>Profile</Th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.id} className={buildRowClass(row.outcome)}>
                  <Td className="border-l-2 border-transparent">{<OutcomeBadge value={row.outcome} />}</Td>
                  <Td>
                    <div className="flex min-w-[10rem] flex-col">
                      <span className="font-medium text-text-primary">{row.symbol || shortMint(row.mint, 4)}</span>
                      <span className="text-[11px] text-text-muted">{shortMint(row.mint, 6)}</span>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {row.outcome !== "REJECTED" ? (
                          <Button
                            type="button"
                            variant={ticketMint === row.mint ? "secondary" : "ghost"}
                            size="sm"
                            className="h-auto px-2 py-1 text-[11px]"
                            onClick={() => openTradeTicket(row)}
                          >
                            <Ticket className="h-3 w-3" />
                            Trade
                          </Button>
                        ) : null}
                        <Link
                          href={`${marketRoutes.tokenByMintPrefix}/${encodeURIComponent(row.mint)}` as Route}
                          prefetch={false}
                          className="rounded border border-bg-border px-2 py-1 text-[11px] font-medium text-text-secondary hover:text-text-primary"
                        >
                          Token
                        </Link>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-auto px-2 py-1 text-[11px]"
                          onClick={() => void navigator.clipboard.writeText(row.mint)}
                        >
                          <Copy className="h-3 w-3" />
                          Mint
                        </Button>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <div className="min-w-[16rem]">
                      <div className="text-text-primary">{row.primaryReason}</div>
                      {row.rejectReason && row.outcome === "REJECTED" ? (
                        <div className="mt-1 text-[11px] text-[var(--danger)]">{row.rejectReason}</div>
                      ) : row.notes ? (
                        <div className="mt-1 text-[11px] text-text-muted">{row.notes}</div>
                      ) : null}
                    </div>
                  </Td>
                  <Td>{row.recipeName}</Td>
                  <Td>{row.source}</Td>
                  <Td align="center">{<MetricChip value={formatDecimal(row.playScore)} tone={row.outcome === "WINNER" ? "accent" : "default"} />}</Td>
                  <Td align="center">{<MetricChip value={formatDecimal(row.entryScore)} tone={row.outcome === "REJECTED" ? "warning" : "default"} />}</Td>
                  <Td align="center">{<MetricChip value={formatCompactCurrency(row.suggestedCapitalUsd)} />}</Td>
                  <Td align="center">{<MetricChip value={formatCompactCurrency(row.liquidityUsd)} tone="accent" />}</Td>
                  <Td align="center">{<MetricChip value={formatCompactCurrency(row.volume5mUsd)} />}</Td>
                  <Td align="center">{<MetricChip value={formatCompactCurrency(row.marketCapUsd)} />}</Td>
                  <Td align="center">{<MetricChip value={formatInteger(row.timeSinceGraduationMin)} />}</Td>
                  <Td>{row.profile ?? "—"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {filteredRows.length === 0 ? (
        <div className="rounded-[12px] border border-bg-border bg-bg-hover/20 px-4 py-4 text-sm text-text-secondary">
          No result rows match the current filter.
        </div>
      ) : null}
    </div>
  );
}

function OutcomeBadge(props: { value: WorkbenchRunOutcome }) {
  const label = props.value === "WINNER" ? "Winner" : props.value === "PASS" ? "Pass" : "Rejected";
  const tone = props.value === "WINNER"
    ? "border-[rgba(163,230,53,0.28)] bg-[rgba(163,230,53,0.12)] text-[var(--success)]"
    : props.value === "PASS"
      ? "border-bg-border bg-white/[0.05] text-text-secondary"
      : "border-[rgba(251,113,133,0.28)] bg-[rgba(251,113,133,0.12)] text-[var(--danger)]";

  return (
    <span className={cn("inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]", tone)}>
      {label}
    </span>
  );
}

function FilterChip(props: {
  active: boolean;
  label: string;
  count: number;
  tone?: "winner" | "pass" | "rejected";
  onClick: () => void;
}) {
  const toneClass = props.tone === "winner"
    ? "text-[var(--success)]"
    : props.tone === "rejected"
      ? "text-[var(--danger)]"
      : "text-text-secondary";

  return (
    <button
      type="button"
      onClick={props.onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition",
        props.active
          ? "border-[rgba(163,230,53,0.24)] bg-[#11150f] text-text-primary"
          : "border-bg-border bg-bg-hover/20 text-text-secondary hover:bg-bg-hover/40",
      )}
    >
      <span>{props.label}</span>
      <span className={cn("font-medium", toneClass)}>{props.count}</span>
    </button>
  );
}

function SummaryCard(props: {
  label: string;
  value: number;
  detail: string;
  tone?: "winner" | "pass" | "rejected";
}) {
  const toneClass = props.tone === "winner"
    ? "border-[rgba(163,230,53,0.2)] bg-[#10140f]"
    : props.tone === "rejected"
      ? "border-[rgba(251,113,133,0.2)] bg-[#151012]"
      : "border-bg-border bg-bg-hover/20";

  return (
    <div className={cn("rounded-[12px] border px-3 py-2.5", toneClass)}>
      <div className="text-[11px] uppercase tracking-[0.14em] text-text-muted">{props.label}</div>
      <div className="mt-1 text-lg font-medium text-text-primary">{formatInteger(props.value)}</div>
      <div className="mt-1 text-xs text-text-secondary">{props.detail}</div>
    </div>
  );
}

function MetricLabel(props: { icon: typeof Trophy; label: string }) {
  const Icon = props.icon;
  return (
    <span className="inline-flex items-center justify-center gap-1.5">
      <Icon className="h-3.5 w-3.5" />
      {props.label}
    </span>
  );
}

function MetricChip(props: { value: string; tone?: "default" | "accent" | "warning" }) {
  const toneClass = props.tone === "accent"
    ? "text-[var(--success)]"
    : props.tone === "warning"
      ? "text-[var(--warning)]"
      : "text-text-primary";

  return <span className={cn("inline-flex min-w-[4.9rem] justify-center rounded-[10px] px-2 py-1 text-[12px] font-semibold tabular-nums", toneClass)}>{props.value}</span>;
}

function Th(props: { children: ReactNode; align?: "left" | "center" | "right" }) {
  return (
    <th className={cn("border-b border-bg-border px-2.5 py-2", props.align === "right" && "text-right", props.align === "center" && "text-center")}>
      {props.children}
    </th>
  );
}

function Td(props: { children: ReactNode; align?: "left" | "center" | "right"; className?: string }) {
  return (
    <td className={cn("border-b border-bg-border/80 px-2.5 py-2.5 align-top text-text-secondary", props.align === "right" && "text-right", props.align === "center" && "text-center", props.className)}>
      {props.children}
    </td>
  );
}

function buildRowClass(outcome: WorkbenchRunOutcome) {
  if (outcome === "WINNER") {
    return "bg-[rgba(163,230,53,0.05)]";
  }
  if (outcome === "REJECTED") {
    return "bg-[rgba(251,113,133,0.04)]";
  }
  return "bg-transparent";
}

function formatDecimal(value: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return "—";
  }
  return value.toFixed(2).replace(/\.?0+$/, "");
}

function TicketField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  error?: string;
  onBlur?: (value: string) => void;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-[11px] uppercase tracking-[0.12em] text-text-muted">{props.label}</div>
      <Input
        inputMode="decimal"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        onBlur={() => props.onBlur?.(props.value)}
        placeholder={props.placeholder}
      />
      {props.error ? <div className="mt-1 text-[11px] text-[var(--danger)]">{props.error}</div> : null}
    </label>
  );
}

function toPositiveNumber(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function compactObject<T extends Record<string, number | null | undefined>>(input: T) {
  return Object.fromEntries(
    Object.entries(input).filter((entry): entry is [string, number] => typeof entry[1] === "number" && entry[1] !== null),
  );
}
