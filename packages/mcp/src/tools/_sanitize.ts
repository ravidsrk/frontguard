/**
 * Bounding and control-character sanitization helpers for untrusted page/report
 * data returned by MCP tools.
 *
 * @module tools/_sanitize
 */

import type { CloudSuggestedFix } from '../client/cloud.js';

export const MAX_ROUTE_LENGTH = 256;
export const MAX_SELECTOR_LENGTH = 256;
export const MAX_DIFF_ID_LENGTH = 384;
export const MAX_EXPLANATION_LENGTH = 1000;
export const MAX_PATCH_LENGTH = 4096;
export const MAX_URL_LENGTH = 512;
export const MAX_LABEL_LENGTH = 128;
export const MAX_CLUSTERS_PER_DIFF = 25;
export const MAX_OVERFLOW_ELEMENTS_PER_ROW = 25;
export const MAX_CURSOR_LENGTH = 512;
export const MAX_KNOWN_TARGETS = 10;

// eslint-disable-next-line no-control-regex
const SINGLE_LINE_CTRL_RE = /[\x00-\x1f\x7f]+/g;
// eslint-disable-next-line no-control-regex
const MULTI_LINE_CTRL_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]+/g;

/** Normalize a single-line untrusted field (route, selector, id) and cap its length. */
export function capSingleLine(value: string, maxLen: number): string {
  const cleaned = value.replace(SINGLE_LINE_CTRL_RE, ' ').trim();
  if (cleaned.length <= maxLen) return cleaned;
  return `${cleaned.slice(0, Math.max(1, maxLen - 1)).trimEnd()}…`;
}

/** Normalize a multi-line untrusted field (CSS patch, explanation) and cap its length. */
export function capMultiLine(value: string, maxLen: number): string {
  const cleaned = value.replace(MULTI_LINE_CTRL_RE, '');
  if (cleaned.length <= maxLen) return cleaned;
  return `${cleaned.slice(0, Math.max(1, maxLen - 1)).trimEnd()}…`;
}

/** Bound all string fields on a stored suggested fix payload. */
export function sanitizeSuggestedFix(fix: CloudSuggestedFix): CloudSuggestedFix {
  const fixType =
    fix.fixType === 'css' || fix.fixType === 'html' || fix.fixType === 'config'
      ? fix.fixType
      : 'css';
  const confidence =
    typeof fix.confidence === 'number' && Number.isFinite(fix.confidence)
      ? Math.max(0, Math.min(1, fix.confidence))
      : 0;
  return {
    fixType,
    category: capSingleLine(String(fix.category ?? 'other'), MAX_LABEL_LENGTH),
    patch: capMultiLine(String(fix.patch ?? ''), MAX_PATCH_LENGTH),
    confidence,
    explanation: capMultiLine(String(fix.explanation ?? ''), MAX_EXPLANATION_LENGTH),
    ...(typeof fix.target === 'string' && fix.target.trim().length > 0
      ? { target: capSingleLine(fix.target, MAX_SELECTOR_LENGTH) }
      : {}),
    ...(typeof fix.verified === 'boolean' ? { verified: fix.verified } : {}),
  };
}
