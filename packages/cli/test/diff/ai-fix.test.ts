import { describe, it, expect } from 'vitest';
import { parseFixResponse, FIX_SYSTEM_PROMPT, AIFixError } from '../../src/diff/ai-fix.js';

describe('parseFixResponse', () => {
  it('parses a valid overflow fix', () => {
    const raw = JSON.stringify({
      fixType: 'css',
      category: 'overflow-fix',
      patch: '.card { overflow: hidden; text-overflow: ellipsis; }',
      confidence: 0.85,
      explanation: 'Text overflowed the card.',
      target: '.card',
    });
    const fix = parseFixResponse(raw);
    expect(fix).not.toBeNull();
    expect(fix!.category).toBe('overflow-fix');
    expect(fix!.fixType).toBe('css');
    expect(fix!.confidence).toBe(0.85);
    expect(fix!.patch).toContain('overflow: hidden');
    expect(fix!.target).toBe('.card');
  });

  it('strips markdown code fences', () => {
    const raw = '```json\n{"fixType":"css","category":"spacing-fix","patch":".x{margin:0}","confidence":0.7,"explanation":"e"}\n```';
    const fix = parseFixResponse(raw);
    expect(fix).not.toBeNull();
    expect(fix!.category).toBe('spacing-fix');
  });

  it('handles leading/trailing prose around JSON', () => {
    const raw = 'Here is the fix:\n{"fixType":"css","category":"font-fix","patch":"body{font-size:16px}","confidence":0.6,"explanation":"e"} Hope this helps!';
    const fix = parseFixResponse(raw);
    expect(fix).not.toBeNull();
    expect(fix!.category).toBe('font-fix');
  });

  it('returns null for confidence 0 (no-fix signal)', () => {
    const raw = JSON.stringify({ fixType: 'css', category: 'other', patch: '', confidence: 0, explanation: 'cannot determine' });
    expect(parseFixResponse(raw)).toBeNull();
  });

  it('returns null for empty patch', () => {
    const raw = JSON.stringify({ fixType: 'css', category: 'other', patch: '   ', confidence: 0.9, explanation: 'x' });
    expect(parseFixResponse(raw)).toBeNull();
  });

  it('clamps confidence to [0,1]', () => {
    const raw = JSON.stringify({ fixType: 'css', category: 'z-index-fix', patch: '.m{z-index:10}', confidence: 1.5, explanation: 'e' });
    expect(parseFixResponse(raw)!.confidence).toBe(1);
  });

  it('defaults invalid category to "other"', () => {
    const raw = JSON.stringify({ fixType: 'css', category: 'made-up', patch: '.a{color:red}', confidence: 0.5, explanation: 'e' });
    expect(parseFixResponse(raw)!.category).toBe('other');
  });

  it('defaults invalid fixType to "css"', () => {
    const raw = JSON.stringify({ fixType: 'sql', category: 'other', patch: '.a{color:red}', confidence: 0.5, explanation: 'e' });
    expect(parseFixResponse(raw)!.fixType).toBe('css');
  });

  it('throws AIFixError when no JSON object present', () => {
    expect(() => parseFixResponse('no json here')).toThrow(AIFixError);
  });

  it('throws AIFixError on malformed JSON', () => {
    expect(() => parseFixResponse('{ this is not valid json }')).toThrow(AIFixError);
  });

  it('provides a default explanation when missing', () => {
    const raw = JSON.stringify({ fixType: 'css', category: 'spacing-fix', patch: '.a{margin:4px}', confidence: 0.5 });
    expect(parseFixResponse(raw)!.explanation).toBeTruthy();
  });
});

describe('FIX_SYSTEM_PROMPT', () => {
  it('instructs minimal CSS patches and the JSON schema', () => {
    expect(FIX_SYSTEM_PROMPT).toContain('SMALLEST possible CSS patch');
    expect(FIX_SYSTEM_PROMPT).toContain('overflow-fix');
    expect(FIX_SYSTEM_PROMPT).toContain('confidence');
  });
});
