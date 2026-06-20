/**
 * Resolve per-story `parameters.frontguard` for Storybook 8 entries.
 *
 * Storybook 8 `/index.json` omits `parameters`, so discovery falls back to:
 *   1. Static CSF parse of the story file referenced by `importPath`
 *   2. Reading merged parameters from the live preview iframe
 *
 * @module discovery/storybook-parameters
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { loadCsf, type CsfFile } from '@storybook/csf-tools';
import { logger } from '../utils/logger.js';

/** Per-story Frontguard overrides from `parameters.frontguard`. */
export interface StoryFrontguardParameters {
  viewports?: number[];
  threshold?: number;
  ignore?: Array<{ selector: string }>;
  skip?: boolean;
  label?: string;
}

function storyIframePath(storyId: string): string {
  return `/iframe.html?id=${encodeURIComponent(storyId)}&viewMode=story`;
}

// ---------------------------------------------------------------------------
// AST helpers — extract statically-known literals from CSF annotations
// ---------------------------------------------------------------------------

interface AstNode {
  type: string;
  value?: unknown;
  properties?: Array<{ key?: AstNode; value?: AstNode }>;
  elements?: Array<AstNode | null>;
  name?: string;
}

function extractStaticValue(node: AstNode | undefined | null): unknown {
  if (!node) return undefined;
  switch (node.type) {
    case 'StringLiteral':
    case 'NumericLiteral':
    case 'BooleanLiteral':
    case 'Literal':
      return node.value;
    case 'ObjectExpression': {
      const obj: Record<string, unknown> = {};
      for (const prop of node.properties ?? []) {
        const key =
          prop.key?.type === 'Identifier'
            ? prop.key.name
            : prop.key?.type === 'StringLiteral'
              ? prop.key.value
              : undefined;
        if (typeof key === 'string') {
          const val = extractStaticValue(prop.value);
          if (val !== undefined) obj[key] = val;
        }
      }
      return obj;
    }
    case 'ArrayExpression':
      return (node.elements ?? [])
        .map((el) => extractStaticValue(el))
        .filter((v) => v !== undefined);
    default:
      return undefined;
  }
}

function normalizeFrontguardParams(raw: unknown): StoryFrontguardParameters | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const src = raw as Record<string, unknown>;
  const next: StoryFrontguardParameters = {};

  if (Array.isArray(src.viewports)) {
    const viewports = src.viewports.filter(
      (v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0,
    );
    if (viewports.length > 0) next.viewports = viewports;
  }
  if (typeof src.threshold === 'number' && Number.isFinite(src.threshold)) {
    next.threshold = src.threshold;
  }
  if (Array.isArray(src.ignore)) {
    const ignore = src.ignore.filter(
      (r): r is { selector: string } =>
        !!r && typeof r === 'object' && typeof (r as { selector?: unknown }).selector === 'string',
    );
    if (ignore.length > 0) next.ignore = ignore;
  }
  if (src.skip === true) next.skip = true;
  if (typeof src.label === 'string' && src.label.trim()) next.label = src.label.trim();

  return Object.keys(next).length > 0 ? next : undefined;
}

function parseFrontguardFromCsfFile(filePath: string): Map<string, StoryFrontguardParameters> {
  const map = new Map<string, StoryFrontguardParameters>();
  const code = readFileSync(filePath, 'utf-8');
  const csf: CsfFile = loadCsf(code, { makeTitle: (userTitle) => userTitle || '' });
  csf.parse();

  const stories = csf._stories as Record<
    string,
    { id?: string; parameters?: Record<string, unknown> }
  >;
  const annotations = csf._storyAnnotations as Record<string, { parameters?: AstNode }>;

  for (const [exportName, story] of Object.entries(stories)) {
    const storyId = story.id ?? exportName;
    const annotation = annotations[exportName];
    const parametersAst = annotation?.parameters;
    const parameters = parametersAst
      ? (extractStaticValue(parametersAst) as Record<string, unknown> | undefined)
      : undefined;
    const frontguard = normalizeFrontguardParams(parameters?.frontguard);
    if (frontguard) map.set(storyId, frontguard);
  }

  return map;
}

// ---------------------------------------------------------------------------
// File resolution
// ---------------------------------------------------------------------------

const STORYBOOK_MAIN_CANDIDATES = [
  '.storybook/main.ts',
  '.storybook/main.mts',
  '.storybook/main.js',
  '.storybook/main.mjs',
  '.storybook/main.cjs',
];

/** Collect directories that may contain Storybook source (for `importPath`). */
export function collectStorybookSearchRoots(explicitRoot?: string): string[] {
  const roots: string[] = [];
  const seen = new Set<string>();

  const add = (dir: string) => {
    const resolved = resolve(dir);
    if (!seen.has(resolved)) {
      seen.add(resolved);
      roots.push(resolved);
    }
  };

  if (explicitRoot) add(explicitRoot);

  let dir = resolve(process.cwd());
  while (true) {
    add(dir);
    if (STORYBOOK_MAIN_CANDIDATES.some((rel) => existsSync(join(dir, rel)))) {
      break;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return roots;
}

function resolveStoryFile(importPath: string, searchRoots: string[]): string | null {
  for (const root of searchRoots) {
    const candidate = resolve(root, importPath);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Preview enrichment (Storybook 8 — parameters only exist at runtime)
// ---------------------------------------------------------------------------

async function enrichFromPreview(
  baseUrl: string,
  storyIds: string[],
  timeoutMs: number,
): Promise<Map<string, StoryFrontguardParameters>> {
  const map = new Map<string, StoryFrontguardParameters>();
  if (storyIds.length === 0) return map;

  const { chromium } = await import('playwright');
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-gpu', '--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    for (const storyId of storyIds) {
      const url = `${baseUrl.replace(/\/$/, '')}${storyIframePath(storyId)}`;
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: timeoutMs });
        const frontguard = await page.evaluate(async (id) => {
          const preview = (window as unknown as {
            __STORYBOOK_PREVIEW__?: {
              loadStory?: (args: { storyId: string }) => Promise<{ parameters?: Record<string, unknown> }>;
              currentRender?: { story?: { parameters?: Record<string, unknown> } };
            };
          }).__STORYBOOK_PREVIEW__;
          if (!preview) return undefined;

          if (typeof preview.loadStory === 'function') {
            const ctx = await preview.loadStory({ storyId: id });
            return ctx?.parameters?.frontguard;
          }
          return preview.currentRender?.story?.parameters?.frontguard;
        }, storyId);

        const normalized = normalizeFrontguardParams(frontguard);
        if (normalized) map.set(storyId, normalized);
      } catch (err) {
        logger.debug(
          `Storybook preview parameter fetch failed for ${storyId}: ${(err as Error).message}`,
        );
      }
    }

    await context.close();
  } finally {
    await browser.close();
  }

  return map;
}

// ---------------------------------------------------------------------------
// Public resolver
// ---------------------------------------------------------------------------

export interface StorybookEntryRef {
  id: string;
  importPath?: string;
  parameters?: {
    frontguard?: StoryFrontguardParameters;
    [key: string]: unknown;
  };
}

/**
 * Resolve `parameters.frontguard` for index entries.
 *
 * Index payloads are used when present (Storybook 7 and test fixtures).
 * Storybook 8 entries are enriched via CSF static parse and, when needed,
 * a live preview read against the running Storybook server.
 */
export async function resolveStoryFrontguardParameters(
  baseUrl: string,
  entries: StorybookEntryRef[],
  options: {
    storybookMajor: 7 | 8;
    projectRoot?: string;
    fetchTimeoutMs?: number;
  },
): Promise<Map<string, StoryFrontguardParameters>> {
  const resolved = new Map<string, StoryFrontguardParameters>();
  const needsEnrichment: string[] = [];

  for (const entry of entries) {
    const fromIndex = entry.parameters?.frontguard;
    if (fromIndex) {
      resolved.set(entry.id, fromIndex);
      continue;
    }
    needsEnrichment.push(entry.id);
  }

  if (needsEnrichment.length === 0) return resolved;

  const searchRoots = collectStorybookSearchRoots(options.projectRoot);
  const byFile = new Map<string, string[]>();

  for (const entry of entries) {
    if (resolved.has(entry.id) || !entry.importPath) continue;
    const filePath = resolveStoryFile(entry.importPath, searchRoots);
    if (!filePath) continue;
    const ids = byFile.get(filePath) ?? [];
    ids.push(entry.id);
    byFile.set(filePath, ids);
  }

  for (const [filePath] of byFile) {
    try {
      const fromCsf = parseFrontguardFromCsfFile(filePath);
      for (const [storyId, params] of fromCsf) {
        if (!resolved.has(storyId)) resolved.set(storyId, params);
      }
    } catch (err) {
      logger.debug(`CSF parameter parse failed for ${filePath}: ${(err as Error).message}`);
    }
  }

  const stillMissing =
    options.storybookMajor === 8
      ? entries
          .map((e) => e.id)
          .filter((id) => !resolved.has(id))
      : needsEnrichment.filter((id) => !resolved.has(id));

  if (stillMissing.length > 0) {
    const fromPreview = await enrichFromPreview(
      baseUrl,
      stillMissing,
      options.fetchTimeoutMs ?? 15_000,
    );
    for (const [storyId, params] of fromPreview) {
      resolved.set(storyId, params);
    }
  }

  return resolved;
}