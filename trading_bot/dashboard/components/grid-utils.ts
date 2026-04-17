export type MetricScale = {
  min: number;
  max: number;
  inverse?: boolean;
} | null;

export function buildMetricScale(
  values: Array<number | null | undefined>,
  diverging = false,
  inverse = false,
): MetricScale {
  const numeric = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  if (numeric.length === 0) {
    return null;
  }
  if (diverging) {
    const bound = Math.max(Math.abs(Math.min(...numeric)), Math.abs(Math.max(...numeric)));
    return bound === 0 ? null : { min: -bound, max: bound, inverse: false };
  }
  const min = Math.min(...numeric);
  const max = Math.max(...numeric);
  return min === max ? null : { min, max, inverse };
}

export function buildHeatCellStyle(
  value: unknown,
  scale: MetricScale,
): Record<string, string> | undefined {
  const numeric = Number(value);
  if (!scale || !Number.isFinite(numeric)) {
    return undefined;
  }
  const rawRatio = Math.max(0, Math.min(1, (numeric - scale.min) / (scale.max - scale.min)));
  const ratio = scale.inverse ? 1 - rawRatio : rawRatio;
  const warmRatio = scale.inverse
    ? rawRatio
    : Math.max(0, Math.min(1, (0 - scale.min) / (scale.max - scale.min)));
  const greenAlpha = 0.06 + ratio * 0.15;
  const redAlpha = scale.inverse ? 0 : numeric < 0 ? 0.08 + (1 - ratio) * 0.14 : 0;
  if (redAlpha > 0) {
    return {
      background: `linear-gradient(180deg, rgba(251, 113, 133, ${redAlpha}) 0%, rgba(251, 113, 133, ${redAlpha * 0.42}) 100%)`,
    };
  }
  if (scale.inverse && warmRatio > 0.55) {
    return {
      background: `linear-gradient(180deg, rgba(163, 230, 53, ${greenAlpha}) 0%, rgba(163, 230, 53, ${greenAlpha * 0.42}) 100%)`,
      boxShadow: "inset 0 0 0 1px rgba(250, 204, 21, 0.18)",
    };
  }
  return {
    background: `linear-gradient(180deg, rgba(163, 230, 53, ${greenAlpha}) 0%, rgba(163, 230, 53, ${greenAlpha * 0.42}) 100%)`,
  };
}
