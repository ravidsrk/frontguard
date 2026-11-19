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
  'input[name*="card" i]',
  'input[name*="cvv" i]',
  'input[name*="cvc" i]',
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
 * that walks the document, open shadow roots, and same-origin iframes, masking
 * text, autofill, SVG, media, and descendant pixels on matching elements while
 * preserving exact element box geometry.
 */
export function applySensitiveRedactionInPage(selectors: string[]): number {
  if (!selectors || selectors.length === 0) return 0;

  const MEDIA_TAGS = new Set([
    'IMG',
    'VIDEO',
    'CANVAS',
    'SVG',
    'PICTURE',
    'OBJECT',
    'EMBED',
    'IFRAME',
  ]);
  let redactedCount = 0;

  const maskElement = (htmlEl: HTMLElement): void => {
    if (!htmlEl || !htmlEl.style) return;
    if (!htmlEl.hasAttribute('data-frontguard-redact-prev-style')) {
      htmlEl.setAttribute(
        'data-frontguard-redact-prev-style',
        htmlEl.getAttribute('style') ?? '',
      );
    }
    htmlEl.style.setProperty('color', 'transparent', 'important');
    htmlEl.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
    htmlEl.style.setProperty('text-shadow', 'none', 'important');
    htmlEl.style.setProperty('caret-color', 'transparent', 'important');
    htmlEl.style.setProperty('background-image', 'none', 'important');
    htmlEl.style.setProperty('fill', 'transparent', 'important');
    htmlEl.style.setProperty('stroke', 'transparent', 'important');
    const tag = typeof htmlEl.tagName === 'string' ? htmlEl.tagName.toUpperCase() : '';
    if (MEDIA_TAGS.has(tag)) {
      htmlEl.style.setProperty('filter', 'brightness(0)', 'important');
    }
  };

  const visitRoot = (root: Document | ShadowRoot): void => {
    const matched = new Set<Element>();
    for (const sel of selectors) {
      if (!sel) continue;
      try {
        const list = root.querySelectorAll(sel);
        for (const el of list) matched.add(el);
      } catch {
        // Evaluate selectors individually so one invalid custom selector never disables defaults
      }
    }

    for (const el of matched) {
      const htmlEl = el as HTMLElement;
      htmlEl.setAttribute('data-frontguard-redacted', '1');
      maskElement(htmlEl);
      if (typeof htmlEl.querySelectorAll === 'function') {
        const descendants = htmlEl.querySelectorAll('*');
        for (const child of descendants) {
          (child as HTMLElement).setAttribute('data-frontguard-redacted', '1');
          maskElement(child as HTMLElement);
        }
      }
      redactedCount += 1;
    }

    const allElements = root.querySelectorAll('*');
    for (const el of allElements) {
      if (el.shadowRoot) {
        visitRoot(el.shadowRoot);
      }
      const tag = typeof el.tagName === 'string' ? el.tagName.toUpperCase() : '';
      if (tag === 'IFRAME') {
        try {
          const frameDoc = (el as HTMLIFrameElement).contentDocument;
          if (frameDoc) visitRoot(frameDoc);
        } catch {
          // Cross-origin iframe — already masked if iframe itself matched
        }
      }
    }
  };

  visitRoot(document);
  return redactedCount;
}

/**
 * In-page scrubber executed after screenshot capture and before DOM snapshot /
 * element box extraction / text snapshot extraction so sensitive plaintext
 * never reaches serialized HTML, `domElements[].textPreview`, or ARIA/text
 * snapshots.
 */
export function scrubRedactedDomInPage(selectors: string[]): void {
  const SCRUB_ATTRS = ['alt', 'title', 'aria-label', 'data-value'];

  const scrubNode = (el: HTMLElement): void => {
    if (!el || typeof el.setAttribute !== 'function') return;
    el.setAttribute('data-frontguard-redacted', '1');
    const tag = typeof el.tagName === 'string' ? el.tagName.toUpperCase() : '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') {
      try {
        (el as HTMLInputElement | HTMLTextAreaElement).value = '[REDACTED]';
      } catch {
        // Ignore read-only/file inputs
      }
      el.setAttribute('value', '[REDACTED]');
      if (typeof el.removeAttribute === 'function') {
        el.removeAttribute('placeholder');
      }
    }
    for (const attr of SCRUB_ATTRS) {
      if (typeof el.hasAttribute === 'function' && el.hasAttribute(attr)) {
        el.setAttribute(attr, '[REDACTED]');
      }
    }
    const children = el.childNodes;
    if (children) {
      for (let i = 0; i < children.length; i++) {
        const node = children[i];
        if (node && node.nodeType === 3 && node.nodeValue && node.nodeValue.trim().length > 0) {
          node.nodeValue = '[REDACTED]';
        }
      }
    }
  };

  const visitRoot = (root: Document | ShadowRoot): void => {
    const targets = new Set<Element>();
    try {
      for (const el of root.querySelectorAll('[data-frontguard-redacted]')) targets.add(el);
    } catch {
      // ignore
    }
    for (const sel of selectors) {
      if (!sel) continue;
      try {
        for (const el of root.querySelectorAll(sel)) targets.add(el);
      } catch {
        // ignore invalid custom selector
      }
    }
    for (const el of targets) {
      const htmlEl = el as HTMLElement;
      scrubNode(htmlEl);
      if (typeof htmlEl.querySelectorAll === 'function') {
        for (const desc of htmlEl.querySelectorAll('*')) {
          scrubNode(desc as HTMLElement);
        }
      }
    }

    const allElements = root.querySelectorAll('*');
    for (const el of allElements) {
      if (el.shadowRoot) visitRoot(el.shadowRoot);
      const tag = typeof el.tagName === 'string' ? el.tagName.toUpperCase() : '';
      if (tag === 'IFRAME') {
        try {
          const frameDoc = (el as HTMLIFrameElement).contentDocument;
          if (frameDoc) visitRoot(frameDoc);
        } catch {
          // Cross-origin iframe
        }
      }
    }
  };

  visitRoot(document);
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
      el.removeAttribute('data-frontguard-redacted');
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
      const tag = typeof el.tagName === 'string' ? el.tagName.toUpperCase() : '';
      if (tag === 'IFRAME') {
        try {
          const frameDoc = (el as HTMLIFrameElement).contentDocument;
          if (frameDoc) visitRoot(frameDoc);
        } catch {
          // Cross-origin iframe
        }
      }
    }
  };

  visitRoot(document);
}

const SENSITIVE_ATTR_RE =
  /\b(?:type\s*=\s*["']?password["']?|autocomplete\s*=\s*["']?(?:current-password|new-password|one-time-code|cc-[a-z0-9-]+)["']?|name\s*=\s*["']?[^"'>]*(?:card|cvv|cvc)[^"'>]*["']?|data-(?:frontguard-redact(?:ed)?|sensitive)\b)/i;

/**
 * Scrubs sensitive `value="..."`, `placeholder="..."`, `<textarea>` bodies,
 * and `[data-frontguard-redact]`/`[data-sensitive]` element text from
 * serialized DOM HTML snapshots so plaintext is never persisted or sent to LLMs.
 */
export function redactSensitiveDomHtml(html: string): string {
  if (!html) return html;

  let out = html.replace(/<input\b[^>]*>/gi, (tag) => {
    if (!SENSITIVE_ATTR_RE.test(tag)) return tag;
    return tag
      .replace(/\bvalue\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, 'value="[REDACTED]"')
      .replace(/\bplaceholder\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, 'placeholder="[REDACTED]"');
  });

  out = out.replace(/<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/gi, (full, attrs: string) => {
    if (!SENSITIVE_ATTR_RE.test(attrs)) return full;
    return `<textarea${attrs}>[REDACTED]</textarea>`;
  });

  out = out.replace(
    /<([a-z][a-z0-9-]*)\b([^>]*\bdata-(?:frontguard-redact(?:ed)?|sensitive)\b[^>]*)>([\s\S]*?)<\/\1>/gi,
    (_full, tag: string, attrs: string, body: string) =>
      `<${tag}${attrs}>${body.replace(/>([^<]+)</g, '>[REDACTED]<').replace(/^([^<]+)$/, '[REDACTED]')}</${tag}>`,
  );

  return out;
}
