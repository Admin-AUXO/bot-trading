"use client";

import * as Dialog from "@radix-ui/react-dialog";
import clsx from "clsx";
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import { X } from "lucide-react";
import { useMemo } from "react";
import { humanizeKey, smartFormatValue } from "@/lib/format";

ModuleRegistry.registerModules([AllCommunityModule]);

export type GridRecord = Record<string, unknown>;

export function GridStatusBadge(props: { value: string | null | undefined }) {
  const value = String(props.value ?? "unknown").toUpperCase();
  const tone = value.includes("REJECT") || value.includes("ERROR") || value.includes("BLOCK") || value.includes("FAIL") || value.includes("DANGER")
    ? "border-[rgba(251,113,133,0.26)] bg-[rgba(251,113,133,0.12)] text-[var(--danger)]"
    : value.includes("OPEN") || value.includes("ACCEPT") || value.includes("BOUGHT") || value.includes("READY") || value.includes("PASS") || value.includes("HEALTHY") || value.includes("LIVE") || value.includes("RUNNING") || value.includes("ENABLED") || value === "OK"
      ? "border-[rgba(163,230,53,0.26)] bg-[rgba(163,230,53,0.12)] text-[var(--success)]"
      : value.includes("WARNING") || value.includes("PAUSE") || value.includes("WAIT") || value.includes("QUEUE") || value.includes("STALE") || value.includes("DISCOVER") || value.includes("SKIP") || value.includes("CHANGED") || value.includes("DISABLED")
        ? "border-[rgba(250,204,21,0.24)] bg-[rgba(250,204,21,0.12)] text-[var(--warning)]"
        : "border-[var(--line)] bg-white/[0.05] text-text-secondary";

  return (
    <span className={clsx("inline-flex items-center rounded-full px-2 py-1 text-[10px] font-semibold tracking-[0.14em]", tone)}>
      {value.replace(/_/g, " ")}
    </span>
  );
}

export function isLikelyIdentifierKey(key: string) {
  return key.includes("id") || key.includes("mint") || key.includes("address") || key.includes("endpoint") || key.includes("signature");
}

export function isLikelyNumericKey(key: string) {
  return /(price|amount|pnl|count|units|percent|ratio|volume|liquidity|cap|remaining|priority|latency|age|score|ev)/i.test(key);
}

export function formatGridValue(key: string, value: unknown) {
  return smartFormatValue(key, value);
}

export function RowDetailsDialog(props: {
  row: GridRecord | null;
  title: string;
  subtitle?: string;
  preferredKeys?: string[];
  onClose: () => void;
}) {
  const row = props.row;
  const keys = useMemo(() => {
    if (!row) {
      return [];
    }
    const preferred = (props.preferredKeys ?? []).filter((key) => key in row);
    const rest = Object.keys(row).filter((key) => !preferred.includes(key));
    return [...preferred, ...rest];
  }, [props.preferredKeys, row]);

  return (
      <Dialog.Root open={Boolean(row)} onOpenChange={(open) => { if (!open) props.onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/70" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[71] w-[min(56rem,96vw)] max-h-[88vh] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[20px] border border-bg-border bg-[#090a0b] p-0 shadow-2xl outline-none">
          <div className="flex items-center justify-between border-b border-bg-border px-4 py-3">
            <div>
              <Dialog.Title className="text-base font-semibold text-text-primary">{props.title}</Dialog.Title>
              {props.subtitle ? <div className="mt-1 text-xs text-text-secondary">{props.subtitle}</div> : null}
            </div>
            <Dialog.Close asChild>
              <button className="btn-ghost inline-flex items-center gap-2 border border-bg-border px-3 py-1.5 text-xs">
                <X className="h-4 w-4" />
                Close
              </button>
            </Dialog.Close>
          </div>
          <div className="max-h-[calc(88vh-4.25rem)] overflow-auto px-4 py-4">
            {!row || keys.length === 0 ? (
              <div className="rounded-[12px] border border-bg-border bg-bg-hover/30 px-4 py-4 text-sm text-text-secondary">No row details.</div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {keys.map((key) => (
                  <div key={key} className="rounded-[12px] border border-bg-border bg-[#0f1011] px-3 py-3">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">{humanizeKey(key)}</div>
                    <div className={clsx("mt-2 text-sm text-text-primary", isLikelyIdentifierKey(key) && "font-mono text-[12px]")}>
                      {formatGridValue(key, row[key])}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
