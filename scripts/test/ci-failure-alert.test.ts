import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  MARKER_DRILL,
  MARKER_RED,
  applyAlert,
  decideAlert,
  gateAgainstTip,
  parseGhJson,
  reconcileWithTip,
  selectTipRun,
} from '../ci-failure-alert.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workflow = readFileSync(
  path.join(repoRoot, '.github/workflows/ci-failure-alert.yml'),
  'utf8',
);

describe('parseGhJson', () => {
  it('parses gh output when FORCE_COLOR wraps the JSON in ANSI', () => {
    const colored = '\u001b[1;37m[\u001b[m\u001b[1;37m]\u001b[m\n';
    expect(parseGhJson(colored)).toEqual([]);
  });
});

describe('decideAlert', () => {
  it('opens a durable issue when CI fails on a push to main', () => {
    const decision = decideAlert({
      eventName: 'workflow_run',
      conclusion: 'failure',
      headBranch: 'main',
      triggerEvent: 'push',
      sha: 'abc123',
      runUrl: 'https://example.test/run/1',
    });
    expect(decision.action).toBe('open-or-comment');
    expect(decision.title).toBe('main CI is red');
    expect(decision.label).toBe('ci-red');
    expect(decision.closeAfter).toBe(false);
    expect(decision.body).toContain('`abc123`');
    expect(decision.body).toContain('https://example.test/run/1');
    expect(decision.body).toContain(MARKER_RED);
    expect(decision.body).toContain('docs/incident.md');
  });

  it('resolves the issue when a later push to main is green', () => {
    const decision = decideAlert({
      eventName: 'workflow_run',
      conclusion: 'success',
      headBranch: 'main',
      triggerEvent: 'push',
      sha: 'def456',
    });
    expect(decision.action).toBe('resolve');
    expect(decision.marker).toBe(MARKER_RED);
    expect(decision.body).toContain('def456');
  });

  it('ignores pull requests, other branches, and cancelled runs', () => {
    expect(
      decideAlert({
        eventName: 'workflow_run',
        conclusion: 'failure',
        headBranch: 'feat/x',
        triggerEvent: 'pull_request',
      }).action,
    ).toBe('skip');
    expect(
      decideAlert({
        eventName: 'workflow_run',
        conclusion: 'cancelled',
        headBranch: 'main',
        triggerEvent: 'push',
      }).action,
    ).toBe('skip');
    expect(
      decideAlert({
        eventName: 'workflow_run',
        conclusion: 'failure',
        headBranch: 'main',
        triggerEvent: 'pull_request',
      }).action,
    ).toBe('skip');
  });

  it('treats a dispatch drill as a separate issue that closes', () => {
    const decision = decideAlert({ drill: 'true', eventName: 'workflow_dispatch' });
    expect(decision.action).toBe('open-or-comment');
    expect(decision.title).toBe('DRILL: CI failure alert');
    expect(decision.label).toBe('ci-red-drill');
    expect(decision.marker).toBe(MARKER_DRILL);
    expect(decision.closeAfter).toBe(true);
    expect(decision.body).not.toContain(MARKER_RED);
  });
});

describe('applyAlert', () => {
  it('comments on the open red issue instead of opening a second one', async () => {
    const calls: string[] = [];
    const result = await applyAlert(
      decideAlert({
        eventName: 'workflow_run',
        conclusion: 'failure',
        headBranch: 'main',
        triggerEvent: 'push',
        sha: 'abc',
      }),
      {
        ensureLabel() {
          calls.push('label');
        },
        listOpen() {
          return { number: 9 };
        },
        open() {
          calls.push('open');
          return { number: 1 };
        },
        comment(number) {
          calls.push(`comment:${number}`);
        },
        close(number) {
          calls.push(`close:${number}`);
        },
      },
    );
    expect(result).toEqual({ did: 'commented', number: 9, closedDuplicates: [] });
    expect(calls).toEqual(['label', 'comment:9']);
  });

  it('opens, then closes, a drill issue', async () => {
    const calls: string[] = [];
    const result = await applyAlert(decideAlert({ drill: true }), {
      ensureLabel(name) {
        calls.push(`label:${name}`);
      },
      listOpen() {
        return null;
      },
      open() {
        calls.push('open');
        return { number: 4, url: 'https://example.test/issues/4' };
      },
      comment() {
        calls.push('comment');
      },
      close(number) {
        calls.push(`close:${number}`);
      },
    });
    expect(result.did).toBe('opened-and-closed');
    expect(calls).toEqual(['label:ci-red-drill', 'open', 'close:4']);
  });

  it('closes the red issue on recovery and does nothing when none is open', async () => {
    const closed = await applyAlert(
      decideAlert({
        eventName: 'workflow_run',
        conclusion: 'success',
        headBranch: 'main',
        triggerEvent: 'push',
      }),
      {
        ensureLabel() {},
        listOpen() {
          return { number: 3 };
        },
        open() {
          return { number: 1 };
        },
        comment(number: number) {
          expect(number).toBe(3);
        },
        close(number: number) {
          expect(number).toBe(3);
        },
      },
    );
    expect(closed).toEqual({ did: 'closed', numbers: [3] });

    const none = await applyAlert(
      decideAlert({
        eventName: 'workflow_run',
        conclusion: 'success',
        headBranch: 'main',
        triggerEvent: 'push',
      }),
      {
        ensureLabel() {},
        listOpen() {
          return null;
        },
        open() {
          return { number: 1 };
        },
        comment() {
          throw new Error('no comment');
        },
        close() {
          throw new Error('no close');
        },
      },
    );
    expect(none).toEqual({ did: 'none' });
  });

  it('closes every open red issue on recovery, including a duplicate', async () => {
    const closed: number[] = [];
    const result = await applyAlert(
      decideAlert({
        eventName: 'workflow_run',
        conclusion: 'success',
        headBranch: 'main',
        triggerEvent: 'push',
        sha: 'tip',
      }),
      {
        ensureLabel() {},
        listOpen() {
          return [{ number: 4 }, { number: 9 }];
        },
        open() {
          return { number: 1 };
        },
        comment() {},
        close(number: number) {
          closed.push(number);
        },
      },
    );
    expect(result).toEqual({ did: 'closed', numbers: [4, 9] });
    expect(closed).toEqual([4, 9]);
  });

  it('closes the duplicate when two overlapping failures both create an issue', async () => {
    let calls = 0;
    const closed: number[] = [];
    const result = await applyAlert(
      decideAlert({
        eventName: 'workflow_run',
        conclusion: 'failure',
        headBranch: 'main',
        triggerEvent: 'push',
        sha: 'tip',
      }),
      {
        ensureLabel() {},
        listOpen() {
          calls += 1;
          if (calls === 1) return [];
          return [
            { number: 4 },
            { number: 8 },
          ];
        },
        open() {
          return { number: 8, url: 'https://example.test/issues/8' };
        },
        comment() {},
        close(number: number) {
          closed.push(number);
        },
      },
    );
    expect(result.did).toBe('opened-deduped');
    expect(result.number).toBe(4);
    expect(closed).toEqual([8]);
  });
});

describe('gateAgainstTip', () => {
  const failure = decideAlert({
    eventName: 'workflow_run',
    conclusion: 'failure',
    headBranch: 'main',
    triggerEvent: 'push',
    sha: 'older',
  });
  const success = decideAlert({
    eventName: 'workflow_run',
    conclusion: 'success',
    headBranch: 'main',
    triggerEvent: 'push',
    sha: 'older',
  });

  it('ignores an older success and an older failure once main has moved', () => {
    expect(gateAgainstTip(success, { sha: 'older', tip: 'newer' }).action).toBe('skip');
    expect(gateAgainstTip(failure, { sha: 'older', tip: 'newer' }).action).toBe('skip');
  });

  it('keeps a run that is still the tip, and does not gate a drill', () => {
    const current = decideAlert({
      eventName: 'workflow_run',
      conclusion: 'success',
      headBranch: 'main',
      triggerEvent: 'push',
      sha: 'newer',
    });
    expect(gateAgainstTip(current, { sha: 'newer', tip: 'newer' }).action).toBe('resolve');
    const drill = decideAlert({ drill: true });
    expect(gateAgainstTip(drill, { sha: '', tip: '', drill: true }).action).toBe('open-or-comment');
  });

  it('fails closed when the tip is missing', () => {
    expect(gateAgainstTip(success, { sha: 'older', tip: '' }).action).toBe('skip');
  });
});

describe('selectTipRun', () => {
  it('uses the newest completed push and ignores the rest', () => {
    const chosen = selectTipRun(
      [
        {
          headSha: 'tip',
          status: 'completed',
          event: 'pull_request',
          conclusion: 'failure',
          createdAt: '2026-10-19T12:00:00Z',
          databaseId: 9,
        },
        {
          headSha: 'tip',
          status: 'in_progress',
          event: 'push',
          conclusion: '',
          createdAt: '2026-10-19T12:05:00Z',
          databaseId: 8,
        },
        {
          headSha: 'tip',
          status: 'completed',
          event: 'push',
          conclusion: 'failure',
          createdAt: '2026-10-19T11:00:00Z',
          databaseId: 3,
        },
        {
          headSha: 'tip',
          status: 'completed',
          event: 'push',
          conclusion: 'success',
          createdAt: '2026-10-19T11:30:00Z',
          databaseId: 4,
        },
        {
          headSha: 'other',
          status: 'completed',
          event: 'push',
          conclusion: 'failure',
          createdAt: '2026-10-19T13:00:00Z',
          databaseId: 10,
        },
      ],
      'tip',
    );
    expect(chosen && chosen.databaseId).toBe(4);
  });
});

describe('reconcileWithTip', () => {
  const staleSuccess = {
    eventName: 'workflow_run',
    conclusion: 'success',
    headBranch: 'main',
    triggerEvent: 'push',
    sha: 'older',
    tip: 'tip',
    runUrl: 'https://example.test/older',
  };

  it('opens when a replaced run was green but the tip CI failed', () => {
    const decision = reconcileWithTip(staleSuccess, {
      headSha: 'tip',
      conclusion: 'failure',
      url: 'https://example.test/tip',
    });
    expect(decision.action).toBe('open-or-comment');
    expect(decision.body).toContain('`tip`');
    expect(decision.body).toContain('https://example.test/tip');
  });

  it('closes when a replaced run failed but the tip CI is green', () => {
    const decision = reconcileWithTip(
      { ...staleSuccess, conclusion: 'failure', sha: 'older' },
      { headSha: 'tip', conclusion: 'success', url: 'https://example.test/tip' },
    );
    expect(decision.action).toBe('resolve');
  });

  it('keeps the triggering verdict when that run is the tip and no lookup hit', () => {
    const decision = reconcileWithTip(
      { ...staleSuccess, sha: 'tip', tip: 'tip', conclusion: 'failure' },
      null,
    );
    expect(decision.action).toBe('open-or-comment');
  });

  it('skips an older triggering run when the tip has no completed push CI', () => {
    expect(reconcileWithTip(staleSuccess, null).action).toBe('skip');
  });

  it('does not let a red tip change a drill', () => {
    const decision = reconcileWithTip(
      { drill: true, sha: '', tip: '' },
      { headSha: 'tip', conclusion: 'failure', url: 'https://example.test/tip' },
    );
    expect(decision.action).toBe('open-or-comment');
    expect(decision.label).toBe('ci-red-drill');
  });
});

describe('CI failure alert workflow', () => {
  it('listens to the CI workflow and can be dispatched as a drill', () => {
    expect(workflow).toContain('workflows: ["CI"]');
    expect(workflow).toContain('types: [completed]');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('issues: write');
    expect(workflow).toContain('contents: read');
    expect(workflow).toContain('scripts/ci-failure-alert.mjs');
    expect(workflow).toContain('github.event.repository.default_branch');
    expect(workflow).toContain('branches: [main]');
    expect(workflow).toContain('actions: read');
    expect(workflow).toContain('ci-failure-alert-drill');
    expect(workflow).toContain('cancel-in-progress: false');
    expect(workflow).toContain('MAIN_TIP:');
    expect(workflow).not.toContain('pull_request_target');
  });
});
