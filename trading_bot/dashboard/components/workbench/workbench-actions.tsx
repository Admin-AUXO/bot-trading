"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
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

export function RunSessionStartPanel(props: {
  runId: string;
  disabled?: boolean;
  disabledReason?: string | null;
  className?: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<SessionMode>("DRY_RUN");
  const [confirmation, setConfirmation] = useState("");
  const [liveDeployToken, setLiveDeployToken] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    setMode("DRY_RUN");
    setConfirmation("");
    setLiveDeployToken("");
    setMessage(null);
  }, [props.runId]);

  async function handleApplyLive() {
    const payload = buildSessionStartPayload({
      mode,
      confirmation,
      liveDeployToken,
      action: "START",
    });
    if (!payload.ok) {
      setMessage({ kind: "error", text: payload.error });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);
    try {
      const result = await fetchJson<WorkbenchApplyLiveResponse>("/operator/sessions", {
        method: "POST",
        body: JSON.stringify({
          runId: props.runId,
          ...payload.value,
        }),
      });
      setMessage({
        kind: "success",
        text: result.session?.id
          ? `Session ${result.session.id} is now active.`
          : "Session started.",
      });
      setConfirmation("");
      setLiveDeployToken("");
      router.refresh();
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "session start failed" });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={cn("space-y-2", props.className)}>
      <div className="rounded-[14px] border border-bg-border bg-bg-hover/20 p-3">
        <div className="text-xs uppercase tracking-[0.14em] text-text-muted">Start session from this run</div>
        <div className="mt-1 text-xs text-text-secondary">
          Use the explicit session contract. No more prompt roulette.
        </div>
        <SessionModeFields
          mode={mode}
          confirmation={confirmation}
          liveDeployToken={liveDeployToken}
          action="START"
          disabled={props.disabled || isSubmitting}
          onModeChange={setMode}
          onConfirmationChange={setConfirmation}
          onLiveDeployTokenChange={setLiveDeployToken}
          className="mt-3"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button onClick={handleApplyLive} disabled={props.disabled || isSubmitting} variant="secondary" size="sm">
            {isSubmitting ? "Starting..." : "Start session"}
          </Button>
          {props.disabledReason ? (
            <div className="rounded-[10px] border border-bg-border bg-bg-hover/25 px-2.5 py-2 text-xs text-text-muted">
              {props.disabledReason}
            </div>
          ) : null}
        </div>
      </div>
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
  const [mode, setMode] = useState<SessionMode>("DRY_RUN");
  const [confirmation, setConfirmation] = useState("");
  const [liveDeployToken, setLiveDeployToken] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    setSelectedRunId(availableRuns[0]?.id ?? "");
  }, [availableRuns]);

  async function handleStartSession() {
    if (!selectedRunId) {
      setMessage({ kind: "error", text: "Select a run first." });
      return;
    }
    const payload = buildSessionStartPayload({
      mode,
      confirmation,
      liveDeployToken,
      action: "START",
    });
    if (!payload.ok) {
      setMessage({ kind: "error", text: payload.error });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);
    try {
      const result = await fetchJson<WorkbenchApplyLiveResponse>("/operator/sessions", {
        method: "POST",
        body: JSON.stringify({
          runId: selectedRunId,
          ...payload.value,
        }),
      });
      setMessage({
        kind: "success",
        text: result.session?.id
          ? `Started session ${result.session.id}.`
          : "Session started.",
      });
      setConfirmation("");
      setLiveDeployToken("");
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
          Pick one deployable run, choose mode, then type the exact confirmation phrase shown below.
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
                {run.packName} | {run.id.slice(0, 8)} | winners {run.winnerCount ?? 0}
              </option>
            ))}
          </select>
          <SessionModeFields
            mode={mode}
            confirmation={confirmation}
            liveDeployToken={liveDeployToken}
            action="START"
            disabled={isSubmitting}
            onModeChange={setMode}
            onConfirmationChange={setConfirmation}
            onLiveDeployTokenChange={setLiveDeployToken}
          />
          <Button onClick={handleStartSession} disabled={isSubmitting} size="sm">
            {isSubmitting ? "Starting..." : "Start session"}
          </Button>
        </>
      ) : (
        <div className="rounded-[10px] border border-bg-border bg-bg-hover/25 px-3 py-2 text-xs text-text-muted">
          No deployable runs are available yet. Completed runs only appear here when the backend marks them `canApplyLive`.
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
  const [revertMode, setRevertMode] = useState<SessionMode>(props.session.mode);
  const [revertConfirmation, setRevertConfirmation] = useState("");
  const [revertLiveDeployToken, setRevertLiveDeployToken] = useState("");
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
      const revertInput = buildSessionStartPayload({
        mode: revertMode,
        confirmation: revertConfirmation,
        liveDeployToken: revertLiveDeployToken,
        action: "REVERT",
      });
      if (!revertInput.ok) {
        setMessage({ kind: "error", text: revertInput.error });
        return;
      }
      body = {
        action,
        ...revertInput.value,
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
      if (action === "revert") {
        setRevertConfirmation("");
        setRevertLiveDeployToken("");
      }
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
      </div>
      {props.session.previousPackId ? (
        <div className="rounded-[12px] border border-bg-border bg-bg-hover/20 p-3">
          <div className="text-xs uppercase tracking-[0.14em] text-text-muted">Revert to previous pack</div>
          <div className="mt-1 text-xs text-text-secondary">
            Previous deployment: {props.session.previousPackName ?? props.session.previousPackId}
          </div>
          <SessionModeFields
            mode={revertMode}
            confirmation={revertConfirmation}
            liveDeployToken={revertLiveDeployToken}
            action="REVERT"
            disabled={isSubmitting}
            onModeChange={setRevertMode}
            onConfirmationChange={setRevertConfirmation}
            onLiveDeployTokenChange={setRevertLiveDeployToken}
            className="mt-3"
          />
          <div className="mt-3">
            <Button onClick={() => runAction("revert")} disabled={isSubmitting} variant="ghost" size="sm">
              Revert session
            </Button>
          </div>
        </div>
      ) : null}
      {message ? <ActionMessage kind={message.kind} text={message.text} /> : null}
    </div>
  );
}

function SessionModeFields(props: {
  mode: SessionMode;
  confirmation: string;
  liveDeployToken: string;
  action: "START" | "REVERT";
  disabled: boolean;
  className?: string;
  onModeChange: (value: SessionMode) => void;
  onConfirmationChange: (value: string) => void;
  onLiveDeployTokenChange: (value: string) => void;
}) {
  const expected = expectedConfirmation(props.action, props.mode);

  return (
    <div className={cn("grid gap-3 md:grid-cols-3", props.className)}>
      <label className="block">
        <div className="mb-1 text-[11px] uppercase tracking-[0.12em] text-text-muted">Mode</div>
        <Select
          value={props.mode}
          disabled={props.disabled}
          onChange={(event) => props.onModeChange(event.target.value as SessionMode)}
        >
          <option value="DRY_RUN">DRY_RUN</option>
          <option value="LIVE">LIVE</option>
        </Select>
      </label>
      <label className="block md:col-span-2">
        <div className="mb-1 flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.12em] text-text-muted">
          <span>Confirmation</span>
          <span className="text-[10px] normal-case tracking-normal text-text-secondary">{expected}</span>
        </div>
        <Input
          value={props.confirmation}
          disabled={props.disabled}
          onChange={(event) => props.onConfirmationChange(event.target.value)}
          placeholder={expected}
        />
      </label>
      {props.mode === "LIVE" ? (
        <label className="block md:col-span-3">
          <div className="mb-1 text-[11px] uppercase tracking-[0.12em] text-text-muted">Live deploy token</div>
          <Input
            type="password"
            value={props.liveDeployToken}
            disabled={props.disabled}
            onChange={(event) => props.onLiveDeployTokenChange(event.target.value)}
            placeholder="Required for LIVE session changes"
          />
        </label>
      ) : null}
    </div>
  );
}

function buildSessionStartPayload(input: {
  mode: SessionMode;
  confirmation: string;
  liveDeployToken: string;
  action: "START" | "REVERT";
}): { ok: true; value: { mode: SessionMode; confirmation: string; liveDeployToken?: string } } | { ok: false; error: string } {
  const confirmation = input.confirmation.trim();
  const expected = expectedConfirmation(input.action, input.mode);
  if (confirmation !== expected) {
    return { ok: false, error: `Confirmation must match "${expected}".` };
  }
  if (input.mode === "LIVE" && input.liveDeployToken.trim().length === 0) {
    return { ok: false, error: "Live deploy token is required for LIVE mode." };
  }
  return {
    ok: true,
    value: {
      mode: input.mode,
      confirmation,
      liveDeployToken: input.mode === "LIVE" ? input.liveDeployToken.trim() : undefined,
    },
  };
}

function expectedConfirmation(action: "START" | "REVERT", mode: SessionMode) {
  return `${action} ${mode} SESSION`;
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
