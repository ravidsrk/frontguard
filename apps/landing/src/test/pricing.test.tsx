/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fireEvent, render, screen, within } from './test-utils';
import { afterEach, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { Component as Pricing } from '../routes/pricing';

function renderPricing() {
  return render(
    <MemoryRouter>
      <Pricing />
    </MemoryRouter>,
  );
}

// navigator.clipboard is a getter-only property in jsdom; override it explicitly.
function setClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value });
}

describe('/pricing', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setClipboard(undefined);
  });

  it('renders the hero with the free-forever pill and the 54px h1', () => {
    renderPricing();
    expect(screen.getByText(/the CLI is free forever · MIT/i)).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: /pricing that respects open source/i }),
    ).toBeInTheDocument();
  });

  it('renders three tiers with floor-correct CTAs and external-link hygiene', () => {
    renderPricing();

    // Open Source -> install anchor: internal, no new tab, no rel.
    const install = screen.getByRole('link', { name: /npm install @frontguard\/cli/i });
    expect(install).toHaveAttribute('href', '/#install');
    expect(install).not.toHaveAttribute('target');
    expect(install).not.toHaveAttribute('rel');

    // Pro -> external signup: new tab + rel hygiene.
    const trial = screen.getByRole('link', { name: /start 14-day trial/i });
    expect(trial).toHaveAttribute('href', 'https://app.frontguard.dev/signup');
    expect(trial).toHaveAttribute('target', '_blank');
    expect(trial).toHaveAttribute('rel', 'noopener noreferrer');

    // Team -> mailto enterprise: new tab + rel hygiene.
    const contact = screen.getByRole('link', { name: /contact us/i });
    expect(contact).toHaveAttribute('href', 'mailto:hello@frontguard.dev?subject=Enterprise%20Frontguard');
    expect(contact).toHaveAttribute('target', '_blank');
    expect(contact).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('flags the featured Pro tier with a "most popular" badge', () => {
    renderPricing();
    expect(screen.getByText(/most popular/i)).toBeInTheDocument();
  });

  it('renders all eight FAQ questions as native <details> accordions', () => {
    renderPricing();
    const questions = [
      'How do I install Frontguard?',
      'How does Frontguard handle cross-OS rendering differences?',
      'Can I self-host the cloud?',
      'What environment variables does Frontguard read?',
      'OpenAI or Anthropic — which should I use?',
      'Does Frontguard work with Storybook?',
      'Is there an MCP server for in-IDE agents?',
      "What's the data retention policy for screenshots?",
    ];
    for (const q of questions) {
      expect(screen.getByText(q)).toBeInTheDocument();
    }
    expect(document.querySelectorAll('details')).toHaveLength(8);
  });

  it('emits a FAQPage JSON-LD block covering the same eight questions', () => {
    const { container } = renderPricing();
    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script).not.toBeNull();
    const data = JSON.parse(script!.innerHTML);
    expect(data['@type']).toBe('FAQPage');
    expect(data.mainEntity).toHaveLength(8);
    expect(data.mainEntity[0].name).toBe('How do I install Frontguard?');
    expect(data.mainEntity[0].acceptedAnswer.text).toMatch(/npm install @frontguard\/cli/);
    // The escaped angle bracket round-trips back to a real "<" after parsing.
    expect(data.mainEntity[0].acceptedAnswer.text).toContain('<your URL>');
  });

  it('maps the compare-plans matrix cells to the correct status colors', () => {
    renderPricing();
    const table = screen.getByRole('table');

    // ✓ glyphs are pass-green (color lives on the wrapping span).
    const checks = within(table).getAllByText('✓');
    expect(checks.length).toBeGreaterThan(0);
    checks.forEach((c) => expect(c.parentElement).toHaveClass('text-pass'));

    // Managed-storage R2 cells are amber; both Pro and Team carry it.
    const r2 = within(table).getAllByText('R2');
    expect(r2).toHaveLength(2);
    r2.forEach((c) => expect(c).toHaveClass('text-amber'));

    // Unavailable cells render an em dash in the muted ink tone, not ✕.
    const dashes = within(table).getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
    dashes.forEach((c) => expect(c).toHaveClass('text-ink-soft'));

    // The Pro column header is the emphasized (amber) column.
    expect(within(table).getByText('Pro')).toHaveClass('text-amber');
  });

  it('renders an accessible compare-plans table with a caption and column scopes', () => {
    renderPricing();
    const table = screen.getByRole('table');
    expect(within(table).getByText(/frontguard plan comparison/i)).toBeInTheDocument();
    expect(within(table).getAllByRole('columnheader')).toHaveLength(4);
    // Nine capability rows render as row headers.
    expect(within(table).getAllByRole('rowheader')).toHaveLength(9);
  });

  it('copies the install command from the CTA band', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });

    renderPricing();
    const copyBtn = screen.getByRole('button', {
      name: /copy command: npm install @frontguard\/cli/i,
    });
    fireEvent.click(copyBtn);

    expect(await screen.findByText('copied ✓')).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith('npm install @frontguard/cli');
  });
});

/**
 * Guards claim-5: every gated feature bullet rendered on a pricing tier card
 * MUST resolve to `hasFeature(plan, key) === true` for that tier's plan id.
 *
 * The source of truth for plan gating is packages/cloud-api/src/billing/plans.ts.
 * apps/landing does not depend on @frontguard/cloud-api, so rather than import
 * the module we read its source from disk and extract the two boolean flags per
 * plan — the test therefore tracks the REAL gating and cannot drift from a copy.
 *
 * FEATURE_KEYS maps each bullet string to the hasFeature() key it promises
 * (null = not plan-gated, skipped). If a new bullet is added to the page, the
 * first test below fails until the mapping is updated — forcing a deliberate
 * choice about whether the new claim is actually granted by the plan.
 */
describe('pricing feature claims map to hasFeature()', () => {
  const plansSource = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../../../../packages/cloud-api/src/billing/plans.ts'),
    'utf8',
  );

  type PlanId = 'free' | 'pro' | 'business';
  type FeatureKey = 'productionMonitoring' | 'ssoSaml';

  /** Extract the productionMonitoring/ssoSaml flags for a plan straight from plans.ts. */
  function planFlags(id: PlanId): Record<FeatureKey, boolean> {
    const m = plansSource.match(
      new RegExp(`id:\\s*'${id}'[\\s\\S]*?productionMonitoring:\\s*(true|false)[\\s\\S]*?ssoSaml:\\s*(true|false)`),
    );
    if (!m) throw new Error(`plans.ts: could not parse limits for plan '${id}'`);
    return { productionMonitoring: m[1] === 'true', ssoSaml: m[2] === 'true' };
  }

  /** Mirror of packages/cloud-api hasFeature(), reading the on-disk flags. */
  function hasFeature(id: PlanId, key: FeatureKey): boolean {
    return planFlags(id)[key];
  }

  /** Each pricing tier card label -> the billing plan id it sells. */
  const TIER_PLAN: Record<string, PlanId> = {
    'OPEN SOURCE': 'free',
    PRO: 'pro',
    TEAM: 'business',
  };

  /** Bullet string -> the gated hasFeature() key it requires (null = not gated). */
  const FEATURE_KEYS: Record<string, FeatureKey | null> = {
    'Production monitoring scheduler': 'productionMonitoring',
    'SSO & dedicated support': 'ssoSaml',
    // Bullets that are not plan-gated map to null and are skipped.
    'Unlimited screenshots & routes': null,
    'Multi-browser & multi-viewport': null,
    'AI analysis (bring your own key)': null,
    'AI fix generation + sandbox verification': null,
    'Git-native baselines': null,
    'GitHub Action + PR comments': null,
    'All 5 plugins, self-hostable': null,
    'Hosted dashboard & report history': null,
    'Managed baseline storage (R2)': null,
    'Slack & PagerDuty alerts': null,
    'Cross-OS reference rendering': null,
    'Priority support': null,
    'Teams, roles & invitations': null,
    'Baseline approval workflows': null,
    'Activity feed & audit log': null,
    'Usage metering & seat billing': null,
    'OpenTelemetry metrics export': null,
  };

  /** Read the rendered feature bullets for a tier card, by its label. */
  function bulletsFor(tierName: string): string[] {
    const card = screen.getByText(tierName, { exact: true }).parentElement!;
    return within(card)
      .getAllByRole('listitem')
      .map((li) => li.textContent!.replace('✓', '').replace(/\s+/g, ' ').trim());
  }

  it('parses real productionMonitoring/ssoSaml gating from plans.ts (pro is gated, business is not)', () => {
    expect(hasFeature('pro', 'productionMonitoring')).toBe(false);
    expect(hasFeature('business', 'productionMonitoring')).toBe(true);
    expect(hasFeature('business', 'ssoSaml')).toBe(true);
  });

  it('declares every rendered pricing bullet in the FEATURE_KEYS mapping', () => {
    renderPricing();
    for (const tierName of Object.keys(TIER_PLAN)) {
      for (const bullet of bulletsFor(tierName)) {
        expect(
          Object.keys(FEATURE_KEYS),
          `pricing bullet "${bullet}" (${tierName}) is unmapped — add it to FEATURE_KEYS (key or null)`,
        ).toContain(bullet);
      }
    }
  });

  it('only advertises a gated capability on a tier whose plan grants it', () => {
    renderPricing();
    for (const [tierName, planId] of Object.entries(TIER_PLAN)) {
      for (const bullet of bulletsFor(tierName)) {
        const key = FEATURE_KEYS[bullet];
        if (!key) continue;
        expect(
          hasFeature(planId, key),
          `${tierName} (plan "${planId}") advertises "${bullet}" but hasFeature(${planId}, ${key}) is false in plans.ts`,
        ).toBe(true);
      }
    }
  });
});
