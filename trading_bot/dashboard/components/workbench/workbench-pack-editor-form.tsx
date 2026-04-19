"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

type FieldErrors = Partial<Record<keyof FormState, string>>;

const AUTOSAVE_INTERVAL_MS = 30_000;
const STORAGE_KEY_PREFIX = "workbench-pack-draft-";

export function WorkbenchPackEditorForm(props: { pack: EditablePack | null; className?: string }) {
  const router = useRouter();
  const [state, setState] = useState<FormState>(() => {
    const saved = loadDraft(props.pack?.id);
    return saved ?? toFormState(props.pack);
  });
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [issues, setIssues] = useState<Array<{ path: string; message: string; level: "warning" | "error" }>>([]);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isDirty, setIsDirty] = useState(false);
  const autosaveTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const initialState = toFormState(props.pack);

  useEffect(() => {
    const saved = loadDraft(props.pack?.id);
    setState(saved ?? initialState);
    setMessage(null);
    setIssues([]);
    setFieldErrors({});
    setIsDirty(false);
  }, [props.pack?.id]);

  const saveDraft = useCallback(() => {
    if (!props.pack?.id || !isDirty) return;
    try {
      sessionStorage.setItem(STORAGE_KEY_PREFIX + props.pack.id, JSON.stringify(state));
    } catch {
      // sessionStorage may be unavailable
    }
  }, [props.pack?.id, state, isDirty]);

  useEffect(() => {
    autosaveTimer.current = setInterval(saveDraft, AUTOSAVE_INTERVAL_MS);
    return () => {
      if (autosaveTimer.current) clearInterval(autosaveTimer.current);
    };
  }, [saveDraft]);

  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  function loadDraft(packId: string | undefined): FormState | null {
    if (!packId) return null;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY_PREFIX + packId);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as FormState;
      if (isValidFormState(parsed)) return parsed;
    } catch {
      // ignore malformed storage
    }
    return null;
  }

  function isValidFormState(v: unknown): v is FormState {
    if (!v || typeof v !== "object") return false;
    const keys: (keyof FormState)[] = ["name", "description", "thesis", "defaultProfile", "sourcesCsv", "thresholdOverridesJson", "recipesJson"];
    return keys.every((k) => k in v);
  }

  function validateField(field: keyof FormState, value: string): string | null {
    switch (field) {
      case "name":
        if (!value.trim()) return "Pack name is required";
        return null;
      case "thresholdOverridesJson":
        if (value.trim()) {
          try {
            JSON.parse(value);
          } catch {
            return "Threshold overrides must be valid JSON";
          }
        }
        return null;
      case "recipesJson":
        if (value.trim()) {
          try {
            JSON.parse(value);
          } catch {
            return "Recipes must be valid JSON";
          }
        }
        return null;
      default:
        return null;
    }
  }

  function handleFieldBlur(field: keyof FormState) {
    const error = validateField(field, state[field]);
    setFieldErrors((prev) => ({ ...prev, [field]: error ?? "" }));
  }

  function handleChange(field: keyof FormState, value: string) {
    setState((prev) => ({ ...prev, [field]: value }));
    setIsDirty(true);
    const error = validateField(field, value);
    if (error) {
      setFieldErrors((prev) => ({ ...prev, [field]: error }));
    } else {
      setFieldErrors((prev) => { const { [field]: _, ...rest } = prev; return rest; });
    }
  }

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
      try {
        sessionStorage.removeItem(STORAGE_KEY_PREFIX + props.pack.id);
      } catch {
        // ignore
      }
      setIsDirty(false);
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
        <Field label="Name" error={fieldErrors.name}>
          <Input
            value={state.name}
            onChange={(event) => handleChange("name", event.target.value)}
            onBlur={() => handleFieldBlur("name")}
            placeholder="Pack name"
          />
        </Field>
        <Field label="Default profile">
          <Select
            value={state.defaultProfile}
            onChange={(event) =>
              setState((prev) => {
                setIsDirty(true);
                return { ...prev, defaultProfile: event.target.value as FormState["defaultProfile"] };
              })}
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
            onChange={(event) => handleChange("description", event.target.value)}
            className="min-h-[120px]"
            placeholder="What this pack is trying to do."
          />
        </Field>
        <Field label="Thesis">
          <Textarea
            value={state.thesis}
            onChange={(event) => handleChange("thesis", event.target.value)}
            className="min-h-[120px]"
            placeholder="Optional thesis"
          />
        </Field>
      </div>

      <div className="mt-3">
        <Field label="Sources (comma separated)">
          <Input
            value={state.sourcesCsv}
            onChange={(event) => handleChange("sourcesCsv", event.target.value)}
            placeholder="birdeye-so-tokenlist, birdeye-trending"
          />
        </Field>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Field label="Threshold overrides JSON" error={fieldErrors.thresholdOverridesJson}>
          <Textarea
            value={state.thresholdOverridesJson}
            onChange={(event) => handleChange("thresholdOverridesJson", event.target.value)}
            onBlur={() => handleFieldBlur("thresholdOverridesJson")}
            className="min-h-[180px] font-mono text-xs"
          />
        </Field>
        <Field label="Recipes JSON" error={fieldErrors.recipesJson}>
          <Textarea
            value={state.recipesJson}
            onChange={(event) => handleChange("recipesJson", event.target.value)}
            onBlur={() => handleFieldBlur("recipesJson")}
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

function Field(props: { label: string; children: React.ReactNode; error?: string }) {
  return (
    <label className="block">
      <div className="mb-1 text-[11px] uppercase tracking-[0.12em] text-text-muted">{props.label}</div>
      {props.children}
      {props.error ? (
        <div className="mt-1 text-[11px] text-[var(--danger)]">{props.error}</div>
      ) : null}
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
