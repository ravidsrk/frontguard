#!/usr/bin/env node
/**
 * Formats `npm audit --json` output for the weekly audit issue comment.
 * Optionally diffs vulnerability counts against a previous metadata snapshot.
 *
 * Usage:
 *   node scripts/audit-weekly-report.mjs audit-current.json [audit-previous.json]
 */
import { readFileSync } from 'node:fs';

const currentPath = process.argv[2];
const previousPath = process.argv[3];

if (!currentPath) {
  console.error('usage: node scripts/audit-weekly-report.mjs <audit.json> [previous.json]');
  process.exit(1);
}

const audit = JSON.parse(readFileSync(currentPath, 'utf8'));
const current = audit.metadata?.vulnerabilities ?? {};
const highs = Object.values(audit.vulnerabilities ?? {}).filter((v) =>
  ['high', 'critical'].includes(v.severity),
);

let previous = null;
if (previousPath) {
  try {
    previous = JSON.parse(readFileSync(previousPath, 'utf8'));
  } catch {
    previous = null;
  }
}

const lines = [];
const date = new Date().toISOString().slice(0, 10);
lines.push(`## Weekly npm audit — ${date}`);
lines.push('');
lines.push('Command: `npm audit --omit=dev --json`');
lines.push('');

if (previous) {
  lines.push('### Diff vs last report');
  lines.push('');
  lines.push('| Severity | Previous | Current | Δ |');
  lines.push('|---|---:|---:|---:|');
  for (const field of ['critical', 'high', 'moderate', 'low', 'total']) {
    const prev = previous[field] ?? 0;
    const curr = current[field] ?? 0;
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
for (const field of ['critical', 'high', 'moderate', 'low', 'total']) {
  lines.push(`| ${field} | ${current[field] ?? 0} |`);
}
lines.push('');

if (highs.length > 0) {
  lines.push('### High / critical packages');
  lines.push('');
  for (const entry of highs) {
    lines.push(`- **${entry.severity}** \`${entry.name}\` (${entry.range ?? 'n/a'})`);
  }
  lines.push('');
} else {
  lines.push('_No high or critical vulnerabilities in the production tree._');
  lines.push('');
}

lines.push(
  `<!-- audit-metadata:${Buffer.from(JSON.stringify(current)).toString('base64')} -->`,
);

process.stdout.write(lines.join('\n'));