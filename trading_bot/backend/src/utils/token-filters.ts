import type { TokenSecurity, TokenHolder, TokenOverview, TradeData, JsonValue } from "./types.js";

export interface FilterResult {
  pass: boolean;
  reason?: string;
  filterResults: Record<string, JsonValue>;
}

export function runSecurityChecks(
  security: TokenSecurity | null,
  holders: TokenHolder[],
  rules: {
    maxTop10HolderPercent: number;
    maxSingleHolderPercent: number;
  },
): FilterResult {
  const filterResults: Record<string, JsonValue> = {};

  if (!security) {
    return { pass: false, reason: "no security data", filterResults };
  }

  filterResults.top10HolderPercent = security.top10HolderPercent;

  if (security.top10HolderPercent > rules.maxTop10HolderPercent) {
    return {
      pass: false,
      reason: `top10 ${security.top10HolderPercent}% > ${rules.maxTop10HolderPercent}%`,
      filterResults,
    };
  }

  if (security.freezeable) {
    return { pass: false, reason: "freezeable", filterResults };
  }

  if (security.mintAuthority) {
    return { pass: false, reason: "mint authority", filterResults };
  }

  if (security.transferFeeEnable) {
    return { pass: false, reason: "transfer fee", filterResults };
  }

  const topHolderPercent = holders.length > 0
    ? (holders[0].percent > 0
      ? holders[0].percent
      : (holders[0].balanceUi != null && security.totalSupply != null && security.totalSupply > 0
        ? (holders[0].balanceUi / security.totalSupply) * 100
        : 0))
    : 0;
  filterResults.topHolderPercent = topHolderPercent;

  if (holders.length > 0 && topHolderPercent > rules.maxSingleHolderPercent) {
    return {
      pass: false,
      reason: `top holder ${topHolderPercent}%`,
      filterResults,
    };
  }

  return { pass: true, filterResults };
}

export function runTradeDataChecks(
  tradeData: TradeData | null,
  rules: {
    minUniqueBuyers5m?: number;
    minBuySellRatio?: number;
    minWashTradingRatio?: number;
    minBuyPressure?: number;
    requireTradeData?: boolean;
  },
): FilterResult {
  const filterResults: Record<string, JsonValue> = {
    tradeDataAvailable: tradeData !== null,
  };

  if (!tradeData) {
    return rules.requireTradeData
      ? { pass: false, reason: "no trade data", filterResults }
      : { pass: true, filterResults };
  }

  filterResults.buyCount5m = tradeData.buy5m;
  filterResults.uniqueWallet5m = tradeData.uniqueWallet5m;
  filterResults.volume5m = tradeData.volume5m;

  if (rules.minUniqueBuyers5m !== undefined && tradeData.uniqueWallet5m < rules.minUniqueBuyers5m) {
    return {
      pass: false,
      reason: `unique wallets ${tradeData.uniqueWallet5m} < ${rules.minUniqueBuyers5m}`,
      filterResults,
    };
  }

  if (rules.minBuySellRatio !== undefined) {
    const buySellRatio = tradeData.buy5m / Math.max(tradeData.trade5m - tradeData.buy5m, 1);
    filterResults.buySellRatio = buySellRatio;
    if (buySellRatio < rules.minBuySellRatio) {
      return {
        pass: false,
        reason: `buy/sell ratio ${buySellRatio.toFixed(2)}`,
        filterResults,
      };
    }
  }

  if (rules.minWashTradingRatio !== undefined) {
    const washTradingRatio = tradeData.volume5m > 0
      ? tradeData.uniqueWallet5m / (tradeData.volume5m / 1000)
      : 0;
    filterResults.washTradingRatio = washTradingRatio;
    if (washTradingRatio < rules.minWashTradingRatio) {
      return {
        pass: false,
        reason: "wash trading detected",
        filterResults,
      };
    }
  }

  return { pass: true, filterResults };
}

export function runLiquidityMarketCapChecks(
  liquidity: number | undefined,
  marketCap: number | undefined,
  rules: {
    minLiquidity?: number;
    maxMarketCap?: number;
  },
): FilterResult {
  const filterResults: Record<string, JsonValue> = {};

  if (liquidity !== undefined) {
    filterResults.liquidity = liquidity;
    if (rules.minLiquidity !== undefined && liquidity < rules.minLiquidity) {
      return {
        pass: false,
        reason: `liquidity ${liquidity} < ${rules.minLiquidity}`,
        filterResults,
      };
    }
  }

  if (marketCap !== undefined) {
    filterResults.marketCap = marketCap;
    if (rules.maxMarketCap !== undefined && marketCap > rules.maxMarketCap) {
      return {
        pass: false,
        reason: `mcap ${marketCap} > ${rules.maxMarketCap}`,
        filterResults,
      };
    }
  }

  return { pass: true, filterResults };
}

export function runHolderCountCheck(
  overview: TokenOverview | null,
  rules: {
    minHolderCount?: number;
  },
): FilterResult {
  const filterResults: Record<string, JsonValue> = {
    holderCount: overview?.holder ?? null,
  };

  if (!overview) {
    return { pass: true, filterResults };
  }

  if (rules.minHolderCount !== undefined && overview.holder < rules.minHolderCount) {
    return {
      pass: false,
      reason: `holders ${overview.holder} < ${rules.minHolderCount}`,
      filterResults,
    };
  }

  return { pass: true, filterResults };
}

export function runFreshnessCheck(
  timestampSec: number | null | undefined,
  rules: {
    nowMs?: number;
    maxAgeSeconds?: number;
    requireTimestamp?: boolean;
    ageKey?: string;
    label?: string;
  },
): FilterResult {
  const ageKey = rules.ageKey ?? "ageSeconds";
  const label = rules.label ?? "timestamp";
  const filterResults: Record<string, JsonValue> = {
    [ageKey]: null,
    [`${ageKey}Available`]: timestampSec != null && timestampSec > 0,
  };

  if (timestampSec == null || timestampSec <= 0) {
    return rules.requireTimestamp
      ? { pass: false, reason: `missing ${label}`, filterResults }
      : { pass: true, filterResults };
  }

  const ageSeconds = Math.max(0, Math.floor(((rules.nowMs ?? Date.now()) / 1000) - timestampSec));
  filterResults[ageKey] = ageSeconds;

  if (rules.maxAgeSeconds !== undefined && ageSeconds > rules.maxAgeSeconds) {
    return {
      pass: false,
      reason: `${label} age ${ageSeconds}s > ${rules.maxAgeSeconds}s`,
      filterResults,
    };
  }

  return { pass: true, filterResults };
}
