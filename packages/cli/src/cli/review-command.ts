/**
 * Accept failing, new, and missing shots without re-rendering.
 *
 * `--from` copies CI PNG bytes as they are. A renderer fingerprint that does
 * not match this process exits 2 and writes nothing. The command does not
 * fetch origin.
 *
 * @module cli/review-command
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { stdin, stdout } from 'node:process';
import { baselineWriteBlockReason } from './baseline-confirm.js';
import {
  captureRunnerForWrite,
  currentFingerprint,
  emptyBaselineManifest,
  fingerprintDiffs,
  stampBaselineManifest,
} from '../core/fingerprint.js';
import { PluginManager } from '../core/plugins.js';
import type {
  BrowserEngine,
  DiffStatus,
  FrontguardConfig,
  RendererFingerprint,
  Route,
  RunResult,
  ScreenshotResult,
} from '../core/types.js';
import { GitOrphanStorage } from '../storage/git-orphan.js';
import { logger } from '../utils/logger.js';

const REVIEWABLE = new Set<string>(['regression', 'new', 'error', 'missing']);
const BROWSERS = new Set<string>(['chromium', 'firefox', 'webkit']);

export interface ReviewShot {
  route: string;
  viewport: number;
  browser: BrowserEngine;
  status: DiffStatus | 'missing';
  current?: string;
  baseline?: string;
  diff?: string;
  fingerprint?: RendererFingerprint;
  discoveredVia?: Route['discoveredVia'];
}

export interface ReviewRequest {
  cwd: string;
  reportDir: string;
  from?: boolean;
  filter?: string;
  all?: boolean;
  confirmBaselines: boolean;
  judgeMode?: boolean;
  config: FrontguardConfig;
  ask?: (shot: ReviewShot, paths: ShotPaths) => Promise<'accept' | 'skip' | 'quit'>;
  interactive?: boolean;
}

export interface ShotPaths {
  baseline: string;
  current: string;
  diff: string;
}

export interface ReviewOutcome {
  exitCode: 0 | 2;
  message?: string;
  audits: string[];
  written: string[];
}

export async function runReview(request: ReviewRequest): Promise<ReviewOutcome> {
  const blocked = baselineWriteBlockReason({
    writing: true,
    confirmBaselines: request.confirmBaselines,
    judgeMode: request.judgeMode === true,
  });
  if (blocked) return { exitCode: 2, message: blocked, audits: [], written: [] };

  const manifest = readReviewManifest(request.reportDir);
  if (!manifest) {
    return {
      exitCode: 2,
      message: `Review manifest at ${request.reportDir}/review.json is missing or invalid. Nothing was written.`,
      audits: [],
      written: [],
    };
  }

  const storage = new GitOrphanStorage(request.cwd, { mode: 'update', offline: true });
  await storage.init();
  const existing = (await storage.readManifest()) ?? emptyBaselineManifest();
  const candidates = reviewableShots(manifest.shots, existing);
  if (candidates.length === 0) {
    return { exitCode: 0, message: 'Nothing to review.', audits: [], written: [] };
  }

  const selected = await selectShots(request, candidates);
  if (selected.exitCode === 2) {
    return { exitCode: 2, message: selected.message, audits: [], written: [] };
  }
  if (selected.accepted.length === 0) {
    return { exitCode: 0, message: 'No shots accepted.', audits: [], written: [] };
  }

  const refusal = await accessibilityRefusal(request.config, selected.accepted);
  if (refusal) return { exitCode: 2, message: refusal, audits: [], written: [] };

  const prepared = prepareWrites(request.reportDir, selected.accepted, existing);
  if (prepared.error) return { exitCode: 2, message: prepared.error, audits: [], written: [] };

  if (request.from) {
    const mismatch = fingerprintRefusal(prepared.ready);
    if (mismatch) return { exitCode: 2, message: mismatch, audits: [], written: [] };
  }

  const stamped = stampBaselineManifest(
    existing,
    prepared.ready.map((row) => row.screenshot),
    request.config.colorScheme,
  );
  await storage.writeBaselines(
    prepared.ready.map((row) => ({
      route: row.shot.route,
      viewport: row.shot.viewport,
      browser: row.shot.browser,
      buffer: row.bytes,
    })),
    stamped,
  );

  const user = gitUser(request.cwd);
  const time = new Date().toISOString();
  const audits = prepared.ready.map((row) => auditLine(row, user, time));
  for (const line of audits) console.log(line);
  return {
    exitCode: 0,
    message: `Accepted ${audits.length} shot${audits.length === 1 ? '' : 's'}.`,
    audits,
    written: prepared.ready.map((row) => row.shot.route),
  };
}

interface Prepared {
  shot: ReviewShot;
  bytes: Buffer;
  oldSha: string;
  screenshot: ScreenshotResult;
}

function prepareWrites(
  reportDir: string,
  shots: readonly ReviewShot[],
  manifest: ReturnType<typeof emptyBaselineManifest>,
): { ready: Prepared[]; error?: string } {
  const ready: Prepared[] = [];
  for (const shot of shots) {
    const current = shot.current ? safePath(reportDir, shot.current) : null;
    if (!current || !existsSync(current)) {
      return { ready: [], error: `No current image for ${label(shot)}. Nothing was written.` };
    }
    const bytes = readFileSync(current);
    ready.push({
      shot,
      bytes,
      oldSha: oldShaFromManifest(manifest, shot),
      screenshot: {
        route: {
          path: shot.route,
          discoveredVia: shot.discoveredVia,
        },
        viewport: shot.viewport,
        browser: shot.browser,
        buffer: bytes,
        domSnapshot: '',
        consoleErrors: [],
        timestamp: Date.now(),
        duration: 0,
      },
    });
  }
  return { ready };
}

function fingerprintRefusal(rows: readonly Prepared[]): string | null {
  for (const row of rows) {
    const recorded = row.shot.fingerprint;
    if (!recorded) {
      return `Renderer fingerprint is missing for ${label(row.shot)}. Nothing was written.`;
    }
    const current = currentFingerprint(
      row.shot.browser,
      captureRunnerForWrite(
        { discoveredVia: row.shot.discoveredVia },
        recorded.captureRunner,
      ),
    );
    const diffs = fingerprintDiffs(recorded, current);
    if (diffs.length > 0) {
      const fields = diffs.map((diff) => diff.field).join(', ');
      return `Renderer fingerprint differs for ${label(row.shot)} (${fields}). Nothing was written.`;
    }
  }
  return null;
}

async function accessibilityRefusal(
  config: FrontguardConfig,
  shots: readonly ReviewShot[],
): Promise<string | null> {
  const plugin = config.plugins?.find((item) => item.name === 'accessibility');
  if (!plugin) return null;
  const manager = new PluginManager();
  manager.register(plugin);
  const metadata = new Map<string, unknown>();
  metadata.set('accessibility:require-complete', true);
  const ctx = { config, logger, metadata };
  const screenshots: ScreenshotResult[] = shots.map((shot) => ({
    route: { path: shot.route, discoveredVia: shot.discoveredVia },
    viewport: shot.viewport,
    browser: shot.browser,
    buffer: Buffer.alloc(0),
    domSnapshot: '',
    consoleErrors: [],
    timestamp: Date.now(),
    duration: 0,
  }));
  try {
    await manager.setup(ctx);
    await manager.runHook('afterRender', screenshots, ctx);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.startsWith('Accessibility check failed:')) throw err;
    return message.includes('Baselines were not written.')
      ? message
      : `${message} Baselines were not written.`;
  } finally {
    await manager.teardown();
  }
  return null;
}

async function selectShots(
  request: ReviewRequest,
  candidates: readonly ReviewShot[],
): Promise<{ exitCode?: 2; message?: string; audits?: string[]; accepted: ReviewShot[] }> {
  if (request.filter) {
    const wanted = new Set(request.filter.split(',').map((part) => part.trim()).filter(Boolean));
    const accepted = candidates.filter((shot) => wanted.has(shot.route));
    if (accepted.length === 0) {
      return { exitCode: 2, message: 'Filter matched no reviewable shots. Nothing was written.', accepted: [] };
    }
    return { accepted };
  }
  if (request.all) return { accepted: candidates.filter((shot) => Boolean(shot.current)) };
  const ask =
    request.ask ??
    (request.interactive === false
      ? undefined
      : request.interactive || stdin.isTTY
        ? askOnTerminal
        : undefined);
  if (!ask) {
    return {
      exitCode: 2,
      message: 'Bulk acceptance needs a filter or --all. Nothing was written.',
      accepted: [],
    };
  }
  const accepted: ReviewShot[] = [];
  for (const shot of candidates) {
    const choice = await ask(shot, displayPaths(request.reportDir, shot));
    if (choice === 'quit') break;
    if (choice === 'accept') accepted.push(shot);
  }
  return { accepted };
}

function askOnTerminal(shot: ReviewShot, paths: ShotPaths): Promise<'accept' | 'skip' | 'quit'> {
  const rl = createInterface({ input: stdin, output: stdout });
  const text = [
    `${label(shot)} ${shot.status}`,
    `  baseline: ${paths.baseline}`,
    `  current: ${paths.current}`,
    `  diff: ${paths.diff}`,
    'accept, skip, or quit? ',
  ].join('\n');
  return rl.question(text).then((answer) => {
    rl.close();
    const word = answer.trim().toLowerCase();
    if (word === 'accept' || word === 'a') return 'accept';
    if (word === 'quit' || word === 'q') return 'quit';
    return 'skip';
  });
}

function reviewableShots(
  shots: readonly ReviewShot[],
  manifest: ReturnType<typeof emptyBaselineManifest>,
): ReviewShot[] {
  const listed = shots.filter((shot) => REVIEWABLE.has(shot.status));
  const seen = new Set(shots.map((shot) => `${shot.route}\0${shot.viewport}\0${shot.browser}`));
  const missing: ReviewShot[] = [];
  for (const [route, entry] of Object.entries(manifest.routes ?? {})) {
    for (const key of Object.keys(entry.snapshots ?? {})) {
      const [viewportRaw, browser] = key.split('/');
      const viewport = Number(viewportRaw);
      if (!BROWSERS.has(browser) || !Number.isFinite(viewport)) continue;
      const id = `${route}\0${viewport}\0${browser}`;
      if (seen.has(id)) continue;
      missing.push({
        route,
        viewport,
        browser: browser as BrowserEngine,
        status: 'missing',
      });
    }
  }
  return [...listed, ...missing];
}

function readReviewManifest(reportDir: string): { shots: ReviewShot[] } | null {
  const path = resolve(reportDir, 'review.json');
  if (!existsSync(path)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { shots?: unknown }).shots)) {
    return null;
  }
  const shots: ReviewShot[] = [];
  for (const item of (parsed as { shots: unknown[] }).shots) {
    const shot = parseShot(item);
    if (!shot) return null;
    shots.push(shot);
  }
  return { shots };
}

function parseShot(item: unknown): ReviewShot | null {
  if (!item || typeof item !== 'object') return null;
  const row = item as Record<string, unknown>;
  if (typeof row.route !== 'string' || !Number.isFinite(row.viewport)) return null;
  if (typeof row.browser !== 'string' || !BROWSERS.has(row.browser)) return null;
  if (typeof row.status !== 'string') return null;
  return {
    route: row.route,
    viewport: Number(row.viewport),
    browser: row.browser as BrowserEngine,
    status: row.status as ReviewShot['status'],
    current: typeof row.current === 'string' ? row.current : undefined,
    baseline: typeof row.baseline === 'string' ? row.baseline : undefined,
    diff: typeof row.diff === 'string' ? row.diff : undefined,
    fingerprint:
      row.fingerprint && typeof row.fingerprint === 'object'
        ? (row.fingerprint as RendererFingerprint)
        : undefined,
    discoveredVia:
      typeof row.discoveredVia === 'string' ? (row.discoveredVia as Route['discoveredVia']) : undefined,
  };
}

function safePath(root: string, rel: string): string | null {
  if (isAbsolute(rel)) return null;
  const full = resolve(root, rel);
  const base = resolve(root);
  const fromBase = relative(base, full);
  if (fromBase.startsWith(`..${sep}`) || fromBase === '..') return null;
  return full;
}

function displayPaths(reportDir: string, shot: ReviewShot): ShotPaths {
  const show = (rel: string | undefined): string => {
    if (!rel) return '(missing)';
    const full = safePath(reportDir, rel);
    return full ?? '(missing)';
  };
  return { baseline: show(shot.baseline), current: show(shot.current), diff: show(shot.diff) };
}

function label(shot: Pick<ReviewShot, 'route' | 'viewport' | 'browser'>): string {
  return `${shot.route} @ ${shot.viewport}px [${shot.browser}]`;
}

function auditLine(row: Prepared, user: string, time: string): string {
  const next = createHash('sha256').update(row.bytes).digest('hex');
  return `audit route=${row.shot.route} viewport=${row.shot.viewport} browser=${row.shot.browser} old=${row.oldSha} new=${next} user=${user} time=${time}`;
}

function gitUser(cwd: string): string {
  try {
    const name = execFileSync('git', ['config', 'user.name'], {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (name) return name;
  } catch {
    // A repo without user.name still records an acceptance.
  }
  return process.env.USER || process.env.USERNAME || 'unknown';
}

/**
 * CLI entry for `frontguard review`. The bin calls this so the option
 * strings stay small enough for the published bundle ceiling.
 */
export async function reviewCli(
  opts: Record<string, unknown>,
  load: (opts: Record<string, unknown>) => Promise<FrontguardConfig>,
): Promise<0 | 2> {
  const confirmBaselines = opts.confirmBaselines === true;
  const judgeMode = opts.mode === 'judge';
  const blocked = baselineWriteBlockReason({
    writing: true,
    confirmBaselines,
    judgeMode,
  });
  if (blocked) {
    logger.error(blocked);
    return 2;
  }
  const config = await load(opts);
  const fromDir = typeof opts.from === 'string' ? opts.from : undefined;
  const out = await runReview({
    cwd: process.cwd(),
    reportDir: fromDir ?? config.outputDir,
    from: fromDir !== undefined,
    filter: typeof opts.filter === 'string' ? opts.filter : undefined,
    all: opts.all === true,
    confirmBaselines,
    judgeMode,
    config,
  });
  if (out.message) {
    if (out.exitCode === 0) logger.info(out.message);
    else logger.error(out.message);
  }
  return out.exitCode;
}

/**
 * Sidecar next to `report.html`. Image names match the HTML report.
 * A failure here must not fail the report.
 */
export function writeReviewManifest(result: RunResult, outputDir: string): void {
  const routes = [...new Set(result.diffs.map((diff) => diff.route.path))];
  const shots = routes.flatMap((path, index) => {
    const diffs = result.diffs.filter((diff) => diff.route.path === path);
    const fragment = filenameFragment(path);
    return diffs.map((diff, diffIdx) => {
      const prefix = `${index}_${fragment}_${diff.viewport}_${diff.browser}_${diffIdx}`;
      const file = (buf: Buffer | undefined, kind: string): string | undefined =>
        buf && buf.length > 0 ? `images/${prefix}_${kind}.png` : undefined;
      return {
        route: path,
        viewport: diff.viewport,
        browser: diff.browser,
        status: diff.status,
        discoveredVia: diff.route.discoveredVia,
        current: file(diff.currentImage, 'current'),
        baseline: file(diff.baselineImage, 'baseline'),
        diff: file(diff.diffImage, 'diff'),
        fingerprint: currentFingerprint(diff.browser, captureRunnerForWrite(diff.route)),
      };
    });
  });
  try {
    writeFileSync(join(outputDir, 'review.json'), `${JSON.stringify({ shots })}\n`);
  } catch (err) {
    logger.debug(
      `Could not write review.json: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** Same fragment as the HTML report's image names. */
function filenameFragment(route: string): string {
  return route.replace(/[^a-zA-Z0-9]/g, '_').replace(/^_+/, '').slice(0, 60) || '_root';
}

export function oldShaFromManifest(
  manifest: ReturnType<typeof emptyBaselineManifest>,
  shot: ReviewShot,
): string {
  return manifest.routes?.[shot.route]?.snapshots?.[`${shot.viewport}/${shot.browser}`]?.sha256 ?? 'absent';
}
