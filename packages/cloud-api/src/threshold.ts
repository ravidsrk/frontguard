export type ThresholdComparison = -1 | 0 | 1;

/** Compare percentage-point output with a ratio threshold without float-boundary drift. */
export function compareDiffToThreshold(
  diffPercentage: number,
  thresholdRatio: number,
): ThresholdComparison {
  if (!Number.isFinite(diffPercentage) || !Number.isFinite(thresholdRatio)) return 1;

  const thresholdPercentage = thresholdRatio * 100;
  const delta = diffPercentage - thresholdPercentage;
  const tolerance =
    Number.EPSILON * 8 * Math.max(1, Math.abs(diffPercentage), Math.abs(thresholdPercentage));

  if (Math.abs(delta) <= tolerance) return 0;
  return delta < 0 ? -1 : 1;
}
