/**
 * Warn when the runner that produced baselines is not the runner about to
 * capture. The note is `FRONTGUARD_CAPTURE_RUNNER` or `captureRunner`.
 * This does not change comparison: pixelmatch stays the only pass/fail gate.
 *
 * @module discovery/capture-runner
 */

import type { CaptureRunnerName, FrontguardConfig } from '../core/types.js';
import { logger } from '../utils/logger.js';

const RUNNERS: readonly CaptureRunnerName[] = ['storybook', 'ladle', 'histoire'];

function isCaptureRunner(value: string): value is CaptureRunnerName {
  return (RUNNERS as readonly string[]).includes(value);
}

/**
 * The one story runner config actually selects. Storybook wins when its URL
 * is set, then Ladle, then Histoire. An empty block selects nothing, so
 * default crawl and filesystem discovery stay in place.
 */
export function selectedCaptureRunner(
  config: Pick<FrontguardConfig, 'storybook' | 'ladle' | 'histoire'>,
): CaptureRunnerName | null {
  if (config.storybook?.url) return 'storybook';
  if (config.ladle?.url || config.ladle?.dir) return 'ladle';
  if (config.histoire?.url || config.histoire?.dir) return 'histoire';
  return null;
}

/**
 * Previous-runner notes from the environment and config, in that order,
 * with duplicates removed. Unset notes are omitted.
 */
export function notedCaptureRunners(
  config: Pick<FrontguardConfig, 'captureRunner'>,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const notes: string[] = [];
  const fromEnv = env.FRONTGUARD_CAPTURE_RUNNER?.trim();
  if (fromEnv) notes.push(fromEnv);
  const fromConfig = config.captureRunner?.trim();
  if (fromConfig && !notes.includes(fromConfig)) notes.push(fromConfig);
  return notes;
}

/**
 * Log when a selected runner differs from a recorded baseline runner.
 * Unknown notes are still reported so a typo does not silently compare
 * incomparable shots. No pixels are approved here.
 */
export function warnIfCaptureRunnerChanged(
  selected: CaptureRunnerName,
  config: Pick<FrontguardConfig, 'captureRunner'>,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const different = notedCaptureRunners(config, env).filter((note) => note !== selected);
  if (different.length === 0) return;

  const known = different.filter(isCaptureRunner);
  const unknown = different.filter((note) => !isCaptureRunner(note));
  const previous = [...known, ...unknown].join(', ');
  logger.warn(
    `Capture runner changed (${previous} → ${selected}). ` +
      'Baselines from the previous runner are not comparable. ' +
      'An Argos maintainer reported a Storybook runner switch made 16 of 22 shots 1px wider or taller ' +
      '(https://x.com/gregberge_/status/2110303101538451874). ' +
      'That figure is a vendor measurement, not a Frontguard statistic. ' +
      'Frontguard does not auto-accept the drift; pixelmatch stays the only pass/fail gate.',
  );
}
