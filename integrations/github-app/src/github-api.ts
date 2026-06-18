/**
 * GitHub App authentication + API helpers (Task 7.2).
 *
 * - Mints a short-lived app JWT (RS256) from the app id + private key.
 * - Exchanges it for an installation access token.
 * - Creates/updates Check Runs.
 * - Detects/reads per-repo Frontguard config and opens config-bootstrap PRs
 *   (branch + commit + PR) for repos that don't have one yet.
 *
 * JWT signing uses Web Crypto (`RSASSA-PKCS1-v1_5` + SHA-256), so this runs on
 * both Workers and Node 18+.
 *
 * @module github-api
 */

/** base64url-encodes a string or bytes (no padding). */
export function base64url(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Imports a PKCS#8 PEM private key for RS256 signing.
 */
export async function importPrivateKey(pem: string, subtle: SubtleCrypto = crypto.subtle): Promise<CryptoKey> {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return subtle.importKey(
    'pkcs8',
    der.buffer as ArrayBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

/**
 * Mints a GitHub App JWT valid for ~10 minutes.
 *
 * @param appId - The GitHub App's numeric id.
 * @param privateKeyPem - The app's PEM private key.
 * @param now - Current time (injectable for tests).
 */
export async function createAppJwt(
  appId: string,
  privateKeyPem: string,
  now: Date = new Date(),
  subtle: SubtleCrypto = crypto.subtle,
): Promise<string> {
  const iat = Math.floor(now.getTime() / 1000) - 60;
  const exp = iat + 600;
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({ iat, exp, iss: appId }));
  const signingInput = `${header}.${payload}`;
  const key = await importPrivateKey(privateKeyPem, subtle);
  const sig = await subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64url(new Uint8Array(sig))}`;
}

/**
 * Exchanges an app JWT for an installation access token.
 */
export async function getInstallationToken(
  jwt: string,
  installationId: number,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const res = await fetchImpl(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'frontguard-github-app',
      },
    },
  );
  if (!res.ok) throw new Error(`Failed to get installation token: ${res.status}`);
  const data = (await res.json()) as { token: string };
  return data.token;
}

/** Standard headers for an authenticated installation request. */
function ghHeaders(token: string, json = false): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'frontguard-github-app',
  };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

/**
 * Creates a Check Run on a commit via the Checks API.
 */
export async function createCheckRun(
  token: string,
  owner: string,
  repo: string,
  payload: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<{ id: number }> {
  const res = await fetchImpl(`https://api.github.com/repos/${owner}/${repo}/check-runs`, {
    method: 'POST',
    headers: ghHeaders(token, true),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to create check run: ${res.status}`);
  return (await res.json()) as { id: number };
}

/**
 * Updates (completes) an existing Check Run via the Checks API.
 *
 * @param checkRunId - Id returned by {@link createCheckRun}.
 * @param payload - A Checks API payload, e.g. from `buildCheckRunPayload`.
 */
export async function updateCheckRun(
  token: string,
  owner: string,
  repo: string,
  checkRunId: number,
  payload: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<{ id: number }> {
  const res = await fetchImpl(
    `https://api.github.com/repos/${owner}/${repo}/check-runs/${checkRunId}`,
    {
      method: 'PATCH',
      headers: ghHeaders(token, true),
      body: JSON.stringify(payload),
    },
  );
  if (!res.ok) throw new Error(`Failed to update check run: ${res.status}`);
  return (await res.json()) as { id: number };
}

/** A repository accessible to an installation. */
export interface InstallationRepo {
  name: string;
  owner: string;
  full_name: string;
  default_branch: string;
}

/**
 * Lists the repositories accessible to the current installation token.
 * Follows GitHub's `GET /installation/repositories` (paginated; first page only
 * by default which is fine for the bootstrap flow on fresh installs).
 */
export async function getInstallationRepos(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<InstallationRepo[]> {
  const res = await fetchImpl('https://api.github.com/installation/repositories?per_page=100', {
    headers: ghHeaders(token),
  });
  if (!res.ok) throw new Error(`Failed to list installation repos: ${res.status}`);
  const data = (await res.json()) as {
    repositories: Array<{ name: string; owner: { login: string }; full_name: string; default_branch: string }>;
  };
  return data.repositories.map((r) => ({
    name: r.name,
    owner: r.owner.login,
    full_name: r.full_name,
    default_branch: r.default_branch,
  }));
}

/** Contents of a file in a repo (decoded). */
export interface FileContents {
  path: string;
  sha: string;
  content: string;
}

/**
 * Fetches a file's contents via the Contents API.
 *
 * Returns `null` when the file does not exist (HTTP 404) — used for config
 * detection — and throws on other non-2xx responses.
 *
 * @param ref - Optional git ref (branch/tag/SHA).
 */
export async function getFileContents(
  token: string,
  owner: string,
  repo: string,
  path: string,
  ref?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<FileContents | null> {
  const query = ref ? `?ref=${encodeURIComponent(ref)}` : '';
  const res = await fetchImpl(
    `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}${query}`,
    { headers: ghHeaders(token) },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to get file contents (${path}): ${res.status}`);
  const data = (await res.json()) as { sha: string; content?: string; encoding?: string };
  const content =
    data.encoding === 'base64' && data.content
      ? new TextDecoder().decode(Uint8Array.from(atob(data.content.replace(/\n/g, '')), (c) => c.charCodeAt(0)))
      : (data.content ?? '');
  return { path, sha: data.sha, content };
}

/**
 * Resolves the head commit SHA of a branch via the git refs API.
 */
export async function getBranchSha(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const res = await fetchImpl(
    `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`,
    { headers: ghHeaders(token) },
  );
  if (!res.ok) throw new Error(`Failed to resolve branch ${branch}: ${res.status}`);
  const data = (await res.json()) as { object: { sha: string } };
  return data.object.sha;
}

/**
 * Creates a new branch (`refs/heads/<branch>`) pointing at `fromSha`.
 */
export async function createBranch(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  fromSha: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const res = await fetchImpl(`https://api.github.com/repos/${owner}/${repo}/git/refs`, {
    method: 'POST',
    headers: ghHeaders(token, true),
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: fromSha }),
  });
  if (!res.ok) throw new Error(`Failed to create branch ${branch}: ${res.status}`);
}

/**
 * Creates or updates a file on a branch via the Contents API.
 * Pass `sha` to update an existing file; omit it to create a new one.
 */
export async function createOrUpdateFile(
  token: string,
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  branch: string,
  sha: string | undefined = undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  // Contents API expects standard base64 (with padding), not base64url.
  const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(content)));
  const body: Record<string, unknown> = { message, content: encoded, branch };
  if (sha) body.sha = sha;
  const res = await fetchImpl(
    `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`,
    {
      method: 'PUT',
      headers: ghHeaders(token, true),
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) throw new Error(`Failed to write file ${path}: ${res.status}`);
}

/**
 * Opens a pull request.
 */
export async function createPullRequest(
  token: string,
  owner: string,
  repo: string,
  params: { title: string; head: string; base: string; body?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ number: number; html_url: string }> {
  const res = await fetchImpl(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    headers: ghHeaders(token, true),
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`Failed to open PR on ${owner}/${repo}: ${res.status}`);
  return (await res.json()) as { number: number; html_url: string };
}

/** A frontguard config discovered in a repo. */
export interface RepoConfig {
  path: string;
  format: 'ts' | 'yml';
  content: string;
}

/** Candidate config locations, in priority order. */
export const CONFIG_PATHS: ReadonlyArray<{ path: string; format: 'ts' | 'yml' }> = [
  { path: 'frontguard.config.ts', format: 'ts' },
  { path: '.github/frontguard.yml', format: 'yml' },
];

/**
 * Reads a repo's Frontguard configuration (per-repo overrides).
 *
 * Looks for `frontguard.config.ts` then `.github/frontguard.yml`. Returns the
 * first one found, or `null` when none exist.
 */
export async function getRepoConfig(
  token: string,
  owner: string,
  repo: string,
  ref?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RepoConfig | null> {
  for (const candidate of CONFIG_PATHS) {
    const file = await getFileContents(token, owner, repo, candidate.path, ref, fetchImpl);
    if (file) return { path: candidate.path, format: candidate.format, content: file.content };
  }
  return null;
}

/** Default `frontguard.config.ts` planted by the bootstrap PR. */
export const DEFAULT_CONFIG_TS = `import { defineConfig } from '@frontguard/cli';

/**
 * Frontguard configuration.
 * Docs: https://frontguard.dev/docs/config
 */
export default defineConfig({
  // Base URL of the deployed preview that Frontguard will visit.
  // The GitHub App rewrites this at run time using the PR's preview deployment
  // (Vercel, Netlify, Cloudflare Pages …); keep it as a sensible local default.
  baseUrl: 'http://localhost:3000',
  // Routes / paths to capture for visual regression.
  routes: ['/'],
  // Viewport widths (px) to capture at. Height is determined by page content.
  viewports: [375, 768, 1440],
  // Fail the check when the pixel-diff fraction exceeds this value (0-1).
  threshold: 0.01,
});
`;

/**
 * Major version of the published GitHub Action that the bootstrap workflow
 * pins to. Using a tagged ref (e.g. `@v0`) instead of `@main` means new repos
 * don't break when the action's main branch changes (P1-11). The ref resolves
 * against the repo-root `action.yml` shim; OPS keeps the `v0` lightweight tag
 * moving forward on each minor release. Bump this when we cut a `v1` of the
 * action.
 */
export const ACTION_REF = 'ravidsrk/frontguard@v0';

/**
 * Default `.github/workflows/frontguard.yml` planted alongside the config.
 *
 * Pins to the tagged action ref rather than `@main` so a green install today
 * stays green next week. The workflow auto-detects Vercel and Netlify preview
 * URLs via the composite action; users can still drive runs through the
 * hosted GitHub App + Cloud API path, in which case this file is harmless and
 * can be deleted.
 */
export const DEFAULT_WORKFLOW_YML = `# Frontguard visual regression workflow.
# Pinned to a tagged release of the action so this file keeps working as the
# action evolves. Bump to a new major (e.g. \`@v1\`) when prompted.
name: Frontguard
on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
jobs:
  visual-regression:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Frontguard
        uses: ${ACTION_REF}
        with:
          # The action auto-detects Vercel and Netlify preview URLs;
          # set \`url\` explicitly if your platform isn't auto-detected.
          config: ./frontguard.config.ts
`;

/**
 * Bootstraps a default `frontguard.config.ts` (and matching workflow) via a
 * pull request when the repo has no Frontguard config yet.
 *
 * Returns the opened PR, or `null` when a config already exists (skipped).
 */
export async function bootstrapConfigPr(
  token: string,
  repo: { owner: string; name: string; default_branch: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ number: number; html_url: string } | null> {
  // Skip if any known config already exists on the default branch.
  const existing = await getRepoConfig(token, repo.owner, repo.name, repo.default_branch, fetchImpl);
  if (existing) return null;

  const branch = 'frontguard/bootstrap-config';
  const baseSha = await getBranchSha(token, repo.owner, repo.name, repo.default_branch, fetchImpl);
  await createBranch(token, repo.owner, repo.name, branch, baseSha, fetchImpl);
  await createOrUpdateFile(
    token,
    repo.owner,
    repo.name,
    'frontguard.config.ts',
    DEFAULT_CONFIG_TS,
    'chore: add Frontguard config',
    branch,
    undefined,
    fetchImpl,
  );
  // The workflow file is best-effort: if a repo already pins a different
  // CI tool or restricts workflow writes, we still want the config PR to
  // succeed. Per-file failures are swallowed.
  try {
    await createOrUpdateFile(
      token,
      repo.owner,
      repo.name,
      '.github/workflows/frontguard.yml',
      DEFAULT_WORKFLOW_YML,
      'chore: add Frontguard workflow',
      branch,
      undefined,
      fetchImpl,
    );
  } catch (err) {
    console.warn(
      `[github-app] Could not plant workflow file in ${repo.owner}/${repo.name}: ` +
        (err instanceof Error ? err.message : String(err)),
    );
  }
  return createPullRequest(
    token,
    repo.owner,
    repo.name,
    {
      title: 'Add Frontguard config',
      head: branch,
      base: repo.default_branch,
      body:
        'This PR adds a default `frontguard.config.ts` and a matching workflow so ' +
        'Frontguard can run visual regression checks on your pull requests.\n\n' +
        'The workflow pins to a tagged release of the action ' +
        `(\`${ACTION_REF}\`) so it stays stable as the action evolves.\n\n` +
        'Tweak the `routes`, `viewports`, and `threshold` to fit your app, then merge. ✅',
    },
    fetchImpl,
  );
}
