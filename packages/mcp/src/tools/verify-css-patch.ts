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

function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

interface ParsedCssStructure {
  balanced: boolean;
  hasBraces: boolean;
  ruleSelectors: string[];
  declarationBlocks: string[];
}

function parseCssStructure(rawCss: string): ParsedCssStructure {
  const css = stripCssComments(rawCss);
  let depth = 0;
  let hasBraces = false;
  let inSingle = false;
  let inDouble = false;
  let lastTopIdx = 0;
  let blockStart = -1;
  const ruleSelectors: string[] = [];
  const declarationBlocks: string[] = [];

  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    const prev = i > 0 ? css[i - 1] : '';
    if (ch === "'" && !inDouble && prev !== '\\') {
      inSingle = !inSingle;
      continue;
    }
    if (ch === '"' && !inSingle && prev !== '\\') {
      inDouble = !inDouble;
      continue;
    }
    if (inSingle || inDouble) continue;

    if (ch === '{') {
      hasBraces = true;
      if (depth === 0) {
        const selector = css.slice(lastTopIdx, i).trim();
        // Strip leading @import statements before the rule selector if present
        const cleanedSelector = selector.replace(/^(?:@import\s+[^;]+;\s*)+/i, '').trim();
        ruleSelectors.push(cleanedSelector);
        blockStart = i + 1;
      }
      depth += 1;
      if (depth > 1) {
        return { balanced: false, hasBraces: true, ruleSelectors, declarationBlocks };
      }
    } else if (ch === '}') {
      hasBraces = true;
      depth -= 1;
      if (depth < 0) {
        return { balanced: false, hasBraces: true, ruleSelectors, declarationBlocks };
      }
      if (depth === 0 && blockStart !== -1) {
        declarationBlocks.push(css.slice(blockStart, i).trim());
        blockStart = -1;
        lastTopIdx = i + 1;
      }
    }
  }

  const trailing = css.slice(lastTopIdx).trim();
  if (hasBraces && trailing.length > 0) {
    return { balanced: false, hasBraces, ruleSelectors, declarationBlocks };
  }

  return {
    balanced: depth === 0 && !inSingle && !inDouble,
    hasBraces,
    ruleSelectors,
    declarationBlocks,
  };
}

function splitTopLevelDeclarations(block: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let parenDepth = 0;

  for (let i = 0; i < block.length; i++) {
    const ch = block[i];
    const prev = i > 0 ? block[i - 1] : '';
    if (ch === "'" && !inDouble && prev !== '\\') {
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle && prev !== '\\') {
      inDouble = !inDouble;
    } else if (!inSingle && !inDouble) {
      if (ch === '(') parenDepth += 1;
      else if (ch === ')') parenDepth = Math.max(0, parenDepth - 1);
      else if (ch === ';' && parenDepth === 0) {
        parts.push(current.trim());
        current = '';
        continue;
      }
    }
    current += ch;
  }
  if (current.trim().length > 0) {
    parts.push(current.trim());
  }
  return parts.filter((p) => p.length > 0);
}

function isValidDeclarationBlock(block: string): boolean {
  const decls = splitTopLevelDeclarations(block);
  if (decls.length === 0) return false;
  const propPattern = /^(?:--[a-zA-Z0-9_-]+|-?[a-zA-Z][a-zA-Z0-9_-]*)$/;
  for (const decl of decls) {
    const colonIdx = decl.indexOf(':');
    if (colonIdx <= 0) return false;
    const prop = decl.slice(0, colonIdx).trim();
    const val = decl.slice(colonIdx + 1).trim();
    if (!propPattern.test(prop) || !val || /[{}]/.test(val)) {
      return false;
    }
  }
  return true;
}

function isValidSelectorSyntax(selector: string): boolean {
  const trimmed = selector.trim();
  if (!trimmed) return false;
  if (/[{};]/.test(trimmed)) return false;
  return true;
}

function detectDangerousProperties(
  css: string,
  targetSelector: string,
  ruleSelectors: string[],
): string[] {
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
  const allSelectors = [targetSelector.trim(), ...ruleSelectors.map((s) => s.trim())];
  const isRootTarget = allSelectors.some((sel) =>
    sel
      .split(',')
      .map((s) => s.trim())
      .some((s) => rootSelectorPattern.test(s)),
  );

  if (/display\s*:\s*none\s*!important/i.test(css)) {
    findings.push('display: none !important');
  } else if (isRootTarget && /display\s*:\s*none\b/i.test(css)) {
    findings.push('display: none (root container)');
  }

  if (/visibility\s*:\s*hidden\s*!important/i.test(css) && isRootTarget) {
    findings.push('visibility: hidden !important');
  } else if (isRootTarget && /visibility\s*:\s*hidden\b/i.test(css)) {
    findings.push('visibility: hidden (root container)');
  }

  return findings;
}

function normalizeCssPatch(rawPatch: string, targetSelector: string): string {
  const trimmed = rawPatch.trim();
  if (!trimmed.includes('{') && !trimmed.includes('}')) {
    const decl = trimmed.endsWith(';') ? trimmed : `${trimmed};`;
    return `${targetSelector.trim()} { ${decl} }`;
  }
  return trimmed;
}

function selectorsEqualOrTokenMatch(a: string, b: string): boolean {
  const normA = a.trim();
  const normB = b.trim();
  if (!normA || !normB) return false;
  if (normA === normB) return true;
  const tokensA = normA.split(',').map((s) => s.trim()).filter(Boolean);
  const tokensB = normB.split(',').map((s) => s.trim()).filter(Boolean);
  return tokensA.some((t) => tokensB.includes(t));
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
  const structure = parseCssStructure(rawPatch);

  let validSyntax = structure.balanced && isValidSelectorSyntax(targetSelector);
  if (validSyntax) {
    if (structure.hasBraces) {
      if (
        structure.ruleSelectors.length === 0 ||
        structure.ruleSelectors.some((s) => !isValidSelectorSyntax(s)) ||
        structure.declarationBlocks.length === 0 ||
        structure.declarationBlocks.some((b) => !isValidDeclarationBlock(b))
      ) {
        validSyntax = false;
      }
    } else if (!isValidDeclarationBlock(rawPatch)) {
      validSyntax = false;
    }
  }

  const dangerousProperties = detectDangerousProperties(
    rawPatch,
    targetSelector,
    structure.ruleSelectors,
  );
  const normalizedPatch = normalizeCssPatch(rawPatch, targetSelector);

  const recordedTarget = match.suggestedFix?.target?.trim();
  const clusterTargets = (match.clusters ?? [])
    .map((c) => c.targetSelector?.trim())
    .filter((s): s is string => Boolean(s));

  const patchSelectorsAlignWithTarget =
    !structure.hasBraces ||
    (structure.ruleSelectors.length > 0 &&
      structure.ruleSelectors.every((ruleSel) =>
        selectorsEqualOrTokenMatch(ruleSel, targetSelector),
      ));

  let selectorMatchedTarget =
    isValidSelectorSyntax(targetSelector) && patchSelectorsAlignWithTarget;
  if (selectorMatchedTarget && (recordedTarget || clusterTargets.length > 0)) {
    const knownTargets = [
      ...(recordedTarget ? [recordedTarget] : []),
      ...clusterTargets,
    ];
    selectorMatchedTarget = knownTargets.some((known) =>
      selectorsEqualOrTokenMatch(known, targetSelector),
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
    reason = !patchSelectorsAlignWithTarget
      ? `Rule selector in css_patch does not match target_selector "${targetSelector}".`
      : `Target selector "${targetSelector}" does not align with recorded diff target "${recordedTarget ?? 'unknown'}".`;
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
