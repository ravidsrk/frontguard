/**
 * Horizontal overflow is measured on the screenshot's page.
 * Flagged means a visible unclipped border box passes the right edge.
 * scrollWidth alone does not flag a transparent or clipped page.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { measureHorizontalOverflow, overflowReports } from '../../src/render/horizontal-overflow.js';
import { comparisonExitCode } from '../../src/cli/exit-code.js';

const fixtureDir = new URL('../../../../validation/fixtures/overflow/', import.meta.url);
const notePath = new URL('../../../../validation/results-overflow.md', import.meta.url);

interface FixtureCase {
  file: string;
  flag: boolean;
  selector: string;
  scrolls?: boolean;
}

describe('horizontal overflow fixtures', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch();
    page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  }, 30_000);

  afterAll(async () => {
    await page?.close();
    await browser?.close();
  });

  it('flags real overflow and skips clipped, transparent, and fitting pages', async () => {
    const labels = JSON.parse(readFileSync(new URL('labels.json', fixtureDir), 'utf8')) as {
      width: number;
      height: number;
      cases: FixtureCase[];
    };
    await page.setViewportSize({ width: labels.width, height: labels.height });

    const measured: Array<FixtureCase & { flagged: boolean }> = [];
    for (const fixture of labels.cases) {
      const html = readFileSync(new URL(fixture.file, fixtureDir), 'utf8');
      await page.setContent(html, { waitUntil: 'load' });
      const shot = await measureHorizontalOverflow(page);
      expect(shot, fixture.file).toBeDefined();
      const flagged = (shot?.elements.length ?? 0) > 0;
      const listed = shot?.elements.some((el) => el.selector === fixture.selector) ?? false;
      expect(listed, fixture.file).toBe(fixture.flag);
      expect(flagged, fixture.file).toBe(fixture.flag);
      if (fixture.flag) {
        const hit = shot?.elements.find((el) => el.selector === fixture.selector);
        expect(hit?.overflowPx, fixture.file).toBeGreaterThanOrEqual(1);
      } else {
        expect(shot?.elements.some((el) => el.selector === fixture.selector), fixture.file).toBe(false);
      }
      if (fixture.scrolls === true) {
        expect(shot!.scrollWidth, fixture.file).toBeGreaterThan(shot!.innerWidth);
      }
      if (fixture.scrolls === false) {
        expect(shot!.scrollWidth, fixture.file).toBeLessThanOrEqual(shot!.innerWidth);
      }
      measured.push({ ...fixture, flagged });
    }

    const positives = measured.filter((row) => row.flag);
    const predicted = measured.filter((row) => row.flagged);
    const truePositives = predicted.filter((row) => row.flag).length;
    const falsePositives = predicted.filter((row) => !row.flag).length;
    expect(truePositives).toBe(positives.length);
    expect(falsePositives).toBe(0);
    const precision = `${truePositives}/${truePositives + falsePositives}`;
    const note = readFileSync(notePath, 'utf8');
    expect(note).toContain(`Precision on this set is ${precision}.`);
    expect(note).toContain('not a Frontguard judge accuracy');
    expect(note).not.toMatch(/Clopper-Pearson/);
  });
});

describe('overflow reports stay off the exit code', () => {
  it('keeps a passing summary at exit 0 when a shot is flagged', async () => {
    const rows = await overflowReports([
      {
        route: { path: '/pricing' },
        viewport: 800,
        browser: 'chromium',
        horizontalOverflow: {
          innerWidth: 800,
          scrollWidth: 1400,
          elements: [{ selector: '[data-testid="wide"]', overflowPx: 600 }],
        },
      },
      {
        route: { path: '/fit' },
        viewport: 800,
        browser: 'chromium',
        horizontalOverflow: { innerWidth: 800, scrollWidth: 800, elements: [] },
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ route: '/pricing', flagged: true });
    expect(comparisonExitCode({
      total: 1,
      passed: 1,
      regressions: 0,
      warnings: 0,
      newPages: 0,
      errors: 0,
    })).toBe(0);
  });

  it('records a wide transparent page without flagging it', async () => {
    const rows = await overflowReports([
      {
        route: { path: '/ghost' },
        viewport: 800,
        browser: 'chromium',
        horizontalOverflow: { innerWidth: 800, scrollWidth: 1400, elements: [] },
      },
    ]);
    expect(rows).toEqual([
      {
        route: '/ghost',
        viewport: 800,
        browser: 'chromium',
        innerWidth: 800,
        scrollWidth: 1400,
        flagged: false,
        elements: [],
      },
    ]);
  });
});
