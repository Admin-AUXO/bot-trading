"use client";

import { AlertTriangle } from "lucide-react";

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[14px] border border-[rgba(251,113,133,0.24)] bg-[#141013] px-4 py-12 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-[rgba(251,113,133,0.24)] bg-[rgba(251,113,133,0.08)]">
        <AlertTriangle className="h-6 w-6 text-[var(--danger,#ef4444)]" />
      </div>
      <h2 className="mb-2 text-sm font-semibold text-text-primary">Failed to load trending data</h2>
      <p className="mb-4 max-w-sm text-xs text-text-muted">{error.message || "An unexpected error occurred while fetching market trending data."}</p>
      <button
        onClick={reset}
        className="rounded-[10px] border border-[rgba(163,230,53,0.3)] bg-[#10120f] px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-[rgba(163,230,53,0.5)] hover:text-accent"
      >
        Try again
      </button>
    </div>
  );
}
