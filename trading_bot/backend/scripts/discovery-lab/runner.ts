import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { HolderConcentration, MintAuthoritySnapshot, TradeDataSnapshot } from "../../src/types/domain.js";
import { applyThresholdObjectOverrides, applyThresholdOverrides, buildThresholds, evaluateGraduatedToken, evaluatePregradToken, preScoreToken } from "./evaluation.js";
import { getHolderConcentrationsBatch, getMemeList, getMintAuthoritiesBatch, getTradeData } from "./providers.js";
import {
  asInt,
  candidateKey,
  countActiveFilters,
  csv,
  defaultCachePath,
  deriveWinnerCsvPath,
  isMintResearch,
  loadCache,
  loadRecipeSelection,
  mapWithConcurrency,
  parseArgs,
  printHelp,
  resolveRelativeNumber,
  saveCache,
  DEFAULT_SOURCES,
} from "./shared.js";
import { buildSourceSummaries, buildWinnerSummaries, minutesSince, printQuerySummaries, printSourceSummaries, renderWinnerCsv, summarizeQuery } from "./reporting.js";
import type {
  BatchFetchResult,
  DeepEvaluation,
  MintResearch,
  QueryOutcome,
  RankedToken,
  ResolvedPlan,
} from "./types.js";

export async function runDiscoveryLabCli() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const { recipePath, recipes: loadedRecipes, packContext } = await loadRecipeSelection(
    scriptDir,
    typeof args.recipes === "string" ? args.recipes : undefined,
    typeof args.pack === "string" ? args.pack : undefined,
  );
  const sources = csv(args.sources, DEFAULT_SOURCES);
  const recipeNames = new Set(csv(args["recipe-names"]));
  const profileNameArg = typeof args.profile === "string"
    ? args.profile.trim()
    : (packContext?.defaultProfile ?? "high-value");
  const profileName = profileNameArg === "runtime" || profileNameArg === "scalp"
    ? profileNameArg
    : "high-value";
  const thresholds = applyThresholdOverrides(
    applyThresholdObjectOverrides(buildThresholds(profileName), packContext?.thresholdOverrides ?? {}),
    args,
  );
  const deepEvalLimitOverride = asInt(args["deep-eval-limit"], 0);
  const queryConcurrency = asInt(args["query-concurrency"], 2);
  const deepConcurrency = asInt(args["deep-concurrency"], 4);
  const cacheTtlSeconds = asInt(args["cache-ttl-seconds"], 300);
  const outPath = typeof args.out === "string" ? path.resolve(process.cwd(), args.out) : null;
  const outCsvPath = typeof args["out-csv"] === "string"
    ? path.resolve(process.cwd(), args["out-csv"])
    : (outPath ? deriveWinnerCsvPath(outPath) : null);
  const allowOverfiltered = args["allow-overfiltered"] === true;
  const cachePath = path.resolve(
    typeof args["cache-file"] === "string"
      ? args["cache-file"]
      : defaultCachePath(),
  );

  const recipes = loadedRecipes
    .filter((recipe) => recipeNames.size === 0 || recipeNames.has(recipe.name))
    .map((recipe) => ({
      ...recipe,
      deepEvalLimit: deepEvalLimitOverride > 0 ? deepEvalLimitOverride : (recipe.deepEvalLimit ?? 6),
    }));

  if (recipes.length === 0) {
    throw new Error("No recipes selected.");
  }

  const nowUnix = Math.floor(Date.now() / 1000);
  const plans: ResolvedPlan[] = [];
  for (const recipe of recipes) {
    const explicitSource = typeof recipe.params.source === "string" && recipe.params.source.trim().length > 0
      ? recipe.params.source.trim()
      : null;
    const planSources = explicitSource ? [explicitSource] : sources;

    for (const source of planSources) {
      const params: Record<string, string | number | boolean> = {};
      for (const [key, value] of Object.entries(recipe.params)) {
        const resolved = resolveRelativeNumber(value, nowUnix);
        if (resolved !== undefined) {
          params[key] = resolved;
        }
      }
      if (!("source" in params)) {
        params.source = source;
      }
      if (!("sort_type" in params)) {
        params.sort_type = "desc";
      }
      if (!("limit" in params)) {
        params.limit = 100;
      }

      const filterCount = countActiveFilters(params);
      plans.push({
        key: `${source}/${recipe.name}`,
        source,
        recipe,
        params,
        filterCount,
      });
    }
  }

  console.log(`Running discovery lab with profile=${thresholds.profileName}, recipes=${recipes.length}, sources=${sources.join(",")}`);
  console.log(`Planned queries=${plans.length}, minimum Birdeye CU=${plans.length * 100}`);

  const queryOutcomes = await mapWithConcurrency(plans, queryConcurrency, async (plan) => {
    if (plan.filterCount > 5 && !allowOverfiltered) {
      return {
        plan,
        returnedCount: 0,
        selectedCount: 0,
        queryCu: 0,
        durationMs: 0,
        status: "skipped",
        skipReason: `filter ceiling exceeded (${plan.filterCount} > 5)`,
        selectedTokens: [],
        topReturned: [],
      } satisfies QueryOutcome;
    }

    const startedAt = Date.now();
    try {
      const response = await getMemeList(plan.params);
      const ranked = response.items
        .map((token) => ({
          token,
          preScore: preScoreToken(token, plan.recipe, nowUnix),
        }))
        .sort((left, right) => right.preScore - left.preScore);
      const selected = ranked.slice(0, plan.recipe.deepEvalLimit ?? 6);

      return {
        plan,
        returnedCount: response.items.length,
        selectedCount: selected.length,
        queryCu: 100,
        durationMs: Date.now() - startedAt,
        status: "ok",
        selectedTokens: selected,
        topReturned: ranked.slice(0, 10).map((item) => ({
          symbol: item.token.symbol,
          mint: item.token.mint,
          preScore: item.preScore,
          liquidityUsd: item.token.liquidityUsd ?? 0,
          volume5mUsd: item.token.volume5mUsd ?? 0,
          volume1hUsd: item.token.volume1hUsd ?? 0,
          progressPercent: item.token.progressPercent,
        })),
      } satisfies QueryOutcome;
    } catch (error) {
      return {
        plan,
        returnedCount: 0,
        selectedCount: 0,
        queryCu: 100,
        durationMs: Date.now() - startedAt,
        status: "error",
        errorMessage: error instanceof Error ? error.message : String(error),
        selectedTokens: [],
        topReturned: [],
      } satisfies QueryOutcome;
    }
  });

  const selectedTokenMap = new Map<string, RankedToken>();
  for (const outcome of queryOutcomes) {
    if (outcome.status !== "ok") continue;
    for (const item of outcome.selectedTokens) {
      const current = selectedTokenMap.get(item.token.mint);
      if (!current || item.preScore > current.preScore) {
        selectedTokenMap.set(item.token.mint, item);
      }
    }
  }

  const mintResearchByMint = new Map<string, MintResearch>();
  const cache = await loadCache(cachePath);
  const deepByCandidate = new Map<string, DeepEvaluation>();
  const selectedEntries = [...selectedTokenMap.values()];
  const uncachedEntries: RankedToken[] = [];

  for (const entry of selectedEntries) {
    const cached = cache[entry.token.mint];
    if (cached && isMintResearch(cached.value) && (Date.now() - cached.fetchedAt) <= cacheTtlSeconds * 1_000) {
      mintResearchByMint.set(entry.token.mint, cached.value);
      continue;
    }
    uncachedEntries.push(entry);
  }

  const tradeDataByMint = new Map<string, BatchFetchResult<TradeDataSnapshot>>();
  await mapWithConcurrency(uncachedEntries, deepConcurrency, async ({ token }) => {
    try {
      tradeDataByMint.set(token.mint, { value: await getTradeData(token.mint), error: null });
    } catch (error) {
      tradeDataByMint.set(token.mint, { value: null, error: error instanceof Error ? error.message : String(error) });
    }
  });

  const mintAuthorityByMint = await getMintAuthoritiesBatch(uncachedEntries.map(({ token }) => token.mint));
  const holderConcentrationByMint = await getHolderConcentrationsBatch(
    uncachedEntries.map(({ token }) => ({
      mint: token.mint,
      supplyRaw: mintAuthorityByMint.get(token.mint)?.value?.supplyRaw ?? "0",
    })),
    Math.min(Math.max(1, deepConcurrency), 4),
  );

  for (const { token } of uncachedEntries) {
    const tradeDataResult = tradeDataByMint.get(token.mint) ?? {
      value: null,
      error: "missing birdeye trade-data result",
    } satisfies BatchFetchResult<TradeDataSnapshot>;
    const mintAuthorityResult = mintAuthorityByMint.get(token.mint) ?? {
      value: null,
      error: "missing helius mint-authority result",
    } satisfies BatchFetchResult<MintAuthoritySnapshot>;
    const holderResult = holderConcentrationByMint.get(token.mint) ?? {
      value: null,
      error: "missing helius holder-concentration result",
    } satisfies BatchFetchResult<HolderConcentration>;

    const errors = [tradeDataResult.error, mintAuthorityResult.error, holderResult.error]
      .filter((value): value is string => typeof value === "string" && value.length > 0);

    mintResearchByMint.set(token.mint, {
      tradeData: tradeDataResult.value,
      mintAuthorities: mintAuthorityResult.value,
      holderConcentration: holderResult.value,
      errorMessage: errors.length > 0 ? errors.join("; ") : null,
    });
  }

  for (const outcome of queryOutcomes) {
    if (outcome.status !== "ok") continue;
    for (const selected of outcome.selectedTokens) {
      const research = mintResearchByMint.get(selected.token.mint);
      if (!research) continue;

      const deep = research.errorMessage
        ? {
          mint: selected.token.mint,
          mode: outcome.plan.recipe.mode,
          pass: false,
          grade: "REJECT",
          preScore: selected.preScore,
          entryScore: 0,
          playScore: 0,
          rejectReason: research.errorMessage,
          softIssues: [],
          notes: [],
          tradeData: null,
          mintAuthorities: null,
          holderConcentration: null,
        } satisfies DeepEvaluation
        : outcome.plan.recipe.mode === "graduated"
          ? evaluateGraduatedToken(
            selected.token,
            outcome.plan.recipe,
            thresholds,
            research.tradeData,
            research.mintAuthorities,
            research.holderConcentration,
            selected.preScore,
            nowUnix,
          )
          : evaluatePregradToken(
            selected.token,
            outcome.plan.recipe,
            thresholds,
            research.tradeData,
            research.mintAuthorities,
            research.holderConcentration,
            selected.preScore,
            nowUnix,
          );

      deepByCandidate.set(candidateKey(outcome.plan.key, selected.token.mint), deep);
      cache[selected.token.mint] = { fetchedAt: Date.now(), value: research };
    }
  }

  await saveCache(cachePath, cache);

  const querySummaries = queryOutcomes
    .filter((outcome) => outcome.status === "ok")
    .map((outcome) => summarizeQuery(outcome, deepByCandidate));
  const sourceSummaries = buildSourceSummaries(querySummaries, sources);

  printSourceSummaries(sourceSummaries);
  printQuerySummaries(querySummaries);

  const failedQueries = queryOutcomes.filter((outcome) => outcome.status !== "ok");
  if (failedQueries.length > 0) {
    console.log("\nSkipped / failed queries");
    for (const item of failedQueries) {
      const reason = item.skipReason ?? item.errorMessage ?? "unknown";
      console.log(`- ${item.plan.key}: ${item.status} (${reason})`);
    }
  }

  const generatedAt = new Date().toISOString();
  const winnerSummaries = buildWinnerSummaries(
    queryOutcomes,
    deepByCandidate,
    mintResearchByMint,
    Math.floor(new Date(generatedAt).getTime() / 1_000),
  );

  if (outPath) {
    const report = {
      generatedAt,
      profile: thresholds.profileName,
      thresholds,
      recipePath,
      sources,
      queryCount: plans.length,
      querySummaries,
      sourceSummaries,
      winners: winnerSummaries,
      deepEvaluations: queryOutcomes
        .filter((outcome) => outcome.status === "ok")
        .flatMap((outcome) => outcome.selectedTokens.map(({ token }) => {
          const deep = deepByCandidate.get(candidateKey(outcome.plan.key, token.mint));
          if (!deep) return null;
          return {
            planKey: outcome.plan.key,
            recipeName: outcome.plan.recipe.name,
            mode: outcome.plan.recipe.mode,
            mint: token.mint,
            symbol: token.symbol,
            source: token.source,
            playScore: deep.playScore,
            entryScore: deep.entryScore,
            grade: deep.grade,
            pass: deep.pass,
            rejectReason: deep.rejectReason,
            priceUsd: deep.tradeData?.priceUsd ?? token.priceUsd ?? null,
            liquidityUsd: token.liquidityUsd ?? null,
            marketCapUsd: token.marketCapUsd ?? null,
            holders: token.holders ?? null,
            volume5mUsd: deep.tradeData?.volume5mUsd ?? token.volume5mUsd ?? null,
            volume30mUsd: deep.tradeData?.volume30mUsd ?? token.volume30mUsd ?? null,
            uniqueWallets5m: deep.tradeData?.uniqueWallets5m ?? null,
            buySellRatio: deep.tradeData
              ? (deep.tradeData.volumeBuy5mUsd ?? 0) / Math.max(deep.tradeData.volumeSell5mUsd ?? 0, 1)
              : null,
            priceChange5mPercent: deep.tradeData?.priceChange5mPercent ?? token.priceChange5mPercent ?? null,
            priceChange30mPercent: deep.tradeData?.priceChange30mPercent ?? token.priceChange30mPercent ?? null,
            top10HolderPercent: deep.holderConcentration?.top10Percent ?? null,
            largestHolderPercent: deep.holderConcentration?.largestHolderPercent ?? null,
            timeSinceGraduationMin: minutesSince(nowUnix, token.graduatedAt),
            timeSinceCreationMin: minutesSince(nowUnix, token.creationAt),
            softIssues: deep.softIssues,
            notes: deep.notes,
          };
        }))
        .filter((item): item is NonNullable<typeof item> => item !== null),
    };
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, JSON.stringify(report, null, 2));
    console.log(`\nWrote report to ${outPath}`);
  }

  if (outCsvPath) {
    await fs.mkdir(path.dirname(outCsvPath), { recursive: true });
    await fs.writeFile(outCsvPath, renderWinnerCsv(winnerSummaries));
    console.log(`Wrote winners CSV to ${outCsvPath}`);
  }
}
