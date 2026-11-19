/**
 * CSS patch sanitizer for AI-generated fix verification sandboxes.
 *
 * Parses and validates AI-generated CSS before browser injection, blocking
 * external resource loads (`@import`, `url()`, `image-set()`, `cross-fade()`,
 * `element()`), script/HTML breakouts (`</style`, `expression()`,
 * `javascript:`, `vbscript:`, `data:`, `-moz-binding`, `behavior`), and
 * reward-hiding declarations (`display: none`, `visibility: hidden`,
 * `opacity: 0`, `font-size: 0`, `scale(0)`).
 *
 * @module sandbox/css-sanitize
 */

const FORBIDDEN_AT_RULES = /@(?:import|font-face|charset|namespace|document)\b/i;
const FORBIDDEN_CONSTRUCTS =
  /<\/style|(?:\burl|\bimage-set|-webkit-image-set|\bcross-fade|\belement|\bexpression)\s*\(|\b(?:javascript|vbscript|data)\s*:|\b(?:-moz-binding|behavior)\b/i;
const SAFE_PROP_RE = /^(?:--[a-z0-9_-]+|[a-z][a-z0-9-]*)$/;
const FORBIDDEN_PROPS = new Set(['behavior', '-moz-binding', 'src']);

/** Strips CSS comments (including unterminated ones) and decodes CSS escapes. */
function normalizeCssForInspection(css: string): string {
  const noComments = css.replace(/\/\*[\s\S]*?(?:\*\/|$)/g, ' ');
  return noComments
    .replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_, hex: string) => {
      const code = Number.parseInt(hex, 16);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return '';
      return String.fromCodePoint(code);
    })
    .replace(/\\([^\n\r\f0-9a-fA-F])/g, '$1');
}

function isHidingDeclaration(prop: string, rawVal: string): boolean {
  const val = rawVal.replace(/!important\s*$/i, '').trim().toLowerCase();
  if (prop === 'display' && val === 'none') return true;
  if (prop === 'visibility' && (val === 'hidden' || val === 'collapse')) return true;
  if (prop === 'opacity') {
    const n = Number.parseFloat(val);
    if (Number.isFinite(n) && n <= 0) return true;
  }
  if (prop === 'font-size' && /^0(?:[a-z%]+)?$/.test(val)) return true;
  if (prop === 'clip-path' && /inset\s*\(\s*100%/i.test(val)) return true;
  if (prop === 'transform' && /scale(?:3d|x|y)?\s*\(\s*0(?:\s*,|\s*\))/i.test(val)) return true;
  return false;
}

export interface CssValidationResult {
  safe: boolean;
  reason?: string;
}

/** Validates an AI-generated CSS patch before injecting it into a browser. */
export function validateCssPatch(css: string): CssValidationResult {
  if (typeof css !== 'string') return { safe: false, reason: 'CSS patch must be a string' };
  if (css.trim().length === 0) return { safe: true };

  const normalized = normalizeCssForInspection(css);
  if (FORBIDDEN_AT_RULES.test(normalized)) {
    return { safe: false, reason: 'CSS patch contains a forbidden at-rule (@import/@font-face/@charset/@namespace)' };
  }
  if (FORBIDDEN_CONSTRUCTS.test(normalized)) {
    return { safe: false, reason: 'CSS patch contains a forbidden construct (url/image-set/expression/scheme/style breakout)' };
  }

  // Verify balanced braces and validate declarations inside innermost blocks.
  let depth = 0;
  let blockStart = -1;
  let hasNested = false;
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (ch === '{') {
      if (depth > 0) hasNested = true;
      depth++;
      blockStart = i + 1;
    } else if (ch === '}') {
      depth--;
      if (depth < 0) return { safe: false, reason: 'CSS patch has unbalanced braces' };
      if (blockStart !== -1 && (!hasNested || depth >= 1)) {
        const body = normalized.slice(blockStart, i);
        for (const decl of body.split(';')) {
          const trimmed = decl.trim();
          if (!trimmed) continue;
          const colon = trimmed.indexOf(':');
          if (colon <= 0) return { safe: false, reason: `Invalid CSS declaration: "${trimmed.slice(0, 40)}"` };
          const prop = trimmed.slice(0, colon).trim().toLowerCase();
          const val = trimmed.slice(colon + 1).trim();
          if (!SAFE_PROP_RE.test(prop) || FORBIDDEN_PROPS.has(prop)) {
            return { safe: false, reason: `Disallowed CSS property: "${prop}"` };
          }
          if (isHidingDeclaration(prop, val)) {
            return { safe: false, reason: `CSS patch hides elements (${prop}: ${val})` };
          }
        }
      }
      blockStart = -1;
      if (depth === 0) hasNested = false;
    }
  }
  if (depth !== 0) return { safe: false, reason: 'CSS patch has unbalanced braces' };
  return { safe: true };
}

/** Asserts that `css` is safe for browser injection and returns it unchanged. */
export function assertSafeCssPatch(css: string): string {
  const res = validateCssPatch(css);
  if (!res.safe) {
    throw new Error(`Unsafe CSS patch rejected: ${res.reason}`);
  }
  return css;
}
