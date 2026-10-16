import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SENSITIVE_SELECTORS,
  resolveRedactSelectors,
  applySensitiveRedactionInPage,
  restoreSensitiveRedactionInPage,
  redactSensitiveDomHtml,
} from '../../src/render/redaction.js';

describe('resolveRedactSelectors', () => {
  it('returns empty array when redactSensitive is falsy', () => {
    expect(resolveRedactSelectors(undefined)).toEqual([]);
    expect(resolveRedactSelectors(false)).toEqual([]);
  });

  it('returns default sensitive selectors when redactSensitive is true', () => {
    const selectors = resolveRedactSelectors(true);
    expect(selectors).toEqual([...DEFAULT_SENSITIVE_SELECTORS]);
    expect(selectors).toContain('input[type="password"]');
    expect(selectors).toContain('[data-frontguard-redact]');
  });

  it('merges custom selectors with default sensitive selectors without duplicates', () => {
    const selectors = resolveRedactSelectors([
      '.api-key-value',
      'input[type="password"]',
      '  #ssn-field  ',
    ]);
    expect(selectors).toContain('input[type="password"]');
    expect(selectors).toContain('.api-key-value');
    expect(selectors).toContain('#ssn-field');
    expect(
      selectors.filter((s) => s === 'input[type="password"]'),
    ).toHaveLength(1);
  });
});

describe('applySensitiveRedactionInPage & restoreSensitiveRedactionInPage', () => {
  it('returns 0 when selector list is empty', () => {
    expect(applySensitiveRedactionInPage([])).toBe(0);
  });

  it('masks matching elements across document and open shadow roots and restores styles', () => {
    const makeMockEl = (initialStyle = 'width: 120px;') => {
      const attrs = new Map<string, string>();
      if (initialStyle) attrs.set('style', initialStyle);
      const props = new Map<string, string>();
      return {
        hasAttribute: (k: string) => attrs.has(k),
        getAttribute: (k: string) => attrs.get(k) ?? null,
        setAttribute: (k: string, v: string) => attrs.set(k, v),
        removeAttribute: (k: string) => attrs.delete(k),
        style: {
          setProperty: (k: string, v: string) => {
            props.set(k, v);
            attrs.set('style', `${initialStyle} ${k}: ${v};`);
          },
        },
        _attrs: attrs,
        _props: props,
      };
    };

    const docInput = makeMockEl('width: 200px;');
    const shadowInput = makeMockEl('');

    const mockShadowRoot = {
      querySelectorAll: (sel: string) => {
        if (sel === '*') return [];
        if (sel === '[data-frontguard-redact-prev-style]') {
          return shadowInput.hasAttribute('data-frontguard-redact-prev-style')
            ? [shadowInput]
            : [];
        }
        return [shadowInput];
      },
    };

    const hostEl = { shadowRoot: mockShadowRoot };

    const prevDoc = (globalThis as any).document;
    (globalThis as any).document = {
      querySelectorAll: (sel: string) => {
        if (sel === '*') return [hostEl];
        if (sel === '[data-frontguard-redact-prev-style]') {
          return docInput.hasAttribute('data-frontguard-redact-prev-style')
            ? [docInput]
            : [];
        }
        return [docInput];
      },
    };

    try {
      const count = applySensitiveRedactionInPage(resolveRedactSelectors(true));
      expect(count).toBe(2);
      expect(docInput._props.get('color')).toBe('transparent');
      expect(shadowInput._props.get('color')).toBe('transparent');

      restoreSensitiveRedactionInPage();
      expect(docInput.getAttribute('style')).toBe('width: 200px;');
      expect(shadowInput.getAttribute('style')).toBeNull();
    } finally {
      (globalThis as any).document = prevDoc;
    }
  });
});

describe('redactSensitiveDomHtml', () => {
  it('scrubs value attributes from password, credit-card, one-time-code, and data-frontguard-redact inputs', () => {
    const rawHtml = [
      '<form>',
      '  <input type="text" name="username" value="alice@example.com">',
      '  <input type="password" name="pwd" value="s3cr3t-p@ss!">',
      '  <input type="text" autocomplete="cc-number" value="4111222233334444">',
      '  <input type="text" autocomplete="one-time-code" value="849201">',
      '  <input type="text" data-frontguard-redact value="fg_live_secret_token">',
      '  <input type="text" data-sensitive="true" value="private-ssn">',
      '</form>',
    ].join('\n');

    const scrubbed = redactSensitiveDomHtml(rawHtml);

    expect(scrubbed).toContain('value="alice@example.com"');
    expect(scrubbed).not.toContain('s3cr3t-p@ss!');
    expect(scrubbed).not.toContain('4111222233334444');
    expect(scrubbed).not.toContain('849201');
    expect(scrubbed).not.toContain('fg_live_secret_token');
    expect(scrubbed).not.toContain('private-ssn');
    expect(scrubbed).toContain('value="[REDACTED]"');
  });
});
