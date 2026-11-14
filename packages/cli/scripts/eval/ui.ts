/**
 * Rendered eval cases: one real landing page and labelled CSS/HTML mutations,
 * captured with Playwright Chromium at 1280×900.
 *
 * The page uses system fonts and inline CSS only, so it renders offline and
 * the same way on every run of the same browser build.
 */

import type { EvalCase } from './types.js';

const VIEWPORT = { width: 1280, height: 900 };

const BASE_CSS = `
  * { box-sizing: border-box; margin: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1f2937; background: #ffffff; }
  header { display: flex; align-items: center; justify-content: space-between; padding: 18px 48px; background: #0f172a; color: #fff; }
  header .logo { font-weight: 700; font-size: 22px; }
  header nav a { color: #cbd5e1; margin-left: 28px; text-decoration: none; font-size: 15px; }
  header .cta { background: #2563eb; color: #fff; padding: 10px 18px; border-radius: 8px; font-size: 15px; }
  .hero { padding: 72px 48px 56px; background: #f8fafc; }
  .hero h1 { font-size: 44px; max-width: 760px; line-height: 1.15; }
  .hero p { margin-top: 16px; font-size: 18px; color: #475569; max-width: 640px; }
  .hero .primary { display: inline-block; margin-top: 28px; background: #2563eb; color: #fff; padding: 14px 26px; border-radius: 10px; font-size: 17px; white-space: nowrap; }
  .pricing { display: flex; gap: 24px; padding: 48px; }
  .card { flex: 1; border: 1px solid #e2e8f0; border-radius: 14px; padding: 28px; background: #fff; }
  .card h3 { font-size: 20px; }
  .card .price { font-size: 36px; font-weight: 700; margin: 14px 0; }
  .card li { margin-top: 8px; color: #475569; list-style: none; }
  footer { padding: 28px 48px; background: #0f172a; color: #94a3b8; font-size: 14px; }
`;

const BODY = `
  <header>
    <div class="logo">Acme Cloud</div>
    <nav><a href="#">Product</a><a href="#">Pricing</a><a href="#">Docs</a><a href="#">Blog</a></nav>
    <div class="cta">Sign up</div>
  </header>
  <section class="hero">
    <h1>Ship visual changes with confidence</h1>
    <p>Catch layout breaks before your users do. Review every screenshot in one place.</p>
    <div class="primary">Start free trial</div>
  </section>
  <section class="pricing">
    <div class="card"><h3>Starter</h3><div class="price">$19</div><ul><li>5 projects</li><li>Email support</li></ul></div>
    <div class="card"><h3>Pro</h3><div class="price">$49</div><ul><li>Unlimited projects</li><li>Priority support</li></ul></div>
    <div class="card"><h3>Team</h3><div class="price">$99</div><ul><li>SSO</li><li>Audit log</li></ul></div>
  </section>
  <footer>© 2026 Acme Cloud · Privacy · Terms</footer>
`;

function html(extraCss = '', body = BODY): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}${extraCss}</style></head><body>${body}</body></html>`;
}

interface Mutation {
  id: string;
  description: string;
  expected: EvalCase['expected'];
  ambiguous?: boolean;
  css?: string;
  body?: string;
}

const MUTATIONS: Mutation[] = [
  { id: 'ui-nav-removed', description: 'Header navigation disappears', expected: ['regression'], css: 'header { display: none; }' },
  {
    id: 'ui-cta-clipped',
    description: 'Hero call-to-action is clipped to a sliver',
    expected: ['regression'],
    css: '.hero .primary { width: 64px; overflow: hidden; }',
  },
  {
    id: 'ui-cards-overlap',
    description: 'The Pro card slides over the Starter card and hides its text',
    expected: ['regression'],
    css: '.pricing .card:nth-child(2) { transform: translate(-300px, 56px); box-shadow: 0 8px 24px rgba(15, 23, 42, 0.18); }',
  },
  { id: 'ui-footer-missing', description: 'Footer is gone', expected: ['regression'], css: 'footer { display: none; }' },
  {
    id: 'ui-price-change',
    description: 'Pro price changes from $49 to $59',
    expected: ['content_update'],
    body: BODY.replace('$49', '$59'),
  },
  {
    id: 'ui-headline-copy',
    description: 'Hero headline copy is rewritten',
    expected: ['content_update'],
    body: BODY.replace('Ship visual changes with confidence', 'Review every UI change before it ships'),
  },
  {
    id: 'ui-dark-theme',
    description: 'Site-wide dark theme',
    expected: ['intentional'],
    css: `body { background: #020617; color: #e2e8f0; }
      .hero { background: #0b1220; } .hero p, .card li { color: #94a3b8; }
      .card { background: #0f172a; border-color: #1e293b; }`,
  },
  {
    id: 'ui-typography',
    description: 'Consistent typography change across the page',
    expected: ['intentional'],
    css: `body { font-family: Georgia, 'Times New Roman', serif; } .hero h1 { font-size: 48px; letter-spacing: -0.5px; }`,
  },
  {
    id: 'ui-cta-color',
    description: 'Only the hero button colour changes',
    expected: ['regression', 'intentional'],
    ambiguous: true,
    css: '.hero .primary { background: #16a34a; }',
  },
  {
    id: 'ui-banner-added',
    description: 'Announcement bar added above the header; everything moves down cleanly',
    expected: ['intentional', 'regression'],
    ambiguous: true,
    body: `<div style="background:#fef3c7;color:#92400e;padding:12px 48px;font-size:15px">New: team plans now include SSO.</div>${BODY}`,
  },
];

/** True when the Playwright Chromium binary can be launched. */
export async function canRenderUI(): Promise<boolean> {
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch();
    await browser.close();
    return true;
  } catch {
    return false;
  }
}

/** Renders HTML to a PNG at the eval viewport, optionally with an extra stylesheet. */
export async function renderHtml(
  page: import('playwright').Page,
  source: string,
  extraCss?: string,
): Promise<Buffer> {
  await page.setContent(source, { waitUntil: 'load' });
  if (extraCss) await page.addStyleTag({ content: extraCss });
  return Buffer.from(await page.screenshot({ type: 'png', fullPage: false, animations: 'disabled' }));
}

/** Renders the UI cases. Requires `npx playwright install chromium`. */
export async function uiCases(): Promise<EvalCase[]> {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const baseHtml = html();
    const before = await renderHtml(page, baseHtml);
    const cases: EvalCase[] = [];
    for (const m of MUTATIONS) {
      const afterHtml = html(m.css ?? '', m.body ?? BODY);
      cases.push({
        id: m.id,
        set: 'ui',
        description: m.description,
        expected: m.expected,
        ...(m.ambiguous ? { ambiguous: true } : {}),
        viewport: VIEWPORT.width,
        before,
        after: await renderHtml(page, afterHtml),
        html: { before: baseHtml, after: afterHtml },
      });
    }
    return cases;
  } finally {
    await browser.close();
  }
}
