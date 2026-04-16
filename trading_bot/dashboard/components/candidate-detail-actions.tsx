"use client";

import { useState } from "react";
import { fetchJson } from "@/lib/api";

export function CandidateDetailActions(props: { candidateId: string; mint: string }) {
  const [promoteLoading, setPromoteLoading] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);
  const [adjustLoading, setAdjustLoading] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  function showMessage(kind: "success" | "error", text: string) {
    setMessage({ kind, text });
    setTimeout(() => setMessage(null), 4000);
  }

  async function handlePromote() {
    setPromoteLoading(true);
    try {
      const result = await fetchJson<{ candidateId: string; positionId: string }>(`/api/discovery-lab/manual-entry`, {
        method: "POST",
        body: JSON.stringify({ mint: props.mint }),
      });
      showMessage("success", `Promoted — position ${result.positionId} created.`);
    } catch (err) {
      showMessage("error", err instanceof Error ? err.message : "Promote failed.");
    } finally {
      setPromoteLoading(false);
    }
  }

  async function handleBlock() {
    setBlockLoading(true);
    try {
      await fetchJson<{ ok: boolean }>(`/api/operator/candidates/${props.candidateId}/block`, {
        method: "POST",
      });
      showMessage("success", "Candidate blocked permanently.");
    } catch (err) {
      showMessage("error", err instanceof Error ? err.message : "Block failed.");
    } finally {
      setBlockLoading(false);
    }
  }

  async function handleAdjustFilters() {
    setAdjustLoading(true);
    try {
      // Navigate to discovery-lab config with this mint pre-selected
      window.location.href = `/discovery-lab/config?focus=${encodeURIComponent(props.mint)}`;
    } finally {
      setAdjustLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={handlePromote}
        disabled={promoteLoading}
        className="btn-ghost inline-flex items-center gap-2 border border-bg-border text-sm"
        title="Manually promote this candidate to a live position"
      >
        {promoteLoading ? "Promoting…" : "Promote to position"}
      </button>

      <button
        onClick={handleBlock}
        disabled={blockLoading}
        className="btn-ghost inline-flex items-center gap-2 border border-bg-border text-sm"
        title="Permanently block this candidate from intake"
      >
        {blockLoading ? "Blocking…" : "Block permanently"}
      </button>

      <button
        onClick={handleAdjustFilters}
        disabled={adjustLoading}
        className="btn-ghost inline-flex items-center gap-2 border border-bg-border text-sm"
        title="Open filter configuration for this candidate"
      >
        {adjustLoading ? "Loading…" : "Adjust filters"}
      </button>

      {message ? (
        <div className={`rounded-[12px] border px-4 py-3 text-sm ${message.kind === "success"
          ? "border-[rgba(163,230,53,0.25)] bg-[rgba(163,230,53,0.08)] text-[var(--accent)]"
          : "border-[rgba(251,113,133,0.25)] bg-[rgba(251,113,133,0.08)] text-[var(--danger)]"
        }`}>
          {message.text}
        </div>
      ) : null}
    </div>
  );
}
