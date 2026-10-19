/**
 * Alert when CI fails on a push to main.
 *
 * Channel is one GitHub issue (assumption A-16). A green push to main closes
 * that issue. A workflow_dispatch drill opens a separate issue and closes it.
 *
 *   EVENT_NAME CONCLUSION HEAD_BRANCH TRIGGER_EVENT DRILL HEAD_SHA RUN_URL
 *   ALERT_DRY_RUN=1 prints the decision and does not call gh.
 */
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const MARKER_RED = '<!-- frontguard-alert:ci-red -->';
export const MARKER_DRILL = '<!-- frontguard-alert:ci-red-drill -->';

function flag(value) {
  return value === true || value === 'true';
}

/**
 * @param {{
 *   eventName?: string,
 *   conclusion?: string,
 *   headBranch?: string,
 *   triggerEvent?: string,
 *   drill?: boolean | string,
 *   sha?: string,
 *   runUrl?: string,
 * }} input
 */
export function decideAlert(input) {
  const sha = input.sha || 'unknown';
  const runUrl = input.runUrl || '';

  if (flag(input.drill)) {
    return {
      action: 'open-or-comment',
      marker: MARKER_DRILL,
      label: 'ci-red-drill',
      title: 'DRILL: CI failure alert',
      closeAfter: true,
      body: [
        'Drill only. This issue was opened to prove the alert path.',
        'CI on `main` was not failed.',
        '',
        'Operator notes: `docs/incident.md`.',
        '',
        MARKER_DRILL,
      ].join('\n'),
    };
  }

  const mainPush =
    input.eventName === 'workflow_run' &&
    input.headBranch === 'main' &&
    input.triggerEvent === 'push';

  if (mainPush && input.conclusion === 'failure') {
    return {
      action: 'open-or-comment',
      marker: MARKER_RED,
      label: 'ci-red',
      title: 'main CI is red',
      closeAfter: false,
      body: [
        '`main` CI failed.',
        '',
        `- SHA: \`${sha}\``,
        `- Run: ${runUrl || '(url unavailable)'}`,
        '',
        'Operator steps: `docs/incident.md`.',
        '',
        'This issue stays open until a later push to `main` is green.',
        '',
        MARKER_RED,
      ].join('\n'),
    };
  }

  if (mainPush && input.conclusion === 'success') {
    return {
      action: 'resolve',
      marker: MARKER_RED,
      label: 'ci-red',
      title: 'main CI is red',
      body: [
        `\`main\` CI is green again at \`${sha}\`.`,
        runUrl ? `Run: ${runUrl}` : '',
        '',
        MARKER_RED,
      ]
        .filter((line) => line !== '')
        .join('\n'),
    };
  }

  return {
    action: 'skip',
    reason: 'not a drill and not a push to main',
  };
}

/**
 * @param {ReturnType<typeof decideAlert>} decision
 * @param {{
 *   ensureLabel: (name: string) => Promise<void> | void,
 *   listOpen: (label: string, marker: string) => Promise<{number: number} | null> | {number: number} | null,
 *   open: (issue: {title: string, body: string, label: string}) => Promise<{number: number, url?: string}> | {number: number, url?: string},
 *   comment: (number: number, body: string) => Promise<void> | void,
 *   close: (number: number) => Promise<void> | void,
 * }} gh
 */
export async function applyAlert(decision, gh) {
  if (decision.action === 'skip') {
    return { did: 'skip', reason: decision.reason };
  }

  // `gh issue list --label` fails when the label does not exist yet.
  await gh.ensureLabel(decision.label);

  if (decision.action === 'resolve') {
    const open = await gh.listOpen(decision.label, decision.marker);
    if (!open) return { did: 'none' };
    await gh.comment(open.number, decision.body);
    await gh.close(open.number);
    return { did: 'closed', number: open.number };
  }

  const existing = await gh.listOpen(decision.label, decision.marker);
  if (existing) {
    await gh.comment(existing.number, decision.body);
    if (decision.closeAfter) await gh.close(existing.number);
    return {
      did: decision.closeAfter ? 'commented-and-closed' : 'commented',
      number: existing.number,
    };
  }

  const created = await gh.open({
    title: decision.title,
    body: decision.body,
    label: decision.label,
  });
  if (decision.closeAfter) await gh.close(created.number);
  return {
    did: decision.closeAfter ? 'opened-and-closed' : 'opened',
    number: created.number,
    url: created.url,
  };
}

export function createGhAdapter() {
  const run = (args) =>
    execFileSync('gh', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

  return {
    ensureLabel(name) {
      try {
        run([
          'label',
          'create',
          name,
          '--color',
          'B60205',
          '--description',
          'Frontguard CI alert',
        ]);
      } catch (error) {
        const stderr = error && typeof error === 'object' && 'stderr' in error ? String(error.stderr) : '';
        const message = error instanceof Error ? error.message : String(error);
        if (/already exists/i.test(`${stderr}\n${message}`)) return;
        throw error;
      }
    },
    listOpen(label, marker) {
      const issues = JSON.parse(
        run([
          'issue',
          'list',
          '--state',
          'open',
          '--label',
          label,
          '--limit',
          '20',
          '--json',
          'number,title,body',
        ]) || '[]',
      );
      return issues.find((issue) => (issue.body || '').includes(marker)) ?? null;
    },
    open({ title, body, label }) {
      const url = run([
        'issue',
        'create',
        '--title',
        title,
        '--body',
        body,
        '--label',
        label,
      ]).trim();
      const match = url.match(/\/issues\/(\d+)/);
      if (!match) throw new Error(`could not parse issue url from gh: ${url}`);
      return { number: Number(match[1]), url };
    },
    comment(number, body) {
      run(['issue', 'comment', String(number), '--body', body]);
    },
    close(number) {
      run(['issue', 'close', String(number), '--reason', 'completed']);
    },
  };
}

function readEnv() {
  return {
    eventName: process.env.EVENT_NAME || '',
    conclusion: process.env.CONCLUSION || '',
    headBranch: process.env.HEAD_BRANCH || '',
    triggerEvent: process.env.TRIGGER_EVENT || '',
    drill: process.env.DRILL || '',
    sha: process.env.HEAD_SHA || process.env.GITHUB_SHA || '',
    runUrl: process.env.RUN_URL || '',
  };
}

async function main() {
  const decision = decideAlert(readEnv());
  if (process.env.ALERT_DRY_RUN === '1') {
    process.stdout.write(`${JSON.stringify(decision, null, 2)}\n`);
    return;
  }
  const result = await applyAlert(decision, createGhAdapter());
  process.stdout.write(`${JSON.stringify({ decision, result }, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
