import { describe, it, expect } from 'vitest';
import {
  parseAxeResults,
  meetsImpactThreshold,
  normalizeImpact,
  countFailingViolations,
  createAccessibilityPlugin,
  ACCESSIBILITY_RESULTS_KEY,
  type RawAxeResults,
} from '../../src/plugins/accessibility.js';
import type { PluginContext } from '../../src/core/plugins.js';
import type { AccessibilityResult, FrontguardConfig } from '../../src/core/types.js';

const rawSample: RawAxeResults = {
  violations: [
    {
      id: 'color-contrast',
      impact: 'serious',
      description: 'Elements must have sufficient color contrast',
      help: 'Ensure contrast ratio',
      helpUrl: 'https://dequeuniversity.com/rules/axe/4.0/color-contrast',
      nodes: [{ target: ['.btn'], failureSummary: 'low contrast', html: '<button>' }],
    },
    {
      id: 'image-alt',
      impact: 'critical',
      description: 'Images must have alt text',
      help: 'Add alt attribute',
      helpUrl: 'https://example.com/image-alt',
      nodes: [{ target: ['img.logo'] }],
    },
    {
      id: 'landmark-one-main',
      impact: 'moderate',
      description: 'Document should have one main landmark',
      help: 'Add main',
      helpUrl: 'https://example.com/landmark',
      nodes: [{ target: ['body'] }],
    },
  ],
  passes: [{}, {}, {}],
  incomplete: [{}],
};

describe('normalizeImpact', () => {
  it('passes through valid impacts', () => {
    expect(normalizeImpact('critical')).toBe('critical');
    expect(normalizeImpact('serious')).toBe('serious');
  });
  it('defaults unknown/null to minor', () => {
    expect(normalizeImpact(null)).toBe('minor');
    expect(normalizeImpact('weird')).toBe('minor');
  });
});

describe('meetsImpactThreshold', () => {
  it('compares severity correctly', () => {
    expect(meetsImpactThreshold('critical', 'serious')).toBe(true);
    expect(meetsImpactThreshold('minor', 'serious')).toBe(false);
    expect(meetsImpactThreshold('serious', 'serious')).toBe(true);
  });
});

describe('parseAxeResults', () => {
  it('parses all violations with default (minor) threshold', () => {
    const r = parseAxeResults(rawSample, '/home', 1440);
    expect(r.route).toBe('/home');
    expect(r.viewport).toBe(1440);
    expect(r.violations).toHaveLength(3);
    expect(r.passes).toBe(3);
    expect(r.incomplete).toBe(1);
    expect(r.violations[0].nodes[0].target).toEqual(['.btn']);
  });

  it('filters by impact threshold', () => {
    const r = parseAxeResults(rawSample, '/home', 1440, { impact: 'serious' });
    // moderate dropped, serious + critical kept
    expect(r.violations.map((v) => v.id).sort()).toEqual(['color-contrast', 'image-alt']);
  });

  it('applies rule allowlist', () => {
    const r = parseAxeResults(rawSample, '/home', 1440, { rules: ['image-alt'] });
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0].id).toBe('image-alt');
  });

  it('applies rule denylist', () => {
    const r = parseAxeResults(rawSample, '/home', 1440, { excludeRules: ['color-contrast'] });
    expect(r.violations.map((v) => v.id)).not.toContain('color-contrast');
  });

  it('handles empty results', () => {
    const r = parseAxeResults({ violations: [] }, '/x', 375);
    expect(r.violations).toHaveLength(0);
    expect(r.passes).toBe(0);
  });
});

describe('countFailingViolations', () => {
  const results: AccessibilityResult[] = [parseAxeResults(rawSample, '/home', 1440)];

  it('returns 0 when failOnViolation is off', () => {
    expect(countFailingViolations(results, {})).toBe(0);
  });

  it('counts serious+ when failOnViolation is on (default serious)', () => {
    // serious + critical
    expect(countFailingViolations(results, { failOnViolation: true })).toBe(2);
  });

  it('respects a higher impact threshold', () => {
    expect(countFailingViolations(results, { failOnViolation: true, impact: 'critical' })).toBe(1);
  });
});

describe('createAccessibilityPlugin', () => {
  it('has the correct name', () => {
    expect(createAccessibilityPlugin().name).toBe('accessibility');
  });

  it('setup initializes metadata and warns gracefully without axe', async () => {
    const plugin = createAccessibilityPlugin();
    const ctx: PluginContext = {
      config: { baseUrl: 'http://localhost:3000' } as unknown as FrontguardConfig,
      logger: console as unknown as PluginContext['logger'],
      metadata: new Map(),
    };
    await plugin.setup!(ctx);
    expect(ctx.metadata.get(ACCESSIBILITY_RESULTS_KEY)).toEqual([]);
  });

  it('afterRender is a no-op when axe is unavailable (does not throw)', async () => {
    const plugin = createAccessibilityPlugin();
    const ctx: PluginContext = {
      config: { baseUrl: 'http://localhost:3000' } as unknown as FrontguardConfig,
      logger: console as unknown as PluginContext['logger'],
      metadata: new Map(),
    };
    await plugin.setup!(ctx);
    // axe not installed in test env → afterRender returns without throwing
    await expect(plugin.afterRender!([], ctx)).resolves.toBeUndefined();
  });
});
