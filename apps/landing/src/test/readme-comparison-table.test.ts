/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Guards claim-7 and claim-9: the README "How Frontguard Compares" table must
 * not contain numbers the project's own sources don't support.
 *
 * The canonical sources are docs/research.md (the cited competitive research)
 * and apps/landing/src/routes/comparisons/data.ts (the data behind the live
 * /comparisons page). Two cells were fabricated/misleading and are pinned here:
 *   - claim-7: BackstopJS "Actively maintained" said "6yr" — corrected to "low activity".
 *   - claim-9: Chromatic "Pro entry" said "per-snapshot" — corrected to "$179/mo".
 * The final test generalizes the guard: every quantitative token (money or date)
 * in any table cell must appear verbatim in research.md OR comparisons/data.ts.
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../');
const readme = readFileSync(join(repoRoot, 'README.md'), 'utf8');
const research = readFileSync(join(repoRoot, 'docs/research.md'), 'utf8');
const comparisonsData = readFileSync(
  join(repoRoot, 'apps/landing/src/routes/comparisons/data.ts'),
  'utf8',
);

/** Vendor columns in README table order (the empty first column is the capability label). */
const VENDORS = ['Frontguard', 'Percy', 'Chromatic', 'BackstopJS', 'Lost Pixel', 'Argos'] as const;

interface Row {
  capability: string;
  /** One cell per VENDORS column, in order. */
  cells: string[];
}

/** Parse the single comparison table whose header names all six VENDORS. */
function parseComparisonTable(md: string): Row[] {
  const lines = md.split('\n');
  const headerIdx = lines.findIndex(
    (l) => l.trimStart().startsWith('|') && VENDORS.every((v) => l.includes(v)),
  );
  if (headerIdx === -1) throw new Error('README: comparison-table header not found');

  const rows: Row[] = [];
  // Skip the header (headerIdx) and the |---|:---:| separator (headerIdx + 1).
  for (let i = headerIdx + 2; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('|')) break; // blank line / blockquote ends the table
    const parts = line.split('|').map((c) => c.trim());
    const cells = parts.slice(1, -1); // drop empties outside the outer pipes
    const [capability, ...vendorCells] = cells;
    rows.push({ capability, cells: vendorCells });
  }
  return rows;
}

const ROWS = parseComparisonTable(readme);

function row(capability: string): Row {
  const r = ROWS.find((x) => x.capability === capability);
  if (!r) throw new Error(`README comparison table: row "${capability}" not found`);
  return r;
}

function cell(capability: string, vendor: (typeof VENDORS)[number]): string {
  return row(capability).cells[VENDORS.indexOf(vendor)];
}

describe('README comparison table is consistent with project sources', () => {
  it('parses the six-vendor comparison table with all expected rows', () => {
    expect(ROWS.length).toBeGreaterThan(0);
    expect(row('Pro entry').cells).toHaveLength(VENDORS.length);
    expect(row('Actively maintained').cells).toHaveLength(VENDORS.length);
  });

  it('BackstopJS maintenance cell reads "low activity", not the fabricated "6yr" (claim-7)', () => {
    const c = cell('Actively maintained', 'BackstopJS');
    expect(c).toContain('low activity');
    expect(c).not.toContain('6yr');
    // Matches the live /comparisons page wording.
    expect(comparisonsData).toContain('low activity');
  });

  it('Chromatic Pro-entry cell reads "$179/mo", not the misleading "per-snapshot" (claim-9)', () => {
    const c = cell('Pro entry', 'Chromatic');
    expect(c).toContain('$179/mo');
    expect(c).not.toContain('per-snapshot');
    // Matches comparisons/data.ts and the cited Chromatic Starter tier.
    expect(comparisonsData).toContain('$179/mo');
    expect(research).toContain('$179/mo');
  });

  it('every quantitative cell (money or date) maps to a citation in research.md or comparisons/data.ts', () => {
    const TOKEN = /\$[0-9][0-9.,]*(?:\/(?:mo|month|snapshot))?|\b20\d{2}-\d{2}-\d{2}\b/g;
    const sources = `${research}\n${comparisonsData}`;

    const uncited: string[] = [];
    for (const r of ROWS) {
      r.cells.forEach((c, i) => {
        for (const token of c.match(TOKEN) ?? []) {
          if (!sources.includes(token)) {
            uncited.push(`"${token}" in ${r.capability} / ${VENDORS[i]} ("${c}")`);
          }
        }
      });
    }
    expect(uncited, `uncited quantitative claims: ${uncited.join('; ')}`).toEqual([]);
  });
});
