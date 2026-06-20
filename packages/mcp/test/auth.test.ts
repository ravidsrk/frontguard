import { describe, expect, it } from 'vitest';
import { MissingApiKeyError, MissingApiUrlError, requireAuth } from '../src/auth.js';

describe('requireAuth', () => {
  it('throws MissingApiKeyError when FRONTGUARD_API_KEY is unset', () => {
    expect(() => requireAuth({})).toThrow(MissingApiKeyError);
  });

  it('throws MissingApiKeyError when FRONTGUARD_API_KEY is empty', () => {
    expect(() => requireAuth({ FRONTGUARD_API_KEY: '   ' })).toThrow(MissingApiKeyError);
  });

  it('error message mentions FRONTGUARD_API_KEY and mcp.json', () => {
    try {
      requireAuth({});
      expect.fail('should have thrown');
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toMatch(/FRONTGUARD_API_KEY/);
      expect(msg).toMatch(/mcp\.json|MCP client/);
    }
  });

  it('throws MissingApiUrlError when FRONTGUARD_API_URL is unset', () => {
    expect(() => requireAuth({ FRONTGUARD_API_KEY: 'fg_test_abc' })).toThrow(MissingApiUrlError);
  });

  it('throws MissingApiUrlError when FRONTGUARD_API_URL is empty', () => {
    expect(() =>
      requireAuth({ FRONTGUARD_API_KEY: 'fg_test_abc', FRONTGUARD_API_URL: '   ' }),
    ).toThrow(MissingApiUrlError);
  });

  it('uses FRONTGUARD_API_URL when set, stripping trailing slashes', () => {
    const auth = requireAuth({
      FRONTGUARD_API_KEY: 'fg_test_abc',
      FRONTGUARD_API_URL: 'http://localhost:8787///',
    });
    expect(auth.apiUrl).toBe('http://localhost:8787');
  });

  it('trims whitespace around the key', () => {
    const auth = requireAuth({
      FRONTGUARD_API_KEY: '  fg_test_xyz  ',
      FRONTGUARD_API_URL: 'http://localhost:8787',
    });
    expect(auth.apiKey).toBe('fg_test_xyz');
  });
});
