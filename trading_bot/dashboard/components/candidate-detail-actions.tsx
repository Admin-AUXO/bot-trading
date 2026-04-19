"use client";

import Link from "next/link";
import type { Route } from "next";
import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { fetchJson } from "@/lib/api";
import { marketRoutes } from "@/lib/dashboard-routes";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";

export function CandidateDetailActions(props: { mint: string }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function handleManualEntry() {
    setIsSubmitting(true);
    try {
      const result = await fetchJson<{ candidateId: string; positionId: string }>("/operator/manual-entry", {
        method: "POST",
        body: JSON.stringify({ mint: props.mint }),
      });
      setMessage({ kind: "success", text: `Manual entry opened position ${result.positionId}.` });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "manual entry failed" });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <Button onClick={handleManualEntry} disabled={isSubmitting} variant="secondary">
        {isSubmitting ? "Opening…" : "Manual entry"}
      </Button>
      <Link
        href={`${marketRoutes.tokenByMintPrefix}/${encodeURIComponent(props.mint)}` as Route}
        className={cn(buttonVariants({ variant: "ghost" }), "inline-flex")}
      >
        Token lookup
        <ArrowUpRight className="h-4 w-4" />
      </Link>
      {message ? (
        <div
          className={cn(
            "rounded-[12px] border px-4 py-3 text-sm",
            message.kind === "success"
              ? "border-[rgba(163,230,53,0.25)] bg-[rgba(163,230,53,0.08)] text-[var(--accent)]"
              : "border-[rgba(251,113,133,0.25)] bg-[rgba(251,113,133,0.08)] text-[var(--danger)]",
          )}
        >
          {message.text}
        </div>
      ) : null}
    </>
  );
}
