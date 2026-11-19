/**
 * `inspect_diff_cluster_dom` — inspect a visual regression diff and its
 * grounded DOM cluster bounding boxes, AI classification, and suggested fix.
 *
 * @module tools/inspect-diff-cluster-dom
 */

import { z } from 'zod';
import type { CloudClient, CloudRunResult } from '../client/cloud.js';
import { diffIdFor, parseDiffId } from '../client/cloud.js';
import {
  capMultiLine,
  capSingleLine,
  MAX_CLUSTERS_PER_DIFF,
  MAX_DIFF_ID_LENGTH,
  MAX_EXPLANATION_LENGTH,
  MAX_LABEL_LENGTH,
  MAX_ROUTE_LENGTH,
  MAX_SELECTOR_LENGTH,
  sanitizeSuggestedFix,
} from './_sanitize.js';

export const inspectDiffClusterDomInputSchema = {
  diff_id: z
    .string()
    .min(1)
    .max(MAX_DIFF_ID_LENGTH)
    .describe(
      'Diff identifier from list_regressions (`<runId>:<route>@<viewport>` or `@<viewport>@<browser>`).',
    ),
  cluster_id: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Optional 1-based diff cluster index to inspect.'),
} as const;

export type InspectDiffClusterDomInput = {
  diff_id: string;
  cluster_id?: number;
};

export interface DiffClusterInspectionItem {
  id: number;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  targetSelector: string;
}

export interface InspectDiffClusterDomResult {
  diffId: string;
  route: string;
  viewport: number;
  browser?: string;
  diffPercentage: number;
  classification: string | null;
  explanation: string | null;
  suggestedFix: {
    fixType: string;
    category: string;
    patch: string;
    target: string;
    confidence: number;
    verified?: boolean;
  } | null;
  clusters: DiffClusterInspectionItem[];
}

export const inspectDiffClusterDomOutputSchema = z.object({
  diffId: z.string(),
  route: z.string(),
  viewport: z.number(),
  browser: z.string().optional(),
  diffPercentage: z.number(),
  classification: z.string().nullable(),
  explanation: z.string().nullable(),
  suggestedFix: z
    .object({
      fixType: z.string(),
      category: z.string(),
      patch: z.string(),
      target: z.string(),
      confidence: z.number(),
      verified: z.boolean().optional(),
    })
    .nullable(),
  clusters: z.array(
    z.object({
      id: z.number(),
      bbox: z.object({
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number(),
      }),
      targetSelector: z.string(),
    }),
  ),
});

export interface RawCluster {
  id?: unknown;
  bbox?: {
    x?: unknown;
    y?: unknown;
    width?: unknown;
    height?: unknown;
  };
  x?: unknown;
  y?: unknown;
  width?: unknown;
  height?: unknown;
  targetSelector?: unknown;
}

export function normalizeClusters(
  rawClusters: RawCluster[] | undefined,
  fallbackTarget: string,
): DiffClusterInspectionItem[] {
  if (!Array.isArray(rawClusters) || rawClusters.length === 0) return [];
  const safeFallback = capSingleLine(fallbackTarget, MAX_SELECTOR_LENGTH) || 'main';
  const items: DiffClusterInspectionItem[] = [];
  for (let idx = 0; idx < rawClusters.length && items.length < MAX_CLUSTERS_PER_DIFF; idx++) {
    const raw = rawClusters[idx];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const bbox =
      raw.bbox &&
      typeof raw.bbox === 'object' &&
      typeof raw.bbox.x === 'number' &&
      typeof raw.bbox.y === 'number' &&
      typeof raw.bbox.width === 'number' &&
      typeof raw.bbox.height === 'number'
        ? {
            x: raw.bbox.x,
            y: raw.bbox.y,
            width: raw.bbox.width,
            height: raw.bbox.height,
          }
        : typeof raw.x === 'number' &&
            typeof raw.y === 'number' &&
            typeof raw.width === 'number' &&
            typeof raw.height === 'number'
          ? { x: raw.x, y: raw.y, width: raw.width, height: raw.height }
          : null;
    if (!bbox) continue;
    items.push({
      id: typeof raw.id === 'number' && Number.isFinite(raw.id) ? raw.id : idx + 1,
      bbox,
      targetSelector:
        typeof raw.targetSelector === 'string' && raw.targetSelector.trim().length > 0
          ? capSingleLine(raw.targetSelector, MAX_SELECTOR_LENGTH)
          : safeFallback,
    });
  }
  return items;
}

function inferTargetSelector(result: CloudRunResult): string {
  if (result.suggestedFix?.target && result.suggestedFix.target.trim()) {
    return capSingleLine(result.suggestedFix.target, MAX_SELECTOR_LENGTH);
  }
  if (result.suggestedFix?.patch) {
    const braceIdx = result.suggestedFix.patch.indexOf('{');
    if (braceIdx > 0) {
      const candidate = capSingleLine(result.suggestedFix.patch.slice(0, braceIdx), MAX_SELECTOR_LENGTH);
      if (candidate) return candidate;
    }
  }
  return 'main';
}

export async function inspectDiffClusterDom(
  client: CloudClient,
  input: InspectDiffClusterDomInput,
): Promise<InspectDiffClusterDomResult> {
  const parsed = parseDiffId(input.diff_id);
  if (!parsed) {
    throw new Error(
      `Invalid diff_id format "${input.diff_id}" — expected "<runId>:<route>:<viewport>" or "<runId>:<route>@<viewport>".`,
    );
  }

  const { runId, route, viewport, browser } = parsed;
  const run = await client.getRun(runId);
  const match = (run.results ?? []).find(
    (r) =>
      r.route === route &&
      r.viewport === viewport &&
      (browser === undefined || r.browser === browser),
  );

  if (!match) {
    throw new Error(
      `Diff not found in run ${runId} — route=${route} viewport=${viewport}${browser ? ` browser=${browser}` : ''}.`,
    );
  }

  const defaultTarget = inferTargetSelector(match);
  let clusters = normalizeClusters(match.clusters as RawCluster[] | undefined, defaultTarget);

  if (input.cluster_id !== undefined) {
    const filtered = clusters.filter((c) => c.id === input.cluster_id);
    if (filtered.length === 0) {
      throw new Error(
        `Cluster #${input.cluster_id} not found for diff ${input.diff_id}.`,
      );
    }
    clusters = filtered;
  }

  const rawExplanation = match.explanation ?? match.suggestedFix?.explanation ?? null;
  const explanation =
    typeof rawExplanation === 'string'
      ? capMultiLine(rawExplanation, MAX_EXPLANATION_LENGTH)
      : null;
  const cleanFix = match.suggestedFix ? sanitizeSuggestedFix(match.suggestedFix) : null;
  const suggestedFix = cleanFix
    ? {
        fixType: cleanFix.fixType,
        category: cleanFix.category,
        patch: cleanFix.patch,
        target: cleanFix.target ?? defaultTarget,
        confidence: cleanFix.confidence,
        ...(typeof cleanFix.verified === 'boolean' ? { verified: cleanFix.verified } : {}),
      }
    : null;

  return {
    diffId: capSingleLine(match.diffId ?? diffIdFor(runId, match), MAX_DIFF_ID_LENGTH),
    route: capSingleLine(match.route, MAX_ROUTE_LENGTH),
    viewport: match.viewport,
    ...(match.browser ? { browser: capSingleLine(match.browser, MAX_LABEL_LENGTH) } : {}),
    diffPercentage: match.diffPercentage,
    classification: match.classification ? capSingleLine(match.classification, MAX_LABEL_LENGTH) : null,
    explanation,
    suggestedFix,
    clusters,
  };
}
