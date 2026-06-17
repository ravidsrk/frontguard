import { describe, it, expect } from 'vitest';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import {
  base64url,
  createAppJwt,
  getInstallationToken,
  createCheckRun,
  updateCheckRun,
  getInstallationRepos,
  getFileContents,
  getBranchSha,
  createBranch,
  createOrUpdateFile,
  createPullRequest,
  getRepoConfig,
  bootstrapConfigPr,
  DEFAULT_CONFIG_TS,
} from '../src/github-api.js';

/** Builds a fetch mock from an ordered list of route handlers. */
type Route = { match: (url: string, init?: RequestInit) => boolean; respond: (url: string, init?: RequestInit) => Response };
function mockFetch(routes: Route[], calls: Array<{ url: string; init?: RequestInit }> = []) {
  return (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const route = routes.find((r) => r.match(url, init));
    if (!route) throw new Error(`Unmatched fetch: ${(init?.method ?? 'GET')} ${url}`);
    return route.respond(url, init);
  }) as unknown as typeof fetch;
}

describe('base64url', () => {
  it('encodes without padding and url-safe', () => {
    expect(base64url('hello')).toBe('aGVsbG8');
    expect(base64url('>>>')).not.toContain('+');
    expect(base64url('???')).not.toContain('/');
  });
});

describe('createAppJwt', () => {
  it('mints a verifiable RS256 JWT', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;

    const now = new Date('2026-01-01T00:00:00Z');
    const jwt = await createAppJwt('12345', pem, now);
    const [header, payload, sig] = jwt.split('.');
    expect(header && payload && sig).toBeTruthy();

    // Decode payload claims.
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    expect(claims.iss).toBe('12345');
    expect(claims.exp - claims.iat).toBe(600);

    // Verify the RS256 signature with the public key.
    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${header}.${payload}`);
    verifier.end();
    const sigBytes = Buffer.from(sig, 'base64url');
    expect(verifier.verify(publicKey, sigBytes)).toBe(true);
  });
});

describe('getInstallationToken', () => {
  it('exchanges a JWT for an installation token', async () => {
    let captured: { url: string; auth: string } | null = null;
    const fakeFetch = (async (url: string, init: RequestInit) => {
      captured = { url, auth: (init.headers as Record<string, string>).Authorization };
      return new Response(JSON.stringify({ token: 'ghs_abc' }), { status: 201 });
    }) as unknown as typeof fetch;
    const token = await getInstallationToken('jwt123', 99, fakeFetch);
    expect(token).toBe('ghs_abc');
    expect(captured!.url).toContain('/app/installations/99/access_tokens');
    expect(captured!.auth).toBe('Bearer jwt123');
  });

  it('throws on failure', async () => {
    const fakeFetch = (async () => new Response('no', { status: 403 })) as unknown as typeof fetch;
    await expect(getInstallationToken('j', 1, fakeFetch)).rejects.toThrow(/403/);
  });
});

describe('createCheckRun', () => {
  it('POSTs the check-run payload', async () => {
    let captured: { url: string; body: unknown } | null = null;
    const fakeFetch = (async (url: string, init: RequestInit) => {
      captured = { url, body: JSON.parse(init.body as string) };
      return new Response(JSON.stringify({ id: 555 }), { status: 201 });
    }) as unknown as typeof fetch;
    const res = await createCheckRun('tok', 'acme', 'web', { name: 'X', head_sha: 'abc', status: 'in_progress' }, fakeFetch);
    expect(res.id).toBe(555);
    expect(captured!.url).toContain('/repos/acme/web/check-runs');
  });
});

describe('updateCheckRun', () => {
  it('PATCHes the check-run with a completed payload', async () => {
    let captured: { url: string; method?: string; body: Record<string, unknown> } | null = null;
    const fakeFetch = (async (url: string, init: RequestInit) => {
      captured = { url, method: init.method, body: JSON.parse(init.body as string) };
      return new Response(JSON.stringify({ id: 555 }), { status: 200 });
    }) as unknown as typeof fetch;
    const res = await updateCheckRun(
      'tok',
      'acme',
      'web',
      555,
      { status: 'completed', conclusion: 'success' },
      fakeFetch,
    );
    expect(res.id).toBe(555);
    expect(captured!.url).toContain('/repos/acme/web/check-runs/555');
    expect(captured!.method).toBe('PATCH');
    expect(captured!.body.conclusion).toBe('success');
  });

  it('throws on failure', async () => {
    const fakeFetch = (async () => new Response('no', { status: 422 })) as unknown as typeof fetch;
    await expect(
      updateCheckRun('t', 'o', 'r', 1, { status: 'completed' }, fakeFetch),
    ).rejects.toThrow(/422/);
  });
});

describe('getInstallationRepos', () => {
  it('maps the repositories payload', async () => {
    const fakeFetch = (async () =>
      new Response(
        JSON.stringify({
          repositories: [
            { name: 'web', owner: { login: 'acme' }, full_name: 'acme/web', default_branch: 'main' },
            { name: 'api', owner: { login: 'acme' }, full_name: 'acme/api', default_branch: 'trunk' },
          ],
        }),
        { status: 200 },
      )) as unknown as typeof fetch;
    const repos = await getInstallationRepos('tok', fakeFetch);
    expect(repos).toHaveLength(2);
    expect(repos[0]).toEqual({ name: 'web', owner: 'acme', full_name: 'acme/web', default_branch: 'main' });
    expect(repos[1].default_branch).toBe('trunk');
  });
});

describe('getFileContents', () => {
  it('returns null on 404 (missing file)', async () => {
    const fakeFetch = (async () => new Response('not found', { status: 404 })) as unknown as typeof fetch;
    const res = await getFileContents('tok', 'acme', 'web', 'frontguard.config.ts', undefined, fakeFetch);
    expect(res).toBeNull();
  });

  it('decodes base64 content when present', async () => {
    const original = 'export default {};\n';
    const b64 = Buffer.from(original).toString('base64');
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ sha: 'abc123', content: b64, encoding: 'base64' }), {
        status: 200,
      })) as unknown as typeof fetch;
    const res = await getFileContents('tok', 'acme', 'web', 'frontguard.config.ts', 'feature', fakeFetch);
    expect(res).not.toBeNull();
    expect(res!.sha).toBe('abc123');
    expect(res!.content).toBe(original);
  });
});

describe('getBranchSha / createBranch / createOrUpdateFile / createPullRequest', () => {
  it('resolves a branch head sha', async () => {
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ object: { sha: 'base-sha' } }), { status: 200 })) as unknown as typeof fetch;
    expect(await getBranchSha('t', 'acme', 'web', 'main', fakeFetch)).toBe('base-sha');
  });

  it('creates a branch ref', async () => {
    let body: Record<string, unknown> | null = null;
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      body = JSON.parse(init.body as string);
      return new Response('{}', { status: 201 });
    }) as unknown as typeof fetch;
    await createBranch('t', 'acme', 'web', 'frontguard/bootstrap-config', 'base-sha', fakeFetch);
    expect(body!.ref).toBe('refs/heads/frontguard/bootstrap-config');
    expect(body!.sha).toBe('base-sha');
  });

  it('PUTs base64 content for a new file', async () => {
    let body: Record<string, unknown> | null = null;
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      body = JSON.parse(init.body as string);
      return new Response('{}', { status: 201 });
    }) as unknown as typeof fetch;
    await createOrUpdateFile('t', 'acme', 'web', 'frontguard.config.ts', 'hi 🚀', 'msg', 'branch', undefined, fakeFetch);
    expect(Buffer.from(body!.content as string, 'base64').toString()).toBe('hi 🚀');
    expect(body!.sha).toBeUndefined();
  });

  it('opens a PR and returns its url', async () => {
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ number: 12, html_url: 'https://github.com/acme/web/pull/12' }), {
        status: 201,
      })) as unknown as typeof fetch;
    const pr = await createPullRequest('t', 'acme', 'web', { title: 'T', head: 'b', base: 'main' }, fakeFetch);
    expect(pr.number).toBe(12);
    expect(pr.html_url).toContain('/pull/12');
  });
});

describe('getRepoConfig', () => {
  it('returns the ts config when present', async () => {
    const b64 = Buffer.from('export default {}\n').toString('base64');
    const fakeFetch = (async (url: string) => {
      if (url.includes('frontguard.config.ts'))
        return new Response(JSON.stringify({ sha: 's', content: b64, encoding: 'base64' }), { status: 200 });
      return new Response('nope', { status: 404 });
    }) as unknown as typeof fetch;
    const cfg = await getRepoConfig('t', 'acme', 'web', 'main', fakeFetch);
    expect(cfg).not.toBeNull();
    expect(cfg!.format).toBe('ts');
    expect(cfg!.path).toBe('frontguard.config.ts');
  });

  it('falls back to .github/frontguard.yml', async () => {
    const b64 = Buffer.from('threshold: 0.02\n').toString('base64');
    const fakeFetch = (async (url: string) => {
      if (url.includes('frontguard.config.ts')) return new Response('nope', { status: 404 });
      if (url.includes('frontguard.yml'))
        return new Response(JSON.stringify({ sha: 's', content: b64, encoding: 'base64' }), { status: 200 });
      return new Response('nope', { status: 404 });
    }) as unknown as typeof fetch;
    const cfg = await getRepoConfig('t', 'acme', 'web', undefined, fakeFetch);
    expect(cfg!.format).toBe('yml');
    expect(cfg!.content).toContain('threshold');
  });

  it('returns null when no config exists', async () => {
    const fakeFetch = (async () => new Response('nope', { status: 404 })) as unknown as typeof fetch;
    expect(await getRepoConfig('t', 'acme', 'web', undefined, fakeFetch)).toBeNull();
  });
});

describe('bootstrapConfigPr', () => {
  const repo = { owner: 'acme', name: 'web', default_branch: 'main' };

  it('skips when a config already exists', async () => {
    const b64 = Buffer.from('export default {}\n').toString('base64');
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = mockFetch(
      [
        {
          match: (u) => u.includes('contents/frontguard.config.ts'),
          respond: () => new Response(JSON.stringify({ sha: 's', content: b64, encoding: 'base64' }), { status: 200 }),
        },
      ],
      calls,
    );
    const pr = await bootstrapConfigPr('tok', repo, fetchImpl);
    expect(pr).toBeNull();
    // Only the config-detection call should have happened (no branch/PR writes).
    expect(calls.some((c) => c.url.includes('/git/refs'))).toBe(false);
    expect(calls.some((c) => c.url.includes('/pulls'))).toBe(false);
  });

  it('opens a bootstrap PR with the default config when missing', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    let writtenConfig = '';
    let writtenWorkflow = '';
    const fetchImpl = mockFetch(
      [
        // config detection → not found (both candidates)
        { match: (u, i) => u.includes('/contents/') && (i?.method ?? 'GET') === 'GET', respond: () => new Response('no', { status: 404 }) },
        // resolve base branch sha
        { match: (u) => u.includes('/git/ref/heads/main'), respond: () => new Response(JSON.stringify({ object: { sha: 'base' } }), { status: 200 }) },
        // create branch
        { match: (u, i) => u.includes('/git/refs') && i?.method === 'POST', respond: () => new Response('{}', { status: 201 }) },
        // write config file
        {
          match: (u, i) => u.includes('/contents/frontguard.config.ts') && i?.method === 'PUT',
          respond: (_u, i) => {
            const body = JSON.parse((i!.body as string) ?? '{}');
            writtenConfig = Buffer.from(body.content, 'base64').toString();
            return new Response('{}', { status: 201 });
          },
        },
        // write workflow file
        {
          match: (u, i) => u.includes('/contents/') && u.includes('frontguard.yml') && i?.method === 'PUT',
          respond: (_u, i) => {
            const body = JSON.parse((i!.body as string) ?? '{}');
            writtenWorkflow = Buffer.from(body.content, 'base64').toString();
            return new Response('{}', { status: 201 });
          },
        },
        // open PR
        { match: (u, i) => u.includes('/pulls') && i?.method === 'POST', respond: () => new Response(JSON.stringify({ number: 1, html_url: 'https://github.com/acme/web/pull/1' }), { status: 201 }) },
      ],
      calls,
    );
    const pr = await bootstrapConfigPr('tok', repo, fetchImpl);
    expect(pr).not.toBeNull();
    expect(pr!.number).toBe(1);
    expect(writtenConfig).toBe(DEFAULT_CONFIG_TS);
    // The workflow file pins to the tagged action ref (P1-11), not @main.
    expect(writtenWorkflow).toContain('ravidsrk/frontguard@v1');
    expect(writtenWorkflow).not.toContain('@main');
    // The config file imports from @frontguard/cli, not the never-published
    // @frontguard/core.
    expect(writtenConfig).toContain("from '@frontguard/cli'");
    expect(writtenConfig).not.toContain('@frontguard/core');
    expect(calls.some((c) => c.url.includes('/pulls'))).toBe(true);
  });
});
