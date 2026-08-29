export interface ParsedThresholdRatio {
  ratio: number;
  legacyPercentage: boolean;
}

/** Parse the public threshold boundary into the internal 0-1 ratio. */
export function parseThresholdRatio(raw: string): ParsedThresholdRatio {
  const trimmed = raw.trim();
  const value = Number(trimmed);

  if (trimmed.length === 0 || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(
      'Threshold must be a ratio from 0 to 1 (0.01 = 1%); legacy percentages up to 100 are also accepted.',
    );
  }

  if (value > 1) {
    return { ratio: value / 100, legacyPercentage: true };
  }

  return { ratio: value, legacyPercentage: false };
}
