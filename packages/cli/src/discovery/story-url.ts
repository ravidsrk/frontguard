/**
 * Origin-bound URL resolution and HTTP(S) URL guards.
 *
 * Kept free of Node imports so the renderer can use it without pulling the
 * story-index loader into the published library bundle.
 */

const CONTROL_CHAR_RE = /[\x00-\x1f\x7f]/;
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** Returns true when `raw` is a syntactically valid `http:` or `https:` URL with no control chars. */
export function isHttpUrl(raw: string): boolean {
  if (typeof raw !== 'string' || !raw || CONTROL_CHAR_RE.test(raw)) return false;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Parses and validates an `http:` or `https:` URL, throwing a descriptive error otherwise. */
export function assertHttpUrl(raw: string, label = 'URL'): URL {
  if (typeof raw !== 'string' || !raw || CONTROL_CHAR_RE.test(raw)) {
    throw new Error(`Invalid ${label}: contains control characters or is empty`);
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`Invalid ${label} "${raw}"`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Invalid ${label} "${raw}": only http:// and https:// URLs are allowed`);
  }
  return parsed;
}

/**
 * Validates an AI provider `baseUrl`: `https:` is always allowed; `http:` is
 * permitted only for loopback hosts (`localhost`, `127.0.0.1`, `[::1]`, `::1`).
 */
export function isSafeAiBaseUrl(raw: string): boolean {
  if (!isHttpUrl(raw)) return false;
  const parsed = new URL(raw);
  if (parsed.protocol === 'https:') return true;
  return LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase());
}

/**
 * Returns true when `path` is an origin-bound relative route path:
 * starts with `/`, not `//`, contains no backslashes or control characters,
 * and resolves within `baseUrl`'s origin.
 */
export function isOriginBoundPath(
  path: string,
  baseUrl = 'https://frontguard.invalid',
): boolean {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) return false;
  if (path.includes('\\') || CONTROL_CHAR_RE.test(path)) return false;
  try {
    const base = new URL(baseUrl);
    return new URL(path, base).origin === base.origin;
  } catch {
    return false;
  }
}

/**
 * Resolve a story preview against a hosted base without dropping the base directory.
 *
 * `new URL('/?story=a', 'https://example.com/components')` opens the site root.
 * Story paths from Ladle and Histoire are root-shaped (`/?story=`, `/__sandbox.html`).
 * Strip that leading slash and join onto a directory URL so `/components/` stays.
 */
export function joinStoryUrl(base: string, previewPath: string): string {
  const baseObj = assertHttpUrl(base, 'baseUrl');
  if (!isOriginBoundPath(previewPath, baseObj.href)) {
    throw new Error(
      `Invalid route path "${previewPath}": must be an origin-bound relative path starting with "/"`,
    );
  }
  const directory = base.endsWith('/') ? base : `${base}/`;
  const relative = previewPath.replace(/^\/+/, '');
  const resolved = new URL(relative, directory);
  if (resolved.origin !== baseObj.origin) {
    throw new Error(`Route path "${previewPath}" escapes baseUrl origin "${baseObj.origin}"`);
  }
  return resolved.href;
}

/**
 * Open the URL capture opens.
 *
 * Ladle and Histoire previews are root-shaped, so a hosted directory stays
 * only when {@link joinStoryUrl} builds the URL. Every other route keeps
 * `new URL`, which replaces that directory, and enforces origin-bound paths.
 */
export function pageUrl(base: string, path: string, discoveredVia?: string): string {
  const baseObj = assertHttpUrl(base, 'baseUrl');
  if (discoveredVia === 'ladle' || discoveredVia === 'histoire') {
    return joinStoryUrl(base, path);
  }
  if (!isOriginBoundPath(path, baseObj.href)) {
    throw new Error(
      `Invalid route path "${path}": must be an origin-bound relative path starting with "/"`,
    );
  }
  return new URL(path, baseObj).href;
}
