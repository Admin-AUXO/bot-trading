"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { fetchJson } from "@/lib/api";
import type { WorkbenchApplyLiveResponse, WorkbenchCreateRunResponse } from "@/lib/types";

export function StartPackRunButton(props: { packId: string; className?: string }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function handleStartRun() {
    setIsSubmitting(true);
    setMessage(null);
    try {
      const payload = await fetchJson<WorkbenchCreateRunResponse>(`/operator/packs/${encodeURIComponent(props.packId)}/runs`, {
        method: "POST",
      });
      const runId = payload.runId ?? payload.id ?? payload.run?.id ?? null;
      if (runId) {
        router.push(`/workbench/sandbox/${encodeURIComponent(runId)}`);
      } else {
        router.refresh();
      }
      setMessage({ kind: "success", text: runId ? `Run ${runId} started.` : "Run started." });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "run start failed" });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={cn("space-y-2", props.className)}>
      <Button onClick={handleStartRun} disabled={isSubmitting} variant="secondary" size="sm">
        {isSubmitting ? "Starting..." : "Start run"}
      </Button>
      {message ? <ActionMessage kind={message.kind} text={message.text} /> : null}
    </div>
  );
}

export function ApplyRunLiveButton(props: { runId: string; disabled?: boolean; className?: string }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function handleApplyLive() {
    setIsSubmitting(true);
    setMessage(null);
    try {
      const payload = await fetchJson<WorkbenchApplyLiveResponse>(`/operator/runs/${encodeURIComponent(props.runId)}/apply-live`, {
        method: "POST",
      });
      setMessage({
        kind: "success",
        text: payload.session?.id
          ? `Applied. Session ${payload.session.id} is now active.`
          : "Run applied to live strategy.",
      });
      router.refresh();
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "apply live failed" });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={cn("space-y-2", props.className)}>
      <Button onClick={handleApplyLive} disabled={props.disabled || isSubmitting} variant="secondary" size="sm">
        {isSubmitting ? "Applying..." : "Apply live"}
      </Button>
      {message ? <ActionMessage kind={message.kind} text={message.text} /> : null}
    </div>
  );
}

function ActionMessage(props: { kind: "success" | "error"; text: string }) {
  return (
    <div
      className={cn(
        "rounded-[10px] border px-2.5 py-2 text-xs",
        props.kind === "success"
          ? "border-[rgba(163,230,53,0.25)] bg-[rgba(163,230,53,0.08)] text-[var(--accent)]"
          : "border-[rgba(251,113,133,0.25)] bg-[rgba(251,113,133,0.08)] text-[var(--danger)]",
      )}
    >
      {props.text}
    </div>
  );
}
