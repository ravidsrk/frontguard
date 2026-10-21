/**
 * Lists ignore rules whose `since` date is older than a configured age,
 * and the shots those rules cover. This command never deletes a rule.
 * The list is one vendor account's request, not a consensus.
 */

import type { BrowserEngine, FrontguardConfig, IgnoreRule, RouteEntry } from '../core/types.js';

export interface AgedIgnore {
  scope: string;
  label: string;
  since: string;
  ageDays: number;
  shots: string[];
}

export interface UndatedIgnore {
  scope: string;
  label: string;
}

function ruleLabel(rule: IgnoreRule): string {
  const rect = rule.rect;
  const base = rule.selector ?? (rect ? `rect ${rect.x},${rect.y} ${rect.width}x${rect.height}` : 'ignore');
  return rule.description ? `${base} (${rule.description})` : base;
}

function rpath(entry: RouteEntry): string {
  return typeof entry === 'string' ? entry : entry.path;
}

function routeViewports(entry: RouteEntry, config: FrontguardConfig): number[] {
  if (typeof entry !== 'string' && entry.viewport && entry.viewport.length > 0) return entry.viewport;
  return config.viewports;
}

function shotsFor(path: string, viewports: number[], browsers: BrowserEngine[]): string[] {
  const shots: string[] = [];
  for (const viewport of viewports) {
    for (const browser of browsers) shots.push(`${path} @ ${viewport}px [${browser}]`);
  }
  return shots;
}

/** Whole UTC days from `since` (YYYY-MM-DD) to `now`. */
export function utcAgeDays(since: string, now: Date): number {
  const start = Date.parse(`${since}T00:00:00.000Z`);
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((end - start) / 86_400_000);
}

export function collectAgedIgnores(
  config: FrontguardConfig,
  olderThanDays: number,
  now: Date,
): { aged: AgedIgnore[]; undated: UndatedIgnore[]; shotsKnown: boolean } {
  const routes = config.routes ?? [];
  const shotsKnown = routes.length > 0;
  const aged: AgedIgnore[] = [];
  const undated: UndatedIgnore[] = [];
  const allShots = routes.map((entry) => ({
    path: rpath(entry),
    viewports: routeViewports(entry, config),
  }));

  const consider = (
    scope: string,
    rule: IgnoreRule,
    targets: { path: string; viewports: number[] }[],
  ): void => {
    if (!rule.since) {
      undated.push({ scope, label: ruleLabel(rule) });
      return;
    }
    const ageDays = utcAgeDays(rule.since, now);
    if (ageDays <= olderThanDays) return;
    aged.push({
      scope,
      label: ruleLabel(rule),
      since: rule.since,
      ageDays,
      shots: targets.flatMap((target) => shotsFor(target.path, target.viewports, config.browsers)),
    });
  };

  for (const rule of config.ignore) consider('global', rule, allShots);
  for (const entry of routes) {
    if (typeof entry === 'string' || !entry.ignore) continue;
    const targets = [{ path: entry.path, viewports: routeViewports(entry, config) }];
    for (const rule of entry.ignore) consider(entry.path, rule, targets);
  }
  return { aged, undated, shotsKnown };
}

export function formatAgedIgnores(
  result: { aged: AgedIgnore[]; undated: UndatedIgnore[]; shotsKnown: boolean },
  olderThanDays: number,
): string {
  const lines = [
    `Ignore rules older than ${olderThanDays} days. One vendor account asked for this list. This command does not remove a rule.`,
  ];
  if (!result.shotsKnown) {
    lines.push(
      'Shot coverage is unavailable. This command reads configured routes and does not discover Storybook, crawl, or filesystem routes.',
    );
  }
  if (result.aged.length === 0) lines.push('No dated ignore rule is older than that.');
  for (const hit of result.aged) {
    lines.push(`${hit.scope}  ${hit.label}  since ${hit.since} (${hit.ageDays} days)`);
    for (const shot of hit.shots) lines.push(`  ${shot}`);
  }
  if (result.undated.length > 0) {
    lines.push('Undated ignore rules are omitted from the age check. Add since: YYYY-MM-DD to include one.');
    for (const hit of result.undated) lines.push(`${hit.scope}  ${hit.label}`);
  }
  return lines.join('\n');
}
