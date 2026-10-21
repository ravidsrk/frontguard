/**
 * Join a hosted story preview onto a base URL that may include a directory.
 *
 * Kept free of Node imports so the renderer can use it without pulling the
 * story-index loader into the published library bundle.
 */

/**
 * Resolve a story preview against a hosted base without dropping the base directory.
 *
 * `new URL('/?story=a', 'https://example.com/components')` opens the site root.
 * Story paths from Ladle and Histoire are root-shaped (`/?story=`, `/__sandbox.html`).
 * Strip that leading slash and join onto a directory URL so `/components/` stays.
 */
export function joinStoryUrl(base: string, previewPath: string): string {
  const directory = base.endsWith('/') ? base : `${base}/`;
  const relative = previewPath.replace(/^\/+/, '');
  return new URL(relative, directory).href;
}

/**
 * Open the URL capture opens.
 *
 * Ladle and Histoire previews are root-shaped, so a hosted directory stays
 * only when {@link joinStoryUrl} builds the URL. Every other route keeps
 * `new URL`, which replaces that directory.
 */
export function pageUrl(base: string, path: string, discoveredVia?: string): string {
  if (discoveredVia === 'ladle' || discoveredVia === 'histoire') return joinStoryUrl(base, path);
  return new URL(path, base).href;
}
