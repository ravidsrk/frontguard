import { describe, it, expect } from 'vitest';
import { flakeScore, flakeTier, renderFlakeBadge } from '../src/dashboard/flake.js';
import type { MonitorRun } from '../src/db/monitors.js';

function r(status: MonitorRun['status'], attempts = 1): Pick<MonitorRun, 'status' | 'attempts'> {
  return { status, attempts };
}

describe('flakeScore', () => {
  it('returns 100 for an empty history (no known flakiness)', () => {
    expect(flakeScore([])).toBe(100);
  });

  it('returns 100 for a run of first-try passes', () => {
    expect(flakeScore([r('passed'), r('passed'), r('passed')])).toBe(100);
  });

  it('penalises retried passes (anti-flake consensus signal)', () => {
    expect(flakeScore([r('passed', 2), r('passed', 2), r('passed', 2)])).toBe(70);
  });

  it('zero-weights regressions', () => {
    expect(flakeScore([r('passed'), r('regression'), r('passed')])).toBe(67);
  });

  it('partial-weights errors', () => {
    expect(flakeScore([r('error'), r('error')])).toBe(30);
  });
});

describe('flakeTier', () => {
  it('matches the Argos-style thresholds', () => {
    expect(flakeTier(100)).toBe('green');
    expect(flakeTier(95)).toBe('green');
    expect(flakeTier(94)).toBe('yellow');
    expect(flakeTier(80)).toBe('yellow');
    expect(flakeTier(79)).toBe('red');
    expect(flakeTier(0)).toBe('red');
  });
});

describe('renderFlakeBadge', () => {
  it('emits the tier class + numeric score', () => {
    expect(renderFlakeBadge(100)).toContain('flake-green');
    expect(renderFlakeBadge(100)).toContain('100');
    expect(renderFlakeBadge(85)).toContain('flake-yellow');
    expect(renderFlakeBadge(50)).toContain('flake-red');
    expect(renderFlakeBadge(50)).toContain('title="Stability score: 50/100"');
  });
});
