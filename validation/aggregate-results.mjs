#!/usr/bin/env node
/**
 * aggregate-results.mjs — compute aggregate metrics from validation/results/*.json.
 *
 * The harness runs two passes against each repo:
 *   baselineRuns: first pass (no baseline exists yet — routes are "new")
 *   recheckRuns:  second pass against unchanged code (a green re-run)
 *
 * Pixel-only metric we can honestly measure:
 *   false_positive_rate = (recheck routes with status != 'pass') / (recheck routes total)
 *
 * Anti-flake hit rate, AI classification accuracy, and TP/FN counts require
 * either deliberate regression seeding or AI keys; we mark those as N/A
 * when the data isn't there and explain why in the methodology.
 *
 * Usage:
 *   node validation/aggregate-results.mjs                 # prints markdown
 *   node validation/aggregate-results.mjs --json          # prints JSON
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(__dirname, 'results');

function loadResults() {
  const entries = readdirSync(RESULTS_DIR).filter((f) => f.endsWith('.json'));
  return entries.map((f) => {
    const raw = readFileSync(join(RESULTS_DIR, f), 'utf8');
    try {
      return JSON.parse(raw);
    } catch (e) {
      return { name: f.replace(/\.json$/, ''), parseError: e.message };
    }
  });
}

function flattenDiffs(routeRuns) {
  if (!Array.isArray(routeRuns)) return [];
  const diffs = [];
  for (const r of routeRuns) {
    const result = r && r.result;
    if (!result || result.error) {
      diffs.push({ route: r?.route ?? 'unknown', status: 'error', synthetic: true });
      continue;
    }
    if (Array.isArray(result.diffs)) {
      for (const d of result.diffs) {
        diffs.push({
          route: r.route,
          viewport: d.viewport,
          browser: d.browser,
          status: d.status,
          diffPercentage: d.diffPercentage,
          classification: d?.aiAnalysis?.classification,
        });
      }
    }
  }
  return diffs;
}

function summarize(repo) {
  const baseline = flattenDiffs(repo.baselineRuns);
  const recheck = flattenDiffs(repo.recheckRuns);

  const counts = (diffs) => {
    const c = { pass: 0, regression: 0, warning: 0, new: 0, error: 0, other: 0 };
    for (const d of diffs) {
      if (c[d.status] !== undefined) c[d.status]++;
      else c.other++;
    }
    return c;
  };

  const recheckCounts = counts(recheck);
  const baselineCounts = counts(baseline);
  const recheckTotal = recheck.length;
  const recheckPositives = recheckCounts.regression + recheckCounts.warning;
  const fpRate = recheckTotal > 0 ? recheckPositives / recheckTotal : null;

  // The repo "booted" if Frontguard rendered ANY real diff in either pass —
  // pure error/synthetic entries don't count, since they signal the dev
  // server never came up or the CLI crashed before rendering.
  const recheckReal = recheckCounts.pass + recheckCounts.regression + recheckCounts.warning + recheckCounts.new;
  const baselineReal = baselineCounts.pass + baselineCounts.regression + baselineCounts.warning + baselineCounts.new;
  return {
    name: repo.name,
    repo: repo.repo,
    category: repo.category,
    baselineCounts,
    recheckCounts,
    recheckTotal,
    recheckPositives,
    fpRate,
    bootSucceeded: recheckReal + baselineReal > 0,
  };
}

function loadSkipNotes() {
  try {
    return JSON.parse(readFileSync(join(RESULTS_DIR, 'skip-notes.json'), 'utf8'));
  } catch {
    return null;
  }
}

function loadReposManifest() {
  try {
    return JSON.parse(readFileSync(join(__dirname, 'repos.json'), 'utf8'));
  } catch {
    return [];
  }
}

function deriveSkippedFromManifest(presentRepoNames) {
  const manifest = loadReposManifest();
  const skipNotes = loadSkipNotes() ?? { reasons: {} };
  return manifest
    .filter((m) => !presentRepoNames.has(m.name))
    .map((m) => ({
      name: m.name,
      category: m.category,
      reason: skipNotes.reasons?.[m.name] ?? 'no results JSON written (clone / install / dev-server failure — see harness log)',
    }));
}

function aggregate() {
  const results = loadResults().filter((r) => !r.parseError && r.name && r.name !== 'skip-notes');
  const summaries = results.map(summarize);

  const totalRoutes = summaries.reduce((s, r) => s + r.recheckTotal, 0);
  const totalFP = summaries.reduce((s, r) => s + r.recheckPositives, 0);
  const overallFPRate = totalRoutes > 0 ? totalFP / totalRoutes : null;
  const reposBooted = summaries.filter((s) => s.bootSucceeded).length;
  const present = new Set(summaries.map((s) => s.name));
  const skipped = deriveSkippedFromManifest(present);
  const totalRepos = summaries.length + skipped.length;

  return {
    summaries,
    skipped,
    aggregate: {
      reposAttempted: totalRepos,
      reposBooted,
      reposSkipped: totalRepos - reposBooted,
      recheckRouteCount: totalRoutes,
      recheckPositiveCount: totalFP,
      pixelFalsePositiveRate: overallFPRate,
    },
  };
}

function pct(n) {
  if (n == null) return 'n/a';
  return `${(n * 100).toFixed(1)}%`;
}

function renderMarkdown(a) {
  const lines = [];
  const ai = process.env.FRONTGUARD_AI_ENABLED === 'true';

  lines.push('### Aggregate (pixel-only)');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|---|---|');
  lines.push(`| Repos attempted | ${a.aggregate.reposAttempted} |`);
  lines.push(`| Repos that booted | ${a.aggregate.reposBooted} |`);
  lines.push(`| Repos skipped | ${a.aggregate.reposSkipped} |`);
  lines.push(`| Recheck routes measured | ${a.aggregate.recheckRouteCount} |`);
  lines.push(`| Recheck positives (regression+warning) | ${a.aggregate.recheckPositiveCount} |`);
  lines.push(`| **Pixel-only false-positive rate** | **${pct(a.aggregate.pixelFalsePositiveRate)}** |`);
  lines.push(`| AI classification accuracy | ${ai ? 'see per-repo table' : '_pending key configuration (no AI provider key set in env)_'} |`);
  lines.push('');

  lines.push('### Per-repo');
  lines.push('');
  lines.push('| Repo | Category | Booted | Baseline new | Recheck pass | Recheck regression+warning | Recheck error | Pixel FP rate |');
  lines.push('|---|---|---|---|---|---|---|---|');
  for (const s of a.summaries) {
    const baselineNew = s.baselineCounts.new + s.baselineCounts.pass; // "pass" can happen if a baseline existed already
    const recheckPass = s.recheckCounts.pass;
    const recheckBad = s.recheckCounts.regression + s.recheckCounts.warning;
    const recheckErr = s.recheckCounts.error;
    lines.push(
      `| ${s.name} | ${s.category} | ${s.bootSucceeded ? '✅' : '❌'} | ${baselineNew} | ${recheckPass} | ${recheckBad} | ${recheckErr} | ${pct(s.fpRate)} |`,
    );
  }
  for (const sk of a.skipped) {
    lines.push(
      `| ${sk.name} | ${sk.category ?? '—'} | ❌ | — | — | — | — | n/a (${sk.reason}) |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

function buildLandingPayload(a, runDate, cliVersion) {
  // Compact shape consumed by apps/landing/src/components/Validation.tsx —
  // pre-computed so the marketing build has no runtime dependency on the
  // raw per-repo JSONs.
  const repoEntries = a.summaries.map((s) => ({
    name: s.name,
    category: s.category,
    bootSucceeded: s.bootSucceeded,
    recheckPass: s.recheckCounts.pass,
    recheckFalsePositive: s.recheckCounts.regression + s.recheckCounts.warning,
    recheckError: s.recheckCounts.error,
    pixelFalsePositiveRate: s.fpRate,
  }));
  for (const sk of a.skipped) {
    repoEntries.push({
      name: sk.name,
      category: sk.category ?? '—',
      bootSucceeded: false,
      recheckPass: 0,
      recheckFalsePositive: 0,
      recheckError: 0,
      pixelFalsePositiveRate: null,
      skipReason: sk.reason,
    });
  }
  return {
    runDate,
    cliVersion,
    aiEnabled: process.env.FRONTGUARD_AI_ENABLED === 'true',
    aggregate: a.aggregate,
    repos: repoEntries,
  };
}

const args = process.argv.slice(2);
const data = aggregate();
if (args.includes('--json')) {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
} else if (args.includes('--landing')) {
  const idx = args.indexOf('--run-date');
  const runDate = idx >= 0 ? args[idx + 1] : new Date().toISOString().slice(0, 10);
  const cidx = args.indexOf('--cli-version');
  const cliVersion = cidx >= 0 ? args[cidx + 1] : '0.2.0';
  const payload = buildLandingPayload(data, runDate, cliVersion);
  process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
} else {
  process.stdout.write(renderMarkdown(data) + '\n');
}
