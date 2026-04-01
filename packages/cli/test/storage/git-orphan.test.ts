import { describe, it, expect } from 'vitest';
import { sanitizeRoutePath, GitOrphanStorage } from '../../src/storage/git-orphan.js';

describe('sanitizeRoutePath', () => {
  it('strips leading slash from normal routes', () => {
    expect(sanitizeRoutePath('/checkout/step-1')).toBe('checkout/step-1');
  });

  it('converts root path / to _root', () => {
    expect(sanitizeRoutePath('/')).toBe('_root');
  });

  it('sanitizes path traversal attempts', () => {
    const result = sanitizeRoutePath('../../etc/passwd');
    expect(result).not.toContain('..');
    // No path traversal should survive
    expect(result).not.toMatch(/\.\./);
    // Should produce something like: ____etc_passwd
    expect(result).toMatch(/^[a-zA-Z0-9_\-\/]+$/);
  });

  it('converts empty string to _root', () => {
    expect(sanitizeRoutePath('')).toBe('_root');
  });

  it('strips special characters', () => {
    const result = sanitizeRoutePath('/hello?foo=bar&baz=1');
    // ? = & should be replaced with _
    expect(result).not.toContain('?');
    expect(result).not.toContain('=');
    expect(result).not.toContain('&');
    expect(result).toMatch(/^[a-zA-Z0-9_\-\/]+$/);
  });

  it('converts single dot to _root', () => {
    expect(sanitizeRoutePath('.')).toBe('_root');
  });

  it('handles route with hyphens and underscores', () => {
    expect(sanitizeRoutePath('/my-route/sub_page')).toBe('my-route/sub_page');
  });

  it('strips multiple leading slashes', () => {
    expect(sanitizeRoutePath('///foo')).toBe('foo');
  });

  it('handles deeply nested paths', () => {
    expect(sanitizeRoutePath('/a/b/c/d/e')).toBe('a/b/c/d/e');
  });

  it('handles URL-encoded characters', () => {
    const result = sanitizeRoutePath('/hello%20world');
    // % should be replaced with _
    expect(result).not.toContain('%');
    expect(result).toMatch(/^[a-zA-Z0-9_\-\/]+$/);
  });
});

describe('GitOrphanStorage', () => {
  it('can be instantiated without throwing', () => {
    // Use a temporary path — we're not calling init() so no git ops happen
    const storage = new GitOrphanStorage('/tmp/fake-repo');
    expect(storage).toBeDefined();
    expect(storage).toBeInstanceOf(GitOrphanStorage);
  });

  it('can be instantiated with a custom branch name', () => {
    const storage = new GitOrphanStorage('/tmp/fake-repo', 'my-baselines');
    expect(storage).toBeDefined();
  });

  it('throws if readBaseline is called before init', async () => {
    const storage = new GitOrphanStorage('/tmp/fake-repo');
    await expect(storage.readBaseline('/test', 1440, 'chromium')).rejects.toThrow('not initialized');
  });

  it('throws if writeBaseline is called before init', async () => {
    const storage = new GitOrphanStorage('/tmp/fake-repo');
    await expect(storage.writeBaseline('/test', 1440, 'chromium', Buffer.from('png'))).rejects.toThrow('not initialized');
  });

  it('throws if readManifest is called before init', async () => {
    const storage = new GitOrphanStorage('/tmp/fake-repo');
    await expect(storage.readManifest()).rejects.toThrow('not initialized');
  });

  it('throws if writeManifest is called before init', async () => {
    const storage = new GitOrphanStorage('/tmp/fake-repo');
    const manifest = {
      schemaVersion: 1,
      createdBy: 'test',
      updatedAt: new Date().toISOString(),
      routes: {},
    };
    await expect(storage.writeManifest(manifest)).rejects.toThrow('not initialized');
  });
});
