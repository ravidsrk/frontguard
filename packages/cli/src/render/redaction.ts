/**
 * Sensitive-DOM Pixel & HTML Snapshot Redaction Engine.
 *
 * Prevents credentials, payment card fields, one-time codes, and elements
 * marked with `[data-frontguard-redact]` or `[data-sensitive]` from leaking
 * into baseline screenshots, cloud storage, or multimodal LLM prompts while
 * preserving exact element box geometry so layout regressions are still caught.
 *
 * @module render/redaction
 */

/** Default CSS selectors for sensitive inputs that should be redacted. */
export const DEFAULT_SENSITIVE_SELECTORS: readonly string[] = [
  'input[type="password"]',
  'input[autocomplete="current-password"]',
  'input[autocomplete="new-password"]',
  'input[autocomplete="one-time-code"]',
  'input[autocomplete^="cc-"]',
  '[data-frontguard-redact]',
  '[data-sensitive]',
] as const;

/**
 * Resolves the active list of CSS selectors to redact based on configuration.
 *
 * - `false` or `undefined`: returns `[]` (opt-in or controlled by caller)
 * - `true`: returns `DEFAULT_SENSITIVE_SELECTORS`
 * - `string[]`: merges custom selectors with `DEFAULT_SENSITIVE_SELECTORS`
 */
export function resolveRedactSelectors(
  redactConfig?: boolean | string[],
): string[] {
  if (!redactConfig) return [];
  if (redactConfig === true) {
    return [...DEFAULT_SENSITIVE_SELECTORS];
  }
  const merged = new Set<string>([
    ...DEFAULT_SENSITIVE_SELECTORS,
    ...redactConfig.map((s) => s.trim()).filter(Boolean),
  ]);
  return [...merged];
}

/**
 * In-page function passed to `page.evaluate(applySensitiveRedactionInPage, selectors)`
 * that walks the document and any open shadow roots, masking text/value pixels
 * on matching elements while preserving their exact bounding box dimensions,
 * borders, and layout flow.
 */
export function applySensitiveRedactionInPage(selectors: string[]): number {
  const combined = selectors.join(', ');
  if (!combined) return 0;

  let redactedCount = 0;
  const visitRoot = (root: Document | ShadowRoot): void => {
    try {
      const matches = root.querySelectorAll(combined);
      for (const el of matches) {
        const htmlEl = el as HTMLElement;
        if (!htmlEl.hasAttribute('data-frontguard-redact-prev-style')) {
          htmlEl.setAttribute(
            'data-frontguard-redact-prev-style',
            htmlEl.getAttribute('style') ?? '',
          );
        }
        htmlEl.style.setProperty('color', 'transparent', 'important');
        htmlEl.style.setProperty('text-shadow', 'none', 'important');
        htmlEl.style.setProperty('caret-color', 'transparent', 'important');
        redactedCount += 1;
      }
    } catch {
      // Ignore invalid custom selector errors in isolated roots
    }

    const allElements = root.querySelectorAll('*');
    for (const el of allElements) {
      if (el.shadowRoot) {
        visitRoot(el.shadowRoot);
      }
    }
  };

  visitRoot(document);
  return redactedCount;
}

/**
 * Restores original inline styles on elements previously masked by
 * {@link applySensitiveRedactionInPage}.
 */
export function restoreSensitiveRedactionInPage(): void {
  const visitRoot = (root: Document | ShadowRoot): void => {
    const matches = root.querySelectorAll('[data-frontguard-redact-prev-style]');
    for (const el of matches) {
      const prev = el.getAttribute('data-frontguard-redact-prev-style');
      el.removeAttribute('data-frontguard-redact-prev-style');
      if (prev) {
        el.setAttribute('style', prev);
      } else {
        el.removeAttribute('style');
      }
    }

    const allElements = root.querySelectorAll('*');
    for (const el of allElements) {
      if (el.shadowRoot) {
        visitRoot(el.shadowRoot);
      }
    }
  };

  visitRoot(document);
}

/**
 * Scrubs sensitive `value="..."` attributes from serialized DOM HTML snapshots
 * so password, credit-card, OTP, and `[data-frontguard-redact]` values are
 * never persisted in `domSnapshot` or transmitted to LLM providers.
 */
export function redactSensitiveDomHtml(html: string): string {
  if (!html) return html;

  return html.replace(/<input\b[^>]*>/gi, (tag) => {
    const isPassword = /\btype\s*=\s*["']?password["']?/i.test(tag);
    const isSensitiveAutocomplete =
      /\bautocomplete\s*=\s*["']?(?:current-password|new-password|one-time-code|cc-[a-z0-9-]+)["']?/i.test(
        tag,
      );
    const isExplicitRedact = /\bdata-(?:frontguard-redact|sensitive)\b/i.test(tag);

    if (!isPassword && !isSensitiveAutocomplete && !isExplicitRedact) {
      return tag;
    }

    return tag.replace(
      /\bvalue\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,
      'value="[REDACTED]"',
    );
  });
}
