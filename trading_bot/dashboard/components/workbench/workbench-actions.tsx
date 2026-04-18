"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { fetchJson } from "@/lib/api";
import type {
  TradingSessionSnapshot,
  WorkbenchApplyLiveResponse,
  WorkbenchCreateRunResponse,
  WorkbenchRunSummary,
} from "@/lib/types";

type SessionMode = "DRY_RUN" | "LIVE";

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
    const payload = collectSessionStartInput("DRY_RUN");
    if (!payload) {
      return;
    }

    setIsSubmitting(true);
    setMessage(null);
    try {
      const result = await fetchJson<WorkbenchApplyLiveResponse>("/operator/sessions", {
        method: "POST",
        body: JSON.stringify({
          runId: props.runId,
          ...payload,
        }),
      });
      setMessage({
        kind: "success",
        text: result.session?.id
          ? `Session ${result.session.id} is now active.`
          : "Session started.",
      });
      router.refresh();
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "session start failed" });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={cn("space-y-2", props.className)}>
      <Button onClick={handleApplyLive} disabled={props.disabled || isSubmitting} variant="secondary" size="sm">
        {isSubmitting ? "Starting..." : "Start session"}
      </Button>
      {message ? <ActionMessage kind={message.kind} text={message.text} /> : null}
    </div>
  );
}

export function SessionLaunchPanel(props: {
  runs: WorkbenchRunSummary[];
  className?: string;
}) {
  const router = useRouter();
  const availableRuns = useMemo(
    () => props.runs.filter((run) => run.canApplyLive),
    [props.runs],
  );
  const [selectedRunId, setSelectedRunId] = useState<string>(availableRuns[0]?.id ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function handleStartSession() {
    if (!selectedRunId) {
      setMessage({ kind: "error", text: "Select a run first." });
      return;
    }
    const payload = collectSessionStartInput("DRY_RUN");
    if (!payload) {
      return;
    }

    setIsSubmitting(true);
    setMessage(null);
    try {
      const result = await fetchJson<WorkbenchApplyLiveResponse>("/operator/sessions", {
        method: "POST",
        body: JSON.stringify({
          runId: selectedRunId,
          ...payload,
        }),
      });
      setMessage({
        kind: "success",
        text: result.session?.id
          ? `Started session ${result.session.id}.`
          : "Session started.",
      });
      router.refresh();
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "session start failed" });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={cn("space-y-3 rounded-[14px] border border-bg-border bg-bg-hover/20 p-3", props.className)}>
      <div>
        <div className="text-xs uppercase tracking-[0.14em] text-text-muted">Start deployment</div>
        <div className="mt-1 text-sm text-text-secondary">
          Session start is now a real backend contract. Pick a completed run, choose mode, then type the confirmation phrase when prompted.
        </div>
      </div>

      {availableRuns.length > 0 ? (
        <>
          <select
            className="w-full rounded-[10px] border border-bg-border bg-[#0d1117] px-3 py-2 text-sm text-text-primary outline-none"
            value={selectedRunId}
            onChange={(event) => setSelectedRunId(event.target.value)}
          >
            {availableRuns.map((run) => (
              <option key={run.id} value={run.id}>
                {run.packName} | {run.id.slice(0, 8)} | {run.status}
              </option>
            ))}
          </select>
          <Button onClick={handleStartSession} disabled={isSubmitting} size="sm">
            {isSubmitting ? "Starting..." : "Start session"}
          </Button>
        </>
      ) : (
        <div className="rounded-[10px] border border-bg-border bg-bg-hover/25 px-3 py-2 text-xs text-text-muted">
          No completed deployable runs are available yet.
        </div>
      )}

      {message ? <ActionMessage kind={message.kind} text={message.text} /> : null}
    </div>
  );
}

export function SessionLifecycleActions(props: {
  session: TradingSessionSnapshot;
  isPaused: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function runAction(action: "pause" | "resume" | "stop" | "revert") {
    let body: Record<string, unknown> = { action };

    if (action === "pause") {
      if (!window.confirm("Pause the active session?")) {
        return;
      }
    }

    if (action === "resume") {
      if (!window.confirm("Resume the active session?")) {
        return;
      }
    }

    if (action === "stop") {
      if (!window.confirm("Stop the active session and clear the deployed live strategy?")) {
        return;
      }
    }

    if (action === "revert") {
      if (!props.session.previousPackId) {
        setMessage({ kind: "error", text: "No previous deployed pack is available for this session." });
        return;
      }
      const revertInput = collectSessionRevertInput(props.session.mode);
      if (!revertInput) {
        return;
      }
      body = {
        action,
        ...revertInput,
      };
    }

    setIsSubmitting(true);
    setMessage(null);
    try {
      await fetchJson<TradingSessionSnapshot>(`/operator/sessions/${encodeURIComponent(props.session.id)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setMessage({
        kind: "success",
        text: action === "revert" ? "Session reverted." : `Session ${action}d.`,
      });
      router.refresh();
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : `session ${action} failed` });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={cn("space-y-2", props.className)}>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => runAction(props.isPaused ? "resume" : "pause")}
          disabled={isSubmitting}
          variant="secondary"
          size="sm"
        >
          {isSubmitting ? "Working..." : props.isPaused ? "Resume session" : "Pause session"}
        </Button>
        <Button onClick={() => runAction("stop")} disabled={isSubmitting} variant="ghost" size="sm">
          Stop session
        </Button>
        <Button
          onClick={() => runAction("revert")}
          disabled={isSubmitting || !props.session.previousPackId}
          variant="ghost"
          size="sm"
        >
          Revert session
        </Button>
      </div>
      {message ? <ActionMessage kind={message.kind} text={message.text} /> : null}
    </div>
  );
}

function collectSessionStartInput(defaultMode: SessionMode): {
  mode: SessionMode;
  confirmation: string;
  liveDeployToken?: string;
} | null {
  const mode = promptForMode(defaultMode);
  if (!mode) {
    return null;
  }
  const confirmation = promptForConfirmation("START", mode);
  if (!confirmation) {
    return null;
  }
  const promptedToken = mode === "LIVE" ? promptForLiveDeployToken() : undefined;
  if (mode === "LIVE" && !promptedToken) {
    return null;
  }
  const liveDeployToken = promptedToken ?? undefined;
  return { mode, confirmation, liveDeployToken };
}

function collectSessionRevertInput(defaultMode: SessionMode): {
  mode: SessionMode;
  confirmation: string;
  liveDeployToken?: string;
} | null {
  const mode = promptForMode(defaultMode);
  if (!mode) {
    return null;
  }
  const confirmation = promptForConfirmation("REVERT", mode);
  if (!confirmation) {
    return null;
  }
  const promptedToken = mode === "LIVE" ? promptForLiveDeployToken() : undefined;
  if (mode === "LIVE" && !promptedToken) {
    return null;
  }
  const liveDeployToken = promptedToken ?? undefined;
  return { mode, confirmation, liveDeployToken };
}

function promptForMode(defaultMode: SessionMode): SessionMode | null {
  const value = window.prompt("Session mode: type DRY_RUN or LIVE.", defaultMode);
  if (!value) {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  if (normalized === "DRY_RUN" || normalized === "LIVE") {
    return normalized;
  }
  window.alert("Mode must be DRY_RUN or LIVE.");
  return null;
}

function promptForConfirmation(action: "START" | "REVERT", mode: SessionMode): string | null {
  const expected = `${action} ${mode} SESSION`;
  const value = window.prompt(`Type "${expected}" to confirm.`, expected);
  if (!value) {
    return null;
  }
  if (value.trim() !== expected) {
    window.alert(`Confirmation must match "${expected}".`);
    return null;
  }
  return value.trim();
}

function promptForLiveDeployToken(): string | null {
  const value = window.prompt("Enter the live deploy token.");
  if (!value || value.trim().length === 0) {
    window.alert("Live deploy token is required for LIVE mode.");
    return null;
  }
  return value.trim();
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
