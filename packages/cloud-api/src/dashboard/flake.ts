/**
 * Flake-score derivation (Task 15.2).
 *
 * Computes a 0–100 stability score for a monitor from its recent run history.
 * The score penalises both regressions and any test that required a retry
 * (anti-flake consensus already records `attempts > 1`), so a monitor that
 * passes only after re-tries scores lower than one that passes first-try.
 *
 * The Argos-style badge tiers: green ≥95, yellow 80–94, red <80.
 *
 * @module dashboard/flake
 */

import type { MonitorRun } from '../db/monitors.js';

/** Inputs the score needs from each run. */
export type FlakeInput = Pick<MonitorRun, 'status' | 'attempts'>;

/**
 * Returns the stability score (0–100) for a window of runs. Empty windows
 * return 100 — "no history, no known flakiness" — which keeps newly-created
 * monitors from being penalised before they've actually run.
 *
 * Per-run weights:
 *   passed,  attempts=1  → 1.0 (perfect)
 *   passed,  attempts>1  → 0.7 (recovered after retry → mild flake)
 *   regression           → 0.0 (real failure)
 *   error                → 0.3 (infra issue; partial penalty)
 */
export function flakeScore(runs: FlakeInput[]): number {
  if (runs.length === 0) return 100;
  const total = runs.reduce((acc, r) => acc + weightForRun(r), 0);
  return Math.round((total / runs.length) * 100);
}

function weightForRun(run: FlakeInput): number {
  if (run.status === 'passed') return run.attempts > 1 ? 0.7 : 1.0;
  if (run.status === 'error') return 0.3;
  return 0; // regression
}

/** Stability tier for a score (drives badge colour). */
export type FlakeTier = 'green' | 'yellow' | 'red';

/** Maps a 0–100 score to a colour tier. */
export function flakeTier(score: number): FlakeTier {
  if (score >= 95) return 'green';
  if (score >= 80) return 'yellow';
  return 'red';
}

/** Renders an Argos-style flake badge: dot + score. */
export function renderFlakeBadge(score: number): string {
  const tier = flakeTier(score);
  return `<span class="flake flake-${tier}" title="Stability score: ${score}/100"><span class="flake-dot"></span>${score}</span>`;
}
