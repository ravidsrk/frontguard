/**
 * `verify_css_patch` — statically check a candidate CSS patch against a
 * visual regression diff: tokenizer/parser syntax validation (including nested
 * `@media`/`@supports` blocks), selector alignment with the targets recorded
 * for the diff, and an AST-level deny list of exfiltration and hiding rules.
 *
 * Nothing is rendered (#383). A static pass is not a visual fix: the agent
 * applies the patch and re-runs `frontguard run` to confirm the pixels.
 *
 * @module tools/verify-css-patch
 */

import { z } from 'zod';
import type { CloudClient } from '../client/cloud.js';
import { diffIdFor, parseDiffId } from '../client/cloud.js';
import {
  capMultiLine,
  capSingleLine,
  MAX_DIFF_ID_LENGTH,
  MAX_KNOWN_TARGETS,
  MAX_PATCH_LENGTH,
  MAX_SELECTOR_LENGTH,
} from './_sanitize.js';
import { detectDangerousCss, parseCssPatch } from './css-parser.js';

export const verifyCssPatchInputSchema = {
  diff_id: z
    .string()
    .min(1)
    .max(MAX_DIFF_ID_LENGTH)
    .describe('Diff identifier from list_regressions.'),
  target_selector: z
    .string()
    .min(1)
    .max(512)
    .describe('Grounded CSS selector targeted by the patch.'),
  css_patch: z
    .string()
    .min(1)
    .max(16_384)
    .describe('Candidate CSS rule or declaration block to validate.'),
} as const;

export type VerifyCssPatchInput = {
  diff_id: string;
  target_selector: string;
  css_patch: string;
};

export interface VerifyCssPatchResult {
  diffId: string;
  /** `pass` only when the syntax is valid, nothing is denied, and the selector matches. */
  staticCheck: 'pass' | 'fail';
  /** Always false: this tool renders nothing, so pixels are unconfirmed. */
  rendered: false;
  validSyntax: boolean;
  selectorMatchedTarget: boolean;
  dangerousProperties: string[];
  /** Grounded target selectors recorded for this diff (structured untrusted data). */
  knownTargets: string[];
  normalizedPatch: string;
  reason: string;
  /** Static safe guidance: refine and re-check, or apply locally and re-run `frontguard run`. */
  nextStep: string;
}

export const verifyCssPatchOutputSchema = z.object({
  diffId: z.string(),
  staticCheck: z.enum(['pass', 'fail']),
  rendered: z.literal(false),
  validSyntax: z.boolean(),
  selectorMatchedTarget: z.boolean(),
  dangerousProperties: z.array(z.string()),
  knownTargets: z.array(z.string()),
  normalizedPatch: z.string(),
  reason: z.string(),
  nextStep: z.string(),
});

/** `nextStep` after a static pass. Only a render can confirm a visual fix. */
export const VERIFY_CSS_PASS_NEXT_STEP =
  'Apply the patch locally and re-run `frontguard run` to confirm the pixels.';

const VERIFY_CSS_SYNTAX_NEXT_STEP =
  'Fix the CSS: balanced braces, valid rules (or bare declarations), each declaration written as `property: value;`. Then call verify_css_patch again.';

const VERIFY_CSS_RULE_MISMATCH_NEXT_STEP =
  'Align the rule selector in css_patch with target_selector, or pass bare declarations, then call verify_css_patch again.';

const VERIFY_CSS_TARGET_MISMATCH_NEXT_STEP =
  'Select one of the selectors listed in knownTargets (or call inspect_diff_cluster_dom) for target_selector and css_patch, then call verify_css_patch again.';

function isValidSelectorSyntax(selector: string): boolean {
  const trimmed = selector.trim();
  if (!trimmed) return false;
  if (/[{};]/.test(trimmed)) return false;
  return true;
}

function normalizeCssPatch(rawPatch: string, targetSelector: string, hasBraces: boolean): string {
  const trimmed = rawPatch.trim();
  if (!hasBraces && !trimmed.includes('{') && !trimmed.includes('}')) {
    const decl = trimmed.endsWith(';') ? trimmed : `${trimmed};`;
    return capMultiLine(`${targetSelector.trim()} { ${decl} }`, MAX_PATCH_LENGTH);
  }
  return capMultiLine(trimmed, MAX_PATCH_LENGTH);
}

function selectorsEqualOrTokenMatch(a: string, b: string): boolean {
  const normA = a.trim();
  const normB = b.trim();
  if (!normA || !normB) return false;
  if (normA === normB) return true;
  const tokensA = normA
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const tokensB = normB
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return tokensA.some((t) => tokensB.includes(t));
}

export async function verifyCssPatch(
  client: CloudClient,
  input: VerifyCssPatchInput,
): Promise<VerifyCssPatchResult> {
  const parsed = parseDiffId(input.diff_id);
  if (!parsed) {
    throw new Error(
      `Invalid diff_id format "${capSingleLine(String(input.diff_id), MAX_DIFF_ID_LENGTH)}" — expected "<runId>:<route>:<viewport>" or "<runId>:<route>@<viewport>".`,
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
      `Diff not found in run ${runId} — route=${capSingleLine(route, 128)} viewport=${viewport}${browser ? ` browser=${browser}` : ''}.`,
    );
  }

  const rawPatch = input.css_patch.trim();
  const targetSelector = input.target_selector.trim();
  const cssAst = parseCssPatch(rawPatch);

  const ruleSelectors = cssAst.rules.map((r) => r.selectorText);
  const hasRulesOrAt = cssAst.hasBraces || cssAst.atRules.length > 0;
  let validSyntax = cssAst.valid && isValidSelectorSyntax(targetSelector);
  if (validSyntax && hasRulesOrAt) {
    if (
      ruleSelectors.some((s) => !isValidSelectorSyntax(s)) ||
      (cssAst.rules.length === 0 && cssAst.bareDeclarations.length === 0)
    ) {
      validSyntax = false;
    }
  }

  const dangerousProperties = detectDangerousCss(cssAst);
  const normalizedPatch = normalizeCssPatch(rawPatch, targetSelector, cssAst.hasBraces);

  const recordedTarget = match.suggestedFix?.target?.trim();
  const clusterTargets = (match.clusters ?? [])
    .map((c) => (c && typeof c.targetSelector === 'string' ? c.targetSelector.trim() : ''))
    .filter((s): s is string => Boolean(s));

  const knownTargets = Array.from(
    new Set([...(recordedTarget ? [recordedTarget] : []), ...clusterTargets]),
  )
    .slice(0, MAX_KNOWN_TARGETS)
    .map((t) => capSingleLine(t, MAX_SELECTOR_LENGTH));

  const patchSelectorsAlignWithTarget =
    !cssAst.hasBraces ||
    (ruleSelectors.length > 0 &&
      ruleSelectors.every((ruleSel) => selectorsEqualOrTokenMatch(ruleSel, targetSelector)));

  let selectorMatchedTarget =
    isValidSelectorSyntax(targetSelector) && patchSelectorsAlignWithTarget;
  if (selectorMatchedTarget && knownTargets.length > 0) {
    selectorMatchedTarget = knownTargets.some((known) =>
      selectorsEqualOrTokenMatch(known, targetSelector),
    );
  }

  let reason: string;
  let nextStep: string;

  if (!validSyntax) {
    reason = 'CSS patch has invalid syntax or unbalanced braces.';
    nextStep = VERIFY_CSS_SYNTAX_NEXT_STEP;
  } else if (dangerousProperties.length > 0) {
    reason = `CSS patch contains dangerous properties or directives: ${dangerousProperties.join(', ')}.`;
    nextStep = `Remove ${dangerousProperties.join(', ')} from the patch, then call verify_css_patch again.`;
  } else if (!patchSelectorsAlignWithTarget) {
    reason = 'Rule selector in css_patch does not match target_selector.';
    nextStep = VERIFY_CSS_RULE_MISMATCH_NEXT_STEP;
  } else if (!selectorMatchedTarget) {
    reason = 'target_selector does not match any selector recorded in knownTargets for this diff.';
    nextStep = VERIFY_CSS_TARGET_MISMATCH_NEXT_STEP;
  } else {
    reason =
      knownTargets.length > 0
        ? 'Static checks passed: valid syntax, no denied properties, and target_selector matches a selector recorded for this diff. Nothing was rendered, so the pixels are unconfirmed.'
        : 'Static checks passed: valid syntax and no denied properties. No target selector is recorded for this diff, so target_selector was only compared with the patch. Nothing was rendered, so the pixels are unconfirmed.';
    nextStep = VERIFY_CSS_PASS_NEXT_STEP;
  }

  const staticCheck: 'pass' | 'fail' =
    validSyntax && dangerousProperties.length === 0 && selectorMatchedTarget ? 'pass' : 'fail';

  return {
    diffId: capSingleLine(match.diffId ?? diffIdFor(runId, match), MAX_DIFF_ID_LENGTH),
    staticCheck,
    rendered: false,
    validSyntax,
    selectorMatchedTarget,
    dangerousProperties,
    knownTargets,
    normalizedPatch,
    reason,
    nextStep,
  };
}
