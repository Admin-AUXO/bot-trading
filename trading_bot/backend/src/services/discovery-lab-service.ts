import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { Prisma } from "@prisma/client";
import { db } from "../db/client.js";
import type { LiveStrategySettings } from "../types/domain.js";
import { RuntimeConfigService } from "./runtime-config.js";
import { logger } from "../utils/logger.js";
import { buildDiscoveryLabLiveStrategy } from "./discovery-lab-strategy-calibration.js";
import { listCreatedDiscoveryLabPacks } from "./discovery-lab-created-packs.js";
import { listWorkspaceDiscoveryLabPackSeeds } from "./discovery-lab-workspace-packs.js";
import {
  DexScreenerClient,
  type DexScreenerTokenPair,
} from "./dexscreener-client.js";
import { buildTradeSetup, type TradeSetup } from "./trade-setup.js";
import {
  KNOWN_SOURCES,
  DEFAULT_PROFILE,
  DEFAULT_SOURCES,
  countRecipeFilters,
  customPackFileSchema,
  draftSchema,
  normalizePackDraft,
  normalizeSources,
  cleanThresholdOverrides,
  packToDraft,
  slugify,
  withAutoPackName,
} from "./discovery-lab-pack-types.js";
import type {
  RecipeMode,
  DiscoveryLabProfile,
  DiscoveryLabPackKind,
  DiscoveryLabRecipe,
  DiscoveryLabThresholdOverrides,
  DiscoveryLabPack,
  DiscoveryLabValidationIssue,
  DiscoveryLabPackDraft,
} from "./discovery-lab-pack-types.js";
import { toJsonValue } from "../utils/json.js";
export type {
  RecipeMode,
  DiscoveryLabProfile,
  DiscoveryLabPackKind,
  DiscoveryLabRecipe,
  DiscoveryLabThresholdOverrides,
  DiscoveryLabPack,
  DiscoveryLabValidationIssue,
  DiscoveryLabPackDraft,
} from "./discovery-lab-pack-types.js";

type Scalar = string | number | boolean;
export type DiscoveryLabRunStatus =
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "INTERRUPTED";

export type DiscoveryLabRunRequest = {
  packId?: string;
  draft?: DiscoveryLabPackDraft;
  sources?: string[];
  profile?: DiscoveryLabProfile;
  thresholdOverrides?: DiscoveryLabThresholdOverrides;
  allowOverfiltered?: boolean;
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
  recipeMode: RecipeMode;
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
    mode: RecipeMode;
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

export type DiscoveryLabRunSummary = {
  id: string;
  status: DiscoveryLabRunStatus;
  createdAt: string;
  startedAt: string;
  completedAt: string | null;
  appliedToLiveAt: string | null;
  appliedConfigVersionId: number | null;
  packId: string;
  packName: string;
  packKind: DiscoveryLabPackKind;
  profile: DiscoveryLabProfile;
  sources: string[];
  allowOverfiltered: boolean;
  queryCount: number | null;
  winnerCount: number | null;
  evaluationCount: number | null;
  errorMessage: string | null;
};

export type DiscoveryLabRunDetail = DiscoveryLabRunSummary & {
  packSnapshot: DiscoveryLabPack;
  thresholdOverrides: DiscoveryLabThresholdOverrides;
  strategyCalibration: LiveStrategySettings | null;
  stdout: string;
  stderr: string;
  report: DiscoveryLabReport | null;
};

export type DiscoveryLabCatalog = {
  packs: DiscoveryLabPack[];
  activeRun: DiscoveryLabRunSummary | null;
  recentRuns: DiscoveryLabRunSummary[];
  profiles: DiscoveryLabProfile[];
  knownSources: string[];
};

const MAX_RECENT_RUNS = 20;

type RunningProcess = {
  runId: string;
  childPid: number;
};

export class DiscoveryLabService {
  private readonly backendRoot: string;
  private readonly scriptsDir: string;
  private readonly localRoot: string;
  private readonly packsDir: string;
  private readonly runsDir: string;
  private runningProcess: RunningProcess | null = null;
  private readonly config = new RuntimeConfigService();

  constructor() {
    this.backendRoot = process.cwd();
    this.scriptsDir = path.join(this.backendRoot, "scripts");
    this.localRoot = path.join(this.backendRoot, ".local", "discovery-lab");
    this.packsDir = path.join(this.localRoot, "packs");
    this.runsDir = path.join(this.localRoot, "runs");
  }

  async ensure(): Promise<void> {
    await fs.mkdir(this.packsDir, { recursive: true });
    await fs.mkdir(this.runsDir, { recursive: true });
    await this.seedWorkspacePacks();
    await this.reconcileInterruptedRuns();
    await this.syncPacksToDb(await this.listPacks());
  }

  async getCatalog(): Promise<DiscoveryLabCatalog> {
    const [packs, recentRuns] = await Promise.all([
      this.listPacks(),
      this.listRunSummaries(),
    ]);
    const activeRun =
      recentRuns.find((run) => run.status === "RUNNING") ?? null;
    return {
      packs,
      activeRun,
      recentRuns,
      profiles: ["runtime", "high-value", "scalp"],
      knownSources: KNOWN_SOURCES,
    };
  }

  getCatalogMetadata(): Pick<DiscoveryLabCatalog, "profiles" | "knownSources"> {
    return {
      profiles: ["runtime", "high-value", "scalp"],
      knownSources: KNOWN_SOURCES,
    };
  }

  async validateDraft(
    input: DiscoveryLabPackDraft,
    allowOverfiltered = false,
  ): Promise<{
    ok: boolean;
    issues: DiscoveryLabValidationIssue[];
    pack: DiscoveryLabPackDraft;
  }> {
    let parsed: DiscoveryLabPackDraft;
    try {
      parsed = draftSchema.parse(withAutoPackName(input));
    } catch (err) {
      return {
        ok: false,
        issues: [{
          path: "draft",
          message: err instanceof Error ? err.message : "Invalid draft structure",
          level: "error",
        }],
        pack: input,
      };
    }
    const issues: DiscoveryLabValidationIssue[] = [];
    const recipeNames = new Set<string>();

    if ((parsed.defaultSources ?? []).length === 0) {
      issues.push({
        path: "defaultSources",
        message: "No sources selected; the run will default to pump_dot_fun.",
        level: "warning",
      });
    }

    for (let index = 0; index < parsed.recipes.length; index += 1) {
      const recipe = parsed.recipes[index];
      if (recipeNames.has(recipe.name)) {
        issues.push({
          path: `recipes.${index}.name`,
          message: "Recipe names must be unique within a pack.",
          level: "error",
        });
      }
      recipeNames.add(recipe.name);

      const filterCount = countRecipeFilters(recipe.params);
      if (filterCount > 5) {
        issues.push({
          path: `recipes.${index}.params`,
          message: allowOverfiltered
            ? `Recipe uses ${filterCount} provider-side filters; Birdeye may reject it.`
            : `Recipe uses ${filterCount} provider-side filters; Birdeye accepts at most 5.`,
          level: allowOverfiltered ? "warning" : "error",
        });
      } else if (filterCount === 5) {
        issues.push({
          path: `recipes.${index}.params`,
          message:
            "Recipe is at the 5-filter provider ceiling; adding another filter will break the request.",
          level: "warning",
        });
      }
    }

    return {
      ok: issues.every((issue) => issue.level !== "error"),
      issues,
      pack: parsed,
    };
  }

  async savePack(input: DiscoveryLabPackDraft): Promise<DiscoveryLabPack> {
    const validation = await this.validateDraft(input, true);
    if (!validation.ok) {
      throw new Error("pack validation failed");
    }
    const normalized = validation.pack;
    if (normalized.id && isWorkspacePackId(normalized.id)) {
      throw new Error("workspace packs are read-only");
    }
    if (normalized.id) {
      const existing = (await this.listPacks()).find((pack) => pack.id === normalized.id);
      if (existing && existing.kind !== "custom") {
        throw new Error("only custom packs can be updated");
      }
    }
    const id = normalized.id ?? (await this.allocatePackId(normalized.name));
    if (isWorkspacePackId(id)) {
      throw new Error("workspace-* ids are reserved");
    }
    const record = {
      id,
      name: normalized.name,
      description: normalized.description ?? "",
      defaultSources: normalized.defaultSources?.length
        ? normalized.defaultSources
        : DEFAULT_SOURCES,
      defaultProfile: normalized.defaultProfile ?? DEFAULT_PROFILE,
      thresholdOverrides: normalized.thresholdOverrides ?? {},
      recipes: normalized.recipes,
      updatedAt: new Date().toISOString(),
    };
    const filePath = this.packFilePath(id);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await writeJsonFileAtomic(filePath, record);
    const pack = await this.readCustomPack(filePath);
    await this.upsertPackRecord(pack);
    return pack;
  }

  async deletePack(packId: string): Promise<{ ok: true }> {
    if (!packId.trim()) {
      throw new Error("packId is required");
    }
    if (isWorkspacePackId(packId)) {
      throw new Error("workspace packs are read-only");
    }
    const existing = (await this.listPacks()).find((pack) => pack.id === packId);
    if (!existing) {
      throw new Error("pack not found");
    }
    if (existing.kind !== "custom") {
      throw new Error("only custom packs can be deleted");
    }
    const filePath = this.packFilePath(packId);
    await fs.rm(filePath, { force: true });
    await db.discoveryLabPack.deleteMany({ where: { id: packId } });
    await db.strategyPackVersion.deleteMany({ where: { packId } });
    await db.strategyPack.deleteMany({ where: { id: packId } });
    return { ok: true };
  }

  async startRun(
    request: DiscoveryLabRunRequest,
  ): Promise<DiscoveryLabRunDetail> {
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

    const validation = await this.validateDraft(
      packToDraft(pack),
      allowOverfiltered,
    );
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
    const recordPath = this.runFilePath(runId);

    await fs.writeFile(
      recipePath,
      JSON.stringify(
        {
          description: packSnapshot.description,
          recipes: packSnapshot.recipes,
        },
        null,
        2,
      ),
    );

    const detail: DiscoveryLabRunDetail = {
      id: runId,
      status: "RUNNING",
      createdAt: startedAt,
      startedAt,
      completedAt: null,
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
        logger.warn(
          { err: error, runId },
          "failed to persist discovery lab stdout",
        );
      });
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr = appendOutput(stderr, String(chunk));
      void this.updateRunOutput(runId, stdout, stderr).catch((error) => {
        logger.warn(
          { err: error, runId },
          "failed to persist discovery lab stderr",
        );
      });
    });
    child.on("close", (code) => {
      void this.finalizeRun(
        runId,
        code ?? 1,
        stdout,
        stderr,
        outPath,
        recordPath,
        recipePath,
      );
    });
    child.on("error", (error) => {
      const message = error instanceof Error ? error.message : String(error);
      void this.finalizeRun(
        runId,
        1,
        stdout,
        `${stderr}\n${message}`,
        outPath,
        recordPath,
        recipePath,
      );
    });

    return detail;
  }

  async getRun(runId: string): Promise<DiscoveryLabRunDetail | null> {
    let detail: DiscoveryLabRunDetail | null = null;
    try {
      const raw = await fs.readFile(this.runFilePath(runId), "utf8");
      detail = JSON.parse(raw) as DiscoveryLabRunDetail;
    } catch {
      const row = await db.discoveryLabRun.findUnique({ where: { id: runId } });
      detail = row ? this.fromDbRun(row) : null;
    }

    if (!detail?.report) {
      return detail;
    }

    const { report, changed } = await this.enrichReportWithDexPairs(
      detail.report,
    );
    if (!changed) {
      return detail;
    }

    const nextDetail = {
      ...detail,
      report,
    };
    await this.writeRunDetail(nextDetail);
    return nextDetail;
  }

  async listRunSummaries(): Promise<DiscoveryLabRunSummary[]> {
    const dbRuns = await db.discoveryLabRun.findMany({
      orderBy: [{ startedAt: "desc" }],
      take: MAX_RECENT_RUNS,
    });
    if (dbRuns.length > 0) {
      return dbRuns.map((row) => toRunSummary(this.fromDbRun(row)));
    }

    const files = await this.readJsonFiles(this.runsDir, (entry) =>
      entry.endsWith(".run.json"),
    );
    const details = files
      .map((item) => item as DiscoveryLabRunDetail)
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
      .slice(0, MAX_RECENT_RUNS);
    return details.map(toRunSummary);
  }

  private async resolvePackForRun(
    request: DiscoveryLabRunRequest,
  ): Promise<DiscoveryLabPack> {
    if (request.draft) {
      const validation = await this.validateDraft(
        request.draft,
        request.allowOverfiltered === true,
      );
      if (!validation.ok) {
        throw new Error("draft pack is invalid");
      }
      return normalizePackDraft(
        validation.pack,
        "custom",
        "__inline__",
        "inline",
      );
    }

    if (!request.packId) {
      throw new Error("packId or draft is required");
    }

    const packs = await this.listPacks();
    const pack = packs.find((candidate) => candidate.id === request.packId);
    if (!pack) {
      throw new Error("pack not found");
    }
    return pack;
  }

  private async listPacks(): Promise<DiscoveryLabPack[]> {
    const [created, custom] = await Promise.all([
      Promise.resolve(listCreatedDiscoveryLabPacks()),
      this.listCustomPacks(),
    ]);
    const packs = [...created, ...custom].sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === "created" ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    });
    return packs;
  }

  private async listCustomPacks(): Promise<DiscoveryLabPack[]> {
    return this.readJsonFiles(
      this.packsDir,
      (entry) => entry.endsWith(".json"),
      async (filePath) => this.readCustomPack(filePath),
    );
  }

  private async readCustomPack(filePath: string): Promise<DiscoveryLabPack> {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = customPackFileSchema.parse(JSON.parse(raw));
    return {
      id: parsed.id,
      kind: "custom",
      name: parsed.name,
      description: parsed.description ?? "",
      thesis: parsed.thesis,
      targetPnlBand: parsed.targetPnlBand,
      defaultSources: parsed.defaultSources?.length
        ? parsed.defaultSources
        : DEFAULT_SOURCES,
      defaultProfile: parsed.defaultProfile ?? DEFAULT_PROFILE,
      thresholdOverrides: parsed.thresholdOverrides ?? {},
      recipes: parsed.recipes,
      updatedAt:
        parsed.updatedAt ?? (await fs.stat(filePath)).mtime.toISOString(),
      sourcePath: filePath,
    };
  }

  private async seedWorkspacePacks(): Promise<void> {
    const seeds = listWorkspaceDiscoveryLabPackSeeds();
    for (const seed of seeds) {
      const filePath = this.packFilePath(seed.id);
      try {
        await fs.access(filePath);
      } catch {
        await writeJsonFileAtomic(filePath, seed);
      }
    }
  }

  private async allocatePackId(name: string): Promise<string> {
    const base = slugify(name) || "custom-pack";
    const taken = new Set((await this.listPacks()).map((pack) => pack.id));
    if (!taken.has(base)) {
      return base;
    }
    let suffix = 2;
    while (taken.has(`${base}-${suffix}`)) {
      suffix += 1;
    }
    return `${base}-${suffix}`;
  }

  private packFilePath(packId: string): string {
    return path.join(this.packsDir, `${packId}.json`);
  }

  private runFilePath(runId: string): string {
    return path.join(this.runsDir, `${runId}.run.json`);
  }

  private async writeRunDetail(detail: DiscoveryLabRunDetail): Promise<void> {
    await writeJsonFileAtomic(this.runFilePath(detail.id), detail);
    await this.upsertRunRecord(detail);
    await this.pruneRuns();
  }

  private async updateRunOutput(
    runId: string,
    stdout: string,
    stderr: string,
  ): Promise<void> {
    const current = await this.getRun(runId);
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
    _recordPath: string,
    recipePath: string,
  ): Promise<void> {
    const current = await this.getRun(runId);
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
      const cashUsd = Number(
        botState?.cashUsd ?? baseSettings.capital.capitalUsd,
      );
      const winnerByMint = new Map(
        report.winners.map((winner) => [winner.address, winner] as const),
      );
      report.deepEvaluations = report.deepEvaluations.map((evaluation) => ({
        ...evaluation,
        tradeSetup: buildTradeSetup({
          settings: baseSettings,
          cashUsd,
          openPositions,
          entryPriceUsd: evaluation.priceUsd,
          entryScore: evaluation.entryScore,
          presetId:
            evaluation.mode === "pregrad"
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
      current.strategyCalibration = buildDiscoveryLabLiveStrategy(
        current,
        baseSettings,
      );
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

  private async loadDexPairsForReport(
    report: DiscoveryLabReport,
  ): Promise<Map<string, DexScreenerTokenPair>> {
    const mints = [
      ...new Set(
        report.deepEvaluations
          .map((evaluation) => evaluation.mint)
          .filter(Boolean),
      ),
    ];
    if (mints.length === 0) {
      return new Map();
    }

    try {
      const dexscreener = new DexScreenerClient();
      return await dexscreener.getTopPairsByMint(mints);
    } catch (error) {
      logger.warn(
        { err: error, mintCount: mints.length },
        "discovery-lab dex pair enrichment failed",
      );
      return new Map();
    }
  }

  private async enrichReportWithDexPairs(report: DiscoveryLabReport): Promise<{
    report: DiscoveryLabReport;
    changed: boolean;
  }> {
    const needsHydration = report.deepEvaluations.some((evaluation) => {
      const socialCount = evaluation.socials?.count ?? 0;
      return (
        !evaluation.pairAddress ||
        !evaluation.pairCreatedAt ||
        socialCount === 0
      );
    });

    if (!needsHydration) {
      return { report, changed: false };
    }

    const dexPairs = await this.loadDexPairsForReport(report);
    let changed = false;
    const deepEvaluations = report.deepEvaluations.map((evaluation) => {
      const pair = dexPairs.get(evaluation.mint);
      if (!pair) {
        return evaluation;
      }

      const nextPairAddress =
        evaluation.pairAddress?.trim() || pair.pairAddress?.trim() || null;
      const nextPairCreatedAt =
        evaluation.pairCreatedAt ?? pair.pairCreatedAt ?? null;
      const nextSocials = {
        website: evaluation.socials?.website ?? pair.website ?? null,
        twitter: evaluation.socials?.twitter ?? pair.twitter ?? null,
        telegram: evaluation.socials?.telegram ?? pair.telegram ?? null,
        count: [
          evaluation.socials?.website ?? pair.website ?? null,
          evaluation.socials?.twitter ?? pair.twitter ?? null,
          evaluation.socials?.telegram ?? pair.telegram ?? null,
        ].filter(Boolean).length,
      };

      if (
        nextPairAddress === (evaluation.pairAddress ?? null) &&
        nextPairCreatedAt === (evaluation.pairCreatedAt ?? null) &&
        nextSocials.website === (evaluation.socials?.website ?? null) &&
        nextSocials.twitter === (evaluation.socials?.twitter ?? null) &&
        nextSocials.telegram === (evaluation.socials?.telegram ?? null) &&
        nextSocials.count === (evaluation.socials?.count ?? 0)
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

    return changed
      ? {
          report: {
            ...report,
            deepEvaluations,
          },
          changed: true,
        }
      : { report, changed: false };
  }

  private async syncPacksToDb(packs: DiscoveryLabPack[]): Promise<void> {
    await Promise.all(
      packs.map((pack) => this.upsertPackRecord(pack)),
    );
  }

  private async upsertPackRecord(
    pack: DiscoveryLabPack,
  ): Promise<void> {
    const discoveryLabPackData = {
      kind: mapPackKindForDb(pack),
      name: pack.name,
      description: pack.description,
      thesis: pack.thesis ?? null,
      targetPnlBand: pack.targetPnlBand
        ? toJsonValue(pack.targetPnlBand)
        : Prisma.DbNull,
      defaultProfile: pack.defaultProfile,
      defaultSources: toJsonValue(pack.defaultSources),
      thresholdOverrides: toJsonValue(pack.thresholdOverrides ?? {}),
      recipes: toJsonValue(pack.recipes),
      sourcePath: pack.sourcePath,
    } satisfies Prisma.DiscoveryLabPackUncheckedCreateInput;

    await db.discoveryLabPack.upsert({
      where: { id: pack.id },
      update: discoveryLabPackData,
      create: {
        id: pack.id,
        ...discoveryLabPackData,
      },
    });

    await this.upsertStrategyPackRecord(pack);
  }

  private async upsertStrategyPackRecord(
    pack: DiscoveryLabPack,
  ): Promise<void> {
    const snapshot = buildStrategyPackSnapshot(pack);
    const snapshotJson = toJsonValue(snapshot);
    const snapshotFingerprint = JSON.stringify(snapshotJson);

    await db.$transaction(async (tx) => {
      const existingPack = await tx.strategyPack.findUnique({
        where: { id: pack.id },
        select: { status: true, publishedAt: true },
      });
      const latestVersion = await tx.strategyPackVersion.findFirst({
        where: { packId: pack.id },
        orderBy: { version: "desc" },
        select: { version: true, configSnapshot: true },
      });
      const currentVersion = latestVersion?.version ?? 1;
      const latestFingerprint = latestVersion
        ? JSON.stringify(latestVersion.configSnapshot)
        : null;
      const nextVersion = latestFingerprint === snapshotFingerprint
        ? currentVersion
        : latestVersion
          ? latestVersion.version + 1
          : 1;

      await tx.strategyPack.upsert({
        where: { id: pack.id },
        update: {
          name: pack.name,
          version: nextVersion,
          recipe: toJsonValue(snapshot.recipe),
          baseFilters: toJsonValue(snapshot.baseFilters),
          baseExits: toJsonValue(snapshot.baseExits),
          adaptiveAxes: toJsonValue(snapshot.adaptiveAxes),
          capitalModifier: snapshot.capitalModifier,
          sortColumn: snapshot.sortColumn,
          sortOrder: snapshot.sortOrder,
          createdBy: snapshot.createdBy,
        },
        create: {
          id: pack.id,
          name: pack.name,
          version: nextVersion,
          status: existingPack?.status ?? "DRAFT",
          recipe: toJsonValue(snapshot.recipe),
          baseFilters: toJsonValue(snapshot.baseFilters),
          baseExits: toJsonValue(snapshot.baseExits),
          adaptiveAxes: toJsonValue(snapshot.adaptiveAxes),
          capitalModifier: snapshot.capitalModifier,
          sortColumn: snapshot.sortColumn,
          sortOrder: snapshot.sortOrder,
          publishedAt: existingPack?.publishedAt ?? null,
          createdBy: snapshot.createdBy,
        },
      });

      if (latestFingerprint !== snapshotFingerprint) {
        await tx.strategyPackVersion.create({
          data: {
            packId: pack.id,
            version: nextVersion,
            configSnapshot: snapshotJson,
            parentVersion: latestVersion?.version ?? null,
            notes: `discovery-lab ${pack.kind} sync`,
          },
        });
      }
    });
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
        strategyCalibration: detail.strategyCalibration
          ? toJsonValue(detail.strategyCalibration)
          : Prisma.DbNull,
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
        strategyCalibration: detail.strategyCalibration
          ? toJsonValue(detail.strategyCalibration)
          : Prisma.DbNull,
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

  private async syncRunReportTables(
    detail: DiscoveryLabRunDetail,
  ): Promise<void> {
    if (!detail.report) {
      await db.discoveryLabRunQuery.deleteMany({ where: { runId: detail.id } });
      await db.discoveryLabRunToken.deleteMany({ where: { runId: detail.id } });
      return;
    }

    const winnerByMint = new Map(
      detail.report.winners.map((winner) => [winner.address, winner] as const),
    );

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
            buySellRatio: evaluation.buySellRatio,
            priceChange5mPct: evaluation.priceChange5mPercent,
            top10HolderPct: evaluation.top10HolderPercent,
            largestHolderPct: evaluation.largestHolderPercent,
            timeSinceGraduationMin: evaluation.timeSinceGraduationMin,
            timeSinceCreationMin: evaluation.timeSinceCreationMin,
            softIssues: toJsonValue(evaluation.softIssues),
            notes: toJsonValue(evaluation.notes),
            isWinner: Boolean(winner),
            winnerScore: winner?.score ?? null,
            winnerRecipeNames: winner
              ? toJsonValue(winner.whichRecipes)
              : Prisma.DbNull,
            tradeSetup: evaluation.tradeSetup
              ? toJsonValue(evaluation.tradeSetup)
              : Prisma.DbNull,
          };
        }),
      });
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
      thresholdOverrides: (row.thresholdOverrides ??
        {}) as DiscoveryLabThresholdOverrides,
      strategyCalibration: (row.strategyCalibration ??
        null) as LiveStrategySettings | null,
      stdout: row.stdout ?? "",
      stderr: row.stderr ?? "",
      report: (row.report ?? null) as DiscoveryLabReport | null,
    };
  }

  private async reconcileInterruptedRuns(): Promise<void> {
    const files = await this.readJsonFiles(this.runsDir, (entry) =>
      entry.endsWith(".run.json"),
    );
    for (const file of files) {
      const detail = file as DiscoveryLabRunDetail;
      if (detail.status !== "RUNNING") {
        continue;
      }
      detail.status = "INTERRUPTED";
      detail.completedAt = detail.completedAt ?? new Date().toISOString();
      detail.errorMessage =
        detail.errorMessage ?? "run interrupted before completion";
      await writeJsonFileAtomic(this.runFilePath(detail.id), detail);
      await this.upsertRunRecord(detail);
    }
  }

  private async pruneRuns(): Promise<void> {
    const summaries = await this.listRunSummaries();
    if (summaries.length <= MAX_RECENT_RUNS) {
      return;
    }
    const stale = summaries.slice(MAX_RECENT_RUNS);
    for (const run of stale) {
      const prefix = path.join(this.runsDir, run.id);
      await fs
        .rm(this.runFilePath(run.id), { force: true })
        .catch(() => undefined);
      await fs
        .rm(`${prefix}.report.json`, { force: true })
        .catch(() => undefined);
      await fs
        .rm(`${prefix}.recipes.json`, { force: true })
        .catch(() => undefined);
    }
  }

  private async readJsonFiles<T = unknown>(
    dirPath: string,
    predicate: (entry: string) => boolean,
    mapFn?: (filePath: string) => Promise<T>,
  ): Promise<T[]> {
    try {
      const entries = await fs.readdir(dirPath);
      const values: T[] = [];
      for (const entry of entries.filter(predicate).sort()) {
        const filePath = path.join(dirPath, entry);
        try {
          if (mapFn) {
            values.push(await mapFn(filePath));
            continue;
          }
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

async function writeJsonFileAtomic(
  filePath: string,
  value: unknown,
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(value, null, 2));
  await fs.rename(tempPath, filePath);
}

function toRunSummary(detail: DiscoveryLabRunDetail): DiscoveryLabRunSummary {
  return {
    id: detail.id,
    status: detail.status,
    createdAt: detail.createdAt,
    startedAt: detail.startedAt,
    completedAt: detail.completedAt,
    appliedToLiveAt: detail.appliedToLiveAt,
    appliedConfigVersionId: detail.appliedConfigVersionId,
    packId: detail.packId,
    packName: detail.packName,
    packKind: detail.packKind,
    profile: detail.profile,
    sources: detail.sources,
    allowOverfiltered: detail.allowOverfiltered,
    queryCount: detail.queryCount,
    winnerCount: detail.winnerCount,
    evaluationCount: detail.evaluationCount,
    errorMessage: detail.errorMessage,
  };
}

function pushThresholdArgs(
  args: string[],
  overrides: DiscoveryLabThresholdOverrides,
): void {
  const flags: Array<[keyof DiscoveryLabThresholdOverrides, string]> = [
    ["minLiquidityUsd", "--min-liquidity-usd"],
    ["maxMarketCapUsd", "--max-market-cap-usd"],
    ["minHolders", "--min-holders"],
    ["minVolume5mUsd", "--min-volume-5m-usd"],
    ["minUniqueBuyers5m", "--min-unique-buyers-5m"],
    ["minBuySellRatio", "--min-buy-sell-ratio"],
    ["maxTop10HolderPercent", "--max-top10-holder-percent"],
    ["maxSingleHolderPercent", "--max-single-holder-percent"],
    [
      "maxNegativePriceChange5mPercent",
      "--max-negative-price-change-5m-percent",
    ],
  ];
  for (const [key, flag] of flags) {
    const value = overrides[key];
    if (value === undefined) continue;
    args.push(flag, String(value));
  }
}

function appendOutput(current: string, next: string): string {
  const combined = `${current}${next}`;
  return combined.length > 32_000 ? combined.slice(-32_000) : combined;
}

function extractFailureMessage(stderr: string, stdout: string): string {
  const stderrLines = stderr
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const meaningfulStderrLines = stderrLines.filter((line) => {
    return !(
      line === "^" ||
      line.startsWith("npm notice") ||
      line.startsWith("Node.js v") ||
      line.startsWith("at ") ||
      line.startsWith("node:")
    );
  });
  const preferredErrorLine = meaningfulStderrLines.find((line) =>
    /error|failed|cannot|not found|invalid|unauthorized/i.test(line),
  );
  if (preferredErrorLine) {
    return preferredErrorLine;
  }
  if (meaningfulStderrLines.length > 0) {
    return meaningfulStderrLines.at(-1) ?? "discovery lab run failed";
  }
  if (stderrLines.length > 0) {
    return stderrLines.at(0) ?? "discovery lab run failed";
  }
  const stdoutLines = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (stdoutLines.length > 0) {
    return stdoutLines.at(-1) ?? "discovery lab run failed";
  }
  if (!stderr.trim() && !stdout.trim()) {
    return "discovery lab run failed";
  }
  return "discovery lab run failed";
}

function mapPackKindForDb(
  pack: Pick<DiscoveryLabPack, "kind" | "id">,
): "CREATED" | "WORKSPACE" | "CUSTOM" {
  if (pack.kind === "created") {
    return "CREATED";
  }
  if (pack.id.startsWith("workspace-")) {
    return "WORKSPACE";
  }
  return "CUSTOM";
}

function mapPackKindFromDb(kind: string): DiscoveryLabPackKind {
  if (kind === "CREATED") {
    return "created";
  }
  return "custom";
}

function buildStrategyPackSnapshot(pack: DiscoveryLabPack) {
  return {
    recipe: {
      profile: pack.defaultProfile,
      sources: pack.defaultSources,
      recipes: pack.recipes,
      targetPnlBand: pack.targetPnlBand ?? null,
    },
    baseFilters: pack.thresholdOverrides ?? {},
    baseExits: {},
    adaptiveAxes: {},
    capitalModifier: new Prisma.Decimal(100),
    sortColumn: null,
    sortOrder: null,
    createdBy: `${pack.kind}:${pack.sourcePath ?? "local"}`,
  };
}

function isWorkspacePackId(packId: string): boolean {
  return packId.startsWith("workspace-");
}
