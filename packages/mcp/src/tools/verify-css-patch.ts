/**
 * `verify_css_patch` — validate a candidate CSS patch against a visual
 * regression diff for syntax correctness, selector alignment, and
 * dangerous layout-destroying properties.
 *
 * @module tools/verify-css-patch
 */

import { z } from 'zod';
import type { CloudClient } from '../client/cloud.js';
import { diffIdFor, parseDiffId } from '../client/cloud.js';

export const verifyCssPatchInputSchema = {
  diff_id: z.string().min(1).describe('Diff identifier from list_regressions.'),
  target_selector: z.string().min(1).describe('Grounded CSS selector targeted by the patch.'),
  css_patch: z.string().min(1).describe('Candidate CSS rule or declaration block to validate.'),
} as const;

export type VerifyCssPatchInput = {
  diff_id: string;
  target_selector: string;
  css_patch: string;
};

export interface VerifyCssPatchResult {
  diffId: string;
  validSyntax: boolean;
  selectorMatchedTarget: boolean;
  dangerousProperties: string[];
  normalizedPatch: string;
  recommendation: 'apply' | 'refine' | 'reject';
  reason: string;
}

export const verifyCssPatchOutputSchema = z.object({
  diffId: z.string(),
  validSyntax: z.boolean(),
  selectorMatchedTarget: z.boolean(),
  dangerousProperties: z.array(z.string()),
  normalizedPatch: z.string(),
  recommendation: z.enum(['apply', 'refine', 'reject']),
  reason: z.string(),
});

function hasBalancedBraces(css: string): { balanced: boolean; hasBraces: boolean } {
  let depth = 0;
  let hasBraces = false;
  for (const ch of css) {
    if (ch === '{') {
      depth += 1;
      hasBraces = true;
    } else if (ch === '}') {
      depth -= 1;
      hasBraces = true;
      if (depth < 0) {
        return { balanced: false, hasBraces: true };
      }
    }
  }
  return { balanced: depth === 0, hasBraces };
}

function isValidSelectorSyntax(selector: string): boolean {
  const trimmed = selector.trim();
  if (!trimmed) return false;
  if (/[{};]/.test(trimmed)) return false;
  return true;
}

function detectDangerousProperties(css: string, targetSelector: string): string[] {
  const findings: string[] = [];

  if (/@import\b/i.test(css)) {
    findings.push('@import');
  }

  if (/url\(\s*['"]?\s*(?:https?:|\/\/|javascript:|data:text\/html)/i.test(css)) {
    findings.push('url()');
  }

  if (/expression\s*\(/i.test(css)) {
    findings.push('expression()');
  }

  const rootSelectorPattern = /^(?:html|body|:root|#root|#app|main|\*)$/i;
  const isRootTarget =
    rootSelectorPattern.test(targetSelector.trim()) ||
    /(?:^|[},]\s*)(?:html|body|:root|#root|#app|\*)\s*\{/i.test(css);

  if (/display\s*:\s*none\s*!important/i.test(css) && isRootTarget) {
    findings.push('display: none !important');
  } else if (/display\s*:\s*none\s*!important/i.test(css)) {
    findings.push('display: none !important');
  }

  if (/visibility\s*:\s*hidden\s*!important/i.test(css) && isRootTarget) {
    findings.push('visibility: hidden !important');
  }

  return findings;
}

function normalizeCssPatch(rawPatch: string, targetSelector: string): string {
  const collapsed = rawPatch.replace(/\s+/g, ' ').trim();
  if (!collapsed.includes('{') && !collapsed.includes('}')) {
    const decl = collapsed.endsWith(';') ? collapsed : `${collapsed};`;
    return `${targetSelector.trim()} { ${decl} }`;
  }
  return collapsed;
}

export async function verifyCssPatch(
  client: CloudClient,
  input: VerifyCssPatchInput,
): Promise<VerifyCssPatchResult> {
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

  const rawPatch = input.css_patch.trim();
  const targetSelector = input.target_selector.trim();
  const { balanced, hasBraces } = hasBalancedBraces(rawPatch);

  let validSyntax = balanced && isValidSelectorSyntax(targetSelector);
  if (validSyntax) {
    if (hasBraces) {
      const openIdx = rawPatch.indexOf('{');
      const closeIdx = rawPatch.lastIndexOf('}');
      const selectorPart = rawPatch.slice(0, openIdx).trim();
      const bodyPart = rawPatch.slice(openIdx + 1, closeIdx).trim();
      if (!selectorPart || !bodyPart || !bodyPart.includes(':')) {
        validSyntax = false;
      }
    } else if (!rawPatch.includes(':')) {
      validSyntax = false;
    }
  }

  const dangerousProperties = detectDangerousProperties(rawPatch, targetSelector);
  const normalizedPatch = normalizeCssPatch(rawPatch, targetSelector);

  const recordedTarget = match.suggestedFix?.target?.trim();
  const clusterTargets = (match.clusters ?? [])
    .map((c) => c.targetSelector?.trim())
    .filter((s): s is string => Boolean(s));

  let selectorMatchedTarget = isValidSelectorSyntax(targetSelector);
  if (selectorMatchedTarget && (recordedTarget || clusterTargets.length > 0)) {
    const knownTargets = [
      ...(recordedTarget ? [recordedTarget] : []),
      ...clusterTargets,
    ];
    selectorMatchedTarget = knownTargets.some(
      (known) =>
        known === targetSelector ||
        targetSelector.includes(known) ||
        known.includes(targetSelector),
    );
  }

  let recommendation: 'apply' | 'refine' | 'reject';
  let reason: string;

  if (!validSyntax) {
    recommendation = 'reject';
    reason = 'CSS patch has invalid syntax or unbalanced braces.';
  } else if (dangerousProperties.length > 0) {
    recommendation = 'reject';
    reason = `CSS patch contains dangerous properties or directives: ${dangerousProperties.join(', ')}.`;
  } else if (!selectorMatchedTarget) {
    recommendation = 'refine';
    reason = `Target selector "${targetSelector}" does not align with recorded diff target "${recordedTarget ?? 'unknown'}".`;
  } else {
    recommendation = 'apply';
    reason =
      'CSS patch syntax is valid, free of dangerous properties, and aligned with the target selector.';
  }

  return {
    diffId: match.diffId ?? diffIdFor(runId, match),
    validSyntax,
    selectorMatchedTarget,
    dangerousProperties,
    normalizedPatch,
    recommendation,
    reason,
  };
}
