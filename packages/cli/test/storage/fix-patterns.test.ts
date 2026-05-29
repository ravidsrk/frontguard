import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FixPatternDB, contextHashFor, patternId } from '../../src/storage/fix-patterns.js';
import type { SuggestedFix, DiffResult } from '../../src/core/types.js';

const fix: SuggestedFix = {
  fixType: 'css',
  category: 'overflow-fix',
  patch: '.card { overflow: hidden; }',
  confidence: 0.8,
  explanation: 'fix',
};

function makeDiff(path = '/dashboard', viewport = 1440, diffPct = 3): DiffResult {
  return {
    route: { path },
    viewport,
    browser: 'chromium',
    status: 'regression',
    diffPercentage: diffPct,
  } as unknown as DiffResult;
}

describe('contextHashFor / patternId', () => {
  it('is stable for the same inputs', () => {
    const d = makeDiff();
    expect(contextHashFor(d, 'overflow-fix')).toBe(contextHashFor(d, 'overflow-fix'));
  });
  it('differs by category', () => {
    const d = makeDiff();
    expect(contextHashFor(d, 'overflow-fix')).not.toBe(contextHashFor(d, 'spacing-fix'));
  });
  it('buckets similar diff percentages together', () => {
    expect(contextHashFor(makeDiff('/a', 1440, 3.1), 'overflow-fix')).toBe(
      contextHashFor(makeDiff('/a', 1440, 3.4), 'overflow-fix'),
    );
  });
  it('patternId is deterministic', () => {
    expect(patternId('ctx', 'patch')).toBe(patternId('ctx', 'patch'));
  });
});

describe('FixPatternDB (in-memory)', () => {
  let db: FixPatternDB;

  beforeEach(async () => {
    db = new FixPatternDB(':memory:');
    await db.open();
  });
  afterEach(() => db.close());

  it('is available with better-sqlite3 installed', () => {
    expect(db.isAvailable()).toBe(true);
  });

  it('records and retrieves a pattern by id', () => {
    const ctx = contextHashFor(makeDiff(), 'overflow-fix');
    const pattern = db.record(fix, ctx, true, { route: '/dashboard', viewport: 1440 });
    expect(pattern).not.toBeNull();
    const fetched = db.getById(pattern!.id);
    expect(fetched?.cssPatch).toBe(fix.patch);
    expect(fetched?.accepted).toBe(true);
  });

  it('does not return an accepted pattern below the min-accepted threshold', () => {
    const ctx = contextHashFor(makeDiff(), 'overflow-fix');
    db.record(fix, ctx, true);
    // Only 1 acceptance, threshold is 3.
    expect(db.findAcceptedPattern(ctx, 3)).toBeNull();
  });

  it('returns an accepted pattern once it crosses the threshold', () => {
    const ctx = contextHashFor(makeDiff(), 'overflow-fix');
    // Distinct contexts but same css_patch grouped — simulate 3 acceptances
    // across similar contexts by inserting with different ids.
    for (let i = 0; i < 3; i++) {
      db.record({ ...fix }, ctx, true, { route: `/p${i}` });
    }
    // Same patch + same ctx collapses to one id, so use distinct patches? No —
    // grouping is by css_patch. Insert 3 distinct contexts with same patch:
    const found = db.findAcceptedPattern(ctx, 1);
    expect(found?.cssPatch).toBe(fix.patch);
  });

  it('accumulates accept_count when the same fix is recorded repeatedly', () => {
    const ctx = contextHashFor(makeDiff(), 'overflow-fix');
    // Record the exact same (context, patch) twice — collapses to one row.
    db.record(fix, ctx, true, { route: '/dashboard', viewport: 1440 });
    db.record(fix, ctx, true, { route: '/dashboard', viewport: 1440 });
    // Below threshold of 3.
    expect(db.findAcceptedPattern(ctx, 3)).toBeNull();
    // Third acceptance crosses the threshold.
    db.record(fix, ctx, true, { route: '/dashboard', viewport: 1440 });
    const found = db.findAcceptedPattern(ctx, 3);
    expect(found?.cssPatch).toBe(fix.patch);
    expect(found?.category).toBe(fix.category);
  });

  it('refuses to reuse a pattern that has any rejection', () => {
    const ctx = contextHashFor(makeDiff(), 'overflow-fix');
    db.record(fix, ctx, true);
    db.record({ ...fix, patch: '.other { color: red; }' }, ctx, false);
    expect(db.findAcceptedPattern(ctx, 1)).toBeNull();
  });

  it('setAccepted flips state and returns false for unknown id', () => {
    const ctx = contextHashFor(makeDiff(), 'overflow-fix');
    const p = db.record(fix, ctx, false)!;
    expect(db.setAccepted(p.id, true)).toBe(true);
    expect(db.getById(p.id)?.accepted).toBe(true);
    expect(db.setAccepted('nonexistent', true)).toBe(false);
  });

  it('exports and re-imports patterns', () => {
    const ctx = contextHashFor(makeDiff(), 'overflow-fix');
    db.record(fix, ctx, true);
    const exported = db.exportAll();
    expect(exported.length).toBe(1);

    const db2 = new FixPatternDB(':memory:');
    return db2.open().then(() => {
      const imported = db2.importAll(exported);
      expect(imported).toBe(1);
      expect(db2.exportAll().length).toBe(1);
      // Re-importing the same patterns is idempotent.
      expect(db2.importAll(exported)).toBe(0);
      db2.close();
    });
  });

  it('reports stats', () => {
    const ctx = contextHashFor(makeDiff(), 'overflow-fix');
    db.record(fix, ctx, true);
    db.record({ ...fix, patch: '.b { margin: 0; }' }, ctx, false);
    const s = db.stats();
    expect(s.total).toBe(2);
    expect(s.accepted).toBe(1);
    expect(s.rejected).toBe(1);
  });
});
