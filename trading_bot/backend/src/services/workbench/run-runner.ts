import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { Prisma } from "@prisma/client";
import { db } from "../../db/client.js";
import type { LiveStrategySettings } from "../../types/domain.js";
import { logger } from "../../utils/logger.js";
import { toJsonValue } from "../../utils/json.js";
import { RuntimeConfigService } from "../runtime-config.js";
import { buildDiscoveryLabLiveStrategy } from "../discovery-lab-strategy-calibration.js";
import { DexScreenerClient, type DexScreenerTokenPair } from "../dexscreener-client.js";
import { buildTradeSetup, type TradeSetup } from "../trade-setup.js";
import {
  cleanThresholdOverrides,
  normalizePackDraft,
  normalizeSources,
  packToDraft,
  type DiscoveryLabPack,
  type DiscoveryLabProfile,
  type DiscoveryLabThresholdOverrides,
} from "../discovery-lab-pack-types.js";
import type {
  DiscoveryLabRunDetail,
  DiscoveryLabRunRequest,
  DiscoveryLabRunStatus,
} from "../discovery-lab-service.js";
import {
  appendOutput,
  buildStrategyPackSnapshot,
  extractFailureMessage,
  mapPackKindForDb,
  mapPackKindFromDb,
  pushThresholdArgs,
  writeJsonFileAtomic,
} from "./discovery-lab-shared.js";
import { PackRepo } from "./pack-repo.js";
import { StrategyPackDraftValidator } from "./strategy-pack-draft-validator.js";

type RunningProcess = {
  runId: string;
  childPid: number;
};

type SourceSummary = {
  source: string;
  recipesRun: number;
  totalReturned: number;
  totalGoodTokens: number;
  uniqueGoodTokens: number;
  bestByGoodCount: string | null;
  bestByAverageScore: string | null;
  bestByEfficiency: string | null;
  bestByQuality: string | null;
};

type QuerySummary = {
  key: string;
  source: string;
  recipeName: string;
  recipeMode: "pregrad" | "postgrad";
  filterCount: number;
  returnedCount: number;
  selectedCount: number;
  goodCount: number;
  rejectCount: number;
  selectionRatePercent: number;
  passRatePercent: number;
  winnerHitRatePercent: number;
  avgGoodPlayScore: number;
  avgGoodEntryScore: number;
  avgSelectedPlayScore: number;
  avgSelectedEntryScore: number;
  estimatedCu: number;
  goodMints: string[];
  topSelectedTokens: Array<{
    symbol: string;
    mint: string;
    grade: string;
    playScore: number;
    rejectReason: string | null;
  }>;
  topGoodTokens: Array<{
    symbol: string;
    mint: string;
    grade: string;
    playScore: number;
    rejectReason: string | null;
  }>;
};

type WinnerSummary = {
  tokenName: string;
  address: string;
  timeSinceGraduationMin: number | null;
  timeSinceCreationMin: number | null;
  priceUsd: number | null;
  liquidityUsd: number | null;
  holders: number | null;
  volume1mUsd: number | null;
  volume5mUsd: number | null;
  volumeChange1mPercent: number | null;
  volumeChange5mPercent: number | null;
  priceChange1mPercent: number | null;
  priceChange5mPercent: number | null;
  trades1m: number | null;
  trades5m: number | null;
  uniqueWallets5m: number | null;
  uniqueWallets24h: number | null;
  buySellRatio: number | null;
  marketCapUsd: number | null;
  mintAuth: string | null;
  top10HolderPercent: number | null;
  maxSingleHolderPercent: number | null;
  score: number;
  whichRecipes: string[];
};

type DiscoveryLabReport = {
  generatedAt: string;
  profile: DiscoveryLabProfile;
  thresholds: Record<string, number | string>;
  recipePath: string;
  sources: string[];
  queryCount: number;
  querySummaries: QuerySummary[];
  sourceSummaries: SourceSummary[];
  winners: WinnerSummary[];
  deepEvaluations: Array<{
    planKey: string;
    recipeName: string;
    mode: "pregrad" | "postgrad";
    mint: string;
    symbol: string;
    source: string;
    playScore: number;
    entryScore: number;
    grade: string;
    pass: boolean;
    rejectReason: string | null;
    priceUsd: number | null;
    liquidityUsd: number | null;
    marketCapUsd: number | null;
    holders: number | null;
    volume5mUsd: number | null;
    volume30mUsd: number | null;
    uniqueWallets5m: number | null;
    buySellRatio: number | null;
    priceChange5mPercent: number | null;
    priceChange30mPercent: number | null;
    top10HolderPercent: number | null;
    largestHolderPercent: number | null;
    timeSinceGraduationMin: number | null;
    timeSinceCreationMin: number | null;
    softIssues: string[];
    notes: string[];
    pairAddress?: string | null;
    pairCreatedAt?: string | null;
    socials?: {
      website: string | null;
      twitter: string | null;
      telegram: string | null;
      count: number;
    } | null;
    tradeSetup?: TradeSetup | null;
  }>;
};

export class RunRunner {
  private readonly backendRoot: string;
  private readonly localRoot: string;
  private readonly runsDir: string;
  private readonly config = new RuntimeConfigService();
  private readonly dexscreener = new DexScreenerClient();
  private runningProcess: RunningProcess | null = null;

  constructor(
    private readonly deps: {
      packs: PackRepo;
      validator: StrategyPackDraftValidator;
    },
  ) {
    this.backendRoot = process.cwd();
    this.localRoot = path.join(this.backendRoot, ".local", "discovery-lab");
    this.runsDir = path.join(this.localRoot, "runs");
  }

  async ensure(): Promise<void> {
    await fs.mkdir(this.runsDir, { recursive: true });
    await this.reconcileInterruptedRuns();
  }

  async startRun(request: DiscoveryLabRunRequest): Promise<DiscoveryLabRunDetail> {
    if (this.runningProcess) {
      throw new Error("a discovery lab run is already active");
    }

    const pack = await this.resolvePackForRun(request);
    const sources = normalizeSources(request.sources ?? pack.defaultSources);
    const profile = request.profile ?? pack.defaultProfile;
    const thresholdOverrides = cleanThresholdOverrides({
      ...pack.thresholdOverrides,
      ...(request.thresholdOverrides ?? {}),
    });
    const allowOverfiltered = request.allowOverfiltered === true;

    const validation = await this.deps.validator.validateDraft(packToDraft(pack), allowOverfiltered);
    if (!validation.ok) {
      throw new Error("run validation failed");
    }

    const runId = randomUUID();
    const startedAt = new Date().toISOString();
    const packSnapshot = {
      ...pack,
      defaultSources: sources,
      defaultProfile: profile,
      thresholdOverrides,
      updatedAt: startedAt,
    };
    const recipePath = path.join(this.runsDir, `${runId}.recipes.json`);
    const outPath = path.join(this.runsDir, `${runId}.report.json`);

    await fs.writeFile(recipePath, JSON.stringify({
      description: packSnapshot.description,
      recipes: packSnapshot.recipes,
    }, null, 2));

    const detail: DiscoveryLabRunDetail = {
      id: runId,
      status: "RUNNING",
      createdAt: startedAt,
      startedAt,
      completedAt: null,
      appliedToLiveAt: null,
      appliedConfigVersionId: null,
      packId: packSnapshot.id,
      packName: packSnapshot.name,
      packKind: packSnapshot.kind,
      profile,
      sources,
      allowOverfiltered,
      queryCount: null,
      winnerCount: null,
      evaluationCount: null,
      errorMessage: null,
      packSnapshot,
      thresholdOverrides,
      strategyCalibration: null,
      stdout: "",
      stderr: "",
      report: null,
    };
    await this.writeRunDetail(detail);

    const args = [
      "run",
      "lab:discovery",
      "--",
      "--recipes",
      recipePath,
      "--profile",
      profile,
      "--sources",
      sources.join(","),
      "--out",
      outPath,
    ];
    if (allowOverfiltered) {
      args.push("--allow-overfiltered");
    }
    pushThresholdArgs(args, thresholdOverrides);

    const child = spawn("npm", args, {
      cwd: this.backendRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    });

    this.runningProcess = {
      runId,
      childPid: child.pid ?? -1,
    };

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout = appendOutput(stdout, String(chunk));
      void this.updateRunOutput(runId, stdout, stderr).catch((error) => {
        logger.warn({ err: error, runId }, "failed to persist discovery lab stdout");
      });
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr = appendOutput(stderr, String(chunk));
      void this.updateRunOutput(runId, stdout, stderr).catch((error) => {
        logger.warn({ err: error, runId }, "failed to persist discovery lab stderr");
      });
    });
    child.on("close", (code) => {
      void this.finalizeRun(runId, code ?? 1, stdout, stderr, outPath, recipePath);
    });
    child.on("error", (error) => {
      const message = error instanceof Error ? error.message : String(error);
      void this.finalizeRun(runId, 1, stdout, `${stderr}\n${message}`, outPath, recipePath);
    });

    return detail;
  }

  private async resolvePackForRun(request: DiscoveryLabRunRequest): Promise<DiscoveryLabPack> {
    if (request.draft) {
      const validation = await this.deps.validator.validateDraft(
        request.draft,
        request.allowOverfiltered === true,
      );
      if (!validation.ok) {
        throw new Error("draft pack is invalid");
      }
      return normalizePackDraft(validation.pack, "custom", "__inline__", "inline");
    }

    if (!request.packId) {
      throw new Error("packId or draft is required");
    }

    const pack = await this.deps.packs.getPack(request.packId);
    if (!pack) {
      throw new Error("pack not found");
    }
    return pack;
  }

  private runFilePath(runId: string): string {
    return path.join(this.runsDir, `${runId}.run.json`);
  }

  private async writeRunDetail(detail: DiscoveryLabRunDetail): Promise<void> {
    await writeJsonFileAtomic(this.runFilePath(detail.id), detail);
    await this.upsertRunRecord(detail);
    await this.pruneRuns();
  }

  private async updateRunOutput(runId: string, stdout: string, stderr: string): Promise<void> {
    const current = await this.getStoredRun(runId);
    if (!current || current.status !== "RUNNING") {
      return;
    }
    current.stdout = stdout;
    current.stderr = stderr;
    await writeJsonFileAtomic(this.runFilePath(runId), current);
    await db.discoveryLabRun.update({
      where: { id: runId },
      data: { stdout, stderr },
    }).catch(() => undefined);
  }

  private async finalizeRun(
    runId: string,
    code: number,
    stdout: string,
    stderr: string,
    outPath: string,
    recipePath: string,
  ): Promise<void> {
    const current = await this.getStoredRun(runId);
    if (!current) {
      this.runningProcess = null;
      return;
    }

    const completedAt = new Date().toISOString();
    let report: DiscoveryLabReport | null = null;
    try {
      const rawReport = await fs.readFile(outPath, "utf8");
      report = JSON.parse(rawReport) as DiscoveryLabReport;
    } catch {
      report = null;
    }

    current.completedAt = completedAt;
    current.stdout = stdout;
    current.stderr = stderr;
    current.report = report;
    current.queryCount = report?.queryCount ?? null;
    current.winnerCount = report?.winners.length ?? null;
    current.evaluationCount = report?.deepEvaluations.length ?? null;
    if (report) {
      const baseSettings = await this.config.getSettings();
      const [botState, openPositions] = await Promise.all([
        db.botState.findUnique({ where: { id: "singleton" } }),
        db.position.count({ where: { status: "OPEN" } }),
      ]);
      const enrichedReport = await this.enrichReportWithDexPairs(report);
      report = enrichedReport.report;
      const cashUsd = Number(botState?.cashUsd ?? baseSettings.capital.capitalUsd);
      const winnerByMint = new Map(report.winners.map((winner) => [winner.address, winner] as const));
      report.deepEvaluations = report.deepEvaluations.map((evaluation) => ({
        ...evaluation,
        tradeSetup: buildTradeSetup({
          settings: baseSettings,
          cashUsd,
          openPositions,
          entryPriceUsd: evaluation.priceUsd,
          entryScore: evaluation.entryScore,
          presetId: evaluation.mode === "pregrad"
            ? "LATE_CURVE_MIGRATION_SNIPE"
            : "FIRST_MINUTE_POSTGRAD_CONTINUATION",
          playScore: evaluation.playScore,
          winnerScore: winnerByMint.get(evaluation.mint)?.score ?? null,
          marketContext: {
            marketCapUsd: evaluation.marketCapUsd,
            timeSinceGraduationMin: evaluation.timeSinceGraduationMin,
            top10HolderPercent: evaluation.top10HolderPercent,
            largestHolderPercent: evaluation.largestHolderPercent,
            socialCount: evaluation.socials?.count ?? 0,
            lpLockedPercent: null,
            softIssueCount: evaluation.softIssues.length,
          },
        }),
      }));
      current.strategyCalibration = buildDiscoveryLabLiveStrategy(current, baseSettings);
      current.report = report;
    } else {
      current.strategyCalibration = null;
    }
    if (code === 0 && report) {
      current.status = "COMPLETED";
      current.errorMessage = null;
    } else {
      current.status = "FAILED";
      current.errorMessage = extractFailureMessage(stderr, stdout);
    }

    this.runningProcess = null;
    await this.writeRunDetail(current);
    await this.syncRunReportTables(current);
    await fs.rm(recipePath, { force: true }).catch(() => undefined);
  }

  private async loadDexPairsForReport(report: DiscoveryLabReport): Promise<Map<string, DexScreenerTokenPair>> {
    const mints = Array.from(new Set(
      report.deepEvaluations
        .map((evaluation) => evaluation.mint)
        .filter((mint): mint is string => typeof mint === "string" && mint.length > 0),
    ));
    if (mints.length === 0) {
      return new Map();
    }

    const responses = await Promise.allSettled(
      mints.map(async (mint) => [mint, await this.dexscreener.getPairs(mint)] as const),
    );
    const pairMap = new Map<string, DexScreenerTokenPair>();
    for (const response of responses) {
      if (response.status !== "fulfilled") {
        continue;
      }
      const [mint, pairs] = response.value;
      const bestPair = pairs.find((pair) => pair.chainId === "solana") ?? pairs[0];
      if (bestPair) {
        pairMap.set(mint, bestPair);
      }
    }
    return pairMap;
  }

  private async enrichReportWithDexPairs(
    report: DiscoveryLabReport,
  ): Promise<{ report: DiscoveryLabReport; changed: boolean }> {
    const pairMap = await this.loadDexPairsForReport(report);
    if (pairMap.size === 0) {
      return { report, changed: false };
    }

    let changed = false;
    const deepEvaluations = report.deepEvaluations.map((evaluation) => {
      const pair = pairMap.get(evaluation.mint);
      if (!pair) {
        return evaluation;
      }
      const nextPairAddress = pair.pairAddress ?? null;
      const nextPairCreatedAt = pair.pairCreatedAt ?? null;
      const socials = pair.info?.socials ?? [];
      const websites = pair.info?.websites ?? [];
      const nextSocials = {
        website: websites[0]?.url ?? null,
        twitter: socials.find((entry) => entry.type === "twitter")?.url ?? null,
        telegram: socials.find((entry) => entry.type === "telegram")?.url ?? null,
        count: [
          websites[0]?.url ?? null,
          socials.find((entry) => entry.type === "twitter")?.url ?? null,
          socials.find((entry) => entry.type === "telegram")?.url ?? null,
        ].filter(Boolean).length,
      };
      if (
        nextPairAddress === (evaluation.pairAddress ?? null)
        && nextPairCreatedAt === (evaluation.pairCreatedAt ?? null)
        && nextSocials.website === (evaluation.socials?.website ?? null)
        && nextSocials.twitter === (evaluation.socials?.twitter ?? null)
        && nextSocials.telegram === (evaluation.socials?.telegram ?? null)
        && nextSocials.count === (evaluation.socials?.count ?? 0)
      ) {
        return evaluation;
      }
      changed = true;
      return {
        ...evaluation,
        pairAddress: nextPairAddress,
        pairCreatedAt: nextPairCreatedAt,
        socials: nextSocials,
      };
    });

    return changed ? { report: { ...report, deepEvaluations }, changed: true } : { report, changed: false };
  }

  private async upsertRunRecord(detail: DiscoveryLabRunDetail): Promise<void> {
    const settings = await this.config.getSettings();
    await this.upsertStrategyPackRecord(detail.packSnapshot);
    await db.discoveryLabRun.upsert({
      where: { id: detail.id },
      update: {
        status: detail.status,
        packId: detail.packId,
        packName: detail.packName,
        packKind: mapPackKindForDb(detail.packSnapshot),
        profile: detail.profile,
        sources: toJsonValue(detail.sources),
        allowOverfiltered: detail.allowOverfiltered,
        queryCount: detail.queryCount,
        winnerCount: detail.winnerCount,
        evaluationCount: detail.evaluationCount,
        thresholdOverrides: toJsonValue(detail.thresholdOverrides ?? {}),
        packSnapshot: toJsonValue(detail.packSnapshot),
        report: detail.report ? toJsonValue(detail.report) : Prisma.DbNull,
        strategyCalibration: detail.strategyCalibration ? toJsonValue(detail.strategyCalibration) : Prisma.DbNull,
        configSnapshot: toJsonValue(settings),
        stdout: detail.stdout,
        stderr: detail.stderr,
        errorMessage: detail.errorMessage,
        startedAt: new Date(detail.startedAt),
        completedAt: detail.completedAt ? new Date(detail.completedAt) : null,
      },
      create: {
        id: detail.id,
        status: detail.status,
        packId: detail.packId,
        packName: detail.packName,
        packKind: mapPackKindForDb(detail.packSnapshot),
        profile: detail.profile,
        sources: toJsonValue(detail.sources),
        allowOverfiltered: detail.allowOverfiltered,
        queryCount: detail.queryCount,
        winnerCount: detail.winnerCount,
        evaluationCount: detail.evaluationCount,
        thresholdOverrides: toJsonValue(detail.thresholdOverrides ?? {}),
        packSnapshot: toJsonValue(detail.packSnapshot),
        report: detail.report ? toJsonValue(detail.report) : Prisma.DbNull,
        strategyCalibration: detail.strategyCalibration ? toJsonValue(detail.strategyCalibration) : Prisma.DbNull,
        configSnapshot: toJsonValue(settings),
        stdout: detail.stdout,
        stderr: detail.stderr,
        errorMessage: detail.errorMessage,
        createdAt: new Date(detail.createdAt),
        startedAt: new Date(detail.startedAt),
        completedAt: detail.completedAt ? new Date(detail.completedAt) : null,
      },
    });
  }

  private async upsertStrategyPackRecord(pack: DiscoveryLabPack): Promise<void> {
    const snapshot = buildStrategyPackSnapshot(pack);
    await db.strategyPack.updateMany({
      where: { id: pack.id },
      data: {
        name: pack.name,
        recipe: toJsonValue(snapshot.recipe),
        baseFilters: toJsonValue(snapshot.baseFilters),
        baseExits: toJsonValue(snapshot.baseExits),
        adaptiveAxes: toJsonValue(snapshot.adaptiveAxes),
        capitalModifier: snapshot.capitalModifier,
        sortColumn: snapshot.sortColumn,
        sortOrder: snapshot.sortOrder,
        createdBy: snapshot.createdBy,
      },
    }).catch(() => undefined);
  }

  private async syncRunReportTables(detail: DiscoveryLabRunDetail): Promise<void> {
    if (!detail.report) {
      await db.discoveryLabRunQuery.deleteMany({ where: { runId: detail.id } });
      await db.discoveryLabRunToken.deleteMany({ where: { runId: detail.id } });
      return;
    }
    const winnerByMint = new Map(detail.report.winners.map((winner) => [winner.address, winner] as const));
    await db.$transaction([
      db.discoveryLabRunQuery.deleteMany({ where: { runId: detail.id } }),
      db.discoveryLabRunToken.deleteMany({ where: { runId: detail.id } }),
    ]);
    if (detail.report.querySummaries.length > 0) {
      await db.discoveryLabRunQuery.createMany({
        data: detail.report.querySummaries.map((summary) => ({
          runId: detail.id,
          key: summary.key,
          source: summary.source,
          recipeName: summary.recipeName,
          recipeMode: summary.recipeMode,
          filterCount: summary.filterCount,
          returnedCount: summary.returnedCount,
          selectedCount: summary.selectedCount,
          goodCount: summary.goodCount,
          rejectCount: summary.rejectCount,
          selectionRatePercent: summary.selectionRatePercent,
          passRatePercent: summary.passRatePercent,
          winnerHitRatePercent: summary.winnerHitRatePercent,
          avgGoodPlayScore: summary.avgGoodPlayScore,
          avgGoodEntryScore: summary.avgGoodEntryScore,
          avgSelectedPlayScore: summary.avgSelectedPlayScore,
          avgSelectedEntryScore: summary.avgSelectedEntryScore,
          estimatedCu: summary.estimatedCu,
          metadata: toJsonValue({
            goodMints: summary.goodMints,
            topSelectedTokens: summary.topSelectedTokens,
            topGoodTokens: summary.topGoodTokens,
          }),
        })),
      });
    }
    if (detail.report.deepEvaluations.length > 0) {
      await db.discoveryLabRunToken.createMany({
        data: detail.report.deepEvaluations.map((evaluation) => {
          const winner = winnerByMint.get(evaluation.mint) ?? null;
          return {
            runId: detail.id,
            mint: evaluation.mint,
            symbol: evaluation.symbol,
            source: evaluation.source,
            recipeName: evaluation.recipeName,
            recipeMode: evaluation.mode,
            passed: evaluation.pass,
            grade: evaluation.grade,
            rejectReason: evaluation.rejectReason,
            playScore: evaluation.playScore,
            entryScore: evaluation.entryScore,
            priceUsd: evaluation.priceUsd,
            liquidityUsd: evaluation.liquidityUsd,
            marketCapUsd: evaluation.marketCapUsd,
            holders: evaluation.holders,
            volume5mUsd: evaluation.volume5mUsd,
            volume30mUsd: evaluation.volume30mUsd,
            uniqueWallets5m: evaluation.uniqueWallets5m,
            buySellRatio: evaluation.buySellRatio,
            priceChange5mPercent: evaluation.priceChange5mPercent,
            priceChange30mPercent: evaluation.priceChange30mPercent,
            top10HolderPercent: evaluation.top10HolderPercent,
            largestHolderPercent: evaluation.largestHolderPercent,
            timeSinceGraduationMin: evaluation.timeSinceGraduationMin,
            timeSinceCreationMin: evaluation.timeSinceCreationMin,
            softIssues: toJsonValue(evaluation.softIssues),
            notes: toJsonValue(evaluation.notes),
            isWinner: Boolean(winner),
            winnerScore: winner?.score ?? null,
            winnerRecipeNames: winner ? toJsonValue(winner.whichRecipes) : Prisma.DbNull,
            tradeSetup: evaluation.tradeSetup ? toJsonValue(evaluation.tradeSetup) : Prisma.DbNull,
          };
        }),
      });
    }
  }

  private async getStoredRun(runId: string): Promise<DiscoveryLabRunDetail | null> {
    try {
      const raw = await fs.readFile(this.runFilePath(runId), "utf8");
      return JSON.parse(raw) as DiscoveryLabRunDetail;
    } catch {
      const row = await db.discoveryLabRun.findUnique({ where: { id: runId } });
      return row ? this.fromDbRun(row) : null;
    }
  }

  private fromDbRun(row: {
    id: string;
    status: DiscoveryLabRunStatus;
    createdAt: Date;
    startedAt: Date;
    completedAt: Date | null;
    appliedToLiveAt: Date | null;
    appliedConfigVersionId: number | null;
    packId: string;
    packName: string;
    packKind: string;
    profile: string;
    sources: unknown;
    allowOverfiltered: boolean;
    queryCount: number | null;
    winnerCount: number | null;
    evaluationCount: number | null;
    errorMessage: string | null;
    packSnapshot: unknown;
    thresholdOverrides: unknown;
    strategyCalibration: unknown;
    stdout: string | null;
    stderr: string | null;
    report: unknown;
  }): DiscoveryLabRunDetail {
    return {
      id: row.id,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      startedAt: row.startedAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
      appliedToLiveAt: row.appliedToLiveAt?.toISOString() ?? null,
      appliedConfigVersionId: row.appliedConfigVersionId ?? null,
      packId: row.packId,
      packName: row.packName,
      packKind: mapPackKindFromDb(row.packKind),
      profile: row.profile as DiscoveryLabProfile,
      sources: Array.isArray(row.sources) ? (row.sources as string[]) : [],
      allowOverfiltered: row.allowOverfiltered,
      queryCount: row.queryCount,
      winnerCount: row.winnerCount,
      evaluationCount: row.evaluationCount,
      errorMessage: row.errorMessage,
      packSnapshot: row.packSnapshot as DiscoveryLabPack,
      thresholdOverrides: (row.thresholdOverrides ?? {}) as DiscoveryLabThresholdOverrides,
      strategyCalibration: (row.strategyCalibration ?? null) as LiveStrategySettings | null,
      stdout: row.stdout ?? "",
      stderr: row.stderr ?? "",
      report: (row.report ?? null) as DiscoveryLabReport | null,
    };
  }

  private async reconcileInterruptedRuns(): Promise<void> {
    const files = await this.readJsonFiles<DiscoveryLabRunDetail>(this.runsDir, (entry) => entry.endsWith(".run.json"));
    for (const detail of files) {
      if (detail.status !== "RUNNING") {
        continue;
      }
      detail.status = "INTERRUPTED";
      detail.completedAt = detail.completedAt ?? new Date().toISOString();
      detail.errorMessage = detail.errorMessage ?? "run interrupted before completion";
      await writeJsonFileAtomic(this.runFilePath(detail.id), detail);
      await this.upsertRunRecord(detail);
    }
  }

  private async pruneRuns(): Promise<void> {
    const rows = await db.discoveryLabRun.findMany({
      orderBy: [{ startedAt: "desc" }],
      take: 40,
      select: { id: true },
    });
    const stale = rows.slice(20);
    for (const run of stale) {
      const prefix = path.join(this.runsDir, run.id);
      await fs.rm(this.runFilePath(run.id), { force: true }).catch(() => undefined);
      await fs.rm(`${prefix}.report.json`, { force: true }).catch(() => undefined);
      await fs.rm(`${prefix}.recipes.json`, { force: true }).catch(() => undefined);
    }
  }

  private async readJsonFiles<T>(dirPath: string, predicate: (entry: string) => boolean): Promise<T[]> {
    try {
      const entries = await fs.readdir(dirPath);
      const values: T[] = [];
      for (const entry of entries.filter(predicate).sort()) {
        const filePath = path.join(dirPath, entry);
        try {
          const raw = await fs.readFile(filePath, "utf8");
          values.push(JSON.parse(raw) as T);
        } catch {
          continue;
        }
      }
      return values;
    } catch {
      return [];
    }
  }
}
