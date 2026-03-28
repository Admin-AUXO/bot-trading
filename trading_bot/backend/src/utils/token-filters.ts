import type { TokenSecurity, TokenHolder, TradeData, JsonValue } from "./types.js";

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

  if (holders.length > 0 && holders[0].percent > rules.maxSingleHolderPercent) {
    return {
      pass: false,
      reason: `top holder ${holders[0].percent}%`,
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
    minBuyPressure?: number;
  },
): FilterResult {
  const filterResults: Record<string, JsonValue> = {};

  if (!tradeData) {
    return { pass: true, filterResults };
  }

  filterResults.uniqueBuyers5m = tradeData.buy5m;
  filterResults.volume5m = tradeData.volume5m;

  if (rules.minUniqueBuyers5m !== undefined && tradeData.buy5m < rules.minUniqueBuyers5m) {
    return {
      pass: false,
      reason: `unique buyers ${tradeData.buy5m} < ${rules.minUniqueBuyers5m}`,
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
