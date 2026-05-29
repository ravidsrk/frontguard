import { describe, it, expect } from 'vitest';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import {
  base64url,
  createAppJwt,
  getInstallationToken,
  createCheckRun,
} from '../src/github-api.js';

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
