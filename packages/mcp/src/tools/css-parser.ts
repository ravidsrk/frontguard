/**
 * Zero-dependency CSS Syntax Level 3 tokenizer, block parser, and security/hiding
 * static analyzer for `verify_css_patch`.
 *
 * Strips comments, decodes CSS backslash hex escapes (e.g. `\69 mport`, `\75 rl`),
 * parses balanced blocks including nested `@media`/`@supports`/`@container`/`@layer`
 * conditional rules, and inspects the decoded AST so comment splitting and escape
 * obfuscation cannot bypass static checks.
 *
 * @module tools/css-parser
 */

const MAX_NESTING_DEPTH = 8;
const MAX_CSS_TOKENS = 20_000;

export interface CssFunctionCall {
  /** Decoded lowercase function name (e.g. `url`, `image-set`, `scale`). */
  name: string;
  /** Decoded raw argument text inside parentheses. */
  args: string;
}

export interface CssDeclaration {
  /** Decoded lowercase property name (e.g. `display`, `-moz-binding`, `--gap`). */
  property: string;
  /** Decoded value without trailing `!important`. */
  value: string;
  /** True when `!important` was present. */
  important: boolean;
  /** All function calls appearing anywhere inside the declaration value. */
  functions: CssFunctionCall[];
}

export interface CssQualifiedRule {
  /** Comma-separated selector list (trimmed). */
  selectorText: string;
  declarations: CssDeclaration[];
}

export interface CssAtRule {
  /** Decoded lowercase at-keyword name without `@` (e.g. `import`, `media`). */
  name: string;
  /** Decoded prelude before `;` or `{`. */
  prelude: string;
  /** Any function calls found inside the prelude (e.g. `@import url(...)`). */
  functions: CssFunctionCall[];
}

export interface ParsedCssPatch {
  valid: boolean;
  hasBraces: boolean;
  rules: CssQualifiedRule[];
  atRules: CssAtRule[];
  /** Bare declarations when the patch has no braces/rules. */
  bareDeclarations: CssDeclaration[];
  /** Error message when `valid` is false. */
  error?: string;
}

type TokenType =
  | 'ident'
  | 'at-keyword'
  | 'function'
  | 'string'
  | 'hash'
  | 'number'
  | 'colon'
  | 'semicolon'
  | 'comma'
  | 'lbrace'
  | 'rbrace'
  | 'lparen'
  | 'rparen'
  | 'lbracket'
  | 'rbracket'
  | 'whitespace'
  | 'delim';

interface Token {
  type: TokenType;
  /** Decoded value (for ident/at-keyword/function/string/hash/delim/etc.). */
  value: string;
  /** Raw source slice (without surrounding quotes for strings? No, full raw text). */
  raw: string;
}

function isHexDigit(code: number): boolean {
  return (
    (code >= 0x30 && code <= 0x39) ||
    (code >= 0x41 && code <= 0x46) ||
    (code >= 0x61 && code <= 0x66)
  );
}

function isWhitespace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f';
}

function isIdentStart(ch: string): boolean {
  const c = ch.charCodeAt(0);
  return (
    (c >= 0x41 && c <= 0x5a) ||
    (c >= 0x61 && c <= 0x7a) ||
    c === 0x5f || // _
    c >= 0x80
  );
}

function isIdentChar(ch: string): boolean {
  const c = ch.charCodeAt(0);
  return isIdentStart(ch) || (c >= 0x30 && c <= 0x39) || c === 0x2d; // 0-9, -
}

function isNewline(ch: string): boolean {
  return ch === '\n' || ch === '\r' || ch === '\f';
}

/** Decode a CSS escape sequence starting at `pos` (where `css[pos] === '\\'`). */
function consumeEscape(css: string, pos: number): { char: string; nextPos: number } {
  const i = pos + 1;
  if (i >= css.length) {
    return { char: '\uFFFD', nextPos: i };
  }
  if (isHexDigit(css.charCodeAt(i))) {
    let end = i;
    while (end < css.length && end - i < 6 && isHexDigit(css.charCodeAt(end))) {
      end++;
    }
    const codePoint = Number.parseInt(css.slice(i, end), 16);
    // Optional single whitespace after hex escape (CRLF counts as one)
    if (end < css.length) {
      if (css[end] === '\r' && css[end + 1] === '\n') {
        end += 2;
      } else if (isWhitespace(css[end])) {
        end += 1;
      }
    }
    const char =
      codePoint === 0 ||
      (codePoint >= 0xd800 && codePoint <= 0xdfff) ||
      codePoint > 0x10ffff
        ? '\uFFFD'
        : String.fromCodePoint(codePoint);
    return { char, nextPos: end };
  }
  return { char: css[i], nextPos: i + 1 };
}

function startsEscape(css: string, pos: number): boolean {
  return css[pos] === '\\' && pos + 1 < css.length && !isNewline(css[pos + 1]);
}

function startsIdent(css: string, pos: number): boolean {
  if (pos >= css.length) return false;
  const ch = css[pos];
  if (ch === '-') {
    const next = css[pos + 1];
    if (!next) return false;
    return isIdentStart(next) || next === '-' || startsEscape(css, pos + 1);
  }
  return isIdentStart(ch) || startsEscape(css, pos);
}

function consumeIdent(css: string, pos: number): { value: string; nextPos: number } {
  let out = '';
  let i = pos;
  while (i < css.length) {
    if (isIdentChar(css[i])) {
      out += css[i];
      i++;
    } else if (startsEscape(css, i)) {
      const esc = consumeEscape(css, i);
      out += esc.char;
      i = esc.nextPos;
    } else {
      break;
    }
  }
  return { value: out, nextPos: i };
}

function tokenizeCss(css: string): { ok: true; tokens: Token[] } | { ok: false; error: string } {
  const tokens: Token[] = [];
  let i = 0;

  while (i < css.length) {
    if (tokens.length >= MAX_CSS_TOKENS) {
      return { ok: false, error: 'CSS patch exceeds maximum token limit.' };
    }

    const ch = css[i];

    // Comments: /* ... */
    if (ch === '/' && css[i + 1] === '*') {
      const close = css.indexOf('*/', i + 2);
      if (close === -1) {
        return { ok: false, error: 'Unclosed CSS comment.' };
      }
      // CSS comments act as token separators without producing a token.
      i = close + 2;
      continue;
    }

    // Whitespace
    if (isWhitespace(ch)) {
      const start = i;
      while (i < css.length && isWhitespace(css[i])) i++;
      tokens.push({ type: 'whitespace', value: ' ', raw: css.slice(start, i) });
      continue;
    }

    // Strings
    if (ch === '"' || ch === "'") {
      const quote = ch;
      const start = i;
      i++;
      let out = '';
      let closed = false;
      while (i < css.length) {
        const c = css[i];
        if (c === quote) {
          i++;
          closed = true;
          break;
        }
        if (isNewline(c)) {
          return { ok: false, error: 'Unclosed CSS string before newline.' };
        }
        if (c === '\\') {
          if (i + 1 >= css.length) {
            return { ok: false, error: 'Unclosed CSS string at escape.' };
          }
          if (isNewline(css[i + 1])) {
            i += css[i + 1] === '\r' && css[i + 2] === '\n' ? 3 : 2;
            continue;
          }
          const esc = consumeEscape(css, i);
          out += esc.char;
          i = esc.nextPos;
          continue;
        }
        out += c;
        i++;
      }
      if (!closed) {
        return { ok: false, error: 'Unclosed CSS string.' };
      }
      tokens.push({ type: 'string', value: out, raw: css.slice(start, i) });
      continue;
    }

    // Punctuation
    if (ch === ':') {
      tokens.push({ type: 'colon', value: ':', raw: ':' });
      i++;
      continue;
    }
    if (ch === ';') {
      tokens.push({ type: 'semicolon', value: ';', raw: ';' });
      i++;
      continue;
    }
    if (ch === ',') {
      tokens.push({ type: 'comma', value: ',', raw: ',' });
      i++;
      continue;
    }
    if (ch === '{') {
      tokens.push({ type: 'lbrace', value: '{', raw: '{' });
      i++;
      continue;
    }
    if (ch === '}') {
      tokens.push({ type: 'rbrace', value: '}', raw: '}' });
      i++;
      continue;
    }
    if (ch === '(') {
      tokens.push({ type: 'lparen', value: '(', raw: '(' });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen', value: ')', raw: ')' });
      i++;
      continue;
    }
    if (ch === '[') {
      tokens.push({ type: 'lbracket', value: '[', raw: '[' });
      i++;
      continue;
    }
    if (ch === ']') {
      tokens.push({ type: 'rbracket', value: ']', raw: ']' });
      i++;
      continue;
    }

    // At-keyword: @ident
    if (ch === '@' && startsIdent(css, i + 1)) {
      const start = i;
      const ident = consumeIdent(css, i + 1);
      i = ident.nextPos;
      tokens.push({ type: 'at-keyword', value: ident.value, raw: css.slice(start, i) });
      continue;
    }

    // Hash: #ident
    if (ch === '#' && (i + 1 < css.length) && (isIdentChar(css[i + 1]) || startsEscape(css, i + 1))) {
      const start = i;
      const ident = consumeIdent(css, i + 1);
      i = ident.nextPos;
      tokens.push({ type: 'hash', value: `#${ident.value}`, raw: css.slice(start, i) });
      continue;
    }

    // Number (including optional leading +/- or .)
    if (
      (ch >= '0' && ch <= '9') ||
      (ch === '.' && i + 1 < css.length && css[i + 1] >= '0' && css[i + 1] <= '9') ||
      ((ch === '+' || ch === '-') &&
        i + 1 < css.length &&
        ((css[i + 1] >= '0' && css[i + 1] <= '9') ||
          (css[i + 1] === '.' && i + 2 < css.length && css[i + 2] >= '0' && css[i + 2] <= '9')))
    ) {
      const start = i;
      if (ch === '+' || ch === '-') i++;
      while (i < css.length && css[i] >= '0' && css[i] <= '9') i++;
      if (css[i] === '.' && i + 1 < css.length && css[i + 1] >= '0' && css[i + 1] <= '9') {
        i++;
        while (i < css.length && css[i] >= '0' && css[i] <= '9') i++;
      }
      if ((css[i] === 'e' || css[i] === 'E') && i + 1 < css.length) {
        let exp = i + 1;
        if (css[exp] === '+' || css[exp] === '-') exp++;
        if (exp < css.length && css[exp] >= '0' && css[exp] <= '9') {
          i = exp;
          while (i < css.length && css[i] >= '0' && css[i] <= '9') i++;
        }
      }
      // Attach trailing % or ident unit if present
      if (css[i] === '%') {
        i++;
      } else if (startsIdent(css, i)) {
        i = consumeIdent(css, i).nextPos;
      }
      const raw = css.slice(start, i);
      tokens.push({ type: 'number', value: raw, raw });
      continue;
    }

    // Ident or function (ident immediately followed by `(`)
    if (startsIdent(css, i)) {
      const start = i;
      const ident = consumeIdent(css, i);
      i = ident.nextPos;
      if (css[i] === '(') {
        i++;
        tokens.push({ type: 'function', value: ident.value, raw: css.slice(start, i) });
      } else {
        tokens.push({ type: 'ident', value: ident.value, raw: css.slice(start, i) });
      }
      continue;
    }

    // Stray backslash before newline or EOF
    if (ch === '\\') {
      return { ok: false, error: 'Invalid CSS escape sequence.' };
    }

    tokens.push({ type: 'delim', value: ch, raw: ch });
    i++;
  }

  return { ok: true, tokens };
}

function tokensToDecodedText(tokens: readonly Token[]): string {
  return tokens
    .map((t) => {
      if (t.type === 'function') return `${t.value}(`;
      if (t.type === 'at-keyword') return `@${t.value}`;
      if (t.type === 'string') return JSON.stringify(t.value);
      return t.value;
    })
    .join('')
    .trim();
}

function tokensToRawText(tokens: readonly Token[]): string {
  return tokens.map((t) => t.raw).join('').trim();
}

/** Extract all function calls (including nested ones) and verify balanced `()` and `[]`. */
function extractFunctionsAndCheckBalance(
  tokens: readonly Token[],
): { ok: true; functions: CssFunctionCall[] } | { ok: false; error: string } {
  const functions: CssFunctionCall[] = [];
  const stack: Array<{ kind: 'paren' | 'bracket'; fnName?: string; startIdx: number }> = [];

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'function') {
      stack.push({ kind: 'paren', fnName: t.value.toLowerCase(), startIdx: i + 1 });
    } else if (t.type === 'lparen') {
      stack.push({ kind: 'paren', startIdx: i + 1 });
    } else if (t.type === 'lbracket') {
      stack.push({ kind: 'bracket', startIdx: i + 1 });
    } else if (t.type === 'rparen') {
      const top = stack.pop();
      if (!top || top.kind !== 'paren') {
        return { ok: false, error: 'Unbalanced parentheses in CSS.' };
      }
      if (top.fnName !== undefined) {
        functions.push({
          name: top.fnName,
          args: tokensToDecodedText(tokens.slice(top.startIdx, i)),
        });
      }
    } else if (t.type === 'rbracket') {
      const top = stack.pop();
      if (!top || top.kind !== 'bracket') {
        return { ok: false, error: 'Unbalanced brackets in CSS.' };
      }
    } else if (t.type === 'lbrace' || t.type === 'rbrace') {
      return { ok: false, error: 'Unexpected brace inside CSS declaration or prelude.' };
    }
  }

  if (stack.length > 0) {
    return { ok: false, error: 'Unclosed parenthesis or bracket in CSS.' };
  }

  // Also catch `ident` followed by whitespace + `(` like `expression ( ... )` (IE legacy syntax)
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type === 'ident') {
      let j = i + 1;
      while (j < tokens.length && tokens[j].type === 'whitespace') j++;
      if (j < tokens.length && tokens[j].type === 'lparen') {
        let depth = 1;
        let k = j + 1;
        while (k < tokens.length && depth > 0) {
          if (tokens[k].type === 'lparen' || tokens[k].type === 'function') depth++;
          else if (tokens[k].type === 'rparen') depth--;
          k++;
        }
        functions.push({
          name: tokens[i].value.toLowerCase(),
          args: tokensToDecodedText(tokens.slice(j + 1, k - 1)),
        });
      }
    }
  }

  return { ok: true, functions };
}

const VALID_PROP_RE = /^(?:--[a-zA-Z0-9_-]+|-?[a-zA-Z][a-zA-Z0-9_-]*)$/;

function parseDeclarations(
  tokens: readonly Token[],
): { ok: true; declarations: CssDeclaration[] } | { ok: false; error: string } {
  const segments: Token[][] = [];
  let current: Token[] = [];
  let parenDepth = 0;
  let bracketDepth = 0;

  for (const t of tokens) {
    if (t.type === 'lbrace' || t.type === 'rbrace') {
      return { ok: false, error: 'Unexpected brace inside declaration block.' };
    }
    if (t.type === 'function' || t.type === 'lparen') parenDepth++;
    else if (t.type === 'rparen') {
      parenDepth--;
      if (parenDepth < 0) return { ok: false, error: 'Unbalanced parentheses in declaration.' };
    } else if (t.type === 'lbracket') bracketDepth++;
    else if (t.type === 'rbracket') {
      bracketDepth--;
      if (bracketDepth < 0) return { ok: false, error: 'Unbalanced brackets in declaration.' };
    } else if (t.type === 'semicolon' && parenDepth === 0 && bracketDepth === 0) {
      segments.push(current);
      current = [];
      continue;
    }
    current.push(t);
  }
  if (parenDepth !== 0 || bracketDepth !== 0) {
    return { ok: false, error: 'Unclosed parenthesis or bracket in declaration.' };
  }
  segments.push(current);

  const declarations: CssDeclaration[] = [];
  for (const seg of segments) {
    const nonWs = seg.filter((t) => t.type !== 'whitespace');
    if (nonWs.length === 0) continue;

    // Find top-level colon
    let colonIdx = -1;
    let pDepth = 0;
    let bDepth = 0;
    for (let i = 0; i < seg.length; i++) {
      const t = seg[i];
      if (t.type === 'function' || t.type === 'lparen') pDepth++;
      else if (t.type === 'rparen') pDepth--;
      else if (t.type === 'lbracket') bDepth++;
      else if (t.type === 'rbracket') bDepth--;
      else if (t.type === 'colon' && pDepth === 0 && bDepth === 0) {
        colonIdx = i;
        break;
      }
    }
    if (colonIdx === -1) {
      return { ok: false, error: 'Missing colon in CSS declaration.' };
    }

    const propTokens = seg.slice(0, colonIdx).filter((t) => t.type !== 'whitespace');
    if (propTokens.length !== 1 || propTokens[0].type !== 'ident') {
      return { ok: false, error: 'Invalid CSS property name.' };
    }
    const property = propTokens[0].value.toLowerCase();
    if (!VALID_PROP_RE.test(property)) {
      return { ok: false, error: `Invalid CSS property name "${property}".` };
    }

    const valTokens = seg.slice(colonIdx + 1);
    const nonWsVal = valTokens.filter((t) => t.type !== 'whitespace');
    if (nonWsVal.length === 0) {
      return { ok: false, error: `Missing value for CSS property "${property}".` };
    }

    const balanced = extractFunctionsAndCheckBalance(valTokens);
    if (!balanced.ok) return balanced;

    // Detect trailing `!important` (tokens end with delim `!` + ident `important`)
    let important = false;
    let effectiveValTokens = valTokens;
    if (
      nonWsVal.length >= 2 &&
      nonWsVal[nonWsVal.length - 2].type === 'delim' &&
      nonWsVal[nonWsVal.length - 2].value === '!' &&
      nonWsVal[nonWsVal.length - 1].type === 'ident' &&
      nonWsVal[nonWsVal.length - 1].value.toLowerCase() === 'important'
    ) {
      important = true;
      const bangTok = nonWsVal[nonWsVal.length - 2];
      const bangIdx = valTokens.lastIndexOf(bangTok);
      effectiveValTokens = valTokens.slice(0, bangIdx);
      if (effectiveValTokens.every((t) => t.type === 'whitespace')) {
        return { ok: false, error: `Missing value before !important for "${property}".` };
      }
    }

    declarations.push({
      property,
      value: tokensToDecodedText(effectiveValTokens),
      important,
      functions: balanced.functions,
    });
  }

  if (declarations.length === 0) {
    return { ok: false, error: 'Declaration block is empty.' };
  }
  return { ok: true, declarations };
}

/** At-rules whose block body contains nested rules (not declarations). */
const CONDITIONAL_GROUP_AT_RULES = new Set([
  'media',
  'supports',
  'container',
  'layer',
  'scope',
  'document',
  'starting-style',
]);

/** At-rules whose block body contains declarations directly. */
const DECLARATION_AT_RULES = new Set(['font-face', 'page', 'property']);

function findMatchingRBrace(tokens: readonly Token[], lbraceIdx: number): number {
  let depth = 1;
  for (let i = lbraceIdx + 1; i < tokens.length; i++) {
    if (tokens[i].type === 'lbrace') depth++;
    else if (tokens[i].type === 'rbrace') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function parseRuleList(
  tokens: readonly Token[],
  depth: number,
  outRules: CssQualifiedRule[],
  outAtRules: CssAtRule[],
  outAtDeclarations: CssDeclaration[],
): { ok: true } | { ok: false; error: string } {
  if (depth > MAX_NESTING_DEPTH) {
    return { ok: false, error: 'CSS nesting depth exceeds limit.' };
  }

  let i = 0;
  while (i < tokens.length) {
    // Skip leading whitespace
    while (i < tokens.length && tokens[i].type === 'whitespace') i++;
    if (i >= tokens.length) break;

    if (tokens[i].type === 'rbrace' || tokens[i].type === 'lbrace') {
      return { ok: false, error: 'Unbalanced braces in CSS.' };
    }

    if (tokens[i].type === 'at-keyword') {
      const name = tokens[i].value.toLowerCase();
      i++;
      const preludeStart = i;
      let parenDepth = 0;
      let bracketDepth = 0;
      while (i < tokens.length) {
        const t = tokens[i];
        if (t.type === 'function' || t.type === 'lparen') parenDepth++;
        else if (t.type === 'rparen') parenDepth--;
        else if (t.type === 'lbracket') bracketDepth++;
        else if (t.type === 'rbracket') bracketDepth--;
        else if (parenDepth === 0 && bracketDepth === 0 && (t.type === 'semicolon' || t.type === 'lbrace' || t.type === 'rbrace')) {
          break;
        }
        i++;
      }

      const preludeTokens = tokens.slice(preludeStart, i);
      const balanced = extractFunctionsAndCheckBalance(preludeTokens);
      if (!balanced.ok) return balanced;

      outAtRules.push({
        name,
        prelude: tokensToDecodedText(preludeTokens),
        functions: balanced.functions,
      });

      if (i < tokens.length && tokens[i].type === 'semicolon') {
        i++;
        continue;
      }

      if (i < tokens.length && tokens[i].type === 'lbrace') {
        const rbrace = findMatchingRBrace(tokens, i);
        if (rbrace === -1) {
          return { ok: false, error: `Unclosed block for @${name}.` };
        }
        const blockTokens = tokens.slice(i + 1, rbrace);
        if (CONDITIONAL_GROUP_AT_RULES.has(name)) {
          if (blockTokens.every((t) => t.type === 'whitespace')) {
            return { ok: false, error: `Empty @${name} block.` };
          }
          const inner = parseRuleList(blockTokens, depth + 1, outRules, outAtRules, outAtDeclarations);
          if (!inner.ok) return inner;
        } else if (DECLARATION_AT_RULES.has(name)) {
          const decls = parseDeclarations(blockTokens);
          if (!decls.ok) return decls;
          outAtDeclarations.push(...decls.declarations);
        } else if (name === 'keyframes' || name === '-webkit-keyframes') {
          const inner = parseRuleList(blockTokens, depth + 1, outRules, outAtRules, outAtDeclarations);
          if (!inner.ok) return inner;
        } else {
          return { ok: false, error: `Unsupported at-rule block @${name}.` };
        }
        i = rbrace + 1;
        continue;
      }

      return { ok: false, error: `Unterminated at-rule @${name}.` };
    }

    // Qualified rule: prelude up to `{`
    const selStart = i;
    let parenDepth = 0;
    let bracketDepth = 0;
    while (i < tokens.length) {
      const t = tokens[i];
      if (t.type === 'function' || t.type === 'lparen') parenDepth++;
      else if (t.type === 'rparen') parenDepth--;
      else if (t.type === 'lbracket') bracketDepth++;
      else if (t.type === 'rbracket') bracketDepth--;
      else if (parenDepth === 0 && bracketDepth === 0 && (t.type === 'lbrace' || t.type === 'rbrace' || t.type === 'semicolon')) {
        break;
      }
      i++;
    }

    if (i >= tokens.length || tokens[i].type !== 'lbrace') {
      return { ok: false, error: 'Unexpected trailing tokens or missing rule block.' };
    }

    const selTokens = tokens.slice(selStart, i);
    const selBalanced = extractFunctionsAndCheckBalance(selTokens);
    if (!selBalanced.ok) return selBalanced;

    const selectorText = tokensToRawText(selTokens);
    if (!selectorText) {
      return { ok: false, error: 'Missing selector before rule block.' };
    }

    const rbrace = findMatchingRBrace(tokens, i);
    if (rbrace === -1) {
      return { ok: false, error: 'Unclosed CSS rule block.' };
    }

    const bodyTokens = tokens.slice(i + 1, rbrace);
    const decls = parseDeclarations(bodyTokens);
    if (!decls.ok) return decls;

    outRules.push({
      selectorText,
      declarations: decls.declarations,
    });
    i = rbrace + 1;
  }

  return { ok: true };
}

/** Parse a CSS patch (either bare declarations or one/more rules, including nested `@media`/`@supports`). */
export function parseCssPatch(rawCss: string): ParsedCssPatch {
  const tok = tokenizeCss(rawCss);
  if (!tok.ok) {
    return {
      valid: false,
      hasBraces: rawCss.includes('{') || rawCss.includes('}'),
      rules: [],
      atRules: [],
      bareDeclarations: [],
      error: tok.error,
    };
  }

  const tokens = tok.tokens;
  const nonWs = tokens.filter((t) => t.type !== 'whitespace');
  if (nonWs.length === 0) {
    return {
      valid: false,
      hasBraces: false,
      rules: [],
      atRules: [],
      bareDeclarations: [],
      error: 'CSS patch is empty.',
    };
  }

  const hasBraces = tokens.some((t) => t.type === 'lbrace' || t.type === 'rbrace');
  const hasTopAtKeyword = tokens.some((t) => t.type === 'at-keyword');

  if (!hasBraces && !hasTopAtKeyword) {
    const decls = parseDeclarations(tokens);
    if (!decls.ok) {
      return {
        valid: false,
        hasBraces: false,
        rules: [],
        atRules: [],
        bareDeclarations: [],
        error: decls.error,
      };
    }
    return {
      valid: true,
      hasBraces: false,
      rules: [],
      atRules: [],
      bareDeclarations: decls.declarations,
    };
  }

  const rules: CssQualifiedRule[] = [];
  const atRules: CssAtRule[] = [];
  const atDeclarations: CssDeclaration[] = [];
  const parsed = parseRuleList(tokens, 0, rules, atRules, atDeclarations);
  if (!parsed.ok) {
    return {
      valid: false,
      hasBraces,
      rules,
      atRules,
      bareDeclarations: atDeclarations,
      error: parsed.error,
    };
  }

  if (rules.length === 0 && atDeclarations.length === 0 && atRules.length === 0) {
    return {
      valid: false,
      hasBraces,
      rules,
      atRules,
      bareDeclarations: [],
      error: 'No CSS rules found.',
    };
  }

  return {
    valid: true,
    hasBraces,
    rules,
    atRules,
    bareDeclarations: atDeclarations,
  };
}

function isZeroNumericValue(raw: string): boolean {
  const cleaned = raw.trim().toLowerCase();
  if (/^[+-]?(?:0+(?:\.0*)?|\.0+)%?$/.test(cleaned)) {
    return true;
  }
  return false;
}

function hasZeroScaleTransform(functions: readonly CssFunctionCall[]): boolean {
  for (const fn of functions) {
    const name = fn.name;
    if (name === 'scale' || name === 'scalex' || name === 'scaley' || name === 'scalez' || name === 'scale3d') {
      const parts = fn.args
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.some((p) => isZeroNumericValue(p))) {
        return true;
      }
    } else if (name === 'matrix') {
      // matrix(a, b, c, d, tx, ty): zero scale if (a==0 && b==0) or (c==0 && d==0)
      const parts = fn.args
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (
        parts.length >= 4 &&
        ((isZeroNumericValue(parts[0]) && isZeroNumericValue(parts[1])) ||
          (isZeroNumericValue(parts[2]) && isZeroNumericValue(parts[3])))
      ) {
        return true;
      }
    } else if (name === 'matrix3d') {
      const parts = fn.args
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (
        parts.length === 16 &&
        ((isZeroNumericValue(parts[0]) && isZeroNumericValue(parts[1]) && isZeroNumericValue(parts[2])) ||
          (isZeroNumericValue(parts[4]) && isZeroNumericValue(parts[5]) && isZeroNumericValue(parts[6])))
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Inspects a parsed CSS AST (comment-stripped and escape-decoded) for
 * exfiltration, active execution, and visual-hiding rules.
 *
 * Returns a deduplicated list of static violation codes (never raw untrusted input).
 */
export function detectDangerousCss(parsed: ParsedCssPatch): string[] {
  const findings = new Set<string>();

  for (const at of parsed.atRules) {
    if (at.name === 'import') {
      findings.add('@import');
    }
    for (const fn of at.functions) {
      if (fn.name === 'url') findings.add('url()');
      if (fn.name === 'image-set' || fn.name === '-webkit-image-set') findings.add('image-set()');
      if (fn.name === 'expression') findings.add('expression()');
    }
  }

  const allDeclarations: CssDeclaration[] = [
    ...parsed.bareDeclarations,
    ...parsed.rules.flatMap((r) => r.declarations),
  ];

  for (const decl of allDeclarations) {
    const prop = decl.property;
    const valNorm = decl.value.trim().toLowerCase();

    for (const fn of decl.functions) {
      if (fn.name === 'url') findings.add('url()');
      if (fn.name === 'image-set' || fn.name === '-webkit-image-set') findings.add('image-set()');
      if (fn.name === 'expression') findings.add('expression()');
    }

    if (prop === '-moz-binding') {
      findings.add('-moz-binding');
    } else if (prop === 'behavior') {
      findings.add('behavior');
    } else if (prop === 'display' && valNorm === 'none') {
      findings.add(decl.important ? 'display: none !important' : 'display: none');
    } else if (prop === 'visibility' && (valNorm === 'hidden' || valNorm === 'collapse')) {
      findings.add(decl.important ? 'visibility: hidden !important' : 'visibility: hidden');
    } else if (prop === 'opacity' && isZeroNumericValue(valNorm)) {
      findings.add('opacity: 0');
    } else if (prop === 'clip-path' && valNorm !== 'none') {
      findings.add('clip-path');
    } else if (prop === 'content-visibility' && valNorm === 'hidden') {
      findings.add('content-visibility: hidden');
    } else if (prop === 'transform' && hasZeroScaleTransform(decl.functions)) {
      findings.add('transform: scale(0)');
    }
  }

  return Array.from(findings);
}
