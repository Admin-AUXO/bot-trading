import type { DiscoveryToken, MintAuthoritySnapshot, TradeDataSnapshot } from "../../src/types/domain.js";
import { candidateKey } from "./shared.js";
import type { DeepEvaluation, MintResearch, QueryOutcome, QuerySummary, SourceSummary, WinnerSummary } from "./types.js";

function preferPositiveNumber(base: number | null | undefined, candidate: number | null | undefined) {
  if (base !== null && base !== undefined && base > 0) {
    return base;
  }
  if (candidate !== null && candidate !== undefined && candidate > 0) {
    return candidate;
  }
  return base ?? candidate ?? null;
}

function mergeTokenForWinner(base: DiscoveryToken, candidate: DiscoveryToken): DiscoveryToken {
  return {
    ...base,
    name: base.name || candidate.name,
    symbol: base.symbol || candidate.symbol,
    source: base.source || candidate.source,
    creator: base.creator ?? candidate.creator,
    platformId: base.platformId ?? candidate.platformId,
    graduatedAt: preferPositiveNumber(base.graduatedAt, candidate.graduatedAt),
    creationAt: preferPositiveNumber(base.creationAt, candidate.creationAt),
    recentListingAt: preferPositiveNumber(base.recentListingAt, candidate.recentListingAt),
    lastTradeAt: preferPositiveNumber(base.lastTradeAt, candidate.lastTradeAt),
    decimals: base.decimals ?? candidate.decimals,
    priceUsd: preferPositiveNumber(base.priceUsd, candidate.priceUsd),
    liquidityUsd: preferPositiveNumber(base.liquidityUsd, candidate.liquidityUsd),
    marketCapUsd: preferPositiveNumber(base.marketCapUsd, candidate.marketCapUsd),
    fdvUsd: preferPositiveNumber(base.fdvUsd, candidate.fdvUsd),
    totalSupply: preferPositiveNumber(base.totalSupply, candidate.totalSupply),
    circulatingSupply: preferPositiveNumber(base.circulatingSupply, candidate.circulatingSupply),
    holders: preferPositiveNumber(base.holders, candidate.holders),
  };
}

function bigIntValue(value: string | number | bigint | null | undefined) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  if (typeof value === "string" && value.length > 0) return BigInt(value);
  return 0n;
}

function marketCapForWinner(
  token: DiscoveryToken,
  tradeData: TradeDataSnapshot | null,
  mintAuthorities: MintAuthoritySnapshot | null,
) {
  if (token.marketCapUsd !== null && token.marketCapUsd !== undefined && token.marketCapUsd > 0) {
    return token.marketCapUsd;
  }

  const priceUsd = tradeData?.priceUsd ?? token.priceUsd;
  if (priceUsd === null || priceUsd === undefined) {
    return null;
  }

  if (mintAuthorities && mintAuthorities.decimals >= 0) {
    const supplyRaw = Number(bigIntValue(mintAuthorities.supplyRaw));
    const normalizedSupply = supplyRaw / (10 ** mintAuthorities.decimals);
    if (Number.isFinite(normalizedSupply) && normalizedSupply > 0) {
      const computedMarketCap = priceUsd * normalizedSupply;
      return computedMarketCap > 0 ? computedMarketCap : null;
    }
  }

  const totalSupply = token.totalSupply ?? token.circulatingSupply;
  if (totalSupply !== null && totalSupply !== undefined && totalSupply > 0) {
    const computedMarketCap = priceUsd * totalSupply;
    return computedMarketCap > 0 ? computedMarketCap : null;
  }

  return null;
}

export function minutesSince(nowUnix: number, unixTime: number | null | undefined) {
  if (unixTime === null || unixTime === undefined || unixTime <= 0) {
    return null;
  }

  const normalizedUnix = unixTime > nowUnix * 10 ? unixTime / 1_000 : unixTime;
  return Math.max(0, (nowUnix - normalizedUnix) / 60);
}

export function buildWinnerSummaries(
  queryOutcomes: QueryOutcome[],
  deepByCandidate: Map<string, DeepEvaluation>,
  mintResearchByMint: Map<string, MintResearch>,
  nowUnix: number,
) {
  const winners = new Map<string, {
    bestToken: DiscoveryToken;
    winnerFacts: DiscoveryToken;
    research: MintResearch;
    bestScore: number;
    recipes: Map<string, number>;
  }>();

  for (const outcome of queryOutcomes) {
    if (outcome.status !== "ok") continue;

    for (const { token } of outcome.selectedTokens) {
      const deep = deepByCandidate.get(candidateKey(outcome.plan.key, token.mint));
      if (!deep?.pass) continue;

      const research = mintResearchByMint.get(token.mint);
      if (!research) continue;

      const current = winners.get(token.mint);
      if (!current) {
        winners.set(token.mint, {
          bestToken: token,
          winnerFacts: token,
          research,
          bestScore: deep.playScore,
          recipes: new Map([[outcome.plan.recipe.name, deep.playScore]]),
        });
        continue;
      }

      current.winnerFacts = mergeTokenForWinner(current.winnerFacts, token);
      current.research = current.research.errorMessage ? research : current.research;
      current.recipes.set(
        outcome.plan.recipe.name,
        Math.max(current.recipes.get(outcome.plan.recipe.name) ?? Number.NEGATIVE_INFINITY, deep.playScore),
      );
      if (deep.playScore > current.bestScore) {
        current.bestScore = deep.playScore;
        current.bestToken = token;
      }
    }
  }

  return [...winners.entries()]
    .map(([mint, winner]) => {
      const token = mergeTokenForWinner(winner.bestToken, winner.winnerFacts);
      const tradeData = winner.research.tradeData;
      const holderConcentration = winner.research.holderConcentration;
      const mintAuthorities = winner.research.mintAuthorities;
      const recipeNames = [...winner.recipes.entries()]
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .map(([recipeName]) => recipeName);

      return {
        tokenName: token.name || token.symbol || mint,
        address: mint,
        timeSinceGraduationMin: minutesSince(nowUnix, token.graduatedAt),
        timeSinceCreationMin: minutesSince(nowUnix, token.creationAt),
        priceUsd: tradeData?.priceUsd ?? token.priceUsd ?? null,
        liquidityUsd: token.liquidityUsd ?? null,
        holders: token.holders ?? null,
        volume1mUsd: tradeData?.volume1mUsd ?? token.volume1mUsd ?? null,
        volume5mUsd: tradeData?.volume5mUsd ?? token.volume5mUsd ?? null,
        volumeChange1mPercent: tradeData?.volume1mChangePercent ?? token.volume1mChangePercent ?? null,
        volumeChange5mPercent: tradeData?.volume5mChangePercent ?? token.volume5mChangePercent ?? null,
        priceChange1mPercent: tradeData?.priceChange1mPercent ?? token.priceChange1mPercent ?? null,
        priceChange5mPercent: tradeData?.priceChange5mPercent ?? token.priceChange5mPercent ?? null,
        trades1m: tradeData?.trades1m ?? token.trades1m ?? null,
        trades5m: tradeData?.trades5m ?? token.trades5m ?? null,
        uniqueWallets5m: tradeData?.uniqueWallets5m ?? null,
        uniqueWallets24h: tradeData?.uniqueWallets24h ?? null,
        buySellRatio: tradeData
          ? (tradeData.volumeBuy5mUsd ?? 0) / Math.max(tradeData.volumeSell5mUsd ?? 0, 1)
          : null,
        marketCapUsd: marketCapForWinner(token, tradeData, mintAuthorities),
        mintAuth: mintAuthorities?.mintAuthority ?? "inactive",
        top10HolderPercent: holderConcentration?.top10Percent ?? null,
        maxSingleHolderPercent: holderConcentration?.largestHolderPercent ?? null,
        score: winner.bestScore,
        whichRecipes: recipeNames,
      } satisfies WinnerSummary;
    })
    .sort((left, right) => right.score - left.score || left.tokenName.localeCompare(right.tokenName));
}

function formatCsvCell(value: string | number | null | undefined) {
  if (value === null || value === undefined) {
    return "";
  }

  const text = typeof value === "number" ? String(value) : value;
  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll("\"", "\"\"")}"`;
  }
  return text;
}

function formatWinnerNumber(value: number | null, digits: number) {
  if (value === null || value === undefined) {
    return "";
  }

  return value.toFixed(digits);
}

export function renderWinnerCsv(winners: WinnerSummary[]) {
  const header = [
    "token_name",
    "address",
    "time_since_graduation_min",
    "time_since_creation_min",
    "volume_1m_usd",
    "volume_5m_usd",
    "volume_change_1m_percent",
    "volume_change_5m_percent",
    "price_change_1m_percent",
    "price_change_5m_percent",
    "trades_1m",
    "trades_5m",
    "unique_wallets_24h",
    "market_cap_usd",
    "mint_auth",
    "top10_holder_percent",
    "max_single_holder_percent",
    "score",
    "which_recipes",
  ];

  const rows = winners.map((winner) => ([
    winner.tokenName,
    winner.address,
    formatWinnerNumber(winner.timeSinceGraduationMin, 2),
    formatWinnerNumber(winner.timeSinceCreationMin, 2),
    formatWinnerNumber(winner.volume1mUsd, 2),
    formatWinnerNumber(winner.volume5mUsd, 2),
    formatWinnerNumber(winner.volumeChange1mPercent, 2),
    formatWinnerNumber(winner.volumeChange5mPercent, 2),
    formatWinnerNumber(winner.priceChange1mPercent, 2),
    formatWinnerNumber(winner.priceChange5mPercent, 2),
    formatWinnerNumber(winner.trades1m, 0),
    formatWinnerNumber(winner.trades5m, 0),
    formatWinnerNumber(winner.uniqueWallets24h, 0),
    formatWinnerNumber(winner.marketCapUsd, 2),
    winner.mintAuth ?? "",
    formatWinnerNumber(winner.top10HolderPercent, 2),
    formatWinnerNumber(winner.maxSingleHolderPercent, 2),
    formatWinnerNumber(winner.score, 4),
    winner.whichRecipes.join("|"),
  ]));

  return [
    header.map(formatCsvCell).join(","),
    ...rows.map((row) => row.map(formatCsvCell).join(",")),
  ].join("\n");
}

export function summarizeQuery(
  outcome: QueryOutcome,
  deepByCandidate: Map<string, DeepEvaluation>,
): QuerySummary {
  const selected = outcome.selectedTokens
    .map(({ token }) => {
      const deep = deepByCandidate.get(candidateKey(outcome.plan.key, token.mint));
      if (!deep) return null;
      return { token, deep };
    })
    .filter((value): value is { token: DiscoveryToken; deep: DeepEvaluation } => value !== null);

  const good = selected.filter(({ deep }) => deep.pass);

  const avgGoodPlayScore = good.length > 0
    ? good.reduce((sum, item) => sum + item.deep.playScore, 0) / good.length
    : 0;
  const avgGoodEntryScore = good.length > 0
    ? good.reduce((sum, item) => sum + item.deep.entryScore, 0) / good.length
    : 0;
  const avgSelectedPlayScore = selected.length > 0
    ? selected.reduce((sum, item) => sum + item.deep.playScore, 0) / selected.length
    : 0;
  const avgSelectedEntryScore = selected.length > 0
    ? selected.reduce((sum, item) => sum + item.deep.entryScore, 0) / selected.length
    : 0;
  const estimatedCu = outcome.queryCu + (outcome.selectedCount * 17);
  const rejectCount = Math.max(selected.length - good.length, 0);
  const selectionRatePercent = outcome.returnedCount > 0 ? (selected.length / outcome.returnedCount) * 100 : 0;
  const passRatePercent = selected.length > 0 ? (good.length / selected.length) * 100 : 0;
  const winnerHitRatePercent = outcome.returnedCount > 0 ? (good.length / outcome.returnedCount) * 100 : 0;

  return {
    key: outcome.plan.key,
    source: outcome.plan.source,
    recipeName: outcome.plan.recipe.name,
    recipeMode: outcome.plan.recipe.mode,
    filterCount: outcome.plan.filterCount,
    returnedCount: outcome.returnedCount,
    selectedCount: outcome.selectedCount,
    goodCount: good.length,
    rejectCount,
    selectionRatePercent,
    passRatePercent,
    winnerHitRatePercent,
    avgGoodPlayScore,
    avgGoodEntryScore,
    avgSelectedPlayScore,
    avgSelectedEntryScore,
    estimatedCu,
    goodMints: good.map(({ token }) => token.mint),
    topSelectedTokens: selected
      .sort((left, right) => right.deep.playScore - left.deep.playScore)
      .slice(0, 5)
      .map(({ token, deep }) => ({
        symbol: token.symbol,
        mint: token.mint,
        grade: deep.grade,
        playScore: deep.playScore,
        rejectReason: deep.rejectReason,
      })),
    topGoodTokens: good
      .sort((left, right) => right.deep.playScore - left.deep.playScore)
      .slice(0, 5)
      .map(({ token, deep }) => ({
        symbol: token.symbol,
        mint: token.mint,
        grade: deep.grade,
        playScore: deep.playScore,
        rejectReason: deep.rejectReason,
      })),
  };
}

export function buildSourceSummaries(querySummaries: QuerySummary[], sources: string[]): SourceSummary[] {
  return sources.map((source) => {
    const sourceQueries = querySummaries.filter((summary) => summary.source === source);
    const goodMints = new Set(sourceQueries.flatMap((summary) => summary.goodMints));
    const sourceQueriesWithWins = sourceQueries.filter((summary) => summary.goodCount > 0);
    const bestByGoodCount = [...sourceQueriesWithWins]
      .sort((left, right) => right.goodCount - left.goodCount || right.avgGoodPlayScore - left.avgGoodPlayScore)[0];
    const bestByAverageScore = [...sourceQueriesWithWins]
      .sort((left, right) => right.avgGoodPlayScore - left.avgGoodPlayScore || right.goodCount - left.goodCount)[0];
    const bestByEfficiency = [...sourceQueriesWithWins]
      .sort((left, right) => (right.goodCount / Math.max(right.estimatedCu, 1)) - (left.goodCount / Math.max(left.estimatedCu, 1)))[0];
    const bestByQuality = [...sourceQueries]
      .sort((left, right) => right.avgSelectedPlayScore - left.avgSelectedPlayScore || right.returnedCount - left.returnedCount)[0];

    return {
      source,
      recipesRun: sourceQueries.length,
      totalReturned: sourceQueries.reduce((sum, item) => sum + item.returnedCount, 0),
      totalGoodTokens: sourceQueries.reduce((sum, item) => sum + item.goodCount, 0),
      uniqueGoodTokens: goodMints.size,
      bestByGoodCount: bestByGoodCount?.recipeName ?? null,
      bestByAverageScore: bestByAverageScore?.recipeName ?? null,
      bestByEfficiency: bestByEfficiency?.recipeName ?? null,
      bestByQuality: bestByQuality?.recipeName ?? null,
    };
  });
}

export function printSourceSummaries(sourceSummaries: SourceSummary[]) {
  console.log("\nSource winners");
  for (const summary of sourceSummaries) {
    console.log(
      `- ${summary.source}: recipes=${summary.recipesRun}, returned=${summary.totalReturned}, `
      + `good=${summary.totalGoodTokens}, uniqueGood=${summary.uniqueGoodTokens}, `
      + `bestCount=${summary.bestByGoodCount ?? "n/a"}, `
      + `bestScore=${summary.bestByAverageScore ?? "n/a"}, `
      + `bestEfficiency=${summary.bestByEfficiency ?? "n/a"}, `
      + `bestQuality=${summary.bestByQuality ?? "n/a"}`,
    );
  }
}

export function printQuerySummaries(querySummaries: QuerySummary[]) {
  console.log("\nTop query outcomes");
  const sorted = [...querySummaries]
    .sort(
      (left, right) => right.goodCount - left.goodCount
        || right.avgGoodPlayScore - left.avgGoodPlayScore
        || right.avgSelectedPlayScore - left.avgSelectedPlayScore,
    )
    .slice(0, 12);

  for (const summary of sorted) {
    const topSymbols = summary.topGoodTokens.length > 0
      ? summary.topGoodTokens.map((token) => `${token.symbol}:${token.grade}`).join(", ")
      : summary.topSelectedTokens.map((token) => `${token.symbol}:${token.grade}@${token.playScore.toFixed(2)}`).join(", ");
    console.log(
      `- ${summary.source} / ${summary.recipeName}: returned=${summary.returnedCount}, selected=${summary.selectedCount}, `
      + `good=${summary.goodCount}, reject=${summary.rejectCount}, selRate=${summary.selectionRatePercent.toFixed(1)}%, `
      + `passRate=${summary.passRatePercent.toFixed(1)}%, avgGood=${summary.avgGoodPlayScore.toFixed(3)}, `
      + `avgSel=${summary.avgSelectedPlayScore.toFixed(3)}, estCU=${summary.estimatedCu}, `
      + `top=${topSymbols || "none"}`,
    );
  }
}
