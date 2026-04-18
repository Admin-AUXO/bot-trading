"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { fetchJson } from "@/lib/api";
import type { DiscoveryLabPackDraft, DiscoveryLabValidationResponse } from "@/lib/types";

type EditablePack = {
  id: string;
  kind: "created" | "custom";
  name: string;
  description: string;
  thesis?: string;
  defaultProfile: "runtime" | "high-value" | "scalp";
  defaultSources: string[];
  thresholdOverrides: Record<string, unknown>;
  recipes: unknown[];
};

type SaveResponse = {
  id?: string;
  pack?: {
    id?: string;
  };
};

type FormState = {
  name: string;
  description: string;
  thesis: string;
  defaultProfile: "runtime" | "high-value" | "scalp";
  sourcesCsv: string;
  thresholdOverridesJson: string;
  recipesJson: string;
};

export function WorkbenchPackEditorForm(props: { pack: EditablePack | null; className?: string }) {
  const router = useRouter();
  const [state, setState] = useState<FormState>(() => toFormState(props.pack));
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [issues, setIssues] = useState<Array<{ path: string; message: string; level: "warning" | "error" }>>([]);

  useEffect(() => {
    setState(toFormState(props.pack));
    setMessage(null);
    setIssues([]);
  }, [props.pack?.id]);

  async function handleSave(mode: "update" | "copy") {
    if (!props.pack) {
      return;
    }

    setIsSaving(true);
    setMessage(null);
    setIssues([]);

    try {
      const payload = toDraftPayload(state);
      const saveAsCopy = mode === "copy" || props.pack.kind !== "custom";
      const path = !saveAsCopy
        ? `/operator/packs/${encodeURIComponent(props.pack.id)}`
        : "/operator/packs";
      const method = !saveAsCopy ? "PATCH" : "POST";
      const response = await fetchJson<SaveResponse>(path, {
        method,
        body: JSON.stringify(payload),
      });

      const savedPackId = response.pack?.id ?? response.id ?? props.pack.id;
      setMessage({
        kind: "success",
        text: !saveAsCopy ? `Saved ${savedPackId}.` : `Created ${savedPackId}.`,
      });
      router.push(`/workbench/editor/${encodeURIComponent(savedPackId)}`);
      router.refresh();
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "pack save failed",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleValidate() {
    if (!props.pack) {
      return;
    }

    setIsSaving(true);
    setMessage(null);
    setIssues([]);

    try {
      const payload = toDraftPayload(state);
      const response = await fetchJson<DiscoveryLabValidationResponse>("/operator/packs/validate", {
        method: "POST",
        body: JSON.stringify({ draft: payload, allowOverfiltered: false }),
      });
      setIssues(response.issues);
      setMessage({
        kind: response.ok ? "success" : "error",
        text: response.ok ? "Validation passed." : `${response.issues.length} validation issue(s).`,
      });
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "validation failed",
      });
    } finally {
      setIsSaving(false);
    }
  }

  if (!props.pack) {
    return (
      <div className={props.className}>
        <div className="rounded-[12px] border border-bg-border bg-bg-hover/20 p-3 text-xs text-text-muted">
          Choose a pack from the list to edit and save it through the dedicated operator pack route.
        </div>
      </div>
    );
  }

  return (
    <div className={props.className}>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Name">
          <Input
            value={state.name}
            onChange={(event) => setState((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="Pack name"
          />
        </Field>
        <Field label="Default profile">
          <Select
            value={state.defaultProfile}
            onChange={(event) =>
              setState((prev) => ({
                ...prev,
                defaultProfile: event.target.value as FormState["defaultProfile"],
              }))}
          >
            <option value="runtime">runtime</option>
            <option value="high-value">high-value</option>
            <option value="scalp">scalp</option>
          </Select>
        </Field>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Field label="Description">
          <Textarea
            value={state.description}
            onChange={(event) => setState((prev) => ({ ...prev, description: event.target.value }))}
            className="min-h-[120px]"
            placeholder="What this pack is trying to do."
          />
        </Field>
        <Field label="Thesis">
          <Textarea
            value={state.thesis}
            onChange={(event) => setState((prev) => ({ ...prev, thesis: event.target.value }))}
            className="min-h-[120px]"
            placeholder="Optional thesis"
          />
        </Field>
      </div>

      <div className="mt-3">
        <Field label="Sources (comma separated)">
          <Input
            value={state.sourcesCsv}
            onChange={(event) => setState((prev) => ({ ...prev, sourcesCsv: event.target.value }))}
            placeholder="birdeye-so-tokenlist, birdeye-trending"
          />
        </Field>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Field label="Threshold overrides JSON">
          <Textarea
            value={state.thresholdOverridesJson}
            onChange={(event) => setState((prev) => ({ ...prev, thresholdOverridesJson: event.target.value }))}
            className="min-h-[180px] font-mono text-xs"
          />
        </Field>
        <Field label="Recipes JSON">
          <Textarea
            value={state.recipesJson}
            onChange={(event) => setState((prev) => ({ ...prev, recipesJson: event.target.value }))}
            className="min-h-[180px] font-mono text-xs"
          />
        </Field>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          disabled={isSaving}
          onClick={() => void handleValidate()}
        >
          {isSaving ? "Working..." : "Validate"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={isSaving}
          onClick={() => void handleSave("update")}
        >
          {isSaving ? "Saving..." : props.pack.kind === "custom" ? "Save pack" : "Save as custom"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={isSaving}
          onClick={() => void handleSave("copy")}
        >
          Save as new pack
        </Button>
        {message ? (
          <div
            className={
              message.kind === "success"
                ? "rounded-[10px] border border-[rgba(163,230,53,0.25)] bg-[rgba(163,230,53,0.08)] px-2.5 py-2 text-xs text-[var(--accent)]"
                : "rounded-[10px] border border-[rgba(251,113,133,0.25)] bg-[rgba(251,113,133,0.08)] px-2.5 py-2 text-xs text-[var(--danger)]"
            }
          >
            {message.text}
          </div>
        ) : null}
      </div>

      {props.pack.kind !== "custom" ? (
        <div className="mt-3 rounded-[10px] border border-[rgba(250,204,21,0.25)] bg-[rgba(250,204,21,0.08)] px-2.5 py-2 text-xs text-[var(--warning)]">
          Seed packs are read-only. Save creates a custom copy instead of patching the source seed.
        </div>
      ) : null}

      {issues.length > 0 ? (
        <div className="mt-3 space-y-2">
          {issues.map((issue, index) => (
            <div
              key={`${issue.path}-${index}`}
              className={
                issue.level === "error"
                  ? "rounded-[10px] border border-[rgba(251,113,133,0.25)] bg-[rgba(251,113,133,0.08)] px-2.5 py-2 text-xs text-[var(--danger)]"
                  : "rounded-[10px] border border-[rgba(250,204,21,0.25)] bg-[rgba(250,204,21,0.08)] px-2.5 py-2 text-xs text-[var(--warning)]"
              }
            >
              <span className="font-semibold">{issue.path}</span>
              <span className="text-text-secondary"> · {issue.message}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-[11px] uppercase tracking-[0.12em] text-text-muted">{props.label}</div>
      {props.children}
    </label>
  );
}

function toFormState(pack: EditablePack | null): FormState {
  return {
    name: pack?.name ?? "",
    description: pack?.description ?? "",
    thesis: pack?.thesis ?? "",
    defaultProfile: pack?.defaultProfile ?? "runtime",
    sourcesCsv: (pack?.defaultSources ?? []).join(", "),
    thresholdOverridesJson: prettyJson(pack?.thresholdOverrides ?? {}),
    recipesJson: prettyJson(pack?.recipes ?? []),
  };
}

function toDraftPayload(state: FormState): DiscoveryLabPackDraft {
  const sources = state.sourcesCsv
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  const thresholdOverrides = parseJsonRecord(state.thresholdOverridesJson, "threshold overrides");
  const recipes = parseJsonArray(state.recipesJson, "recipes");
  const name = state.name.trim();
  if (!name) {
    throw new Error("pack name is required");
  }

  return {
    name,
    description: state.description.trim(),
    thesis: state.thesis.trim() || undefined,
    defaultProfile: state.defaultProfile,
    defaultSources: sources,
    thresholdOverrides,
    recipes,
  };
}

function parseJsonRecord(input: string, label: string): Record<string, unknown> {
  if (!input.trim()) {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    throw new Error(`${label} must be valid JSON`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

function parseJsonArray(input: string, label: string): DiscoveryLabPackDraft["recipes"] {
  if (!input.trim()) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    throw new Error(`${label} must be valid JSON`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON array`);
  }
  return parsed as DiscoveryLabPackDraft["recipes"];
}

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "";
  }
}
