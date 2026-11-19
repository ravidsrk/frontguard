#!/usr/bin/env node
/**
 * Formats `npm audit --json` output for the weekly audit issue comment.
 * Optionally diffs vulnerability counts against a previous metadata snapshot.
 *
 * Usage:
 *   node scripts/audit-weekly-report.mjs audit-current.json [audit-previous.json]
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SEVERITY_FIELDS = ['critical', 'high', 'moderate', 'low', 'total'];

/**
 * Coerces an untrusted metadata field to a non-negative safe integer.
 * Rejects non-numeric strings, NaN, Infinity, floats, and negatives so
 * tampered or malformed previous-comment metadata cannot inject Markdown or
 * produce NaN deltas.
 */
export function toNonNegativeInt(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
  }
  return 0;
}

/** Extracts a sanitized numeric vulnerability-count map from an untrusted object. */
export function normalizeCounts(obj) {
  const safe = {};
  for (const field of SEVERITY_FIELDS) {
    safe[field] =
      obj && typeof obj === 'object' && !Array.isArray(obj) ? toNonNegativeInt(obj[field]) : 0;
  }
  return safe;
}

function escapeInline(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/[`<>&|]/g, '')
    .trim();
}

export function buildAuditReport(audit, rawPrevious = null, date = new Date().toISOString().slice(0, 10)) {
  const current = normalizeCounts(audit?.metadata?.vulnerabilities);
  const highs = Object.values(audit?.vulnerabilities ?? {}).filter(
    (v) => v && typeof v === 'object' && ['high', 'critical'].includes(v.severity),
  );

  const hasPrevious =
    rawPrevious !== null && typeof rawPrevious === 'object' && !Array.isArray(rawPrevious);
  const previous = hasPrevious ? normalizeCounts(rawPrevious) : null;

  const lines = [];
  lines.push(`## Weekly npm audit — ${date}`);
  lines.push('');
  lines.push('Command: `npm audit --omit=dev --json`');
  lines.push('');

  if (previous) {
    lines.push('### Diff vs last report');
    lines.push('');
    lines.push('| Severity | Previous | Current | Δ |');
    lines.push('|---|---:|---:|---:|');
    for (const field of SEVERITY_FIELDS) {
      const prev = previous[field];
      const curr = current[field];
      const delta = curr - prev;
      const sign = delta > 0 ? `+${delta}` : String(delta);
      lines.push(`| ${field} | ${prev} | ${curr} | ${sign} |`);
    }
    lines.push('');
  }

  lines.push('### Current summary');
  lines.push('');
  lines.push('| Severity | Count |');
  lines.push('|---|---:|');
  for (const field of SEVERITY_FIELDS) {
    lines.push(`| ${field} | ${current[field]} |`);
  }
  lines.push('');

  if (highs.length > 0) {
    lines.push('### High / critical packages');
    lines.push('');
    for (const entry of highs) {
      const sev = escapeInline(entry.severity);
      const name = escapeInline(entry.name);
      const range = escapeInline(entry.range ?? 'n/a') || 'n/a';
      lines.push(`- **${sev}** \`${name}\` (${range})`);
    }
    lines.push('');
  } else {
    lines.push('_No high or critical vulnerabilities in the production tree._');
    lines.push('');
  }

  lines.push(
    `<!-- audit-metadata:${Buffer.from(JSON.stringify(current)).toString('base64')} -->`,
  );

  return lines.join('\n');
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const currentPath = process.argv[2];
  const previousPath = process.argv[3];

  if (!currentPath) {
    console.error('usage: node scripts/audit-weekly-report.mjs <audit.json> [previous.json]');
    process.exit(1);
  }

  const audit = JSON.parse(readFileSync(currentPath, 'utf8'));
  let previous = null;
  if (previousPath) {
    try {
      const parsed = JSON.parse(readFileSync(previousPath, 'utf8'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        previous = parsed;
      }
    } catch {
      previous = null;
    }
  }

  process.stdout.write(buildAuditReport(audit, previous));
}
