/**
 * Renderer fingerprint recorded on each baseline snapshot.
 *
 * A mismatch is not a pixel failure. Compare mode warns, naming every field
 * that differs. `fingerprint: 'strict'` exits 2 because the comparison is
 * untrusted. Schema 1 manifests have no fingerprint: they still load, warn
 * once, and do not fail strict mode.
 *
 * Pixelmatch stays the only pass/fail signal. Do not upgrade it here (#284).
 * That upgrade should show up as a comparator change on the first run that
 * already has a fingerprint.
 *
 * @module core/fingerprint
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { CLI_VERSION } from '../version.js';
import type {
  BaselineManifest,
  BaselineSnapshot,
  BrowserEngine,
  FingerprintCheck,
  RendererFingerprint,
  Route,
  ScreenshotResult,
} from './types.js';

const require = createRequire(import.meta.url);

/** New manifests use schema 2. Schema 1 (no fingerprint) stays readable. */
export const BASELINE_SCHEMA_VERSION = 2;

/**
 * Options passed to pixelmatch for the pass/fail comparison.
 * These are the values previously inlined in `diff/pixel.ts`.
 * Changing them is a comparator change and bypasses smart filtering.
 */
export const PIXELMATCH_OPTIONS = {
  threshold: 0.1,
  includeAA: false,
} as const;

/**
 * Options passed to every baseline `page.screenshot` call.
 * These match the values previously inlined at the call sites.
 * Changing them changes captured pixels and churns committed baselines.
 */
export const CAPTURE_SCREENSHOT_OPTIONS = {
  fullPage: true,
  type: 'png' as const,
};

/**
 * Device scale factor used for capture.
 * The browser context is created without `deviceScaleFactor`, so Playwright's
 * default of 1 is the effective value. Do not start passing a different value.
 */
export const CAPTURE_DEVICE_SCALE_FACTOR = 1;

const MISSING_FINGERPRINT_WARNING =
  'Baseline has no renderer fingerprint (written before fingerprints). ' +
  'Comparison continues; strict mode does not fail when there is nothing to mismatch.';

interface PlaywrightBrowserPin {
  name?: string;
  browserVersion?: string;
  title?: string;
}

interface FieldDiff {
  field: string;
  baseline: unknown;
  current: unknown;
}

/** Mutable tally while baselines are compared. */
export interface FingerprintAccum {
  compared: number;
  withFingerprint: number;
  diffs: Map<string, FieldDiff>;
  lines: Map<string, string>;
}

export function createFingerprintAccum(): FingerprintAccum {
  return { compared: 0, withFingerprint: 0, diffs: new Map(), lines: new Map() };
}

function packageVersion(name: string): string {
  const pkg = require(`${name}/package.json`) as { version?: unknown };
  if (typeof pkg.version !== 'string' || pkg.version.length === 0) {
    throw new Error(`Installed package ${name} has no version`);
  }
  return pkg.version;
}

function playwrightBrowserPins(): PlaywrightBrowserPin[] {
  try {
    // browsers.json ships beside playwright-core and is not a package export.
    // Resolve it from the installed playwright package so an isolated layout
    // (pnpm) still describes the browser that package launches.
    const playwrightPkg = require.resolve('playwright/package.json');
    const fromPlaywright = createRequire(playwrightPkg);
    const pkgPath = fromPlaywright.resolve('playwright-core/package.json');
    const json = JSON.parse(readFileSync(join(dirname(pkgPath), 'browsers.json'), 'utf8')) as {
      browsers?: PlaywrightBrowserPin[];
    };
    return Array.isArray(json.browsers) ? json.browsers : [];
  } catch {
    return [];
  }
}

/**
 * Registry name of the executable Playwright launches for our call.
 *
 * `browserType.launch()` is headless by default and we do not pass `channel`.
 * Chromium's `getExecutableName` then selects `chromium-headless-shell` when
 * that pin exists, and `chromium` (Chrome for Testing / new headless) otherwise.
 * Firefox and WebKit use their own registry names. The build string and channel
 * label are copied from Playwright's `browsers.json` (`browserVersion`, `title`).
 * Nothing is invented when that file has no entry.
 */
function playwrightExecutableName(engine: string, pins: readonly PlaywrightBrowserPin[]): string {
  if (engine === 'chromium' && pins.some((pin) => pin.name === 'chromium-headless-shell')) {
    return 'chromium-headless-shell';
  }
  return engine;
}

function browserIdentity(engine: string): RendererFingerprint['browser'] {
  const pins = playwrightBrowserPins();
  const executableName = playwrightExecutableName(engine, pins);
  const pin = pins.find((entry) => entry.name === executableName);
  const browser: RendererFingerprint['browser'] = { name: engine };
  if (typeof pin?.browserVersion === 'string' && pin.browserVersion.length > 0) {
    browser.version = pin.browserVersion;
  }
  if (typeof pin?.title === 'string' && pin.title.length > 0) {
    browser.channel = pin.title;
  }
  return browser;
}

/**
 * Fingerprint of this process. `captureRunner` is omitted unless the caller
 * knows it (`storybook`, `ladle`, `histoire`, or `routes`).
 */
export function currentFingerprint(
  browser: BrowserEngine | string,
  captureRunner?: string,
): RendererFingerprint {
  const fingerprint: RendererFingerprint = {
    frontguard: CLI_VERSION,
    playwright: packageVersion('playwright'),
    browser: browserIdentity(browser),
    os: process.platform,
    arch: process.arch,
    deviceScaleFactor: CAPTURE_DEVICE_SCALE_FACTOR,
    pixelmatch: {
      version: packageVersion('pixelmatch'),
      options: { ...PIXELMATCH_OPTIONS },
    },
    screenshot: { ...CAPTURE_SCREENSHOT_OPTIONS },
  };
  const digest = process.env.FRONTGUARD_IMAGE_DIGEST?.trim();
  if (digest) fingerprint.imageDigest = digest;
  if (captureRunner) fingerprint.captureRunner = captureRunner;
  return fingerprint;
}

/** Runners this CLI can discover. Anything else (ladle, histoire, a custom label) is kept. */
const DISCOVERED_CAPTURE_RUNNERS = new Set(['storybook', 'routes']);

/**
 * Runner to store for this capture.
 * A route that moved between Storybook discovery and an explicit route records
 * the runner this process actually used. Runners the CLI cannot discover stay
 * on the snapshot so a later update does not pretend it recaptured them.
 */
export function captureRunnerForWrite(
  route: Pick<Route, 'discoveredVia'>,
  existing?: string,
): string {
  if (route.discoveredVia === 'storybook') return 'storybook';
  if (existing && !DISCOVERED_CAPTURE_RUNNERS.has(existing)) return existing;
  return 'routes';
}

function runtimeCaptureRunner(route: Pick<Route, 'discoveredVia'>): string {
  return route.discoveredVia === 'storybook' ? 'storybook' : 'routes';
}

export function emptyBaselineManifest(): BaselineManifest {
  return {
    schemaVersion: BASELINE_SCHEMA_VERSION,
    createdBy: `frontguard@${CLI_VERSION}`,
    updatedAt: new Date().toISOString(),
    routes: {},
  };
}

/**
 * Parse a manifest without rejecting schema 1 or unknown fields.
 * Returns null for JSON that is not an object manifest. Never throws.
 */
export function parseBaselineManifest(raw: string): BaselineManifest | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  if (
    record.routes !== undefined &&
    (typeof record.routes !== 'object' || record.routes === null || Array.isArray(record.routes))
  ) {
    return null;
  }
  return parsed as BaselineManifest;
}

/**
 * Stamp schema 2 and a fingerprint onto each snapshot being written.
 * Unknown manifest fields and an existing `captureRunner` are preserved.
 */
export function stampBaselineManifest(
  manifest: BaselineManifest,
  shots: readonly ScreenshotResult[],
): BaselineManifest {
  const routes: BaselineManifest['routes'] = { ...(manifest.routes ?? {}) };
  for (const shot of shots) {
    const existing = routes[shot.route.path];
    const now = new Date().toISOString();
    const sha256 = createHash('sha256').update(shot.buffer).digest('hex');
    const snapshotKey = `${shot.viewport}/${shot.browser}`;
    const previous = existing?.snapshots?.[snapshotKey];
    const fingerprint = currentFingerprint(
      shot.browser,
      captureRunnerForWrite(shot.route, previous?.fingerprint?.captureRunner),
    );
    const snapshot: BaselineSnapshot = {
      ...previous,
      sha256,
      updatedAt: now,
      fingerprint,
    };
    routes[shot.route.path] = {
      viewports: [...new Set([...(existing?.viewports ?? []), shot.viewport])],
      browsers: [...new Set([...(existing?.browsers ?? []), shot.browser])],
      lastUpdated: now,
      sha256,
      snapshots: {
        ...(existing?.snapshots ?? {}),
        [snapshotKey]: snapshot,
      },
    };
  }
  return {
    ...manifest,
    schemaVersion: BASELINE_SCHEMA_VERSION,
    createdBy: manifest.createdBy || `frontguard@${CLI_VERSION}`,
    updatedAt: new Date().toISOString(),
    routes,
  };
}

function formatValue(value: unknown): string {
  if (value === undefined) return 'absent';
  return JSON.stringify(value);
}

function stableString(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((entry) => stableString(entry)).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableString(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

function pushDiff(diffs: FieldDiff[], field: string, baseline: unknown, current: unknown): void {
  if (stableString(baseline) === stableString(current)) return;
  diffs.push({ field, baseline, current });
}

function diffRecord(
  diffs: FieldDiff[],
  prefix: string,
  baseline: object | undefined,
  current: object | undefined,
): void {
  const left = (baseline ?? {}) as Record<string, unknown>;
  const right = (current ?? {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  for (const key of keys) {
    pushDiff(diffs, `${prefix}.${key}`, left[key], right[key]);
  }
}

/** Field-by-field differences. Order is stable for warnings and tests. */
export function fingerprintDiffs(
  baseline: RendererFingerprint,
  current: RendererFingerprint,
): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  pushDiff(diffs, 'frontguard', baseline.frontguard, current.frontguard);
  pushDiff(diffs, 'playwright', baseline.playwright, current.playwright);
  pushDiff(diffs, 'browser.name', baseline.browser?.name, current.browser?.name);
  pushDiff(diffs, 'browser.version', baseline.browser?.version, current.browser?.version);
  pushDiff(diffs, 'browser.channel', baseline.browser?.channel, current.browser?.channel);
  pushDiff(diffs, 'imageDigest', baseline.imageDigest, current.imageDigest);
  pushDiff(diffs, 'os', baseline.os, current.os);
  pushDiff(diffs, 'arch', baseline.arch, current.arch);
  pushDiff(diffs, 'deviceScaleFactor', baseline.deviceScaleFactor, current.deviceScaleFactor);
  pushDiff(diffs, 'pixelmatch.version', baseline.pixelmatch?.version, current.pixelmatch?.version);
  diffRecord(diffs, 'pixelmatch.options', baseline.pixelmatch?.options, current.pixelmatch?.options);
  diffRecord(diffs, 'screenshot', baseline.screenshot, current.screenshot);
  pushDiff(diffs, 'captureRunner', baseline.captureRunner, current.captureRunner);
  return diffs;
}

export function formatFingerprintLine(diff: FieldDiff, where?: string): string {
  const location = where ? ` (${where})` : '';
  return `${diff.field}${location}: baseline ${formatValue(diff.baseline)} vs current ${formatValue(diff.current)}`;
}

export function formatFingerprintWarning(lines: readonly string[]): string {
  return [
    'Renderer fingerprint differs from the baseline. This is not a pixel failure:',
    ...lines.map((line) => `  ${line}`),
  ].join('\n');
}

export function missingFingerprintWarning(): string {
  return MISSING_FINGERPRINT_WARNING;
}

function snapshotFingerprint(
  manifest: BaselineManifest | null,
  route: string,
  viewport: number,
  browser: string,
): RendererFingerprint | undefined {
  const snapshots = manifest?.routes?.[route]?.snapshots;
  if (!snapshots || typeof snapshots !== 'object') return undefined;
  const snapshot = snapshots[`${viewport}/${browser}`];
  if (!snapshot || typeof snapshot !== 'object') return undefined;
  const fingerprint = snapshot.fingerprint;
  if (!fingerprint || typeof fingerprint !== 'object') return undefined;
  return fingerprint;
}

export function noteComparedFingerprint(
  accum: FingerprintAccum,
  manifest: BaselineManifest | null,
  manifestReadable: boolean,
  shot: ScreenshotResult,
): void {
  if (!manifestReadable) return;
  accum.compared += 1;
  const fingerprint = snapshotFingerprint(manifest, shot.route.path, shot.viewport, shot.browser);
  if (!fingerprint) return;
  accum.withFingerprint += 1;
  const where = `${shot.route.path} @ ${shot.viewport}px [${shot.browser}]`;
  const current = currentFingerprint(shot.browser, runtimeCaptureRunner(shot.route));
  for (const diff of fingerprintDiffs(fingerprint, current)) {
    const key = `${diff.field}\0${stableString(diff.baseline)}\0${stableString(diff.current)}`;
    if (!accum.diffs.has(key)) accum.diffs.set(key, diff);
    if (!accum.lines.has(key)) accum.lines.set(key, formatFingerprintLine(diff, where));
  }
}

export function finishFingerprintCheck(
  accum: FingerprintAccum,
  mode: 'warn' | 'strict',
): FingerprintCheck {
  const lines = [...accum.lines.values()];
  const fields = [...new Set([...accum.diffs.values()].map((diff) => diff.field))];
  return {
    fields,
    lines,
    missing: accum.compared > accum.withFingerprint && accum.compared > 0,
    strictFailure: mode === 'strict' && accum.diffs.size > 0,
  };
}

function bothPresentAndDiffer(baseline: unknown, current: unknown): boolean {
  if (baseline === undefined || current === undefined) return false;
  return stableString(baseline) !== stableString(current);
}

/**
 * Widths this run will capture for one route. A nonempty per-route override
 * replaces the global list; an empty override does not.
 */
function effectiveViewports(
  route: { viewport?: readonly number[]; usesGlobal?: boolean } | undefined,
  globalViewports: ReadonlySet<number> | null,
): ReadonlySet<number> | null {
  const explicit = route?.viewport && route.viewport.length > 0 ? new Set(route.viewport) : null;
  if (route?.usesGlobal) {
    if (!globalViewports) return null;
    if (!explicit) return globalViewports;
    const union = new Set(globalViewports);
    for (const width of explicit) union.add(width);
    return union;
  }
  if (explicit) return explicit;
  return globalViewports;
}

/**
 * One entry per path. Repeated paths keep every width they capture.
 * An entry with no override uses the global list and does not drop a sibling
 * override that names a different width.
 */
function selectedRoutesByPath(
  routes: readonly { path: string; viewport?: readonly number[] }[],
): Map<string, { path: string; viewport?: number[]; usesGlobal?: boolean }> {
  const grouped = new Map<string, { path: string; viewport?: number[]; usesGlobal?: boolean }>();
  for (const route of routes) {
    const explicit = route.viewport && route.viewport.length > 0 ? [...route.viewport] : undefined;
    const current = grouped.get(route.path);
    if (!current) {
      grouped.set(route.path, {
        path: route.path,
        viewport: explicit,
        usesGlobal: explicit === undefined,
      });
      continue;
    }
    if (explicit === undefined) current.usesGlobal = true;
    else current.viewport = [...new Set([...(current.viewport ?? []), ...explicit])];
  }
  return grouped;
}

/**
 * Why smart filtering must render every route, or undefined when the baseline
 * browser build and pixelmatch options still match this process.
 * A missing fingerprint does not bypass scoping. Retired routes and widths
 * outside the effective capture set do not either.
 */
export function rendererBypassReason(
  manifest: BaselineManifest | null | undefined,
  browsers: readonly string[],
  selection?: {
    routes: readonly { path: string; viewport?: readonly number[] }[];
    viewports: readonly number[];
  },
): string | undefined {
  if (!manifest?.routes) return undefined;
  const active = new Set(browsers);
  const selectedByPath =
    selection && selection.routes.length > 0 ? selectedRoutesByPath(selection.routes) : null;
  const globalViewports =
    selection && selection.viewports.length > 0 ? new Set(selection.viewports) : null;
  const reasons = new Set<string>();
  for (const [routePath, route] of Object.entries(manifest.routes)) {
    if (selectedByPath && !selectedByPath.has(routePath)) continue;
    const activeViewports = effectiveViewports(selectedByPath?.get(routePath), globalViewports);
    if (!route?.snapshots) continue;
    for (const [snapshotKey, snapshot] of Object.entries(route.snapshots)) {
      if (activeViewports) {
        const slash = snapshotKey.indexOf('/');
        const viewport = slash > 0 ? Number(snapshotKey.slice(0, slash)) : Number.NaN;
        if (!activeViewports.has(viewport)) continue;
      }
      const fingerprint = snapshot?.fingerprint;
      if (!fingerprint) continue;
      const engine = fingerprint.browser?.name;
      if (typeof engine === 'string' && engine.length > 0 && !active.has(engine)) continue;
      const current = currentFingerprint(engine || browsers[0] || 'chromium');
      if (bothPresentAndDiffer(fingerprint.browser?.version, current.browser.version)) {
        reasons.add(
          `browser.version ${formatValue(fingerprint.browser?.version)} → ${formatValue(current.browser.version)}`,
        );
      }
      if (bothPresentAndDiffer(fingerprint.browser?.channel, current.browser.channel)) {
        reasons.add(
          `browser.channel ${formatValue(fingerprint.browser?.channel)} → ${formatValue(current.browser.channel)}`,
        );
      }
      if (bothPresentAndDiffer(fingerprint.pixelmatch?.version, current.pixelmatch.version)) {
        reasons.add(
          `pixelmatch.version ${formatValue(fingerprint.pixelmatch?.version)} → ${formatValue(current.pixelmatch.version)}`,
        );
      }
      if (
        fingerprint.pixelmatch?.options &&
        bothPresentAndDiffer(fingerprint.pixelmatch.options, current.pixelmatch.options)
      ) {
        reasons.add(
          `pixelmatch.options ${formatValue(fingerprint.pixelmatch.options)} → ${formatValue(current.pixelmatch.options)}`,
        );
      }
    }
  }
  if (reasons.size === 0) return undefined;
  return `renderer fingerprint changed since the baseline (${[...reasons].join('; ')}); rendering all routes`;
}

export function fingerprintMode(mode: string | undefined): 'warn' | 'strict' {
  return mode === 'strict' ? 'strict' : 'warn';
}
