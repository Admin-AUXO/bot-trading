"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { fetchJson } from "@/lib/api";
import { workbenchRoutes } from "@/lib/dashboard-routes";
import type {
  WorkbenchRunGradePayload,
  WorkbenchRunTuningPayload,
} from "@/lib/types";

export function WorkbenchGraderActions(props: { runId: string; runStatus: string }) {
  const [gradePayload, setGradePayload] = useState<WorkbenchRunGradePayload | null>(null);
  const [tuningPayload, setTuningPayload] = useState<WorkbenchRunTuningPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (props.runStatus !== "COMPLETED") {
      setGradePayload(null);
      setTuningPayload(null);
      setError(null);
      return;
    }
    startTransition(() => {
      void refreshComputedState();
    });
  }, [props.runId, props.runStatus]);

  async function refreshComputedState() {
    setError(null);
    try {
      const [grade, tuning] = await Promise.all([
        fetchJson<WorkbenchRunGradePayload>(`/operator/runs/${encodeURIComponent(props.runId)}/grade`, {
          method: "POST",
          body: JSON.stringify({ persist: false }),
        }),
        fetchJson<WorkbenchRunTuningPayload>(`/operator/runs/${encodeURIComponent(props.runId)}/suggest-tuning`, {
          method: "POST",
          body: JSON.stringify({ apply: false }),
        }),
      ]);
      setGradePayload(grade);
      setTuningPayload(tuning);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "grader fetch failed");
    }
  }

  async function persistGrade() {
    setError(null);
    try {
      const payload = await fetchJson<WorkbenchRunGradePayload>(`/operator/runs/${encodeURIComponent(props.runId)}/grade`, {
        method: "POST",
        body: JSON.stringify({ persist: true }),
      });
      setGradePayload(payload);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "grade persist failed");
    }
  }

  async function applySuggestedDraft() {
    setError(null);
    try {
      const payload = await fetchJson<WorkbenchRunTuningPayload>(`/operator/runs/${encodeURIComponent(props.runId)}/suggest-tuning`, {
        method: "POST",
        body: JSON.stringify({ apply: true }),
      });
      setTuningPayload(payload);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "tuning apply failed");
    }
  }

  if (props.runStatus !== "COMPLETED") {
    return (
      <div className="rounded-[12px] border border-bg-border bg-bg-hover/20 p-3 text-sm text-text-muted">
        Completed runs only. Grading unfinished runs is how you train a liar.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => startTransition(() => { void refreshComputedState(); })} disabled={isPending} size="sm" variant="secondary">
          {isPending ? "Refreshing..." : "Refresh grade"}
        </Button>
        <Button onClick={() => { void persistGrade(); }} disabled={isPending || !gradePayload} size="sm" variant="ghost">
          Persist grade
        </Button>
        <Button
          onClick={() => { void applySuggestedDraft(); }}
          disabled={isPending || !tuningPayload || tuningPayload.deltas.length === 0}
          size="sm"
        >
          Create tuned draft
        </Button>
      </div>

      {error ? (
        <div className="rounded-[10px] border border-[rgba(251,113,133,0.25)] bg-[rgba(251,113,133,0.08)] px-3 py-2 text-xs text-[var(--danger)]">
          {error}
        </div>
      ) : null}

      {gradePayload ? (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Grade" value={gradePayload.summary.grade} detail={`${gradePayload.summary.overallScorePercent}% rubric`} />
          <MetricCard label="Pass rate" value={`${gradePayload.summary.passRatePercent}%`} detail={`Winners ${gradePayload.summary.winnerRatePercent}%`} />
          <MetricCard label="False positives" value={`${gradePayload.summary.falsePositiveRatePercent}%`} detail={`Passes ${gradePayload.summary.passCount}`} />
          <MetricCard
            label="Confidence"
            value={gradePayload.summary.calibrationConfidencePercent == null ? "n/a" : `${gradePayload.summary.calibrationConfidencePercent}%`}
            detail={gradePayload.persisted ? `${gradePayload.persisted.packStatus} / ${gradePayload.persisted.packGrade}` : "not persisted"}
          />
        </div>
      ) : null}

      {tuningPayload ? (
        <div className="rounded-[12px] border border-bg-border bg-bg-hover/20 p-3">
          <div className="text-xs uppercase tracking-[0.14em] text-text-muted">Suggested tuning</div>
          {tuningPayload.deltas.length > 0 ? (
            <div className="mt-2 space-y-2">
              {tuningPayload.deltas.map((delta) => (
                <article key={delta.field} className="rounded-[10px] border border-bg-border bg-[#0d1117] px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2 text-sm text-text-primary">
                    <span>{delta.label}</span>
                    <span className="rounded-full border border-bg-border px-2 py-0.5 text-[11px] uppercase tracking-[0.12em] text-text-muted">
                      {delta.direction}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-text-secondary">
                    {formatValue(delta.currentValue)} {"->"} {formatValue(delta.suggestedValue)}
                  </div>
                  <div className="mt-1 text-xs text-text-muted">{delta.reason}</div>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-2 text-sm text-text-muted">
              No threshold deltas suggested. Either the run is clean, or the evidence is too thin to justify another fake tweak.
            </div>
          )}

          {tuningPayload.appliedPackId ? (
            <div className="mt-3 rounded-[10px] border border-[rgba(163,230,53,0.25)] bg-[rgba(163,230,53,0.08)] px-3 py-2 text-xs text-[var(--accent)]">
              Created tuned draft{" "}
              <Link
                href={`${workbenchRoutes.editor}/${encodeURIComponent(tuningPayload.appliedPackId)}`}
                className="underline decoration-dotted underline-offset-2"
              >
                {tuningPayload.appliedPackName ?? tuningPayload.appliedPackId}
              </Link>
              .
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function MetricCard(props: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-[12px] border border-bg-border bg-bg-hover/20 p-3">
      <div className="text-[11px] uppercase tracking-[0.14em] text-text-muted">{props.label}</div>
      <div className="mt-1 text-lg font-medium text-text-primary">{props.value}</div>
      <div className="mt-1 text-xs text-text-secondary">{props.detail}</div>
    </div>
  );
}

function formatValue(value: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return "unset";
  }
  if (Math.abs(value) >= 100) {
    return Math.round(value).toLocaleString("en-US");
  }
  return value.toFixed(2).replace(/\.?0+$/, "");
}
