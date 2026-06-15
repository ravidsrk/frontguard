import { describe, it, expect, beforeEach } from 'vitest';
import {
  renderMonitorHistory,
  renderDiffViewer,
  renderMasksSettings,
  renderRunAttachments,
  renderScreenshotComparison,
  renderSpendChip,
  screenshotGroupKey,
  formatBytes,
} from '../src/dashboard/render.js';
import { app } from '../src/index.js';
import { getMemoryStore, resetMemoryStore } from '../src/db/factory.js';
import {
  resetMemoryScreenshotStore,
  getMemoryScreenshotStore,
} from '../src/storage/screenshots.js';
import { createSessionCookie, DEV_SESSION_SECRET } from '../src/auth/session.js';
import type { Monitor, MonitorRun } from '../src/db/monitors.js';
import type { Run } from '../src/types.js';
import type { ScreenshotRecord } from '../src/db/store.js';
import type { IgnoreMask } from '../src/db/masks.js';
import type { RunAttachment } from '../src/db/attachments.js';

async function sessionHeader(userId: string): Promise<{ Cookie: string }> {
  const value = await createSessionCookie(userId, DEV_SESSION_SECRET);
  return { Cookie: `fg_session=${value}` };
}

function makeMonitor(over: Partial<Monitor> = {}): Monitor {
  return {
    id: 'm1', userId: 'u1', name: 'Site', url: 'https://example.com',
    routes: ['/'], viewports: [1440], intervalMinutes: 60, alertThreshold: 0.05,
    enabled: true, createdAt: '2026-01-01T00:00:00Z', ...over,
  };
}
function makeRun(id: string, userId = 'u1'): Run {
  return {
    id, status: 'completed', url: 'https://example.com', routes: [{ path: '/' }],
    viewports: [1440], browsers: ['chromium'], threshold: 0.05, ai: null,
    createdAt: '2026-01-01T11:00:00Z', results: null, reportUrl: null,
  };
}
function makeRunForUser(): Run {
  return makeRun('r1', 'u1');
}

// ---------------------------------------------------------------------------
// Render: monitor history
// ---------------------------------------------------------------------------
describe('renderMonitorHistory', () => {
  const m = makeMonitor();
  const runs: MonitorRun[] = [
    { id: 'r1', monitorId: 'm1', userId: 'u1', status: 'passed',     regressionsCount: 0, attempts: 1, createdAt: '2026-01-03T10:00:00Z' },
    { id: 'r2', monitorId: 'm1', userId: 'u1', status: 'regression', regressionsCount: 2, attempts: 1, createdAt: '2026-01-02T10:00:00Z' },
    { id: 'r3', monitorId: 'm1', userId: 'u1', status: 'passed',     regressionsCount: 0, attempts: 2, createdAt: '2026-01-01T10:00:00Z' },
  ];

  it('renders all rows by default + a stability score header', () => {
    const html = renderMonitorHistory(m, runs);
    expect(html).toContain('history');
    expect(html).toContain('Stability across last 3 runs');
    expect(html).toContain('flake-');
    expect(html).toContain('/dashboard/runs/r1');
    expect(html).toContain('/dashboard/runs/r3');
    expect(html).toContain('retried'); // r3 had attempts=2
  });

  it('filters by status', () => {
    const html = renderMonitorHistory(m, runs, { status: 'regression' });
    expect(html).toContain('/dashboard/runs/r2');
    expect(html).not.toContain('/dashboard/runs/r1');
  });

  it('filters by attempts (retried only)', () => {
    const html = renderMonitorHistory(m, runs, { attempts: 'retried' });
    expect(html).toContain('/dashboard/runs/r3');
    expect(html).not.toContain('/dashboard/runs/r1');
  });

  it('sorts oldest-first when asked', () => {
    const html = renderMonitorHistory(m, runs, { sort: 'oldest' });
    const i1 = html.indexOf('/dashboard/runs/r3');
    const i2 = html.indexOf('/dashboard/runs/r1');
    expect(i1).toBeGreaterThan(-1);
    expect(i2).toBeGreaterThan(-1);
    expect(i1).toBeLessThan(i2);
  });

  it('escapes monitor names', () => {
    const html = renderMonitorHistory(makeMonitor({ name: '<x>' }), []);
    expect(html).not.toContain('<x>history');
    expect(html).toContain('&lt;x&gt;');
  });
});

// ---------------------------------------------------------------------------
// Render: diff viewer
// ---------------------------------------------------------------------------
describe('renderDiffViewer', () => {
  const shot = (id: string, type: 'baseline' | 'current' | 'diff'): ScreenshotRecord => ({
    id, runId: 'run1', route: '/', viewport: 1440, browser: 'chromium', type,
    r2Key: `k-${id}`, createdAt: 'now',
  });

  it('renders all three image columns + the toolbar + nav arrows', () => {
    const html = renderDiffViewer({
      runId: 'run1', diff: shot('d1', 'diff'),
      baseline: shot('b1', 'baseline'), current: shot('c1', 'current'),
      prev: { id: 'd0', route: '/', viewport: 1440 },
      next: { id: 'd2', route: '/', viewport: 1440 },
      masks: [],
    });
    expect(html).toContain('Baseline');
    expect(html).toContain('Current');
    expect(html).toContain('Diff');
    expect(html).toContain('/dashboard/screenshots/run1/b1/raw');
    expect(html).toContain('/dashboard/screenshots/run1/c1/raw');
    expect(html).toContain('/dashboard/screenshots/run1/d1/raw');
    // Mode toggle.
    expect(html).toContain('Overlay');
    expect(html).toContain('Heatmap');
    // Keyboard shortcut hints.
    expect(html).toContain('<kbd>A</kbd>');
    expect(html).toContain('<kbd>R</kbd>');
    expect(html).toContain('<kbd>I</kbd>');
    // Nav arrows.
    expect(html).toContain('/dashboard/runs/run1/diffs/d0');
    expect(html).toContain('/dashboard/runs/run1/diffs/d2');
  });

  it('disables nav arrows when prev/next are missing', () => {
    const html = renderDiffViewer({
      runId: 'run1', diff: shot('d1', 'diff'), masks: [],
    });
    expect(html).toContain('class="disabled" title="No previous diff"');
    expect(html).toContain('class="disabled" title="No next diff"');
  });

  it('embeds existing masks for client-side rendering', () => {
    const mask: IgnoreMask = {
      id: 'mk1', userId: 'u1', route: '/', viewport: 1440,
      x: 10, y: 20, width: 100, height: 50, label: 'clock',
      createdAt: 'now',
    };
    const html = renderDiffViewer({
      runId: 'run1', diff: shot('d1', 'diff'), masks: [mask],
    });
    expect(html).toContain('"x":10');
    expect(html).toContain('"width":100');
    expect(html).toContain('clock');
  });
});

// ---------------------------------------------------------------------------
// Render: bulk approve UI
// ---------------------------------------------------------------------------
describe('renderScreenshotComparison sessioned', () => {
  const shots: ScreenshotRecord[] = [
    { id: 'b1', runId: 'r1', route: '/', viewport: 1440, browser: 'chromium', type: 'baseline', r2Key: 'k', createdAt: 'now' },
    { id: 'c1', runId: 'r1', route: '/', viewport: 1440, browser: 'chromium', type: 'current',  r2Key: 'k', createdAt: 'now' },
    { id: 'd1', runId: 'r1', route: '/', viewport: 1440, browser: 'chromium', type: 'diff',     r2Key: 'k', createdAt: 'now' },
    { id: 'd2', runId: 'r1', route: '/about', viewport: 1440, browser: 'chromium', type: 'diff', r2Key: 'k', createdAt: 'now' },
  ];

  it('renders bulk-select form + per-group checkboxes', () => {
    const html = renderScreenshotComparison('r1', shots, { sessioned: true });
    expect(html).toContain('id="bulk-approve-form"');
    expect(html).toContain('Accept selected baselines');
    expect(html).toContain('name="diff_ids"');
    expect(html).toContain('value="d1"');
    expect(html).toContain('value="d2"');
    expect(html).toContain('Open diff viewer');
  });

  it('omits interactive controls when not sessioned', () => {
    const html = renderScreenshotComparison('r1', shots);
    expect(html).not.toContain('id="bulk-approve-form"');
    expect(html).not.toContain('name="diff_ids"');
  });

  it('shows decision labels for prior bulk actions', () => {
    const html = renderScreenshotComparison('r1', shots, {
      sessioned: true,
      decisions: [
        { id: 'dec1', screenshotId: 'd1', runId: 'r1', userId: 'u1', decision: 'accepted', createdAt: 'now' },
      ],
    });
    expect(html).toContain('group-decision accepted');
  });

  it('links to attachments page when attachments exist', () => {
    const att: RunAttachment = { id: 'a1', runId: 'r1', kind: 'trace', name: 'trace.zip', r2Key: 'k', createdAt: 'now', sizeBytes: 1234 };
    const html = renderScreenshotComparison('r1', shots, { sessioned: true, attachments: [att] });
    expect(html).toContain('/dashboard/runs/r1/attachments');
    expect(html).toContain('1 attachment');
  });
});

// ---------------------------------------------------------------------------
// Render: masks + attachments + spend chip + helpers
// ---------------------------------------------------------------------------
describe('renderMasksSettings', () => {
  it('shows empty state when no masks saved', () => {
    expect(renderMasksSettings([])).toContain('No saved masks');
  });
  it('renders each mask with its rect + delete form', () => {
    const m: IgnoreMask = {
      id: 'm1', userId: 'u1', route: '/pricing', viewport: 1440,
      x: 0, y: 0, width: 100, height: 50, label: 'banner', createdAt: 'now',
    };
    const html = renderMasksSettings([m]);
    expect(html).toContain('100×50px');
    expect(html).toContain('banner');
    expect(html).toContain('/pricing');
    expect(html).toContain('/dashboard/settings/masks/m1/delete');
  });
});

describe('renderRunAttachments', () => {
  it('lists attachments with download links and human sizes', () => {
    const html = renderRunAttachments('r1', [
      { id: 'a1', runId: 'r1', kind: 'trace', name: 'trace.zip', r2Key: 'k', sizeBytes: 2048, createdAt: 'now' },
      { id: 'a2', runId: 'r1', kind: 'console-log', name: 'console.txt', r2Key: 'k', sizeBytes: 500, createdAt: 'now' },
    ]);
    expect(html).toContain('/dashboard/runs/r1/attachments/a1/download');
    expect(html).toContain('/dashboard/runs/r1/attachments/a2/download');
    expect(html).toContain('Trace');
    expect(html).toContain('Console log');
    expect(html).toContain('2.0 KB');
  });
  it('shows empty state when there are no attachments', () => {
    expect(renderRunAttachments('r1', [])).toContain('No attachments');
  });
});

describe('renderSpendChip', () => {
  it('returns empty string when there is no cap data at all', () => {
    expect(renderSpendChip(undefined)).toBe('');
  });
  it('shows an Unlimited chip when limit is null', () => {
    expect(renderSpendChip({ runs: 999, runsLimit: null, planName: 'Business' })).toContain('Unlimited');
  });
  it('uses green/yellow/red tiers based on usage ratio', () => {
    expect(renderSpendChip({ runs: 10, runsLimit: 50, planName: 'Free' })).not.toContain('warn');
    expect(renderSpendChip({ runs: 41, runsLimit: 50, planName: 'Free' })).toContain('warn');
    expect(renderSpendChip({ runs: 48, runsLimit: 50, planName: 'Free' })).toContain('crit');
  });
});

describe('formatBytes', () => {
  it('formats bytes, KB, MB, GB', () => {
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe('2.00 GB');
  });
});

describe('screenshotGroupKey', () => {
  it('slugifies route paths to match storage keys', () => {
    expect(screenshotGroupKey({ route: '/pricing', viewport: 1440, browser: 'chromium' })).toBe('pricing|1440|chromium');
    expect(screenshotGroupKey({ route: '/', viewport: 375, browser: 'firefox' })).toBe('root|375|firefox');
  });
});

// ---------------------------------------------------------------------------
// Routes: history + diff viewer + bulk approve + masks + attachments
// ---------------------------------------------------------------------------
describe('GET /dashboard/monitors/:id/history', () => {
  beforeEach(() => resetMemoryStore());

  it('renders the history page for the owner', async () => {
    const store = getMemoryStore();
    await store.createMonitor(makeMonitor({ id: 'h1', userId: 'alice' }));
    await store.addMonitorRun({
      id: 'mr1', monitorId: 'h1', userId: 'alice', status: 'passed',
      regressionsCount: 0, attempts: 1, createdAt: '2026-01-01T10:00:00Z',
    });
    const res = await app.request('/dashboard/monitors/h1/history', { headers: await sessionHeader('alice') });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('history');
    expect(html).toContain('flake-');
  });

  it('rejects access by another user with 404', async () => {
    const store = getMemoryStore();
    await store.createMonitor(makeMonitor({ id: 'h2', userId: 'alice' }));
    const res = await app.request('/dashboard/monitors/h2/history', { headers: await sessionHeader('mallory') });
    expect(res.status).toBe(404);
  });

  it('applies status + sort query params', async () => {
    const store = getMemoryStore();
    await store.createMonitor(makeMonitor({ id: 'h3', userId: 'alice' }));
    await store.addMonitorRun({ id: 'r1', monitorId: 'h3', userId: 'alice', status: 'passed',     regressionsCount: 0, attempts: 1, createdAt: '2026-01-02T10:00:00Z' });
    await store.addMonitorRun({ id: 'r2', monitorId: 'h3', userId: 'alice', status: 'regression', regressionsCount: 1, attempts: 1, createdAt: '2026-01-01T10:00:00Z' });
    const res = await app.request('/dashboard/monitors/h3/history?status=regression', { headers: await sessionHeader('alice') });
    const html = await res.text();
    expect(html).toContain('/dashboard/runs/r2');
    expect(html).not.toContain('/dashboard/runs/r1');
  });
});

describe('GET /dashboard/runs/:runId/diffs/:diffId', () => {
  beforeEach(() => {
    resetMemoryStore();
    resetMemoryScreenshotStore();
  });

  it('renders the diff viewer for the owner', async () => {
    const store = getMemoryStore();
    await store.createRun(makeRunForUser(), 'u1');
    const baseline: ScreenshotRecord = { id: 'b1', runId: 'r1', route: '/', viewport: 1440, browser: 'chromium', type: 'baseline', r2Key: 'k', createdAt: 'now' };
    const current: ScreenshotRecord = { id: 'c1', runId: 'r1', route: '/', viewport: 1440, browser: 'chromium', type: 'current', r2Key: 'k', createdAt: 'now' };
    const diff: ScreenshotRecord = { id: 'd1', runId: 'r1', route: '/', viewport: 1440, browser: 'chromium', type: 'diff', r2Key: 'k', createdAt: 'now' };
    for (const s of [baseline, current, diff]) await store.addScreenshot(s);
    const res = await app.request('/dashboard/runs/r1/diffs/d1', { headers: await sessionHeader('u1') });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Diff viewer');
    expect(html).toContain('/dashboard/screenshots/r1/b1/raw');
    expect(html).toContain('/dashboard/screenshots/r1/c1/raw');
  });

  it('returns 404 for a non-existent diff id', async () => {
    const store = getMemoryStore();
    await store.createRun(makeRunForUser(), 'u1');
    const res = await app.request('/dashboard/runs/r1/diffs/nope', { headers: await sessionHeader('u1') });
    expect(res.status).toBe(404);
  });

  it('rejects cross-user access with 404', async () => {
    const store = getMemoryStore();
    await store.createRun(makeRunForUser(), 'u1');
    await store.addScreenshot({ id: 'd1', runId: 'r1', route: '/', viewport: 1440, browser: 'chromium', type: 'diff', r2Key: 'k', createdAt: 'now' });
    const res = await app.request('/dashboard/runs/r1/diffs/d1', { headers: await sessionHeader('intruder') });
    expect(res.status).toBe(404);
  });
});

describe('POST /dashboard/runs/:runId/approve (bulk)', () => {
  beforeEach(() => resetMemoryStore());

  it('records accept decisions for the supplied diff_ids', async () => {
    const store = getMemoryStore();
    await store.createRun(makeRunForUser(), 'u1');
    await store.addScreenshot({ id: 'd1', runId: 'r1', route: '/', viewport: 1440, browser: 'chromium', type: 'diff', r2Key: 'k', createdAt: 'now' });
    await store.addScreenshot({ id: 'd2', runId: 'r1', route: '/about', viewport: 1440, browser: 'chromium', type: 'diff', r2Key: 'k', createdAt: 'now' });
    const body = new URLSearchParams();
    body.append('diff_ids', 'd1');
    body.append('diff_ids', 'd2');
    const res = await app.request('/dashboard/runs/r1/approve', {
      method: 'POST',
      headers: { ...(await sessionHeader('u1')), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    expect(res.status).toBe(302);
    const decisions = await store.listScreenshotDecisions('r1');
    expect(decisions.map((d) => d.screenshotId).sort()).toEqual(['d1', 'd2']);
    expect((await store.getRun('r1'))!.baselinesApproved).toBe(true);
  });

  it('accepts JSON body and returns JSON', async () => {
    const store = getMemoryStore();
    await store.createRun(makeRunForUser(), 'u1');
    await store.addScreenshot({ id: 'd1', runId: 'r1', route: '/', viewport: 1440, browser: 'chromium', type: 'diff', r2Key: 'k', createdAt: 'now' });
    const res = await app.request('/dashboard/runs/r1/approve', {
      method: 'POST',
      headers: { ...(await sessionHeader('u1')), 'Content-Type': 'application/json' },
      body: JSON.stringify({ diff_ids: ['d1', 'unknown-id'] }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { accepted: number; ids: string[] };
    expect(body.accepted).toBe(1);
    expect(body.ids).toEqual(['d1']);
  });

  it('rejects cross-user access', async () => {
    const store = getMemoryStore();
    await store.createRun(makeRunForUser(), 'u1');
    const res = await app.request('/dashboard/runs/r1/approve', {
      method: 'POST',
      headers: { ...(await sessionHeader('intruder')), 'Content-Type': 'application/json' },
      body: JSON.stringify({ diff_ids: ['d1'] }),
    });
    expect(res.status).toBe(404);
  });
});

describe('POST /dashboard/masks + GET /dashboard/settings/masks', () => {
  beforeEach(() => resetMemoryStore());

  it('creates and lists masks for the owner', async () => {
    const session = await sessionHeader('alice');
    const create = await app.request('/dashboard/masks', {
      method: 'POST',
      headers: { ...session, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        route: '/pricing', viewport: '1440', x: '10', y: '20', width: '100', height: '50',
        label: 'live clock',
      }).toString(),
    });
    expect(create.status).toBe(200);
    const created = (await create.json()) as { mask: IgnoreMask };
    expect(created.mask.label).toBe('live clock');

    const list = await app.request('/dashboard/settings/masks', { headers: session });
    expect(list.status).toBe(200);
    const html = await list.text();
    expect(html).toContain('live clock');
    expect(html).toContain('/pricing');

    const del = await app.request(`/dashboard/settings/masks/${created.mask.id}/delete`, {
      method: 'POST',
      headers: session,
    });
    expect(del.status).toBe(302);
    expect(await getMemoryStore().listMasks('alice')).toHaveLength(0);
  });

  it('rejects unauthenticated mask creation', async () => {
    const res = await app.request('/dashboard/masks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ route: '/', viewport: '1440', x: '0', y: '0', width: '10', height: '10' }).toString(),
    });
    expect(res.status).toBe(401);
  });
});

describe('attachments upload + download', () => {
  beforeEach(() => {
    resetMemoryStore();
    resetMemoryScreenshotStore();
  });

  it('round-trips an attachment for the owner', async () => {
    const store = getMemoryStore();
    await store.createRun(makeRunForUser(), 'u1');
    const session = await sessionHeader('u1');

    const form = new FormData();
    form.set('kind', 'trace');
    form.set('name', 'trace.zip');
    form.set('file', new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: 'application/zip' }), 'trace.zip');
    const up = await app.request('/dashboard/runs/r1/attachments', {
      method: 'POST', headers: session, body: form,
    });
    expect(up.status).toBe(200);
    const created = (await up.json()) as { attachment: RunAttachment };
    expect(created.attachment.kind).toBe('trace');
    expect(created.attachment.sizeBytes).toBe(5);

    // R2 actually got the bytes.
    expect(getMemoryScreenshotStore().size()).toBe(1);

    // Index page lists it.
    const list = await app.request('/dashboard/runs/r1/attachments', { headers: session });
    const html = await list.text();
    expect(html).toContain('trace.zip');

    // Download streams the same bytes back.
    const dl = await app.request(`/dashboard/runs/r1/attachments/${created.attachment.id}/download`, { headers: session });
    expect(dl.status).toBe(200);
    expect(dl.headers.get('Content-Type')).toContain('zip');
    expect(new Uint8Array(await dl.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
  });

  it('rejects download by a non-owner', async () => {
    const store = getMemoryStore();
    await store.createRun(makeRunForUser(), 'u1');
    const session = await sessionHeader('u1');
    const form = new FormData();
    form.set('kind', 'console-log');
    form.set('name', 'c.log');
    form.set('file', new Blob([new Uint8Array([7, 7, 7])], { type: 'text/plain' }), 'c.log');
    const up = await app.request('/dashboard/runs/r1/attachments', { method: 'POST', headers: session, body: form });
    const created = (await up.json()) as { attachment: RunAttachment };

    const dl = await app.request(`/dashboard/runs/r1/attachments/${created.attachment.id}/download`, {
      headers: await sessionHeader('intruder'),
    });
    expect(dl.status).toBe(404);
  });
});

describe('per-diff accept/reject decision routes', () => {
  beforeEach(() => resetMemoryStore());

  it('records a single accept', async () => {
    const store = getMemoryStore();
    await store.createRun(makeRunForUser(), 'u1');
    await store.addScreenshot({ id: 'd1', runId: 'r1', route: '/', viewport: 1440, browser: 'chromium', type: 'diff', r2Key: 'k', createdAt: 'now' });
    const res = await app.request('/dashboard/runs/r1/diffs/d1/accept', {
      method: 'POST', headers: await sessionHeader('u1'),
    });
    expect(res.status).toBe(200);
    const decisions = await store.listScreenshotDecisions('r1');
    expect(decisions).toHaveLength(1);
    expect(decisions[0].decision).toBe('accepted');
  });

  it('records a single reject', async () => {
    const store = getMemoryStore();
    await store.createRun(makeRunForUser(), 'u1');
    await store.addScreenshot({ id: 'd1', runId: 'r1', route: '/', viewport: 1440, browser: 'chromium', type: 'diff', r2Key: 'k', createdAt: 'now' });
    const res = await app.request('/dashboard/runs/r1/diffs/d1/reject', {
      method: 'POST', headers: await sessionHeader('u1'),
    });
    expect(res.status).toBe(200);
    const decisions = await store.listScreenshotDecisions('r1');
    expect(decisions[0].decision).toBe('rejected');
  });
});
