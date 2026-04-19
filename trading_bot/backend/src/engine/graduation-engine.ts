import { CandidateStatus, type Candidate } from "@prisma/client";
import { db } from "../db/client.js";
import { env } from "../config/env.js";
import { BirdeyeClient } from "../services/birdeye-client.js";
import { HeliusClient } from "../services/helius-client.js";
import { ProviderBudgetService } from "../services/provider-budget-service.js";
import { RuntimeConfigService } from "../services/runtime-config.js";
import { AdaptiveContextBuilder } from "../services/adaptive/adaptive-context-builder.js";
import { AdaptiveThresholdService } from "../services/adaptive/adaptive-threshold-service.js";
import { SharedTokenFactsService, type FreshTokenFacts } from "../services/shared-token-facts.js";
import { buildSignalConfidence, deriveExitProfile, scoreEntrySignal } from "../services/entry-scoring.js";
import { FAIR_VALUE_ENTRY_PREMIUM_CAP } from "../services/strategy-exit.js";
import {
  applyStrategySettings,
  derivePresetIdFromRecipeMode,
  getLiveStrategyRecipes,
  getStrategyPreset,
  getStrategyPresetForMode,
  hasLiveStrategy,
  type StrategyDiscoveryRecipe,
} from "../services/strategy-presets.js";
import { recordTokenSnapshot } from "../services/token-snapshot-recorder.js";
import { toOptionalDate } from "../utils/dates.js";
import { ExecutionEngine } from "./execution-engine.js";
import { RiskEngine } from "./risk-engine.js";
import type {
  BotSettings,
  CandidateEvaluation,
  CandidateFilterState,
  DiscoveryToken,
  StrategyPackRecipe,
  StrategyPresetId,
} from "../types/domain.js";
import { toJsonValue } from "../utils/json.js";
import { logger } from "../utils/logger.js";

const DUE_CANDIDATE_STATUSES: CandidateStatus[] = ["DISCOVERED", "SKIPPED", "ERROR"];
const ACTIVE_CANDIDATE_STATUSES: CandidateStatus[] = ["DISCOVERED", "SKIPPED", "ERROR", "ACCEPTED", "BOUGHT"];
const EVALUATION_POOL_MULTIPLIER = 6;

type DiscoveryCandidateSeed = {
  token: DiscoveryToken;
  strategyPresetId: StrategyPresetId;
  discoveryRecipeName: string;
  metadata?: {
    stage?: string;
    strategyPresetId?: StrategyPresetId;
    strategyRecipeName?: string;
    liveStrategyPackId?: string | null;
    liveStrategyRunId?: string | null;
  };
};

export class GraduationEngine {
  private discoveryInFlight = false;
  private evaluationInFlight = false;
  private readonly sharedFacts = new SharedTokenFactsService();

  constructor(
    private readonly birdeye: BirdeyeClient,
    private readonly helius: HeliusClient,
    private readonly execution: ExecutionEngine,
    private readonly risk: RiskEngine,
    private readonly config: RuntimeConfigService,
    private readonly adaptiveContextBuilder: AdaptiveContextBuilder,
    private readonly adaptiveThresholds: AdaptiveThresholdService,
    private readonly providerBudget: ProviderBudgetService,
  ) {}

  async getResearchDiscoveryTokens(limit: number): Promise<DiscoveryToken[]> {
    const settings = await this.config.getSettings();
    const preset = getStrategyPresetForMode(settings, "DRY_RUN");
    return this.fetchDiscoveryTokens(settings, preset.discovery, limit, false, "tradable");
  }

  async evaluateResearchToken(
    token: DiscoveryToken,
    settingsOverride?: Awaited<ReturnType<RuntimeConfigService["getSettings"]>>,
  ): Promise<CandidateEvaluation> {
    const settings = settingsOverride ?? await this.config.getSettings();
    return this.evaluateCandidate(
      token.mint,
      token as unknown as Record<string, unknown>,
      settings,
      settings.strategy.dryRunPresetId,
    );
  }

  scoreDiscoveryToken(
    token: DiscoveryToken,
    settings: Awaited<ReturnType<RuntimeConfigService["getSettings"]>>,
    presetId = settings.strategy.dryRunPresetId,
  ): number {
    const effectiveSettings = applyStrategySettings(settings, presetId);
    const discoveryState = this.toDiscoveryFilterState(token);
    return this.scoreFilterState(discoveryState, effectiveSettings, {
      graduatedAt: token.graduatedAt,
      source: token.source,
    });
  }

  async discover(): Promise<void> {
    if (this.discoveryInFlight) return;
    this.discoveryInFlight = true;

    try {
      const settings = await this.config.getSettings();
      const preset = getStrategyPresetForMode(settings, "LIVE");
      const discoverySeeds = hasLiveStrategy(settings)
        ? await this.fetchDiscoverySeedsFromLiveStrategy(
          settings,
          getLiveStrategyRecipes(settings),
          settings.cadence.evaluationConcurrency * 20,
          true,
        )
        : (await this.fetchDiscoveryTokens(
          settings,
          preset.discovery,
          settings.cadence.evaluationConcurrency * 20,
          true,
        )).map((token) => ({
          token,
          strategyPresetId: preset.id,
          discoveryRecipeName: preset.discovery.name,
          metadata: {
            stage: "discovered",
            strategyPresetId: preset.id,
            strategyRecipeName: preset.discovery.name,
          },
        }));

      await Promise.all(discoverySeeds.map(async (seed) => {
        const { token, strategyPresetId, discoveryRecipeName } = seed;
        const discoveryState = this.toDiscoveryFilterState(token);
        const seedMetadata = seed.metadata as { liveStrategyRunId?: string | null; liveStrategyPackId?: string | null } | undefined;
        const liveStrategyRunId = seedMetadata?.liveStrategyRunId ?? undefined;
        const liveStrategyPackId = seedMetadata?.liveStrategyPackId ?? undefined;
        const created = await db.candidate.create({
          data: {
            mint: token.mint,
            symbol: token.symbol,
            name: token.name,
            source: token.source,
            strategyPresetId,
            discoveryRecipeName,
            creator: token.creator,
            status: "DISCOVERED",
            discoveredAt: new Date(),
            graduatedAt: toOptionalDate(token.graduatedAt),
            liveStrategyRunId,
            liveStrategyPackId,
            ...this.toCandidateData(discoveryState, false),
            scheduledEvaluationAt: new Date(Date.now() + settings.cadence.entryDelayMs),
            metadata: this.mergeCandidateMetadata(null, {
              stage: "discovered",
              strategyPresetId,
              strategyRecipeName: discoveryRecipeName,
              discoveryFilterState: discoveryState,
              discoveryToken: token,
            }),
          },
        });

        await recordTokenSnapshot({
          candidateId: created.id,
          mint: token.mint,
          symbol: token.symbol,
          trigger: "discovery",
          ...discoveryState,
          metadata: token,
        });
      }));

      await this.risk.touchActivity("lastDiscoveryAt");
    } finally {
      this.discoveryInFlight = false;
    }
  }

  private async fetchDiscoverySeedsFromLiveStrategy(
    settings: Awaited<ReturnType<RuntimeConfigService["getSettings"]>>,
    recipes: StrategyPackRecipe[],
    limit: number,
    excludeExistingMints: boolean,
  ): Promise<DiscoveryCandidateSeed[]> {
    const sources = settings.strategy.liveStrategy.sources.length > 0
      ? [...new Set(settings.strategy.liveStrategy.sources)]
      : env.DISCOVERY_SOURCES.includes("all")
        ? ["all"]
        : [...new Set(env.DISCOVERY_SOURCES)];
    const discoveryBudget = await this.providerBudget.canSpend("discovery", sources.length * recipes.length * 100);
    if (!discoveryBudget.allowed) {
      logger.warn({ reason: discoveryBudget.reason }, "custom live discovery skipped to preserve Birdeye monthly budget");
      return [];
    }

    const seeds = new Map<string, DiscoveryCandidateSeed>();
    const sourceRecipePairs = sources.flatMap((source) => recipes.map((recipe) => ({ source, recipe })));
    const groups = await Promise.all(sourceRecipePairs.map(async ({ source, recipe }) => {
      const rows: DiscoveryToken[] = await this.birdeye.getMemeTokensForRecipe({
        recipeParams: recipe.params,
        source,
        mode: recipe.mode,
        limit: Math.min(limit, recipe.deepEvalLimit ?? limit),
      });
      return rows.map((token: DiscoveryToken) => ({
        token,
        strategyPresetId: derivePresetIdFromRecipeMode(recipe.mode),
        discoveryRecipeName: recipe.name,
          metadata: {
            stage: "discovered",
            strategyPresetId: derivePresetIdFromRecipeMode(recipe.mode),
            strategyRecipeName: recipe.name,
            liveStrategyPackId: settings.strategy.liveStrategy.packId ?? undefined,
            liveStrategyRunId: settings.strategy.liveStrategy.sourceRunId ?? undefined,
          },
      } satisfies DiscoveryCandidateSeed));
    }));

    for (const seed of groups.flat()) {
      if (!seeds.has(seed.token.mint)) {
        seeds.set(seed.token.mint, seed);
      }
    }

    const tokens = [...seeds.values()];
    await Promise.all(tokens.map((seed) => this.sharedFacts.rememberDiscovery(seed.token)));

    if (!excludeExistingMints || tokens.length === 0) {
      return tokens;
    }

    const existingMints = new Set(
      (
        await db.candidate.findMany({
          where: {
            mint: { in: tokens.map((seed) => seed.token.mint) },
            status: { in: ACTIVE_CANDIDATE_STATUSES },
          },
          select: { mint: true },
        })
      ).map((row) => row.mint),
    );

    return tokens.filter((seed) => !existingMints.has(seed.token.mint));
  }

  private async fetchDiscoveryTokens(
    settings: Awaited<ReturnType<RuntimeConfigService["getSettings"]>>,
    recipe: StrategyDiscoveryRecipe,
    limit: number,
    excludeExistingMints: boolean,
    sourceMode: "configured" | "all" | "tradable" = "configured",
  ): Promise<DiscoveryToken[]> {
    const nowUnix = Math.floor(Date.now() / 1000);
    const minGraduatedTime = recipe.graduatedWithinSeconds
      ? nowUnix - recipe.graduatedWithinSeconds
      : nowUnix - env.DISCOVERY_LOOKBACK_SECONDS;
    const minLastTradeTime = recipe.minLastTradeSeconds
      ? nowUnix - recipe.minLastTradeSeconds
      : env.DISCOVERY_QUERY_MIN_LAST_TRADE_SECONDS > 0
      ? nowUnix - env.DISCOVERY_QUERY_MIN_LAST_TRADE_SECONDS
      : null;
    const discoverySources = sourceMode === "all"
      ? ["all"]
      : sourceMode === "tradable"
      ? env.TRADABLE_SOURCES.includes("all")
        ? ["all"]
        : [...new Set(env.TRADABLE_SOURCES)]
      : env.DISCOVERY_SOURCES.includes("all")
      ? ["all"]
      : [...new Set(env.DISCOVERY_SOURCES)];
    const discoveryBudget = await this.providerBudget.canSpend("discovery", discoverySources.length * 100);
    if (!discoveryBudget.allowed) {
      logger.warn({ reason: discoveryBudget.reason }, "discovery skipped to preserve Birdeye monthly budget");
      return [];
    }

    const fetchedGroups = await Promise.all(discoverySources.map((source) => this.birdeye.getMemeTokens({
      source,
      graduated: recipe.mode === "graduated",
      minGraduatedTime: recipe.mode === "graduated" ? minGraduatedTime : undefined,
      minProgressPercent: recipe.mode === "pregrad" ? recipe.minProgressPercent : undefined,
      limit: Math.min(limit, recipe.limit ?? limit),
      minLiquidityUsd: recipe.minLiquidityUsd ?? env.DISCOVERY_QUERY_MIN_LIQUIDITY_USD,
      minVolume5mUsd: env.DISCOVERY_QUERY_MIN_VOLUME_5M_USD,
      minHolders: env.DISCOVERY_QUERY_MIN_HOLDERS,
      minLastTradeTime,
      minTrades1m: recipe.minTrades1m,
      minTrades5m: recipe.minTrades5m,
      sortBy: recipe.sortBy || env.DISCOVERY_SORT_BY,
      sortType: recipe.sortType || env.DISCOVERY_SORT_TYPE,
    })));
    const tokens = [...new Map(
      fetchedGroups
        .flat()
        .sort((left, right) => this.compareDiscoveryTokens(left, right, recipe.sortBy, recipe.sortType))
        .map((token) => [token.mint, token] as const),
    ).values()];
    await Promise.all(tokens.map((token) => this.sharedFacts.rememberDiscovery(token)));

    if (!excludeExistingMints || tokens.length === 0) {
      return tokens;
    }

    const existingMints = new Set(
      (
        await db.candidate.findMany({
          where: {
            mint: { in: tokens.map((token) => token.mint) },
            status: { in: ACTIVE_CANDIDATE_STATUSES },
          },
          select: { mint: true },
        })
      ).map((row) => row.mint),
    );

    return tokens.filter((token) => !existingMints.has(token.mint));
  }

  private compareDiscoveryTokens(
    left: DiscoveryToken,
    right: DiscoveryToken,
    sortBy = env.DISCOVERY_SORT_BY,
    sortType: "asc" | "desc" = env.DISCOVERY_SORT_TYPE,
  ): number {
    const direction = sortType === "asc" ? 1 : -1;
    const leftValue = this.readDiscoverySortValue(left, sortBy);
    const rightValue = this.readDiscoverySortValue(right, sortBy);

    if (leftValue === rightValue) {
      return ((right.lastTradeAt ?? 0) - (left.lastTradeAt ?? 0))
        || ((right.volume5mUsd ?? 0) - (left.volume5mUsd ?? 0))
        || ((right.graduatedAt ?? 0) - (left.graduatedAt ?? 0));
    }

    return leftValue > rightValue ? direction : -direction;
  }

  private readDiscoverySortValue(token: DiscoveryToken, sortBy = env.DISCOVERY_SORT_BY): number {
    switch (sortBy) {
      case "trade_1m_count":
        return token.trades1m ?? 0;
      case "last_trade_unix_time":
        return token.lastTradeAt ?? 0;
      case "volume_1m_usd":
        return token.volume1mUsd ?? 0;
      case "volume_5m_usd":
        return token.volume5mUsd ?? 0;
      case "trade_5m_count":
        return token.trades5m ?? 0;
      case "recent_listing_time":
        return token.recentListingAt ?? token.creationAt ?? 0;
      case "graduated_time":
      default:
        return token.graduatedAt ?? 0;
    }
  }

  async evaluateDueCandidates(): Promise<void> {
    if (this.evaluationInFlight) return;
    this.evaluationInFlight = true;

    try {
      const settings = await this.config.getSettings();
      const adaptiveContext = settings.strategy.liveStrategy.enabled
        ? await this.adaptiveContextBuilder.buildContext()
        : null;
      const candidates = await db.candidate.findMany({
        where: {
          status: { in: DUE_CANDIDATE_STATUSES },
          scheduledEvaluationAt: { lte: new Date() },
        },
        include: { latestMetrics: true },
        orderBy: { scheduledEvaluationAt: "asc" },
        take: settings.cadence.evaluationConcurrency * EVALUATION_POOL_MULTIPLIER,
      });

      if (candidates.length === 0) {
        return;
      }

      const rankedCandidates = candidates
        .map((candidate) => ({
          candidate,
          score: this.scoreCandidate(candidate, settings),
        }))
        .sort((left, right) => right.score - left.score)
        .slice(0, settings.cadence.evaluationConcurrency)
        .map(({ candidate }) => candidate);

      const capacity = await this.risk.canOpenPosition(settings);
      if (!capacity.allowed) {
        await this.deferCandidates(
          candidates,
          capacity.retryable ? "SKIPPED" : "ERROR",
          capacity.reason ?? "risk blocked entry",
          settings.cadence.evaluationIntervalMs,
        );
        await this.risk.touchActivity("lastEvaluationAt");
        return;
      }

      for (const candidate of rankedCandidates) {
        try {
          const adaptiveMutation = adaptiveContext
            ? await this.adaptiveThresholds.mutateFilters(settings, adaptiveContext, {
                candidateId: candidate.id,
                packId: candidate.liveStrategyPackId ?? settings.strategy.liveStrategy.packId,
              })
            : null;
          const evaluation = await this.evaluateCandidate(
            candidate.mint,
            candidate.latestMetrics?.metadata as Record<string, unknown> | null,
            settings,
            candidate.strategyPresetId as StrategyPresetId,
            adaptiveMutation,
          );
          if (evaluation.deferReason) {
            await db.candidate.update({
              where: { id: candidate.id },
              data: {
                status: "SKIPPED",
                rejectReason: evaluation.deferReason,
                lastEvaluatedAt: new Date(),
                scheduledEvaluationAt: new Date(Date.now() + settings.cadence.evaluationIntervalMs),
                strategyPresetId: candidate.strategyPresetId,
                ...this.toCandidateData(evaluation.filterState, true),
                metadata: this.mergeCandidateMetadata(candidate.metadata, {
                  evaluationState: "deferred",
                  latestFilterState: evaluation.filterState,
                  latestEvaluation: evaluation.metrics,
                }),
              },
            });
            continue;
          }

          if (!evaluation.passed) {
            await db.candidate.update({
              where: { id: candidate.id },
              data: {
                status: "REJECTED",
                rejectReason: evaluation.rejectReason ?? "rejected",
                lastEvaluatedAt: new Date(),
                strategyPresetId: candidate.strategyPresetId,
                ...this.toCandidateData(evaluation.filterState, true),
                metadata: this.mergeCandidateMetadata(candidate.metadata, {
                  evaluationState: "rejected",
                  latestFilterState: evaluation.filterState,
                  latestEvaluation: evaluation.metrics,
                }),
              },
            });
            await recordTokenSnapshot({
              candidateId: candidate.id,
              mint: candidate.mint,
              symbol: candidate.symbol,
              trigger: "evaluation_reject",
              ...evaluation.filterState,
              metadata: evaluation.metrics,
              securityRisk: evaluation.rejectReason ?? null,
            });
            continue;
          }

          const effectiveSource = candidate.source || evaluation.filterState.source || "unknown";
          if (!this.isTradableSource(effectiveSource)) {
            await recordTokenSnapshot({
              candidateId: candidate.id,
              mint: candidate.mint,
              symbol: candidate.symbol,
              trigger: "evaluation_paper",
              ...evaluation.filterState,
              metadata: {
                ...evaluation.metrics,
                paperOnlySource: effectiveSource,
              },
            });

            await db.candidate.update({
              where: { id: candidate.id },
              data: {
                status: "REJECTED",
                rejectReason: `paper-only source: ${effectiveSource}`,
                lastEvaluatedAt: new Date(),
                strategyPresetId: candidate.strategyPresetId,
                ...this.toCandidateData(evaluation.filterState, true),
                metadata: this.mergeCandidateMetadata(candidate.metadata, {
                  evaluationState: "paper_only",
                  latestFilterState: evaluation.filterState,
                  latestEvaluation: {
                    ...evaluation.metrics,
                    paperOnlySource: effectiveSource,
                  },
                }),
              },
            });
            continue;
          }

          await recordTokenSnapshot({
            candidateId: candidate.id,
            mint: candidate.mint,
            symbol: candidate.symbol,
            trigger: "evaluation_accept",
            ...evaluation.filterState,
            metadata: evaluation.metrics,
          });

          await db.candidate.update({
            where: { id: candidate.id },
            data: {
              status: "ACCEPTED",
              acceptedAt: new Date(),
              lastEvaluatedAt: new Date(),
              rejectReason: null,
              strategyPresetId: candidate.strategyPresetId,
              entryOrigin: "runtime_auto_entry",
              liveStrategyRunId: this.readMetricString(evaluation.metrics, "liveStrategyRunId") ?? candidate.liveStrategyRunId,
              liveStrategyPackId: this.readMetricString(evaluation.metrics, "liveStrategyPackId") ?? candidate.liveStrategyPackId,
              discoveryLabRunId: this.readMetricString(evaluation.metrics, "discoveryLabRunId"),
              ...this.toCandidateData(evaluation.filterState, true),
              metadata: this.mergeCandidateMetadata(candidate.metadata, {
                evaluationState: "accepted",
                latestFilterState: evaluation.filterState,
                latestEvaluation: evaluation.metrics,
                entryScore: this.readMetricNumber(evaluation.metrics, "entryScore"),
                confidenceScore: this.readMetricNumber(evaluation.metrics, "confidenceScore"),
                exitProfile: this.readMetricString(evaluation.metrics, "exitProfile"),
                discoveryLabPackId: this.readMetricString(evaluation.metrics, "discoveryLabPackId"),
              }),
            },
          });

          const positionId = await this.execution.openPosition({
            candidateId: candidate.id,
            mint: candidate.mint,
            symbol: candidate.symbol,
            entryPriceUsd: evaluation.entryPriceUsd!,
            metrics: {
              ...evaluation.metrics,
              strategyPresetId: candidate.strategyPresetId,
            },
          });

          logger.info({ mint: candidate.mint, positionId, tradeMode: settings.tradeMode }, "candidate promoted to position");
        } catch (error) {
          const isOpenConflict = ExecutionEngine.isOpenPositionConflict(error);
          await db.candidate.update({
            where: { id: candidate.id },
            data: {
              status: isOpenConflict ? "SKIPPED" : "ERROR",
              rejectReason: error instanceof Error ? error.message : String(error),
              lastEvaluatedAt: new Date(),
              scheduledEvaluationAt: new Date(Date.now() + settings.cadence.evaluationIntervalMs),
            },
          });
        }
      }

      await this.risk.touchActivity("lastEvaluationAt");
    } finally {
      this.evaluationInFlight = false;
    }
  }

  private async evaluateCandidate(
    mint: string,
    baselineMetrics: Record<string, unknown> | null,
    settings: Awaited<ReturnType<RuntimeConfigService["getSettings"]>>,
    strategyPresetId: StrategyPresetId,
    adaptiveMutation?: {
      filters: BotSettings["filters"];
      entryScoreFloor: number | null;
      filterMult: number;
    } | null,
  ): Promise<CandidateEvaluation> {
    const preset = getStrategyPreset(strategyPresetId);
    const effectiveSettings = applyStrategySettings(settings, strategyPresetId);
    if (adaptiveMutation) {
      effectiveSettings.filters = adaptiveMutation.filters;
    }
    const baseline = this.extractBaselineDiscovery(baselineMetrics);
    const baselineMerged = this.mergeDiscoveryMetrics(null, baselineMetrics);
    const baselineFilterState: CandidateFilterState = {
      ...baselineMerged,
      priceUsd: baselineMerged.priceUsd,
    };
    const shouldRefreshDetail = this.readBoolean(baseline, "graduated") !== true
      || this.readNumber(baseline, "graduatedAt") === null
      || this.readString(baseline, "source") === null;
    const cachedFacts = await this.sharedFacts.getFreshFacts(mint);
    const projectedEvaluationUnits = (shouldRefreshDetail && !cachedFacts.detail ? 30 : 0)
      + (cachedFacts.tradeData ? 0 : 15);
    const evaluationBudget = await this.providerBudget.canSpend(
      "evaluation",
      projectedEvaluationUnits,
    );
    if (!evaluationBudget.allowed) {
      return {
        passed: false,
        deferReason: evaluationBudget.reason ?? "evaluation lane budget pacing blocked",
        metrics: {
          ...(baselineMetrics ?? {}),
          strategyPresetId,
          strategyRecipeName: preset.discovery.name,
          budget: evaluationBudget.snapshot,
        },
        filterState: baselineFilterState,
      };
    }

    const [detail, mintAuthorities] = await Promise.all([
      this.getDetailWithCache(mint, shouldRefreshDetail, cachedFacts.detail),
      this.getMintAuthoritiesWithCache(mint, cachedFacts.mintAuthorities),
    ]);

    const metrics: Record<string, unknown> = {
      ...(baselineMetrics ?? {}),
      strategyPresetId,
      strategyLabel: preset.label,
      strategyRecipeName: preset.discovery.name,
      adaptiveFilterMult: adaptiveMutation?.filterMult ?? null,
      adaptiveEntryScoreFloor: adaptiveMutation?.entryScoreFloor ?? null,
      detail,
      mintAuthorities,
    };

    const merged = this.mergeDiscoveryMetrics(detail, baselineMetrics);
    const baseFilterState: CandidateFilterState = {
      ...merged,
      priceUsd: merged.priceUsd,
    };

    const graduated = detail?.graduated ?? this.readBoolean(baseline, "graduated");
    if (preset.discovery.mode === "graduated") {
      if (!graduated || !merged.graduatedAt) {
        return { passed: false, rejectReason: "token is not confirmed as graduated", metrics, filterState: baseFilterState };
      }

      const ageSeconds = Math.floor(Date.now() / 1000) - merged.graduatedAt;
      metrics.ageSeconds = ageSeconds;
      baseFilterState.graduationAgeSeconds = ageSeconds;
      if (ageSeconds > effectiveSettings.filters.maxGraduationAgeSeconds) {
        return { passed: false, rejectReason: `graduation too old: ${ageSeconds}s`, metrics, filterState: baseFilterState };
      }
    } else {
      const progressPercent = merged.progressPercent ?? 0;
      metrics.progressPercent = progressPercent;
      if (graduated) {
        return { passed: false, rejectReason: "already graduated during pregrad window", metrics, filterState: baseFilterState };
      }
      if (progressPercent < (preset.discovery.minProgressPercent ?? 98.5)) {
        return { passed: false, rejectReason: "progress below pregrad floor", metrics, filterState: baseFilterState };
      }
    }

    const softIssues: string[] = [];
    const liquidityUsd = merged.liquidityUsd ?? 0;
    if (liquidityUsd < effectiveSettings.filters.minLiquidityUsd) {
      if (liquidityUsd < effectiveSettings.filters.minLiquidityUsd * 0.65) {
        return { passed: false, rejectReason: "liquidity far below floor", metrics, filterState: baseFilterState };
      }
      softIssues.push("liquidity below floor");
    }

    const marketCapUsd = merged.marketCapUsd ?? Number.MAX_SAFE_INTEGER;
    if (marketCapUsd > effectiveSettings.filters.maxMarketCapUsd) {
      if (marketCapUsd > effectiveSettings.filters.maxMarketCapUsd * 1.35) {
        return { passed: false, rejectReason: "market cap far above ceiling", metrics, filterState: baseFilterState };
      }
      softIssues.push("market cap above ceiling");
    }

    const holders = merged.holders ?? 0;
    if (holders < effectiveSettings.filters.minHolders) {
      if (holders < effectiveSettings.filters.minHolders * 0.65) {
        return { passed: false, rejectReason: "holder count far below floor", metrics, filterState: baseFilterState };
      }
      softIssues.push("holder count below floor");
    }

    const tradeData = await this.getTradeDataWithCache(mint, cachedFacts.tradeData);
    metrics.tradeData = tradeData;
    Object.assign(baseFilterState, {
      lastTradeAt: tradeData?.lastTradeAt ?? baseFilterState.lastTradeAt,
      priceUsd: tradeData?.priceUsd ?? baseFilterState.priceUsd,
      volume1mUsd: tradeData?.volume1mUsd ?? baseFilterState.volume1mUsd,
      volume5mUsd: tradeData?.volume5mUsd ?? baseFilterState.volume5mUsd,
      volume30mUsd: tradeData?.volume30mUsd ?? baseFilterState.volume30mUsd,
      volume1hUsd: tradeData?.volume1hUsd ?? baseFilterState.volume1hUsd,
      volume24hUsd: tradeData?.volume24hUsd ?? baseFilterState.volume24hUsd,
      volume1mChangePercent: tradeData?.volume1mChangePercent ?? baseFilterState.volume1mChangePercent,
      volume5mChangePercent: tradeData?.volume5mChangePercent ?? baseFilterState.volume5mChangePercent,
      volume30mChangePercent: tradeData?.volume30mChangePercent ?? baseFilterState.volume30mChangePercent,
      volume1hChangePercent: tradeData?.volume1hChangePercent ?? baseFilterState.volume1hChangePercent,
      volume24hChangePercent: tradeData?.volume24hChangePercent ?? baseFilterState.volume24hChangePercent,
      volumeBuy1mUsd: tradeData?.volumeBuy1mUsd,
      volumeBuy5mUsd: tradeData?.volumeBuy5mUsd,
      volumeBuy30mUsd: tradeData?.volumeBuy30mUsd,
      volumeBuy1hUsd: tradeData?.volumeBuy1hUsd,
      volumeBuy24hUsd: tradeData?.volumeBuy24hUsd,
      volumeSell1mUsd: tradeData?.volumeSell1mUsd,
      volumeSell5mUsd: tradeData?.volumeSell5mUsd,
      volumeSell30mUsd: tradeData?.volumeSell30mUsd,
      volumeSell1hUsd: tradeData?.volumeSell1hUsd,
      volumeSell24hUsd: tradeData?.volumeSell24hUsd,
      uniqueWallets1m: tradeData?.uniqueWallets1m,
      uniqueWallets5m: tradeData?.uniqueWallets5m,
      uniqueWallets30m: tradeData?.uniqueWallets30m,
      uniqueWallets1h: tradeData?.uniqueWallets1h,
      uniqueWallets24h: tradeData?.uniqueWallets24h,
      trades1m: tradeData?.trades1m,
      trades5m: tradeData?.trades5m,
      trades30m: tradeData?.trades30m,
      trades1h: tradeData?.trades1h,
      trades24h: tradeData?.trades24h,
      buys1m: tradeData?.buys1m,
      buys5m: tradeData?.buys5m,
      buys30m: tradeData?.buys30m,
      buys1h: tradeData?.buys1h,
      buys24h: tradeData?.buys24h,
      sells1m: tradeData?.sells1m,
      sells5m: tradeData?.sells5m,
      sells30m: tradeData?.sells30m,
      sells1h: tradeData?.sells1h,
      sells24h: tradeData?.sells24h,
      priceChange1mPercent: tradeData?.priceChange1mPercent ?? baseFilterState.priceChange1mPercent,
      priceChange5mPercent: tradeData?.priceChange5mPercent ?? baseFilterState.priceChange5mPercent,
      priceChange30mPercent: tradeData?.priceChange30mPercent ?? baseFilterState.priceChange30mPercent,
      priceChange1hPercent: tradeData?.priceChange1hPercent ?? baseFilterState.priceChange1hPercent,
      priceChange24hPercent: tradeData?.priceChange24hPercent ?? baseFilterState.priceChange24hPercent,
    });

    if (preset.discovery.minLastTradeSeconds && tradeData?.lastTradeAt) {
      const lastTradeAgeSeconds = Math.floor(Date.now() / 1000) - tradeData.lastTradeAt;
      metrics.lastTradeAgeSeconds = lastTradeAgeSeconds;
      if (lastTradeAgeSeconds > preset.discovery.minLastTradeSeconds) {
        return { passed: false, rejectReason: "tape already went stale", metrics, filterState: baseFilterState };
      }
    }

    if (preset.discovery.minTrades1m && (tradeData?.trades1m ?? 0) < preset.discovery.minTrades1m) {
      softIssues.push("1m tape below recipe floor");
    }

    if (preset.discovery.minTrades5m && (tradeData?.trades5m ?? 0) < preset.discovery.minTrades5m) {
      softIssues.push("5m tape below recipe floor");
    }

    const volume5mUsd = tradeData?.volume5mUsd ?? 0;
    if (volume5mUsd < effectiveSettings.filters.minVolume5mUsd) {
      if (volume5mUsd < effectiveSettings.filters.minVolume5mUsd * 0.65) {
        return { passed: false, rejectReason: "5m volume far below floor", metrics, filterState: baseFilterState };
      }
      softIssues.push("5m volume below floor");
    }

    const uniqueBuyers5m = tradeData?.uniqueWallets5m ?? 0;
    if (uniqueBuyers5m < effectiveSettings.filters.minUniqueBuyers5m) {
      if (uniqueBuyers5m < effectiveSettings.filters.minUniqueBuyers5m * 0.65) {
        return { passed: false, rejectReason: "unique buyers far below floor", metrics, filterState: baseFilterState };
      }
      softIssues.push("unique buyers below floor");
    }

    const buySellRatio = (tradeData?.volumeBuy5mUsd ?? 0) / Math.max(tradeData?.volumeSell5mUsd ?? 0, 1);
    metrics.buySellRatio = buySellRatio;
    baseFilterState.buySellRatio = buySellRatio;
    if (buySellRatio < effectiveSettings.filters.minBuySellRatio) {
      if (buySellRatio < effectiveSettings.filters.minBuySellRatio * 0.7) {
        return { passed: false, rejectReason: "buy/sell ratio collapsed", metrics, filterState: baseFilterState };
      }
      softIssues.push("buy/sell ratio too weak");
    }

    const priceChange5m = tradeData?.priceChange5mPercent ?? merged.priceChange5mPercent ?? 0;
    metrics.priceChange5mPercent = priceChange5m;
    baseFilterState.priceChange5mPercent = priceChange5m;
    if (priceChange5m <= -effectiveSettings.filters.maxNegativePriceChange5mPercent) {
      if (priceChange5m <= -effectiveSettings.filters.maxNegativePriceChange5mPercent * 1.5) {
        return { passed: false, rejectReason: "price already dumping hard", metrics, filterState: baseFilterState };
      }
      softIssues.push("price already fading");
    }

    if (!mintAuthorities) {
      return { passed: false, rejectReason: "mint account unavailable", metrics, filterState: baseFilterState };
    }

    Object.assign(baseFilterState, {
      decimals: mintAuthorities.decimals,
      mintAuthorityActive: Boolean(mintAuthorities.mintAuthority),
      freezeAuthorityActive: Boolean(mintAuthorities.freezeAuthority),
    });

    if (mintAuthorities.mintAuthority) {
      return { passed: false, rejectReason: "mint authority still active", metrics, filterState: baseFilterState };
    }

    if (mintAuthorities.freezeAuthority) {
      return { passed: false, rejectReason: "freeze authority still active", metrics, filterState: baseFilterState };
    }

    const holderConcentration = await this.getHolderConcentrationWithCache(
      mint,
      mintAuthorities.supplyRaw,
      cachedFacts.holderConcentration,
    );
    metrics.holderConcentration = holderConcentration;
    Object.assign(baseFilterState, {
      top10HolderPercent: holderConcentration?.top10Percent,
      largestHolderPercent: holderConcentration?.largestHolderPercent,
      largestAccountsCount: holderConcentration?.largestAccountsCount,
      largestHolderAddress: holderConcentration?.largestHolderAddress,
    });

    if (!holderConcentration) {
      return { passed: false, rejectReason: "holder concentration unavailable", metrics, filterState: baseFilterState };
    }

    if (holderConcentration.top10Percent > effectiveSettings.filters.maxTop10HolderPercent) {
      if (holderConcentration.top10Percent > effectiveSettings.filters.maxTop10HolderPercent * 1.25) {
        return { passed: false, rejectReason: "top10 concentration far too high", metrics, filterState: baseFilterState };
      }
      softIssues.push("top10 concentration too high");
    }

    if (holderConcentration.largestHolderPercent > effectiveSettings.filters.maxSingleHolderPercent) {
      if (holderConcentration.largestHolderPercent > effectiveSettings.filters.maxSingleHolderPercent * 1.25) {
        return { passed: false, rejectReason: "largest holder concentration far too high", metrics, filterState: baseFilterState };
      }
      softIssues.push("largest holder concentration too high");
    }

    const uniqueSoftIssues = [...new Set(softIssues)];
    metrics.softIssues = uniqueSoftIssues;
    metrics.softIssueCount = uniqueSoftIssues.length;
    if (uniqueSoftIssues.length >= 2) {
      return {
        passed: false,
        rejectReason: `multiple soft weaknesses: ${uniqueSoftIssues.join(", ")}`,
        metrics,
        filterState: baseFilterState,
      };
    }

    const securityBudget = await this.providerBudget.canSpend("security", cachedFacts.security ? 0 : 50);
    if (!securityBudget.allowed) {
      return {
        passed: false,
        deferReason: securityBudget.reason ?? "security lane budget pacing blocked",
        metrics: {
          ...metrics,
          budget: securityBudget.snapshot,
        },
        filterState: baseFilterState,
      };
    }

    const security = await this.getSecurityWithCache(mint, cachedFacts.security);
    metrics.security = security;
    Object.assign(baseFilterState, {
      creatorBalancePercent: security?.creatorBalancePercent,
      ownerBalancePercent: security?.ownerBalancePercent,
      updateAuthorityBalancePercent: security?.updateAuthorityBalancePercent,
      top10UserPercent: security?.top10UserPercent,
      top10HolderPercent: baseFilterState.top10HolderPercent ?? security?.top10HolderPercent,
      transferFeeEnabled: security?.transferFeeEnabled,
      transferFeePercent: security?.transferFeePercent,
      trueToken: security?.trueToken,
      token2022: security?.token2022,
      nonTransferable: security?.nonTransferable,
      fakeToken: security?.fakeToken,
      honeypot: security?.honeypot,
      freezeable: security?.freezeable,
      mutableMetadata: security?.mutableMetadata,
      securityCheckedAt: Date.now(),
    });

    if (!security) {
      return { passed: false, rejectReason: "deep security unavailable", metrics, filterState: baseFilterState };
    }

    if (security.fakeToken) {
      return { passed: false, rejectReason: "fake token flagged by Birdeye", metrics, filterState: baseFilterState };
    }

    if (security.honeypot) {
      return { passed: false, rejectReason: "honeypot risk flagged by Birdeye", metrics, filterState: baseFilterState };
    }

    if (security.freezeable === true) {
      return { passed: false, rejectReason: "token remains freezeable", metrics, filterState: baseFilterState };
    }

    if (security.mintAuthorityEnabled === true) {
      return { passed: false, rejectReason: "token remains mintable", metrics, filterState: baseFilterState };
    }

    if ((security.transferFeePercent ?? 0) > effectiveSettings.filters.maxTransferFeePercent) {
      return { passed: false, rejectReason: "transfer fee above allowed ceiling", metrics, filterState: baseFilterState };
    }

    const entryPriceUsd = tradeData?.priceUsd ?? merged.priceUsd;
    if (!entryPriceUsd || entryPriceUsd <= 0) {
      return { passed: false, rejectReason: "entry price unavailable", metrics, filterState: baseFilterState };
    }

    const discoveryPrice = (baseline.priceUsd as number | null | undefined) ?? null;
    let priceDeltaPercent: number | null = null;
    if (discoveryPrice != null && discoveryPrice > 0) {
      priceDeltaPercent = ((entryPriceUsd - discoveryPrice) / discoveryPrice) * 100;
      metrics.priceDeltaSinceDiscoveryPercent = priceDeltaPercent;

      if (priceDeltaPercent > FAIR_VALUE_ENTRY_PREMIUM_CAP * 100) {
        return {
          passed: false,
          rejectReason: `entry price +${priceDeltaPercent.toFixed(1)}% above discovery (cap ${(FAIR_VALUE_ENTRY_PREMIUM_CAP * 100).toFixed(0)}%)`,
          metrics,
          filterState: baseFilterState,
        };
      }

      if (priceDeltaPercent > 0) {
        softIssues.push("paying above discovery price");
      }
    }

    baseFilterState.priceUsd = entryPriceUsd;
    const entryScore = this.scoreFilterState(baseFilterState, effectiveSettings, {
      graduatedAt: merged.graduatedAt,
      source: merged.source,
      priceChangeSinceDiscoveryPercent: priceDeltaPercent,
    });
    const confidenceScore = buildSignalConfidence({ entryScore });
    metrics.entryOrigin = "runtime_auto_entry";
    metrics.entryScore = entryScore;
    metrics.confidenceScore = confidenceScore;
    metrics.exitProfile = deriveExitProfile(confidenceScore);
    if (adaptiveMutation?.entryScoreFloor != null && entryScore < adaptiveMutation.entryScoreFloor) {
      return {
        passed: false,
        rejectReason: `entry score below adaptive floor (${adaptiveMutation.entryScoreFloor.toFixed(2)})`,
        metrics,
        filterState: baseFilterState,
      };
    }

    return {
      passed: true,
      metrics,
      entryPriceUsd,
      filterState: baseFilterState,
    };
  }

  private async deferCandidates(
    candidates: Candidate[],
    status: CandidateStatus,
    reason: string,
    delayMs: number,
  ): Promise<void> {
    const scheduledEvaluationAt = new Date(Date.now() + delayMs);
    await Promise.all(candidates.map((candidate) => db.candidate.update({
      where: { id: candidate.id },
      data: {
        status,
        rejectReason: reason,
        lastEvaluatedAt: new Date(),
        scheduledEvaluationAt,
      },
    })));
  }

  private scoreCandidate(
    candidate: Candidate & { latestMetrics?: { liquidityUsd?: unknown; volume5mUsd?: unknown; buySellRatio?: unknown; priceChange5mPercent?: unknown; uniqueWallets5m?: unknown; holders?: unknown; top10HolderPercent?: unknown; largestHolderPercent?: unknown } | null },
    settings: Awaited<ReturnType<RuntimeConfigService["getSettings"]>>,
  ): number {
    const effectiveSettings = applyStrategySettings(settings, candidate.strategyPresetId as StrategyPresetId);
    const metrics = candidate.latestMetrics;
    return this.scoreFilterState({
      liquidityUsd: Number(metrics?.liquidityUsd ?? 0),
      volume5mUsd: Number(metrics?.volume5mUsd ?? 0),
      buySellRatio: Number(metrics?.buySellRatio ?? 0),
      priceChange5mPercent: Number(metrics?.priceChange5mPercent ?? 0),
      uniqueWallets5m: Number(metrics?.uniqueWallets5m ?? 0),
      holders: Number(metrics?.holders ?? 0),
      top10HolderPercent: Number(metrics?.top10HolderPercent ?? effectiveSettings.filters.maxTop10HolderPercent),
      largestHolderPercent: Number(metrics?.largestHolderPercent ?? effectiveSettings.filters.maxSingleHolderPercent),
    }, effectiveSettings, {
      graduatedAt: candidate.graduatedAt ? Math.floor(candidate.graduatedAt.getTime() / 1000) : null,
      discoveredAtMs: candidate.discoveredAt.getTime(),
      source: candidate.source,
      status: candidate.status,
    });
  }

  private async getDetailWithCache(
    mint: string,
    shouldRefreshDetail: boolean,
    cachedDetail: FreshTokenFacts["detail"],
  ): Promise<DiscoveryToken | null> {
    if (!shouldRefreshDetail) {
      return null;
    }

    if (cachedDetail) {
      return cachedDetail;
    }

    const detail = await this.birdeye.getMemeTokenDetail(mint);
    await this.sharedFacts.rememberDetail(mint, detail);
    return detail;
  }

  private async getTradeDataWithCache(mint: string, cachedTradeData: FreshTokenFacts["tradeData"]) {
    if (cachedTradeData) {
      return cachedTradeData;
    }

    const tradeData = await this.birdeye.getTradeData(mint);
    await this.sharedFacts.rememberTradeData(mint, tradeData);
    return tradeData;
  }

  private async getMintAuthoritiesWithCache(
    mint: string,
    cachedMintAuthorities: FreshTokenFacts["mintAuthorities"],
  ) {
    if (cachedMintAuthorities) {
      return cachedMintAuthorities;
    }

    const mintAuthorities = await this.helius.getMintAuthorities(mint);
    await this.sharedFacts.rememberMintAuthorities(mint, mintAuthorities);
    return mintAuthorities;
  }

  private async getHolderConcentrationWithCache(
    mint: string,
    supplyRaw: string,
    cachedHolderConcentration: FreshTokenFacts["holderConcentration"],
  ) {
    if (cachedHolderConcentration) {
      return cachedHolderConcentration;
    }

    const holderConcentration = await this.helius.getHolderConcentration(mint, supplyRaw);
    await this.sharedFacts.rememberHolderConcentration(mint, holderConcentration);
    return holderConcentration;
  }

  private async getSecurityWithCache(mint: string, cachedSecurity: FreshTokenFacts["security"]) {
    if (cachedSecurity) {
      return cachedSecurity;
    }

    const security = await this.birdeye.getTokenSecurity(mint);
    await this.sharedFacts.rememberSecurity(mint, security);
    return security;
  }

  private scoreFilterState(
    filterState: Pick<
      CandidateFilterState,
      | "liquidityUsd"
      | "volume5mUsd"
      | "buySellRatio"
      | "priceChange5mPercent"
      | "uniqueWallets5m"
      | "holders"
      | "top10HolderPercent"
      | "largestHolderPercent"
    >,
    settings: Awaited<ReturnType<RuntimeConfigService["getSettings"]>>,
    input: {
      graduatedAt?: number | null;
      discoveredAtMs?: number | null;
      source?: string | null;
      status?: CandidateStatus;
      /** Price change % between discovery snapshot and evaluation (negative = dump since discovery). */
      priceChangeSinceDiscoveryPercent?: number | null;
    },
  ): number {
    const now = Date.now();
    const referenceMs = input.graduatedAt
      ? input.graduatedAt * 1000
      : input.discoveredAtMs ?? now;
    const ageSeconds = Math.max(0, (now - referenceMs) / 1000);
    const statusAdjustment = input.status === "ERROR"
      ? -0.05
      : input.status === "SKIPPED"
        ? -0.01
        : 0;

    return scoreEntrySignal(
      {
        liquidityUsd: Number(filterState.liquidityUsd ?? 0),
        volume5mUsd: Number(filterState.volume5mUsd ?? 0),
        buySellRatio: Number(filterState.buySellRatio ?? 0),
        priceChange5mPercent: Number(filterState.priceChange5mPercent ?? 0),
        uniqueWallets5m: Number(filterState.uniqueWallets5m ?? 0),
        holders: Number(filterState.holders ?? 0),
        top10HolderPercent: Number(filterState.top10HolderPercent ?? settings.filters.maxTop10HolderPercent),
        largestHolderPercent: Number(filterState.largestHolderPercent ?? settings.filters.maxSingleHolderPercent),
        ageSeconds,
        source: input.source,
        statusAdjustment,
        priceChangeSinceDiscoveryPercent: input.priceChangeSinceDiscoveryPercent ?? null,
      },
      settings.filters,
    );
  }

  private mergeDiscoveryMetrics(
    detail: DiscoveryToken | null,
    baselineMetrics: Record<string, unknown> | null,
  ): CandidateFilterState & { graduatedAt: number | null } {
    const baseline = this.extractBaselineDiscovery(baselineMetrics);

    return {
      platformId: detail?.platformId ?? this.readString(baseline, "platformId"),
      creationAt: detail?.creationAt ?? this.readNumber(baseline, "creationAt"),
      recentListingAt: detail?.recentListingAt ?? this.readNumber(baseline, "recentListingAt"),
      lastTradeAt: detail?.lastTradeAt ?? this.readNumber(baseline, "lastTradeAt"),
      decimals: detail?.decimals ?? this.readNumber(baseline, "decimals"),
      progressPercent: detail?.progressPercent ?? this.readNumber(baseline, "progressPercent"),
      priceUsd: detail?.priceUsd ?? this.readNumber(baseline, "priceUsd"),
      liquidityUsd: detail?.liquidityUsd ?? this.readNumber(baseline, "liquidityUsd"),
      marketCapUsd: detail?.marketCapUsd ?? this.readNumber(baseline, "marketCapUsd"),
      fdvUsd: detail?.fdvUsd ?? this.readNumber(baseline, "fdvUsd"),
      totalSupply: detail?.totalSupply ?? this.readNumber(baseline, "totalSupply"),
      circulatingSupply: detail?.circulatingSupply ?? this.readNumber(baseline, "circulatingSupply"),
      holders: detail?.holders ?? this.readNumber(baseline, "holders"),
      volume1mUsd: detail?.volume1mUsd ?? this.readNumber(baseline, "volume1mUsd"),
      volume5mUsd: detail?.volume5mUsd ?? this.readNumber(baseline, "volume5mUsd"),
      volume30mUsd: detail?.volume30mUsd ?? this.readNumber(baseline, "volume30mUsd"),
      volume1hUsd: detail?.volume1hUsd ?? this.readNumber(baseline, "volume1hUsd"),
      volume24hUsd: detail?.volume24hUsd ?? this.readNumber(baseline, "volume24hUsd"),
      volume1mChangePercent: detail?.volume1mChangePercent ?? this.readNumber(baseline, "volume1mChangePercent"),
      volume5mChangePercent: detail?.volume5mChangePercent ?? this.readNumber(baseline, "volume5mChangePercent"),
      volume30mChangePercent: detail?.volume30mChangePercent ?? this.readNumber(baseline, "volume30mChangePercent"),
      volume1hChangePercent: detail?.volume1hChangePercent ?? this.readNumber(baseline, "volume1hChangePercent"),
      volume24hChangePercent: detail?.volume24hChangePercent ?? this.readNumber(baseline, "volume24hChangePercent"),
      trades1m: detail?.trades1m ?? this.readNumber(baseline, "trades1m"),
      trades5m: detail?.trades5m ?? this.readNumber(baseline, "trades5m"),
      trades30m: detail?.trades30m ?? this.readNumber(baseline, "trades30m"),
      trades1h: detail?.trades1h ?? this.readNumber(baseline, "trades1h"),
      trades24h: detail?.trades24h ?? this.readNumber(baseline, "trades24h"),
      priceChange1mPercent: detail?.priceChange1mPercent ?? this.readNumber(baseline, "priceChange1mPercent"),
      priceChange5mPercent: detail?.priceChange5mPercent ?? this.readNumber(baseline, "priceChange5mPercent"),
      priceChange30mPercent: detail?.priceChange30mPercent ?? this.readNumber(baseline, "priceChange30mPercent"),
      priceChange1hPercent: detail?.priceChange1hPercent ?? this.readNumber(baseline, "priceChange1hPercent"),
      priceChange24hPercent: detail?.priceChange24hPercent ?? this.readNumber(baseline, "priceChange24hPercent"),
      source: detail?.source ?? this.readString(baseline, "source"),
      creator: detail?.creator ?? this.readString(baseline, "creator"),
      graduatedAt: detail?.graduatedAt ?? this.readNumber(baseline, "graduatedAt"),
    };
  }

  private toDiscoveryFilterState(token: DiscoveryToken): CandidateFilterState {
    return {
      platformId: token.platformId,
      creationAt: token.creationAt,
      recentListingAt: token.recentListingAt,
      lastTradeAt: token.lastTradeAt,
      decimals: token.decimals,
      progressPercent: token.progressPercent,
      priceUsd: token.priceUsd,
      liquidityUsd: token.liquidityUsd,
      marketCapUsd: token.marketCapUsd,
      fdvUsd: token.fdvUsd,
      totalSupply: token.totalSupply,
      circulatingSupply: token.circulatingSupply,
      holders: token.holders,
      volume1mUsd: token.volume1mUsd,
      volume5mUsd: token.volume5mUsd,
      volume30mUsd: token.volume30mUsd,
      volume1hUsd: token.volume1hUsd,
      volume24hUsd: token.volume24hUsd,
      volume1mChangePercent: token.volume1mChangePercent,
      volume5mChangePercent: token.volume5mChangePercent,
      volume30mChangePercent: token.volume30mChangePercent,
      volume1hChangePercent: token.volume1hChangePercent,
      volume24hChangePercent: token.volume24hChangePercent,
      trades1m: token.trades1m,
      trades5m: token.trades5m,
      trades30m: token.trades30m,
      trades1h: token.trades1h,
      trades24h: token.trades24h,
      priceChange1mPercent: token.priceChange1mPercent,
      priceChange5mPercent: token.priceChange5mPercent,
      priceChange30mPercent: token.priceChange30mPercent,
      priceChange1hPercent: token.priceChange1hPercent,
      priceChange24hPercent: token.priceChange24hPercent,
      source: token.source,
      creator: token.creator,
    };
  }

  private readNumber(source: Record<string, unknown>, key: string): number | null {
    const value = source[key];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  private readBoolean(source: Record<string, unknown>, key: string): boolean | null {
    const value = source[key];
    return typeof value === "boolean" ? value : null;
  }

  private readString(source: Record<string, unknown>, key: string): string | null {
    const value = source[key];
    return typeof value === "string" && value.length > 0 ? value : null;
  }

  private readMetricNumber(source: Record<string, unknown>, key: string): number | null {
    const value = source[key];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  private readMetricString(source: Record<string, unknown>, key: string): string | null {
    const value = source[key];
    return typeof value === "string" && value.trim().length > 0 ? value : null;
  }

  private extractBaselineDiscovery(baselineMetrics: Record<string, unknown> | null): Record<string, unknown> {
    const baseline = (baselineMetrics ?? {}) as Record<string, unknown>;
    return baseline.detail && typeof baseline.detail === "object"
      ? baseline.detail as Record<string, unknown>
      : baseline;
  }

  private isTradableSource(source: string): boolean {
    if (env.TRADABLE_SOURCES.includes("all")) {
      return true;
    }

    return env.TRADABLE_SOURCES.includes(source);
  }

  private toCandidateData(input: CandidateFilterState, evaluated: boolean) {
    return {
      platformId: input.platformId ?? null,
      creationAt: toOptionalDate(input.creationAt),
      recentListingAt: toOptionalDate(input.recentListingAt),
      lastTradeAt: toOptionalDate(input.lastTradeAt),
    };
  }

  private mergeCandidateMetadata(
    existing: Candidate["metadata"] | null | undefined,
    patch: Record<string, unknown>,
  ) {
    const base = existing && typeof existing === "object" && !Array.isArray(existing)
      ? existing as Record<string, unknown>
      : {};

    return toJsonValue({
      ...base,
      ...patch,
    });
  }
}
