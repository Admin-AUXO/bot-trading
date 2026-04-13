import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { z } from "zod";
import { logger } from "../utils/logger.js";

type Scalar = string | number | boolean;
type QueryValue = Scalar | null;

export type RecipeMode = "graduated" | "pregrad";
export type DiscoveryLabProfile = "runtime" | "high-value" | "scalp";
export type DiscoveryLabPackKind = "builtin" | "custom";
export type DiscoveryLabRunStatus = "RUNNING" | "COMPLETED" | "FAILED" | "INTERRUPTED";

export type DiscoveryLabRecipe = {
  name: string;
  mode: RecipeMode;
  description?: string;
  deepEvalLimit?: number;
  params: Record<string, QueryValue>;
};

export type DiscoveryLabThresholdOverrides = Partial<{
  minLiquidityUsd: number;
  maxMarketCapUsd: number;
  minHolders: number;
  minVolume5mUsd: number;
  minUniqueBuyers5m: number;
  minBuySellRatio: number;
  maxTop10HolderPercent: number;
  maxSingleHolderPercent: number;
  maxNegativePriceChange5mPercent: number;
}>;

export type DiscoveryLabPack = {
  id: string;
  kind: DiscoveryLabPackKind;
  name: string;
  description: string;
  defaultSources: string[];
  defaultProfile: DiscoveryLabProfile;
  thresholdOverrides: DiscoveryLabThresholdOverrides;
  recipes: DiscoveryLabRecipe[];
  updatedAt: string;
  sourcePath: string;
};

export type DiscoveryLabValidationIssue = {
  path: string;
  message: string;
  level: "error" | "warning";
};

export type DiscoveryLabPackDraft = {
  id?: string;
  name: string;
  description?: string;
  defaultSources?: string[];
  defaultProfile?: DiscoveryLabProfile;
  thresholdOverrides?: DiscoveryLabThresholdOverrides;
  recipes: DiscoveryLabRecipe[];
};

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
  }>;
};

export type DiscoveryLabRunSummary = {
  id: string;
  status: DiscoveryLabRunStatus;
  createdAt: string;
  startedAt: string;
  completedAt: string | null;
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

const DEFAULT_PROFILE: DiscoveryLabProfile = "high-value";
const DEFAULT_SOURCES = ["pump_dot_fun"];
const KNOWN_SOURCES = [
  "pump_dot_fun",
  "moonshot",
  "raydium_launchlab",
  "meteora_dynamic_bonding_curve",
];
const MAX_RECENT_RUNS = 20;
const FILTER_KEYS = new Set([
  "source",
  "creator",
  "platform_id",
  "graduated",
  "min_progress_percent",
  "max_progress_percent",
  "min_graduated_time",
  "max_graduated_time",
  "min_creation_time",
  "max_creation_time",
  "min_recent_listing_time",
  "max_recent_listing_time",
  "min_last_trade_unix_time",
  "max_last_trade_unix_time",
  "min_liquidity",
  "max_liquidity",
  "min_market_cap",
  "max_market_cap",
  "min_fdv",
  "max_fdv",
  "min_holder",
  "min_volume_1m_usd",
  "min_volume_5m_usd",
  "min_volume_30m_usd",
  "min_volume_1h_usd",
  "min_volume_2h_usd",
  "min_volume_4h_usd",
  "min_volume_8h_usd",
  "min_volume_24h_usd",
  "min_volume_7d_usd",
  "min_volume_30d_usd",
  "min_volume_1m_change_percent",
  "min_volume_5m_change_percent",
  "min_volume_30m_change_percent",
  "min_volume_1h_change_percent",
  "min_volume_2h_change_percent",
  "min_volume_4h_change_percent",
  "min_volume_8h_change_percent",
  "min_volume_24h_change_percent",
  "min_volume_7d_change_percent",
  "min_volume_30d_change_percent",
  "min_price_change_1m_percent",
  "min_price_change_5m_percent",
  "min_price_change_30m_percent",
  "min_price_change_1h_percent",
  "min_price_change_2h_percent",
  "min_price_change_4h_percent",
  "min_price_change_8h_percent",
  "min_price_change_24h_percent",
  "min_price_change_7d_percent",
  "min_price_change_30d_percent",
  "min_trade_1m_count",
  "min_trade_5m_count",
  "min_trade_30m_count",
  "min_trade_1h_count",
  "min_trade_2h_count",
  "min_trade_4h_count",
  "min_trade_8h_count",
  "min_trade_24h_count",
  "min_trade_7d_count",
  "min_trade_30d_count",
]);

const queryValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const recipeSchema = z.object({
  name: z.string().trim().min(1),
  mode: z.enum(["graduated", "pregrad"]),
  description: z.string().optional(),
  deepEvalLimit: z.number().int().positive().max(25).optional(),
  params: z.record(z.string(), queryValueSchema),
});
const legacyRecipeFileSchema = z.object({
  description: z.string().optional(),
  recipes: z.array(recipeSchema).min(1),
});
const thresholdOverridesSchema = z.object({
  minLiquidityUsd: z.number().nonnegative().optional(),
  maxMarketCapUsd: z.number().nonnegative().optional(),
  minHolders: z.number().nonnegative().optional(),
  minVolume5mUsd: z.number().nonnegative().optional(),
  minUniqueBuyers5m: z.number().nonnegative().optional(),
  minBuySellRatio: z.number().nonnegative().optional(),
  maxTop10HolderPercent: z.number().nonnegative().optional(),
  maxSingleHolderPercent: z.number().nonnegative().optional(),
  maxNegativePriceChange5mPercent: z.number().nonnegative().optional(),
});
const customPackFileSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string().optional(),
  defaultSources: z.array(z.string().trim().min(1)).optional(),
  defaultProfile: z.enum(["runtime", "high-value", "scalp"]).optional(),
  thresholdOverrides: thresholdOverridesSchema.optional(),
  recipes: z.array(recipeSchema).min(1),
  updatedAt: z.string().optional(),
});
const draftSchema = z.object({
  id: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1),
  description: z.string().optional(),
  defaultSources: z.array(z.string().trim().min(1)).optional(),
  defaultProfile: z.enum(["runtime", "high-value", "scalp"]).optional(),
  thresholdOverrides: thresholdOverridesSchema.optional(),
  recipes: z.array(recipeSchema).min(1),
});

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
    await this.reconcileInterruptedRuns();
  }

  async getCatalog(): Promise<DiscoveryLabCatalog> {
    const [packs, recentRuns] = await Promise.all([
      this.listPacks(),
      this.listRunSummaries(),
    ]);
    const activeRun = recentRuns.find((run) => run.status === "RUNNING") ?? null;
    return {
      packs,
      activeRun,
      recentRuns,
      profiles: ["runtime", "high-value", "scalp"],
      knownSources: KNOWN_SOURCES,
    };
  }

  async validateDraft(input: DiscoveryLabPackDraft, allowOverfiltered = false): Promise<{
    ok: boolean;
    issues: DiscoveryLabValidationIssue[];
    pack: DiscoveryLabPackDraft;
  }> {
    const parsed = draftSchema.parse(input);
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
          message: "Recipe is at the 5-filter provider ceiling; adding another filter will break the request.",
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
    const id = normalized.id ?? await this.allocatePackId(normalized.name);
    const record = {
      id,
      name: normalized.name,
      description: normalized.description ?? "",
      defaultSources: normalized.defaultSources?.length ? normalized.defaultSources : DEFAULT_SOURCES,
      defaultProfile: normalized.defaultProfile ?? DEFAULT_PROFILE,
      thresholdOverrides: normalized.thresholdOverrides ?? {},
      recipes: normalized.recipes,
      updatedAt: new Date().toISOString(),
    };
    const filePath = this.packFilePath(id);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await writeJsonFileAtomic(filePath, record);
    return this.readCustomPack(filePath);
  }

  async deletePack(packId: string): Promise<{ ok: true }> {
    const filePath = this.packFilePath(packId);
    await fs.rm(filePath, { force: true });
    return { ok: true };
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

    const validation = await this.validateDraft(packToDraft(pack), allowOverfiltered);
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
      void this.finalizeRun(runId, code ?? 1, stdout, stderr, outPath, recordPath, recipePath);
    });
    child.on("error", (error) => {
      const message = error instanceof Error ? error.message : String(error);
      void this.finalizeRun(runId, 1, stdout, `${stderr}\n${message}`, outPath, recordPath, recipePath);
    });

    return detail;
  }

  async getRun(runId: string): Promise<DiscoveryLabRunDetail | null> {
    try {
      const raw = await fs.readFile(this.runFilePath(runId), "utf8");
      return JSON.parse(raw) as DiscoveryLabRunDetail;
    } catch {
      return null;
    }
  }

  async listRunSummaries(): Promise<DiscoveryLabRunSummary[]> {
    const files = await this.readJsonFiles(this.runsDir, (entry) => entry.endsWith(".run.json"));
    const details = files
      .map((item) => item as DiscoveryLabRunDetail)
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
      .slice(0, MAX_RECENT_RUNS);
    return details.map(toRunSummary);
  }

  private async resolvePackForRun(request: DiscoveryLabRunRequest): Promise<DiscoveryLabPack> {
    if (request.draft) {
      const validation = await this.validateDraft(request.draft, request.allowOverfiltered === true);
      if (!validation.ok) {
        throw new Error("draft pack is invalid");
      }
      return normalizePackDraft(validation.pack, "custom", "__inline__", "inline");
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
    const [builtin, custom] = await Promise.all([
      this.listBuiltinPacks(),
      this.listCustomPacks(),
    ]);
    return [...builtin, ...custom].sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === "builtin" ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    });
  }

  private async listBuiltinPacks(): Promise<DiscoveryLabPack[]> {
    const entries = await fs.readdir(this.scriptsDir);
    const files = entries
      .filter((entry) => /^discovery-lab(\.recipes.*)?\.json$/.test(entry))
      .sort();
    const packs: DiscoveryLabPack[] = [];

    for (const file of files) {
      const filePath = path.join(this.scriptsDir, file);
      const raw = await fs.readFile(filePath, "utf8");
      const parsed = legacyRecipeFileSchema.parse(JSON.parse(raw));
      const id = path.basename(file, ".json");
      packs.push({
        id,
        kind: "builtin",
        name: humanizePackName(id),
        description: parsed.description ?? "",
        defaultSources: DEFAULT_SOURCES,
        defaultProfile: inferProfileFromFileName(file),
        thresholdOverrides: {},
        recipes: parsed.recipes,
        updatedAt: (await fs.stat(filePath)).mtime.toISOString(),
        sourcePath: filePath,
      });
    }

    return packs;
  }

  private async listCustomPacks(): Promise<DiscoveryLabPack[]> {
    return this.readJsonFiles(this.packsDir, (entry) => entry.endsWith(".json"), async (filePath) => this.readCustomPack(filePath));
  }

  private async readCustomPack(filePath: string): Promise<DiscoveryLabPack> {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = customPackFileSchema.parse(JSON.parse(raw));
    return {
      id: parsed.id,
      kind: "custom",
      name: parsed.name,
      description: parsed.description ?? "",
      defaultSources: parsed.defaultSources?.length ? parsed.defaultSources : DEFAULT_SOURCES,
      defaultProfile: parsed.defaultProfile ?? DEFAULT_PROFILE,
      thresholdOverrides: parsed.thresholdOverrides ?? {},
      recipes: parsed.recipes,
      updatedAt: parsed.updatedAt ?? (await fs.stat(filePath)).mtime.toISOString(),
      sourcePath: filePath,
    };
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
    await this.pruneRuns();
  }

  private async updateRunOutput(runId: string, stdout: string, stderr: string): Promise<void> {
    const current = await this.getRun(runId);
    if (!current || current.status !== "RUNNING") {
      return;
    }
    current.stdout = stdout;
    current.stderr = stderr;
    await writeJsonFileAtomic(this.runFilePath(runId), current);
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
    if (code === 0 && report) {
      current.status = "COMPLETED";
      current.errorMessage = null;
    } else {
      current.status = "FAILED";
      current.errorMessage = extractFailureMessage(stderr, stdout);
    }

    this.runningProcess = null;
    await this.writeRunDetail(current);
    await fs.rm(recipePath, { force: true }).catch(() => undefined);
  }

  private async reconcileInterruptedRuns(): Promise<void> {
    const files = await this.readJsonFiles(this.runsDir, (entry) => entry.endsWith(".run.json"));
    for (const file of files) {
      const detail = file as DiscoveryLabRunDetail;
      if (detail.status !== "RUNNING") {
        continue;
      }
      detail.status = "INTERRUPTED";
      detail.completedAt = detail.completedAt ?? new Date().toISOString();
      detail.errorMessage = detail.errorMessage ?? "run interrupted before completion";
      await writeJsonFileAtomic(this.runFilePath(detail.id), detail);
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
      await fs.rm(this.runFilePath(run.id), { force: true }).catch(() => undefined);
      await fs.rm(`${prefix}.report.json`, { force: true }).catch(() => undefined);
      await fs.rm(`${prefix}.recipes.json`, { force: true }).catch(() => undefined);
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

function countRecipeFilters(params: Record<string, QueryValue>): number {
  return Object.entries(params)
    .filter(([key]) => FILTER_KEYS.has(key))
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .length;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function humanizePackName(id: string): string {
  const label = id
    .replace(/^discovery-lab\.recipes\.?/, "")
    .replace(/^discovery-lab/, "default")
    .replace(/[._-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
  return label || "Default";
}

function inferProfileFromFileName(fileName: string): DiscoveryLabProfile {
  if (fileName.includes("fast-turn")) return "scalp";
  if (fileName.includes("quality")) return "high-value";
  return DEFAULT_PROFILE;
}

async function writeJsonFileAtomic(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(value, null, 2));
  await fs.rename(tempPath, filePath);
}

function normalizeSources(input?: string[]): string[] {
  const values = (input ?? DEFAULT_SOURCES)
    .map((value) => value.trim())
    .filter(Boolean);
  return values.length > 0 ? values : DEFAULT_SOURCES;
}

function cleanThresholdOverrides(input?: DiscoveryLabThresholdOverrides): DiscoveryLabThresholdOverrides {
  const parsed = thresholdOverridesSchema.parse(input ?? {});
  return Object.fromEntries(
    Object.entries(parsed).filter(([, value]) => value !== undefined),
  ) as DiscoveryLabThresholdOverrides;
}

function packToDraft(pack: DiscoveryLabPack): DiscoveryLabPackDraft {
  return {
    id: pack.kind === "custom" ? pack.id : undefined,
    name: pack.name,
    description: pack.description,
    defaultSources: pack.defaultSources,
    defaultProfile: pack.defaultProfile,
    thresholdOverrides: pack.thresholdOverrides,
    recipes: pack.recipes,
  };
}

function normalizePackDraft(
  draft: DiscoveryLabPackDraft,
  kind: DiscoveryLabPackKind,
  sourcePath: string,
  fallbackId: string,
): DiscoveryLabPack {
  return {
    id: draft.id ?? fallbackId,
    kind,
    name: draft.name,
    description: draft.description ?? "",
    defaultSources: normalizeSources(draft.defaultSources),
    defaultProfile: draft.defaultProfile ?? DEFAULT_PROFILE,
    thresholdOverrides: cleanThresholdOverrides(draft.thresholdOverrides),
    recipes: draft.recipes,
    updatedAt: new Date().toISOString(),
    sourcePath,
  };
}

function toRunSummary(detail: DiscoveryLabRunDetail): DiscoveryLabRunSummary {
  return {
    id: detail.id,
    status: detail.status,
    createdAt: detail.createdAt,
    startedAt: detail.startedAt,
    completedAt: detail.completedAt,
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

function pushThresholdArgs(args: string[], overrides: DiscoveryLabThresholdOverrides): void {
  const flags: Array<[keyof DiscoveryLabThresholdOverrides, string]> = [
    ["minLiquidityUsd", "--min-liquidity-usd"],
    ["maxMarketCapUsd", "--max-market-cap-usd"],
    ["minHolders", "--min-holders"],
    ["minVolume5mUsd", "--min-volume-5m-usd"],
    ["minUniqueBuyers5m", "--min-unique-buyers-5m"],
    ["minBuySellRatio", "--min-buy-sell-ratio"],
    ["maxTop10HolderPercent", "--max-top10-holder-percent"],
    ["maxSingleHolderPercent", "--max-single-holder-percent"],
    ["maxNegativePriceChange5mPercent", "--max-negative-price-change-5m-percent"],
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
  const stderrLines = stderr.split("\n").map((line) => line.trim()).filter(Boolean);
  const meaningfulStderrLines = stderrLines.filter((line) => {
    return !(
      line === "^"
      || line.startsWith("npm notice")
      || line.startsWith("Node.js v")
      || line.startsWith("at ")
      || line.startsWith("node:")
    );
  });
  const preferredErrorLine = meaningfulStderrLines.find((line) => /error|failed|cannot|not found|invalid|unauthorized/i.test(line));
  if (preferredErrorLine) {
    return preferredErrorLine;
  }
  if (meaningfulStderrLines.length > 0) {
    return meaningfulStderrLines.at(-1) ?? "discovery lab run failed";
  }
  if (stderrLines.length > 0) {
    return stderrLines.at(0) ?? "discovery lab run failed";
  }
  const stdoutLines = stdout.split("\n").map((line) => line.trim()).filter(Boolean);
  if (stdoutLines.length > 0) {
    return stdoutLines.at(-1) ?? "discovery lab run failed";
  }
  if (!stderr.trim() && !stdout.trim()) {
    return "discovery lab run failed";
  }
  return "discovery lab run failed";
}
