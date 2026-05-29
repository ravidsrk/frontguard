/**
 * GitHub App authentication + API helpers (Task 7.2).
 *
 * - Mints a short-lived app JWT (RS256) from the app id + private key.
 * - Exchanges it for an installation access token.
 * - Creates/updates Check Runs and opens config-bootstrap PRs.
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
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'frontguard-github-app',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to create check run: ${res.status}`);
  return (await res.json()) as { id: number };
}
