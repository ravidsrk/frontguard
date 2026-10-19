/**
 * Alert when CI fails on a push to main.
 *
 * Channel is one GitHub issue (assumption A-16). A green push to main closes
 * that issue. A workflow_dispatch drill opens a separate issue and closes it.
 *
 *   EVENT_NAME CONCLUSION HEAD_BRANCH TRIGGER_EVENT DRILL HEAD_SHA RUN_URL MAIN_TIP
 *   ALERT_DRY_RUN=1 prints the decision and does not call gh.
 *
 * A run updates the issue only when HEAD_SHA is the current main tip, so an
 * older green job cannot close an alert for a newer red push. When this run
 * replaced a pending one, it re-reads the completed push CI for that tip and
 * acts on that conclusion. Recovery closes every matching open issue, and a
 * create re-checks so two overlapping runs do not leave a duplicate open.
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
 * Ignore a completed CI run that is no longer the tip of main.
 * Drills are not gated. A missing tip fails closed instead of closing an alert.
 *
 * @param {ReturnType<typeof decideAlert>} decision
 * @param {{ sha?: string, tip?: string, drill?: boolean | string }} input
 */
/**
 * Newest completed push CI for the tip. In-progress, cancelled, and
 * pull-request runs are not a verdict.
 *
 * @param {Array<{headSha?: string, status?: string, event?: string, conclusion?: string, createdAt?: string, databaseId?: number}> | null | undefined} runs
 * @param {string} tip
 */
export function selectTipRun(runs, tip) {
  const completed = (Array.isArray(runs) ? runs : []).filter(
    (run) =>
      run &&
      run.headSha === tip &&
      run.status === 'completed' &&
      run.event === 'push' &&
      (run.conclusion === 'success' || run.conclusion === 'failure'),
  );
  completed.sort((a, b) => {
    const byTime = String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    if (byTime !== 0) return byTime;
    return (b.databaseId || 0) - (a.databaseId || 0);
  });
  return completed[0] || null;
}

/**
 * Decide from the tip's own CI when we know it. A run that only carries an
 * older conclusion must not skip a tip that is already red or green.
 *
 * @param {Parameters<typeof decideAlert>[0] & { tip?: string }} trigger
 * @param {ReturnType<typeof selectTipRun>} tipRun
 */
export function reconcileWithTip(trigger, tipRun) {
  if (flag(trigger.drill)) {
    return gateAgainstTip(decideAlert(trigger), trigger);
  }
  if (tipRun && tipRun.headSha) {
    const input = {
      eventName: 'workflow_run',
      conclusion: tipRun.conclusion,
      headBranch: 'main',
      triggerEvent: 'push',
      sha: tipRun.headSha,
      runUrl: tipRun.url || '',
      tip: tipRun.headSha,
      drill: false,
    };
    return gateAgainstTip(decideAlert(input), input);
  }
  return gateAgainstTip(decideAlert(trigger), trigger);
}

export function gateAgainstTip(decision, input) {
  if (decision.action === 'skip' || flag(input.drill) || decision.marker === MARKER_DRILL) {
    return decision;
  }
  const sha = input.sha || '';
  const tip = input.tip || '';
  if (!sha || !tip || sha === 'unknown') {
    return { action: 'skip', reason: 'missing sha or main tip' };
  }
  if (sha !== tip) {
    return { action: 'skip', reason: 'run is not the latest commit on main' };
  }
  return decision;
}

function asList(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * @param {ReturnType<typeof decideAlert>} decision
 * @param {{
 *   ensureLabel: (name: string) => Promise<void> | void,
 *   listOpen: (label: string, marker: string) => Promise<Array<{number: number}> | {number: number} | null> | Array<{number: number}> | {number: number} | null,
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
    const open = asList(await gh.listOpen(decision.label, decision.marker));
    if (open.length === 0) return { did: 'none' };
    for (const issue of open) {
      await gh.comment(issue.number, decision.body);
      await gh.close(issue.number);
    }
    return { did: 'closed', numbers: open.map((issue) => issue.number) };
  }

  const existing = asList(await gh.listOpen(decision.label, decision.marker)).sort(
    (a, b) => a.number - b.number,
  );
  if (existing.length > 0) {
    await gh.comment(existing[0].number, decision.body);
    for (const extra of existing.slice(1)) {
      await gh.comment(extra.number, `Duplicate of #${existing[0].number}. Closing.`);
      await gh.close(extra.number);
    }
    if (decision.closeAfter) await gh.close(existing[0].number);
    return {
      did: decision.closeAfter ? 'commented-and-closed' : 'commented',
      number: existing[0].number,
      closedDuplicates: existing.slice(1).map((issue) => issue.number),
    };
  }

  const created = await gh.open({
    title: decision.title,
    body: decision.body,
    label: decision.label,
  });
  if (decision.closeAfter) {
    await gh.close(created.number);
    return {
      did: 'opened-and-closed',
      number: created.number,
      url: created.url,
    };
  }

  const after = asList(await gh.listOpen(decision.label, decision.marker)).sort(
    (a, b) => a.number - b.number,
  );
  const canonical = after[0] || created;
  const closedDuplicates = [];
  for (const extra of after) {
    if (extra.number === canonical.number) continue;
    await gh.comment(extra.number, `Duplicate of #${canonical.number}. Closing.`);
    await gh.close(extra.number);
    closedDuplicates.push(extra.number);
  }
  return {
    did: closedDuplicates.length > 0 ? 'opened-deduped' : 'opened',
    number: canonical.number,
    url: created.url,
    closedDuplicates,
  };
}

export function parseGhJson(text) {
  const clean = String(text).replace(/\u001b\[[0-9;]*m/g, '').trim();
  if (!clean) return [];
  return JSON.parse(clean);
}

export function createGhAdapter() {
  const run = (args) =>
    execFileSync('gh', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        FORCE_COLOR: '0',
        NO_COLOR: '1',
        CLICOLOR: '0',
        GH_FORCE_TTY: '0',
      },
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
      const issues = parseGhJson(
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
      return issues.filter((issue) => (issue.body || '').includes(marker));
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
    listCiRuns(tip) {
      if (!tip) return [];
      return parseGhJson(
        run([
          'run',
          'list',
          '--workflow',
          'ci.yml',
          '--branch',
          'main',
          '--commit',
          tip,
          '--limit',
          '20',
          '--json',
          'databaseId,conclusion,status,event,headSha,url,createdAt',
        ]) || '[]',
      );
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
    tip: process.env.MAIN_TIP || '',
  };
}

async function main() {
  const env = readEnv();
  const gh = createGhAdapter();
  let tipRun = null;
  if (env.eventName === 'workflow_run' && !flag(env.drill) && env.tip) {
    try {
      tipRun = selectTipRun(gh.listCiRuns(env.tip), env.tip);
    } catch (error) {
      console.error(
        `tip CI lookup failed: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
  const decision = reconcileWithTip(env, tipRun);
  if (process.env.ALERT_DRY_RUN === '1') {
    process.stdout.write(`${JSON.stringify(decision, null, 2)}\n`);
    return;
  }
  const result = await applyAlert(decision, gh);
  process.stdout.write(`${JSON.stringify({ decision, result }, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
