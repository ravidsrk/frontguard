/**
 * Count external-repo outcomes without dropping a repo that did not boot.
 * Reads validation/repos.json (always five names) and the pixel-run output dir.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repos = JSON.parse(readFileSync(join(here, '..', 'repos.json'), 'utf8'));

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? '' : (process.argv[i + 1] ?? '');
}

function loadJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function realDiffs(runs) {
  const diffs = [];
  if (!Array.isArray(runs)) return diffs;
  for (const run of runs) {
    const result = run?.result;
    if (!result || result.error || result.note) continue;
    if (Array.isArray(result.diffs)) diffs.push(...result.diffs);
  }
  return diffs;
}

const outDir = arg('--out');
if (!outDir) throw new Error('--out is required');
const externalDir = join(outDir, 'external');
const events = existsSync(join(outDir, 'external-events.log'))
  ? readFileSync(join(outDir, 'external-events.log'), 'utf8').split('\n').filter(Boolean)
  : [];
const present = new Set(
  existsSync(externalDir) ? readdirSync(externalDir).filter((name) => name.endsWith('.json')) : [],
);

const rows = repos.map((repo) => {
  const file = join(externalDir, `${repo.name}.json`);
  const skippedByTime = events.some((line) => line.startsWith(`SKIP ${repo.name} `));
  const raw = existsSync(file) ? loadJson(file) : null;
  const diffs = realDiffs(raw?.recheckRuns);
  const booted = diffs.length > 0;
  let regression = 0;
  let changed = 0;
  let pass = 0;
  let error = 0;
  let ssimOverride = 0;
  let pixelmatch = 0;
  const browsers = new Set();
  for (const diff of diffs) {
    if (diff.status === 'regression') regression += 1;
    else if (diff.status === 'changed') changed += 1;
    else if (diff.status === 'pass') pass += 1;
    else if (diff.status === 'error') error += 1;
    if (diff.ssimOverride === true) ssimOverride += 1;
    if (diff.comparisonMethod === 'pixelmatch') pixelmatch += 1;
    if (diff.browser) browsers.add(diff.browser);
  }
  let outcome = 'no-json';
  if (skippedByTime && !raw) outcome = 'not-attempted-time-box';
  else if (booted) outcome = 'booted';
  else if (raw) outcome = 'json-without-recheck-diffs';
  else outcome = 'no-json';
  return {
    name: repo.name,
    repo: repo.repo,
    category: repo.category,
    outcome,
    booted,
    recheckDiffs: diffs.length,
    pass,
    changed,
    regression,
    error,
    ssimOverride,
    pixelmatch,
    browsers: [...browsers],
  };
});

const summary = {
  reposInDenominator: repos.length,
  rows,
  booted: rows.filter((row) => row.booted).length,
  notBooted: rows.filter((row) => !row.booted).length,
  recheckRegression: rows.reduce((sum, row) => sum + row.regression, 0),
  recheckChanged: rows.reduce((sum, row) => sum + row.changed, 0),
  recheckDiffs: rows.reduce((sum, row) => sum + row.recheckDiffs, 0),
  ssimOverride: rows.reduce((sum, row) => sum + row.ssimOverride, 0),
  browsers: [...new Set(rows.flatMap((row) => row.browsers))],
};

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
