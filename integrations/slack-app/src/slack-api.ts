/**
 * Slack Web API helpers — posting visual-regression results into a channel.
 *
 * @module slack-api
 */

const SLACK_API_TIMEOUT_MS = 10_000;
const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f]+/g;

/** Summary of a Frontguard run, for rendering into Slack. */
export interface RunSummary {
  url: string;
  total: number;
  regressions: number;
  warnings: number;
  reportUrl?: string;
}

/**
 * Escapes all Slack `mrkdwn` special characters (`&`, `<`, `>`, `*`, `_`, `~`,
 * `` ` ``) and strips control characters so untrusted URLs or error strings
 * cannot inject formatting, links, or `<!channel>`/`<!here>`/`<!everyone>`
 * mentions into public Slack messages.
 */
export function escapeSlackMrkdwn(input: string): string {
  return input
    .replace(CONTROL_CHARS_RE, ' ')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*/g, '&#42;')
    .replace(/_/g, '&#95;')
    .replace(/~/g, '&#126;')
    .replace(/`/g, '&#96;');
}

/**
 * Escapes content rendered inside a Slack inline code span (`` `...` ``).
 * Neutralizes backticks, Slack `<...>` mentions/links, `&` entities, and
 * control chars while preserving harmless identifier underscores (e.g. `run_1`).
 */
export function escapeSlackCodeSpan(input: string): string {
  return input
    .replace(CONTROL_CHARS_RE, ' ')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/`/g, '\'');
}

function isSafeHttpsButtonUrl(raw: string | undefined): raw is string {
  if (!raw || CONTROL_CHARS_RE.test(raw)) return false;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

/** Builds a Block Kit message for a run result. Exposed for testing. */
export function buildVisualResultBlocks(summary: RunSummary): unknown[] {
  const badge = summary.regressions > 0 ? '🔴' : summary.warnings > 0 ? '🟡' : '🟢';
  const headline =
    summary.regressions > 0
      ? `${summary.regressions} visual regression(s)`
      : summary.warnings > 0
        ? `${summary.warnings} visual change(s) to review`
        : 'No visual regressions';

  const safeUrl = escapeSlackMrkdwn(summary.url);

  const blocks: unknown[] = [
    { type: 'header', text: { type: 'plain_text', text: `${badge} Frontguard — ${headline}` } },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*URL:*\n${safeUrl}` },
        { type: 'mrkdwn', text: `*Tested:*\n${summary.total} page(s)` },
        { type: 'mrkdwn', text: `*Regressions:*\n${summary.regressions}` },
        { type: 'mrkdwn', text: `*Warnings:*\n${summary.warnings}` },
      ],
    },
  ];
  if (isSafeHttpsButtonUrl(summary.reportUrl)) {
    blocks.push({
      type: 'actions',
      elements: [
        { type: 'button', text: { type: 'plain_text', text: 'View report' }, url: summary.reportUrl },
      ],
    });
  }
  return blocks;
}

export interface PostResult {
  ok: boolean;
  error?: string;
}

/**
 * Posts a message to a channel via `chat.postMessage`. Never throws — returns a
 * result so a failed post can't break the caller.
 */
export async function postSlackMessage(
  token: string,
  channel: string,
  blocks: unknown[],
  fallbackText: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PostResult> {
  try {
    const res = await fetchImpl('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ channel, text: fallbackText, blocks }),
      signal: AbortSignal.timeout(SLACK_API_TIMEOUT_MS),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    return { ok: !!data.ok, error: data.ok ? undefined : (data.error ?? `HTTP ${res.status}`) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
