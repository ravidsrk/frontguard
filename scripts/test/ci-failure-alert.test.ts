import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  MARKER_DRILL,
  MARKER_RED,
  applyAlert,
  decideAlert,
  parseGhJson,
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
    expect(result).toEqual({ did: 'commented', number: 9 });
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
    expect(closed.did).toBe('closed');

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
    expect(workflow).not.toContain('pull_request_target');
  });
});
