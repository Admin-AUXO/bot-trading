type NumericLike = number | string | { toString(): string } | null | undefined;

function toNumber(value: NumericLike): number {
  if (value == null) return 0;
  return Number(value);
}

export function serializeOpenPosition<T extends {
  entryPriceSol: NumericLike;
  entryPriceUsd: NumericLike;
  currentPriceSol: NumericLike;
  currentPriceUsd: NumericLike;
  amountSol: NumericLike;
  amountToken: NumericLike;
  remainingToken: NumericLike;
  peakPriceUsd: NumericLike;
  stopLossPercent: NumericLike;
  openedAt: Date;
}>(position: T) {
  const entryPriceSol = toNumber(position.entryPriceSol);
  const entryPriceUsd = toNumber(position.entryPriceUsd);
  const currentPriceSol = toNumber(position.currentPriceSol);
  const currentPriceUsd = toNumber(position.currentPriceUsd);
  const amountSol = toNumber(position.amountSol);
  const amountToken = toNumber(position.amountToken);
  const remainingToken = toNumber(position.remainingToken);
  const peakPriceUsd = toNumber(position.peakPriceUsd);
  const stopLossPercent = toNumber(position.stopLossPercent);
  const remainingRatio = amountToken > 0 ? remainingToken / amountToken : 0;
  const remainingAmountSol = amountSol * remainingRatio;
  const remainingValueUsd = remainingToken * currentPriceUsd;
  const pnlUsd = (currentPriceUsd - entryPriceUsd) * remainingToken;
  const pnlPercent = entryPriceUsd > 0
    ? ((currentPriceUsd - entryPriceUsd) / entryPriceUsd) * 100
    : 0;

  return {
    ...position,
    entryPriceSol,
    entryPriceUsd,
    currentPriceSol,
    currentPriceUsd,
    amountSol,
    amountToken,
    remainingToken,
    remainingAmountSol,
    remainingValueUsd,
    peakPriceUsd,
    stopLossPercent,
    pnlUsd,
    pnlPercent,
    holdMinutes: (Date.now() - position.openedAt.getTime()) / 60_000,
  };
}
