"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CircleCheck, Layers, Plus, ToggleLeft, ToggleRight, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { createProfile, deleteProfile, toggleProfile, updateProfile } from "@/lib/api";
import type { ConfigProfile, DashboardProfileSettings, TradeMode } from "@/lib/api";
import { profileResultsSummariesQueryOptions } from "@/lib/dashboard-query-options";
import { invalidateProfileManagementQueries } from "@/lib/query-invalidation";
import { formatUsd, timeAgo } from "@/lib/utils";
import {
  buildProfileSettingsPayload,
  createEmptyProfileOverrideDraft,
  createProfileOverrideDraft,
  getProfileOverrideTokens,
  type ProfileOverrideDraft,
  type TriStateBoolean,
  validateProfileOverrideDraft,
} from "@/features/settings/profile-overrides";

export function ProfilesSection({
  profiles,
  controlsLocked,
  controlsUnavailable,
  activeScope,
  openPositionCount,
}: {
  profiles: ConfigProfile[];
  controlsLocked: boolean;
  controlsUnavailable: boolean;
  activeScope: { mode: TradeMode; configProfile: string } | null;
  openPositionCount: number;
}) {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newMode, setNewMode] = useState<TradeMode>("DRY_RUN");
  const [editingProfileName, setEditingProfileName] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ProfileOverrideDraft>(createEmptyProfileOverrideDraft());
  const profileResultsSummariesQuery = useQuery(profileResultsSummariesQueryOptions());
  const profileResultsByKey = new Map(
    (profileResultsSummariesQuery.data ?? []).map((summary) => [`${summary.mode}:${summary.profile}`, summary]),
  );

  const invalidateProfileAndRuntimeState = async () => {
    await invalidateProfileManagementQueries(queryClient);
  };

  const createMut = useMutation({
    mutationFn: (data: { name: string; description: string; mode: TradeMode; settings: Record<string, unknown> }) =>
      createProfile(data),
    onSuccess: async () => {
      await invalidateProfileAndRuntimeState();
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ name, settings }: { name: string; settings: DashboardProfileSettings }) =>
      updateProfile(name, settings),
    onSuccess: async () => {
      await invalidateProfileAndRuntimeState();
      setEditingProfileName(null);
      setEditDraft(createEmptyProfileOverrideDraft());
    },
  });

  const toggleMut = useMutation({
    mutationFn: ({ name, active }: { name: string; active: boolean }) => toggleProfile(name, active),
    onSuccess: invalidateProfileAndRuntimeState,
  });

  const deleteMut = useMutation({
    mutationFn: (name: string) => deleteProfile(name),
    onSuccess: invalidateProfileAndRuntimeState,
  });

  const runtimeSwitchBlocked = activeScope != null && openPositionCount > 0;
  const beginEditing = (profile: ConfigProfile) => {
    setEditingProfileName(profile.name);
    setEditDraft(createProfileOverrideDraft(profile));
  };
  const editDraftErrors = validateProfileOverrideDraft(editDraft);

  return (
    <div className="card h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-accent-purple" />
          <span className="stat-label">Config Profiles</span>
          <span className="text-xs text-text-muted">({profiles.length})</span>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          disabled={controlsLocked || controlsUnavailable}
          className="btn-ghost text-xs flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" />
          New
        </button>
      </div>

      {(controlsLocked || controlsUnavailable) && (
        <div className="text-[11px] text-text-muted mb-3">
          {controlsUnavailable
            ? "Profile changes are unavailable until a dashboard operator secret is configured."
            : "Profile changes are locked until operator access is unlocked."}
        </div>
      )}
      {!controlsLocked && !controlsUnavailable && runtimeSwitchBlocked ? (
        <div className="mb-3 rounded-lg border border-accent-yellow/20 bg-accent-yellow/8 px-3 py-2 text-[11px] text-accent-yellow">
          Runtime profile switching stays disabled while {activeScope?.mode}/{activeScope?.configProfile} still has {openPositionCount} open position{openPositionCount === 1 ? "" : "s"}.
        </div>
      ) : null}
      <div className="mb-3 text-[11px] text-text-muted">
        Profiles inherit backend defaults unless they carry overrides. This page now exposes the override summary so a profile cannot silently weaken safety.
      </div>
      <div className="mb-3 text-[11px] text-text-muted">
        Editing the active runtime profile updates the live lane immediately. Leave a field blank to inherit the backend default again.
      </div>

      <AnimatePresence>
        {showCreate && !controlsLocked && !controlsUnavailable && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] as const }}
            className="overflow-hidden"
          >
            <div className="border border-bg-border rounded-lg p-3 mb-4 space-y-2.5">
              <input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="Profile name"
                className="input-base"
              />
              <input
                value={newDesc}
                onChange={(event) => setNewDesc(event.target.value)}
                placeholder="Description (optional)"
                className="input-base"
              />
              <div className="flex items-center gap-2">
                <select
                  value={newMode}
                  onChange={(event) => setNewMode(event.target.value as TradeMode)}
                  className="input-base flex-1"
                >
                  <option value="DRY_RUN">Dry Run</option>
                  <option value="LIVE">Live</option>
                </select>
                <button
                  onClick={() => {
                    if (!newName.trim()) return;
                    toast.promise(
                      createMut.mutateAsync({ name: newName.trim(), description: newDesc, mode: newMode, settings: {} }),
                      {
                        loading: "Creating profile…",
                        success: "Profile created inactive",
                        error: "Failed to create profile",
                      },
                    );
                  }}
                  disabled={controlsLocked || controlsUnavailable || !newName.trim() || createMut.isPending}
                  className="btn-primary text-xs disabled:opacity-30 whitespace-nowrap"
                >
                  Create
                </button>
                <button onClick={() => setShowCreate(false)} className="btn-ghost text-xs">Cancel</button>
              </div>
              <div className="text-[11px] text-text-muted">
                New profiles start by inheriting the backend defaults for this mode. Create first, then use the inline editor below to add or remove overrides.
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-1.5">
        <AnimatePresence>
          {profiles.map((profile) => {
            const results = profileResultsByKey.get(`${profile.mode}:${profile.name}`);
            const overrideTokens = getProfileOverrideTokens(profile);
            const isRuntimeModeProfile = activeScope != null && profile.mode === activeScope.mode;
            const isRuntimeProfile = isRuntimeModeProfile && profile.name === activeScope.configProfile;
            const isEditing = editingProfileName === profile.name;
            const activationBlocked = !profile.isActive && isRuntimeModeProfile && runtimeSwitchBlocked;
            const toggleDisabled =
              controlsLocked
              || controlsUnavailable
              || isRuntimeProfile
              || activationBlocked;
            const toggleTitle = isRuntimeProfile
              ? "Runtime active profile"
              : activationBlocked
                ? "Close runtime positions before switching profiles"
                : profile.isActive
                  ? "Deactivate"
                  : "Activate";

            return (
              <div key={profile.id} className="space-y-1.5">
                <motion.div
                  layout
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8 }}
                  className="flex items-start justify-between gap-3 py-2.5 px-3 rounded-lg border border-bg-border bg-bg-hover/30 hover:bg-bg-hover/60 transition-colors"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    {profile.isActive
                      ? <CircleCheck className="w-3.5 h-3.5 text-accent-green flex-shrink-0 mt-0.5" />
                      : <XCircle className="w-3.5 h-3.5 text-text-muted flex-shrink-0 mt-0.5" />
                    }
                    <div className="min-w-0">
                      <div className="text-sm font-medium flex items-center gap-1.5">
                        <span className="truncate">{profile.name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${
                          profile.mode === "LIVE"
                            ? "bg-accent-green/20 text-accent-green"
                            : "bg-accent-yellow/20 text-accent-yellow"
                        }`}>
                          {profile.mode}
                        </span>
                        {isRuntimeProfile ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 bg-accent-blue/20 text-accent-blue">
                            runtime
                          </span>
                        ) : null}
                      </div>
                      {profile.description && (
                        <div className="text-xs text-text-muted truncate">{profile.description}</div>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-text-muted">
                        <span>Updated {timeAgo(profile.updatedAt)}</span>
                        {profileResultsSummariesQuery.isLoading ? (
                          <span>Loading results…</span>
                        ) : results ? (
                          <>
                            <span>{results.totalTrades} trades</span>
                            <span>{results.totalExits} exits</span>
                            <span>{(results.winRate * 100).toFixed(0)}% win</span>
                            <span className={results.totalPnlUsd >= 0 ? "text-accent-green" : "text-accent-red"}>
                              {formatUsd(results.totalPnlUsd)}
                            </span>
                          </>
                        ) : (
                          <span>No tracked results yet</span>
                        )}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {overrideTokens.length > 0 ? (
                          overrideTokens.map((token) => (
                            <span
                              key={`${profile.id}-${token.label}`}
                              className={`rounded-full px-2 py-0.5 text-[10px] ${
                                token.tone === "safe"
                                  ? "bg-accent-green/12 text-accent-green"
                                  : token.tone === "warn"
                                    ? "bg-accent-red/12 text-accent-red"
                                    : "bg-bg-border text-text-secondary"
                              }`}
                            >
                              {token.label}
                            </span>
                          ))
                        ) : (
                          <span className="rounded-full bg-bg-border px-2 py-0.5 text-[10px] text-text-muted">
                            inherits defaults
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => {
                        if (isEditing) {
                          setEditingProfileName(null);
                          setEditDraft(createEmptyProfileOverrideDraft());
                          return;
                        }
                        beginEditing(profile);
                      }}
                      disabled={controlsLocked || controlsUnavailable || updateMut.isPending}
                      className="btn-ghost px-2 py-1 text-[11px]"
                      title={isEditing ? "Close editor" : "Edit overrides"}
                    >
                      {isEditing ? "Close" : "Edit"}
                    </button>
                    <button
                      onClick={() => {
                        const nextActive = !profile.isActive;
                        const loadingLabel = nextActive ? "Activating profile…" : "Deactivating profile…";
                        const successLabel = nextActive ? "Profile activated" : "Profile deactivated";
                        const fallbackError = nextActive ? "Failed to activate profile" : "Failed to deactivate profile";

                        toast.promise(
                          toggleMut.mutateAsync({ name: profile.name, active: nextActive }).catch(async (error) => {
                            throw new Error(await extractApiErrorMessage(error, fallbackError));
                          }),
                          {
                            loading: loadingLabel,
                            success: successLabel,
                            error: (error) => error instanceof Error ? error.message : fallbackError,
                          },
                        );
                      }}
                      disabled={toggleDisabled}
                      className="btn-ghost p-1.5"
                      title={toggleTitle}
                    >
                      {profile.isActive
                        ? <ToggleRight className="w-4 h-4 text-accent-green" />
                        : <ToggleLeft className="w-4 h-4 text-text-muted" />
                      }
                    </button>
                    {profile.name !== "default" ? (
                      <button
                        onClick={() => toast.promise(
                          deleteMut.mutateAsync(profile.name).catch(async (error) => {
                            throw new Error(await extractApiErrorMessage(error, "Failed to delete profile"));
                          }),
                          {
                            loading: "Deleting…",
                            success: "Profile deleted",
                            error: (error) => error instanceof Error ? error.message : "Failed to delete profile",
                          },
                        )}
                        disabled={controlsLocked || controlsUnavailable || profile.isActive}
                        className="btn-ghost p-1.5 text-accent-red/60 hover:text-accent-red"
                        title={profile.isActive ? "Activate another profile before deleting this one" : "Delete"}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    ) : null}
                  </div>
                </motion.div>
                {isEditing ? (
                  <ProfileEditor
                    profile={profile}
                    activeScope={activeScope}
                    draft={editDraft}
                    errors={editDraftErrors}
                    disabled={controlsLocked || controlsUnavailable || updateMut.isPending}
                    isSaving={updateMut.isPending}
                    onCancel={() => {
                      setEditingProfileName(null);
                      setEditDraft(createEmptyProfileOverrideDraft());
                    }}
                    onChange={setEditDraft}
                    onSave={() => {
                      const settings = buildProfileSettingsPayload(editDraft);
                      toast.promise(
                        updateMut.mutateAsync({ name: profile.name, settings }).catch(async (error) => {
                          throw new Error(await extractApiErrorMessage(error, "Failed to save profile overrides"));
                        }),
                        {
                          loading: "Saving overrides…",
                          success: activeScope && profile.name === activeScope.configProfile && profile.mode === activeScope.mode
                            ? "Overrides saved and applied to runtime"
                            : "Overrides saved",
                          error: (error) => error instanceof Error ? error.message : "Failed to save profile overrides",
                        },
                      );
                    }}
                  />
                ) : null}
              </div>
            );
          })}
        </AnimatePresence>
        {profiles.length === 0 ? (
          <div className="text-text-muted text-sm py-4 text-center">No profiles yet</div>
        ) : null}
      </div>
    </div>
  );
}

function ProfileEditor({
  profile,
  activeScope,
  draft,
  errors,
  disabled,
  isSaving,
  onCancel,
  onChange,
  onSave,
}: {
  profile: ConfigProfile;
  activeScope: { mode: TradeMode; configProfile: string } | null;
  draft: ProfileOverrideDraft;
  errors: string[];
  disabled: boolean;
  isSaving: boolean;
  onCancel: () => void;
  onChange: React.Dispatch<React.SetStateAction<ProfileOverrideDraft>>;
  onSave: () => void;
}) {
  return (
    <motion.div
      key={`${profile.id}-editor`}
      initial={{ opacity: 0, height: 0, y: -4 }}
      animate={{ opacity: 1, height: "auto", y: 0 }}
      exit={{ opacity: 0, height: 0, y: -4 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] as const }}
      className="overflow-hidden rounded-lg border border-bg-border bg-bg-hover/20 px-3 py-3"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-text-primary">Edit {profile.name} Overrides</div>
          <div className="text-[11px] text-text-muted">
            {profile.mode} profile
            {activeScope && profile.name === activeScope.configProfile && profile.mode === activeScope.mode
              ? " · runtime-active changes apply immediately"
              : " · inactive changes apply on activation"}
          </div>
        </div>
        <button onClick={onCancel} className="btn-ghost px-2 py-1 text-[11px]">
          Cancel
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <div className="space-y-3">
          <div className="rounded-lg border border-bg-border bg-bg-card/50 p-3">
            <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-text-muted">Global</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <LabeledInput
                label="Capital USD"
                value={draft.capitalUsd}
                onChange={(value) => onChange((current) => ({ ...current, capitalUsd: value }))}
                placeholder="inherit"
              />
              <LabeledInput
                label="Daily Loss %"
                value={draft.dailyLossPercent}
                onChange={(value) => onChange((current) => ({ ...current, dailyLossPercent: value }))}
                placeholder="inherit"
              />
              <LabeledInput
                label="Weekly Loss %"
                value={draft.weeklyLossPercent}
                onChange={(value) => onChange((current) => ({ ...current, weeklyLossPercent: value }))}
                placeholder="inherit"
              />
            </div>
          </div>

          <div className="rounded-lg border border-bg-border bg-bg-card/50 p-3">
            <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-accent-blue">S1 Copy</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <LabeledInput
                label="Position Size SOL"
                value={draft.s1.positionSizeSol}
                onChange={(value) => onChange((current) => ({
                  ...current,
                  s1: { ...current.s1, positionSizeSol: value },
                }))}
                placeholder="inherit"
              />
              <LabeledInput
                label="Max Slippage Bps"
                value={draft.s1.maxSlippageBps}
                onChange={(value) => onChange((current) => ({
                  ...current,
                  s1: { ...current.s1, maxSlippageBps: value },
                }))}
                placeholder="inherit"
              />
              <LabeledInput
                label="Max Source Tx Age (s)"
                value={draft.s1.maxSourceTxAgeSeconds}
                onChange={(value) => onChange((current) => ({
                  ...current,
                  s1: { ...current.s1, maxSourceTxAgeSeconds: value },
                }))}
                placeholder="inherit"
              />
              <LabeledSelect
                label="LIVE Trade Data"
                value={draft.s1.requireTradeDataInLive}
                onChange={(value) => onChange((current) => ({
                  ...current,
                  s1: { ...current.s1, requireTradeDataInLive: value as TriStateBoolean },
                }))}
                options={[
                  { value: "inherit", label: "Inherit" },
                  { value: "true", label: "Required" },
                  { value: "false", label: "Soft-fail" },
                ]}
              />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-lg border border-bg-border bg-bg-card/50 p-3">
            <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-accent-purple">S2 Graduation</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <LabeledInput
                label="Position Size SOL"
                value={draft.s2.positionSizeSol}
                onChange={(value) => onChange((current) => ({
                  ...current,
                  s2: { ...current.s2, positionSizeSol: value },
                }))}
                placeholder="inherit"
              />
              <LabeledInput
                label="Max Slippage Bps"
                value={draft.s2.maxSlippageBps}
                onChange={(value) => onChange((current) => ({
                  ...current,
                  s2: { ...current.s2, maxSlippageBps: value },
                }))}
                placeholder="inherit"
              />
              <LabeledInput
                label="Min Unique Holders"
                value={draft.s2.minUniqueHolders}
                onChange={(value) => onChange((current) => ({
                  ...current,
                  s2: { ...current.s2, minUniqueHolders: value },
                }))}
                placeholder="inherit"
              />
              <LabeledInput
                label="Max Graduation Age (s)"
                value={draft.s2.maxGraduationAgeAtEntrySeconds}
                onChange={(value) => onChange((current) => ({
                  ...current,
                  s2: { ...current.s2, maxGraduationAgeAtEntrySeconds: value },
                }))}
                placeholder="inherit"
              />
              <LabeledSelect
                label="LIVE Trade Data"
                value={draft.s2.requireTradeDataInLive}
                onChange={(value) => onChange((current) => ({
                  ...current,
                  s2: { ...current.s2, requireTradeDataInLive: value as TriStateBoolean },
                }))}
                options={[
                  { value: "inherit", label: "Inherit" },
                  { value: "true", label: "Required" },
                  { value: "false", label: "Soft-fail" },
                ]}
              />
            </div>
          </div>

          <div className="rounded-lg border border-bg-border bg-bg-card/50 p-3">
            <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-accent-cyan">S3 Momentum</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <LabeledInput
                label="Position Size SOL"
                value={draft.s3.positionSizeSol}
                onChange={(value) => onChange((current) => ({
                  ...current,
                  s3: { ...current.s3, positionSizeSol: value },
                }))}
                placeholder="inherit"
              />
              <LabeledInput
                label="Max Slippage Bps"
                value={draft.s3.maxSlippageBps}
                onChange={(value) => onChange((current) => ({
                  ...current,
                  s3: { ...current.s3, maxSlippageBps: value },
                }))}
                placeholder="inherit"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="text-[11px] text-text-muted">
            Blank fields remove the override and fall back to backend defaults.
          </div>
          {errors.length > 0 ? (
            <div className="text-[11px] text-accent-red">
              {errors[0]}
            </div>
          ) : null}
        </div>
        <button
          onClick={onSave}
          disabled={disabled || errors.length > 0}
          className="btn-primary px-3 py-1.5 text-xs disabled:opacity-30"
        >
          {isSaving ? "Saving…" : "Save Overrides"}
        </button>
      </div>
    </motion.div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="space-y-1">
      <span className="text-[10px] uppercase tracking-[0.14em] text-text-muted">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="input-base h-9 text-sm"
      />
    </label>
  );
}

function LabeledSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="space-y-1">
      <span className="text-[10px] uppercase tracking-[0.14em] text-text-muted">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="input-base h-9 text-sm"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

async function extractApiErrorMessage(error: unknown, fallback: string): Promise<string> {
  if (error && typeof error === "object" && "response" in error) {
    const response = (error as { response?: Response }).response;
    if (response) {
      const payload = await response.clone().json().catch(() => null) as { error?: unknown } | null;
      if (payload && typeof payload.error === "string" && payload.error.length > 0) {
        return payload.error;
      }
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}
