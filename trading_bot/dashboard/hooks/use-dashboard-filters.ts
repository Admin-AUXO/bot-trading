"use client";

import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { TradeSource } from "@/lib/api";
import { profilesQueryOptions } from "@/lib/dashboard-query-options";
import {
  ACTIVE_MODE_FILTER,
  ACTIVE_PROFILE_FILTER,
  ALL_TRADE_SOURCE_FILTER,
  useDashboardStore,
} from "@/lib/store";
import { useDashboardShell } from "@/hooks/use-dashboard-shell";

export function useDashboardFilters() {
  const {
    selectedMode,
    setSelectedMode,
    selectedProfile,
    setSelectedProfile,
    selectedStrategy,
    setSelectedStrategy,
    selectedTradeSource,
    setSelectedTradeSource,
  } = useDashboardStore();
  const { activeScope } = useDashboardShell();
  const profilesQuery = useQuery(profilesQueryOptions());
  const profiles = useMemo(() => profilesQuery.data ?? [], [profilesQuery.data]);

  const effectiveMode = (
    selectedMode === ACTIVE_MODE_FILTER
      ? activeScope?.mode
      : selectedMode
  ) ?? "LIVE";

  const effectiveProfile = selectedProfile === ACTIVE_PROFILE_FILTER
    ? activeScope?.configProfile ?? "default"
    : selectedProfile;

  useEffect(() => {
    if (selectedProfile === ACTIVE_PROFILE_FILTER) return;
    const match = profiles.find((profile) => profile.name === selectedProfile);
    if (match && match.mode !== effectiveMode) {
      setSelectedProfile(ACTIVE_PROFILE_FILTER);
    }
  }, [effectiveMode, profiles, selectedProfile, setSelectedProfile]);

  const profileOptions = useMemo(() => {
    return profiles
      .filter((profile) => profile.mode === effectiveMode)
      .sort((left, right) => {
        if (left.isActive === right.isActive) {
          return left.name.localeCompare(right.name);
        }
        return left.isActive ? -1 : 1;
      });
  }, [effectiveMode, profiles]);

  return {
    activeScope,
    effectiveMode,
    effectiveProfile,
    profileOptions,
    profilesLoading: profilesQuery.isLoading,
    selectedMode,
    setSelectedMode,
    selectedProfile,
    setSelectedProfile,
    selectedStrategy,
    setSelectedStrategy,
    selectedTradeSource,
    setSelectedTradeSource,
    resolvedTradeSource:
      selectedTradeSource === ALL_TRADE_SOURCE_FILTER
        ? null
        : selectedTradeSource as TradeSource,
    isUsingActiveMode: selectedMode === ACTIVE_MODE_FILTER,
    isUsingActiveProfile: selectedProfile === ACTIVE_PROFILE_FILTER,
  };
}
