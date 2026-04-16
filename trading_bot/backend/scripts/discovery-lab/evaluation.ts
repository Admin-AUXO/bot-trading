import { env } from "../../src/config/env.js";
import { scoreEntrySignal } from "../../src/services/entry-scoring.js";
import type { DiscoveryToken, HolderConcentration, MintAuthoritySnapshot, TradeDataSnapshot } from "../../src/types/domain.js";
import { clamp, gradeFromScore, logScore, recipeWindowSeconds, resolveRelativeNumber } from "./shared.js";
import type { DeepEvaluation, LabRecipe, LabThresholds } from "./types.js";

type ThresholdOverrideInput = Partial<Omit<LabThresholds, "profileName">>;

export function applyThresholdObjectOverrides(
  thresholds: LabThresholds,
  overrides: ThresholdOverrideInput,
): LabThresholds {
  const next: LabThresholds = { ...thresholds };

  if (typeof overrides.minLiquidityUsd === "number") next.minLiquidityUsd = overrides.minLiquidityUsd;
  if (typeof overrides.maxMarketCapUsd === "number") next.maxMarketCapUsd = overrides.maxMarketCapUsd;
  if (typeof overrides.minHolders === "number") next.minHolders = overrides.minHolders;
  if (typeof overrides.minVolume5mUsd === "number") next.minVolume5mUsd = overrides.minVolume5mUsd;
  if (typeof overrides.minUniqueBuyers5m === "number") next.minUniqueBuyers5m = overrides.minUniqueBuyers5m;
  if (typeof overrides.minBuySellRatio === "number") next.minBuySellRatio = overrides.minBuySellRatio;
  if (typeof overrides.maxTop10HolderPercent === "number") next.maxTop10HolderPercent = overrides.maxTop10HolderPercent;
  if (typeof overrides.maxSingleHolderPercent === "number") next.maxSingleHolderPercent = overrides.maxSingleHolderPercent;
  if (typeof overrides.maxGraduationAgeSeconds === "number") next.maxGraduationAgeSeconds = overrides.maxGraduationAgeSeconds;
  if (typeof overrides.maxNegativePriceChange5mPercent === "number") {
    next.maxNegativePriceChange5mPercent = overrides.maxNegativePriceChange5mPercent;
  }

  return next;
}

export function buildThresholds(profileName: "runtime" | "high-value" | "scalp"): LabThresholds {
  if (profileName === "runtime") {
    return {
      profileName,
      minLiquidityUsd: env.MIN_LIQUIDITY_USD,
      maxMarketCapUsd: env.MAX_MARKET_CAP_USD,
      minHolders: env.MIN_HOLDERS,
      minUniqueBuyers5m: env.MIN_UNIQUE_BUYERS_5M,
      minBuySellRatio: env.MIN_BUY_SELL_RATIO,
      maxTop10HolderPercent: env.MAX_TOP10_HOLDER_PERCENT,
      maxSingleHolderPercent: env.MAX_SINGLE_HOLDER_PERCENT,
      maxGraduationAgeSeconds: env.MAX_GRADUATION_AGE_SECONDS,
      minVolume5mUsd: env.MIN_VOLUME_5M_USD,
      maxNegativePriceChange5mPercent: env.MAX_NEGATIVE_PRICE_CHANGE_5M_PERCENT,
    };
  }

  if (profileName === "scalp") {
    return {
      profileName,
      minLiquidityUsd: 8_000,
      maxMarketCapUsd: 2_000_000,
      minHolders: 35,
      minUniqueBuyers5m: 12,
      minBuySellRatio: 1.05,
      maxTop10HolderPercent: 45,
      maxSingleHolderPercent: 25,
      maxGraduationAgeSeconds: 5_400,
      minVolume5mUsd: 1_500,
      maxNegativePriceChange5mPercent: 18,
    };
  }

  return {
    profileName,
    minLiquidityUsd: Math.max(env.MIN_LIQUIDITY_USD, 20_000),
    maxMarketCapUsd: Math.max(env.MAX_MARKET_CAP_USD, 2_500_000),
    minHolders: Math.max(env.MIN_HOLDERS, 150),
    minUniqueBuyers5m: Math.max(env.MIN_UNIQUE_BUYERS_5M, 30),
    minBuySellRatio: Math.max(env.MIN_BUY_SELL_RATIO, 1.2),
    maxTop10HolderPercent: Math.min(env.MAX_TOP10_HOLDER_PERCENT, 25),
    maxSingleHolderPercent: Math.min(env.MAX_SINGLE_HOLDER_PERCENT, 10),
    maxGraduationAgeSeconds: Math.min(Math.max(env.MAX_GRADUATION_AGE_SECONDS, 14_400), 14_400),
    minVolume5mUsd: Math.max(env.MIN_VOLUME_5M_USD, 5_000),
    maxNegativePriceChange5mPercent: Math.max(env.MAX_NEGATIVE_PRICE_CHANGE_5M_PERCENT, 15),
  };
}

export function applyThresholdOverrides(
  thresholds: LabThresholds,
  args: Record<string, string | boolean>,
): LabThresholds {
  const numberArg = (key: string, fallback: number) => {
    const value = args[key];
    if (typeof value !== "string") return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const intArg = (key: string, fallback: number) => {
    const value = args[key];
    if (typeof value !== "string") return fallback;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  return applyThresholdObjectOverrides(thresholds, {
    minLiquidityUsd: numberArg("min-liquidity-usd", thresholds.minLiquidityUsd),
    maxMarketCapUsd: numberArg("max-market-cap-usd", thresholds.maxMarketCapUsd),
    minHolders: intArg("min-holders", thresholds.minHolders),
    minVolume5mUsd: numberArg("min-volume-5m-usd", thresholds.minVolume5mUsd),
    minUniqueBuyers5m: intArg("min-unique-buyers-5m", thresholds.minUniqueBuyers5m),
    minBuySellRatio: numberArg("min-buy-sell-ratio", thresholds.minBuySellRatio),
    maxTop10HolderPercent: numberArg("max-top10-holder-percent", thresholds.maxTop10HolderPercent),
    maxSingleHolderPercent: numberArg("max-single-holder-percent", thresholds.maxSingleHolderPercent),
    maxNegativePriceChange5mPercent: numberArg("max-negative-price-change-5m-percent", thresholds.maxNegativePriceChange5mPercent),
  });
}

export function preScoreToken(token: DiscoveryToken, recipe: LabRecipe, nowUnix: number) {
  const minProgress = Number(resolveRelativeNumber(recipe.params.min_progress_percent, nowUnix) ?? 80);
  const referenceTime = recipe.mode === "graduated"
    ? token.graduatedAt ?? token.lastTradeAt
    : token.recentListingAt ?? token.creationAt ?? token.lastTradeAt;
  const windowSeconds = recipeWindowSeconds(recipe, nowUnix);
  const ageSeconds = referenceTime ? Math.max(0, nowUnix - referenceTime) : windowSeconds;
  const freshnessScore = recipe.mode === "graduated"
    ? clamp(1 - (ageSeconds / Math.max(windowSeconds, 1)), 0, 1)
    : clamp((token.progressPercent - minProgress) / Math.max(100 - minProgress, 1), 0, 1);
  const recencyScore = token.lastTradeAt
    ? clamp(1 - ((nowUnix - token.lastTradeAt) / 1_800), 0, 1)
    : 0;
  const liquidityFloor = Number(resolveRelativeNumber(recipe.params.min_liquidity, nowUnix) ?? 5_000);
  const liquidityScore = logScore(token.liquidityUsd ?? 0, Math.max(liquidityFloor, 1));
  const volumeFloor = Number(resolveRelativeNumber(recipe.params.min_volume_5m_usd, nowUnix) ?? 500);
  const volumeScore = logScore(token.volume5mUsd ?? token.volume1hUsd ?? 0, Math.max(volumeFloor, 1));
  const holderScore = clamp((token.holders ?? 0) / 300, 0, 1);
  const tradeScore = clamp((token.trades5m ?? token.trades1h ?? 0) / 500, 0, 1);
  const sourceBoost = token.source === "pump_dot_fun" ? 0.03 : 0;

  return (freshnessScore * 0.28)
    + (liquidityScore * 0.23)
    + (volumeScore * 0.21)
    + (holderScore * 0.12)
    + (tradeScore * 0.1)
    + (recencyScore * 0.06)
    + sourceBoost;
}

function runtimeLikeScore(input: {
  token: DiscoveryToken;
  tradeData: TradeDataSnapshot | null;
  holderConcentration: HolderConcentration | null;
  thresholds: LabThresholds;
  referenceUnix: number | null;
  ageWindowSeconds: number;
}) {
  const { token, tradeData, holderConcentration, thresholds, referenceUnix, ageWindowSeconds } = input;
  const ageSeconds = referenceUnix ? Math.max(0, Math.floor(Date.now() / 1000) - referenceUnix) : ageWindowSeconds;
  const ratio = (tradeData?.volumeBuy5mUsd ?? 0) / Math.max(tradeData?.volumeSell5mUsd ?? 0, 1);
  return scoreEntrySignal(
    {
      liquidityUsd: token.liquidityUsd ?? 0,
      volume5mUsd: tradeData?.volume5mUsd ?? token.volume5mUsd ?? 0,
      buySellRatio: ratio,
      priceChange5mPercent: tradeData?.priceChange5mPercent ?? token.priceChange5mPercent ?? 0,
      uniqueWallets5m: tradeData?.uniqueWallets5m ?? 0,
      holders: token.holders ?? 0,
      top10HolderPercent: holderConcentration?.top10Percent ?? thresholds.maxTop10HolderPercent,
      largestHolderPercent: holderConcentration?.largestHolderPercent ?? thresholds.maxSingleHolderPercent,
      ageSeconds,
      source: token.source,
    },
    {
      minLiquidityUsd: thresholds.minLiquidityUsd,
      minVolume5mUsd: thresholds.minVolume5mUsd,
      minBuySellRatio: thresholds.minBuySellRatio,
      minUniqueBuyers5m: thresholds.minUniqueBuyers5m,
      minHolders: thresholds.minHolders,
      maxTop10HolderPercent: thresholds.maxTop10HolderPercent,
      maxSingleHolderPercent: thresholds.maxSingleHolderPercent,
      maxNegativePriceChange5mPercent: thresholds.maxNegativePriceChange5mPercent,
      maxGraduationAgeSeconds: Math.max(ageWindowSeconds, 1),
    },
  );
}

export function evaluateGraduatedToken(
  token: DiscoveryToken,
  recipe: LabRecipe,
  thresholds: LabThresholds,
  tradeData: TradeDataSnapshot | null,
  mintAuthorities: MintAuthoritySnapshot | null,
  holderConcentration: HolderConcentration | null,
  preScore: number,
  nowUnix: number,
): DeepEvaluation {
  const softIssues: string[] = [];
  const notes: string[] = [];
  const ageSeconds = token.graduatedAt ? nowUnix - token.graduatedAt : Number.POSITIVE_INFINITY;
  const referenceUnix = token.graduatedAt ?? token.lastTradeAt;
  const ageWindowSeconds = recipeWindowSeconds(recipe, nowUnix);
  const volume5mUsd = tradeData?.volume5mUsd ?? token.volume5mUsd ?? 0;
  const uniqueBuyers5m = tradeData?.uniqueWallets5m ?? 0;
  const buySellRatio = (tradeData?.volumeBuy5mUsd ?? 0) / Math.max(tradeData?.volumeSell5mUsd ?? 0, 1);
  const priceChange5m = tradeData?.priceChange5mPercent ?? token.priceChange5mPercent ?? 0;
  const marketCapUsd = token.marketCapUsd ?? 0;

  let rejectReason: string | null = null;

  if (!token.graduated || !token.graduatedAt) {
    rejectReason = "token is not confirmed as graduated";
  } else if (ageSeconds > thresholds.maxGraduationAgeSeconds) {
    rejectReason = `graduation too old: ${ageSeconds}s`;
  } else if ((token.liquidityUsd ?? 0) < thresholds.minLiquidityUsd * 0.65) {
    rejectReason = "liquidity far below floor";
  } else if (marketCapUsd > thresholds.maxMarketCapUsd * 2) {
    rejectReason = "market cap far above high-value ceiling";
  } else if ((token.holders ?? 0) < thresholds.minHolders * 0.65) {
    rejectReason = "holder count far below floor";
  } else if (!tradeData) {
    rejectReason = "trade data unavailable";
  } else if (volume5mUsd < thresholds.minVolume5mUsd * 0.65) {
    rejectReason = "5m volume far below floor";
  } else if (uniqueBuyers5m < thresholds.minUniqueBuyers5m * 0.65) {
    rejectReason = "unique buyers far below floor";
  } else if (buySellRatio < thresholds.minBuySellRatio * 0.7) {
    rejectReason = "buy/sell ratio collapsed";
  } else if (priceChange5m <= -thresholds.maxNegativePriceChange5mPercent * 1.5) {
    rejectReason = "price already dumping hard";
  } else if (!mintAuthorities) {
    rejectReason = "mint account unavailable";
  } else if (Boolean(mintAuthorities.mintAuthority)) {
    rejectReason = "mint authority still active";
  } else if (Boolean(mintAuthorities.freezeAuthority)) {
    rejectReason = "freeze authority still active";
  } else if (!holderConcentration) {
    rejectReason = "holder concentration unavailable";
  } else if (holderConcentration.top10Percent > thresholds.maxTop10HolderPercent * 1.25) {
    rejectReason = "top10 concentration far too high";
  } else if (holderConcentration.largestHolderPercent > thresholds.maxSingleHolderPercent * 1.25) {
    rejectReason = "largest holder concentration far too high";
  }

  if (!rejectReason) {
    if ((token.liquidityUsd ?? 0) < thresholds.minLiquidityUsd) softIssues.push("liquidity below floor");
    if (marketCapUsd > thresholds.maxMarketCapUsd) softIssues.push("market cap above preferred ceiling");
    if ((token.holders ?? 0) < thresholds.minHolders) softIssues.push("holder count below floor");
    if (volume5mUsd < thresholds.minVolume5mUsd) softIssues.push("5m volume below floor");
    if (uniqueBuyers5m < thresholds.minUniqueBuyers5m) softIssues.push("unique buyers below floor");
    if (buySellRatio < thresholds.minBuySellRatio) softIssues.push("buy/sell ratio too weak");
    if (priceChange5m <= -thresholds.maxNegativePriceChange5mPercent) softIssues.push("price already fading");
    if ((holderConcentration?.top10Percent ?? 0) > thresholds.maxTop10HolderPercent) softIssues.push("top10 concentration too high");
    if ((holderConcentration?.largestHolderPercent ?? 0) > thresholds.maxSingleHolderPercent) softIssues.push("largest holder concentration too high");

    if (softIssues.length >= 2) {
      rejectReason = `multiple soft weaknesses: ${softIssues.join(", ")}`;
    }
  }

  const entryScore = runtimeLikeScore({
    token,
    tradeData,
    holderConcentration,
    thresholds,
    referenceUnix,
    ageWindowSeconds,
  });
  const freshnessBonus = ageSeconds <= 900 ? 0.1 : ageSeconds <= 3_600 ? 0.07 : ageSeconds <= 14_400 ? 0.03 : 0;
  const tapeBonus = token.lastTradeAt && (nowUnix - token.lastTradeAt) <= 300 ? 0.03 : 0;
  const playScore = clamp(entryScore + freshnessBonus + tapeBonus, 0, 1.2);
  const pass = rejectReason === null;
  const grade = gradeFromScore(playScore, pass);

  if (holderConcentration) {
    notes.push(`top10=${holderConcentration.top10Percent.toFixed(2)}% largest=${holderConcentration.largestHolderPercent.toFixed(2)}%`);
  }

  return {
    mint: token.mint,
    mode: recipe.mode,
    pass,
    grade,
    preScore,
    entryScore,
    playScore,
    rejectReason,
    softIssues,
    notes,
    tradeData,
    mintAuthorities,
    holderConcentration,
  };
}

export function evaluatePregradToken(
  token: DiscoveryToken,
  recipe: LabRecipe,
  thresholds: LabThresholds,
  tradeData: TradeDataSnapshot | null,
  mintAuthorities: MintAuthoritySnapshot | null,
  holderConcentration: HolderConcentration | null,
  preScore: number,
  nowUnix: number,
): DeepEvaluation {
  const softIssues: string[] = [];
  const notes: string[] = [];
  const minProgress = Number(resolveRelativeNumber(recipe.params.min_progress_percent, nowUnix) ?? 85);
  const liquidityFloor = Number(resolveRelativeNumber(recipe.params.min_liquidity, nowUnix) ?? Math.max(thresholds.minLiquidityUsd * 0.4, 3_000));
  const recentTradeWindow = nowUnix - Number(resolveRelativeNumber(recipe.params.min_last_trade_unix_time, nowUnix) ?? (nowUnix - 600));
  const recentListingWindow = recipeWindowSeconds(recipe, nowUnix);
  const referenceUnix = token.recentListingAt ?? token.creationAt ?? token.lastTradeAt;
  const volume5mUsd = tradeData?.volume5mUsd ?? token.volume5mUsd ?? 0;
  const volumeFloor = Math.max(500, thresholds.minVolume5mUsd * 0.35);
  const uniqueBuyersFloor = Math.max(10, Math.round(thresholds.minUniqueBuyers5m * 0.6));
  const buySellFloor = Math.max(1.0, thresholds.minBuySellRatio * 0.8);
  const buySellRatio = (tradeData?.volumeBuy5mUsd ?? 0) / Math.max(tradeData?.volumeSell5mUsd ?? 0, 1);

  let rejectReason: string | null = null;

  if (token.graduated) {
    notes.push("already graduated during a pregrad recipe");
  }
  if (token.progressPercent < minProgress) {
    rejectReason = "progress below recipe floor";
  } else if ((token.liquidityUsd ?? 0) < liquidityFloor * 0.5) {
    rejectReason = "liquidity too weak for a pregrad play";
  } else if (!tradeData) {
    rejectReason = "trade data unavailable";
  } else if (volume5mUsd < volumeFloor * 0.5) {
    rejectReason = "5m flow too weak";
  } else if ((tradeData.uniqueWallets5m ?? 0) < uniqueBuyersFloor * 0.5) {
    rejectReason = "unique buyer flow too weak";
  } else if (buySellRatio < buySellFloor * 0.75) {
    rejectReason = "buy/sell ratio too weak";
  } else if (token.lastTradeAt && (nowUnix - token.lastTradeAt) > Math.max(recentTradeWindow, 1_800)) {
    rejectReason = "tape already stale";
  } else if (holderConcentration && holderConcentration.largestHolderPercent > thresholds.maxSingleHolderPercent * 1.5) {
    rejectReason = "largest holder concentration too high";
  }

  if (!rejectReason) {
    if ((token.liquidityUsd ?? 0) < liquidityFloor) softIssues.push("liquidity below preferred floor");
    if (volume5mUsd < volumeFloor) softIssues.push("5m flow below preferred floor");
    if ((tradeData?.uniqueWallets5m ?? 0) < uniqueBuyersFloor) softIssues.push("unique buyers below preferred floor");
    if (buySellRatio < buySellFloor) softIssues.push("buy/sell ratio below preferred floor");
    if (holderConcentration && holderConcentration.top10Percent > thresholds.maxTop10HolderPercent * 1.1) {
      softIssues.push("top10 concentration elevated");
    }
    if (softIssues.length >= 2) {
      rejectReason = `multiple soft weaknesses: ${softIssues.join(", ")}`;
    }
  }

  const entryScore = runtimeLikeScore({
    token,
    tradeData,
    holderConcentration,
    thresholds,
    referenceUnix,
    ageWindowSeconds: recentListingWindow,
  });
  const progressBonus = clamp((token.progressPercent - minProgress) / Math.max(100 - minProgress, 1), 0, 1) * 0.18;
  const recencyBonus = token.lastTradeAt && (nowUnix - token.lastTradeAt) <= 300 ? 0.03 : 0;
  const playScore = clamp((entryScore * 0.82) + progressBonus + recencyBonus, 0, 1.2);
  const pass = rejectReason === null;
  const grade = gradeFromScore(playScore, pass);

  if (mintAuthorities?.mintAuthority) {
    notes.push("mint authority still active pre-grad");
  }
  if (mintAuthorities?.freezeAuthority) {
    notes.push("freeze authority still active pre-grad");
  }

  return {
    mint: token.mint,
    mode: recipe.mode,
    pass,
    grade,
    preScore,
    entryScore,
    playScore,
    rejectReason,
    softIssues,
    notes,
    tradeData,
    mintAuthorities,
    holderConcentration,
  };
}
