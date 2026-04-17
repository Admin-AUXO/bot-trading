"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { fetchJson } from "@/lib/api";
import { operationalDeskRoutes } from "@/lib/dashboard-routes";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { StatusPill } from "@/components/dashboard-primitives";

const SOLSCAN_BASE = "https://solscan.io";

export function PositionDetailActions(props: { mint: string }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function handleRunExitChecks() {
    setIsSubmitting(true);
    try {
      await fetchJson("/control/exit-check-now", { method: "POST" });
      setMessage({ kind: "success", text: "Global exit checks triggered." });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "exit check failed" });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <Button onClick={handleRunExitChecks} disabled={isSubmitting} variant="secondary">
        {isSubmitting ? "Running…" : "Run exit checks"}
      </Button>
      <Link href={operationalDeskRoutes.settings} className={buttonVariants({ variant: "ghost" })}>
        Runtime settings
      </Link>
      <a
        href={`${SOLSCAN_BASE}/token/${props.mint}`}
        target="_blank"
        rel="noreferrer"
        className={cn(buttonVariants({ variant: "ghost" }), "inline-flex")}
      >
        Solscan
        <ArrowUpRight className="h-4 w-4" />
      </a>
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

export function InterventionPriorityBadge(props: { priority: number }) {
  const value = props.priority >= 3 ? "high priority" : props.priority >= 1 ? "medium priority" : "low priority";
  return <StatusPill value={value} />;
}
