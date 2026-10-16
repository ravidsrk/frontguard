/**
 * `inspect_diff_cluster_dom` — inspect a visual regression diff and its
 * grounded DOM cluster bounding boxes, AI classification, and suggested fix.
 *
 * @module tools/inspect-diff-cluster-dom
 */

import { z } from 'zod';
import type { CloudClient, CloudRunResult } from '../client/cloud.js';
import { diffIdFor, parseDiffId } from '../client/cloud.js';

export const inspectDiffClusterDomInputSchema = {
  diff_id: z
    .string()
    .min(1)
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

function inferTargetSelector(result: CloudRunResult): string {
  if (result.suggestedFix?.target && result.suggestedFix.target.trim()) {
    return result.suggestedFix.target.trim();
  }
  if (result.suggestedFix?.patch) {
    const braceIdx = result.suggestedFix.patch.indexOf('{');
    if (braceIdx > 0) {
      const candidate = result.suggestedFix.patch.slice(0, braceIdx).trim();
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
  const rawClusters = match.clusters && match.clusters.length > 0 ? match.clusters : null;

  let clusters: DiffClusterInspectionItem[] = rawClusters
    ? rawClusters.map((c, idx) => ({
        id: typeof c.id === 'number' ? c.id : idx + 1,
        bbox: c.bbox ?? {
          x: Number(c.x ?? 0),
          y: Number(c.y ?? 0),
          width: Number(c.width ?? match.viewport),
          height: Number(c.height ?? Math.max(40, Math.round(match.viewport * 0.25))),
        },
        targetSelector:
          typeof c.targetSelector === 'string' && c.targetSelector.trim()
            ? c.targetSelector.trim()
            : defaultTarget,
      }))
    : [
        {
          id: 1,
          bbox: {
            x: 0,
            y: 0,
            width: match.viewport,
            height: Math.max(40, Math.round(match.viewport * 0.25)),
          },
          targetSelector: defaultTarget,
        },
      ];

  if (input.cluster_id !== undefined) {
    const filtered = clusters.filter((c) => c.id === input.cluster_id);
    clusters =
      filtered.length > 0
        ? filtered
        : [
            {
              id: input.cluster_id,
              bbox: {
                x: 0,
                y: 0,
                width: match.viewport,
                height: Math.max(40, Math.round(match.viewport * 0.25)),
              },
              targetSelector: defaultTarget,
            },
          ];
  }

  const explanation = match.explanation ?? match.suggestedFix?.explanation ?? null;
  const suggestedFix = match.suggestedFix
    ? {
        fixType: match.suggestedFix.fixType,
        category: match.suggestedFix.category,
        patch: match.suggestedFix.patch,
        target: match.suggestedFix.target ?? defaultTarget,
        confidence: match.suggestedFix.confidence,
        ...(typeof match.suggestedFix.verified === 'boolean'
          ? { verified: match.suggestedFix.verified }
          : {}),
      }
    : null;

  return {
    diffId: match.diffId ?? diffIdFor(runId, match),
    route: match.route,
    viewport: match.viewport,
    ...(match.browser ? { browser: match.browser } : {}),
    diffPercentage: match.diffPercentage,
    classification: match.classification ?? null,
    explanation,
    suggestedFix,
    clusters,
  };
}
