"use client";

import { useState } from "react";
import { fetchJson } from "@/lib/api";
import type { PositionDetailPayload } from "@/lib/types";

const SOLANA_EXPLORER_BASE = "https://solscan.io";

export function PositionDetailActions(props: { positionId: string; mint: string; stopLossPriceUsd: number }) {
  const [showStopLossModal, setShowStopLossModal] = useState(false);
  const [stopLossValue, setStopLossValue] = useState(String(props.stopLossPriceUsd));
  const [stopLossLoading, setStopLossLoading] = useState(false);
  const [closeLoading, setCloseLoading] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  function showMessage(kind: "success" | "error", text: string) {
    setMessage({ kind, text });
    setTimeout(() => setMessage(null), 4000);
  }

  async function handleClosePosition() {
    setCloseLoading(true);
    try {
      await fetchJson<{ ok: boolean }>(`/api/control/exit-check-now`, { method: "POST" });
      showMessage("success", "Exit check triggered.");
    } catch (err) {
      showMessage("error", err instanceof Error ? err.message : "Exit check failed.");
    } finally {
      setCloseLoading(false);
    }
  }

  async function handleAdjustStopLoss(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseFloat(stopLossValue);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      showMessage("error", "Enter a valid positive price.");
      return;
    }
    setStopLossLoading(true);
    try {
      await fetchJson<{ ok: boolean }>(`/api/control/settings`, {
        method: "PATCH",
        body: JSON.stringify({ stopLossPercent: parsed }),
      });
      showMessage("success", `Stop loss updated to ${parsed}.`);
      setShowStopLossModal(false);
    } catch (err) {
      showMessage("error", err instanceof Error ? err.message : "Stop loss update failed.");
    } finally {
      setStopLossLoading(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={handleClosePosition}
          disabled={closeLoading}
          className="btn-ghost inline-flex items-center gap-2 border border-bg-border text-sm"
          title="Trigger immediate exit check for this position"
        >
          {closeLoading ? "Closing…" : "Close position"}
        </button>

        <button
          onClick={() => { setShowStopLossModal(true); setStopLossValue(String(props.stopLossPriceUsd)); }}
          className="btn-ghost inline-flex items-center gap-2 border border-bg-border text-sm"
          title="Adjust stop loss for this position"
        >
          Adjust stop loss
        </button>

        <a
          href={`${SOLANA_EXPLORER_BASE}/token/${props.mint}`}
          target="_blank"
          rel="noreferrer"
          className="btn-ghost inline-flex items-center gap-2 border border-bg-border text-sm"
          title="View token on Solscan"
        >
          View on explorer
        </a>
      </div>

      {message ? (
        <div className={`rounded-[12px] border px-4 py-3 text-sm ${message.kind === "success"
          ? "border-[rgba(163,230,53,0.25)] bg-[rgba(163,230,53,0.08)] text-[var(--accent)]"
          : "border-[rgba(251,113,133,0.25)] bg-[rgba(251,113,133,0.08)] text-[var(--danger)]"
        }`}>
          {message.text}
        </div>
      ) : null}

      {showStopLossModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-[18px] border border-bg-border bg-bg-card p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-text-primary">Adjust stop loss</h3>
            <p className="mt-1 text-sm text-text-secondary">Set a new stop loss price in USD.</p>
            <form onSubmit={handleAdjustStopLoss} className="mt-5 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.15em] text-text-muted">
                  Stop loss price (USD)
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={stopLossValue}
                  onChange={(e) => setStopLossValue(e.target.value)}
                  className="input-field w-full"
                  placeholder="0.000000"
                  required
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowStopLossModal(false)}
                  className="btn-ghost inline-flex items-center gap-2 border border-bg-border text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={stopLossLoading}
                  className="btn-primary inline-flex items-center gap-2 text-sm"
                >
                  {stopLossLoading ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function InterventionPriorityBadge(props: { priority: number }) {
  const { priority } = props;
  const tone =
    priority >= 3 ? "danger" :
    priority >= 1 ? "warning" :
    "default";
  const label =
    priority >= 3 ? "High" :
    priority >= 1 ? "Medium" :
    "Low";

  return (
    <span className={`badge badge-${tone}`}>
      {label} ({priority})
    </span>
  );
}
