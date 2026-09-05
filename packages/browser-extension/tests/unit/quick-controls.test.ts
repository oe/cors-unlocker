import { describe, expect, it } from 'vitest';
import { EMPTY_QUICK_CONTROLS, parseQuickControls, quickControlRules } from '../../src/common/quick-controls';

describe('temporary quick controls', () => {
  it('rejects unsupported values instead of creating unbounded delays or implicit controls', () => {
    for (const value of [null, {}, { ...EMPTY_QUICK_CONTROLS, delayMs: 30_000 }, { ...EMPTY_QUICK_CONTROLS, cors: 'true' }, { ...EMPTY_QUICK_CONTROLS, disableCache: 'true' }]) {
      expect(() => parseQuickControls(value)).toThrow();
    }
    expect(quickControlRules('https://example.com', EMPTY_QUICK_CONTROLS)).toEqual([]);
  });
  it('scopes failure and delay to APIs, while including preflights only for CORS', () => {
    const rules = quickControlRules('https://example.com', { disableCache: false, cors: true, credentials: true, delayMs: 1000, failure: true });
    expect(rules).toHaveLength(3);
    expect(rules.every((rule) => rule.match.initiatorOrigins[0] === 'https://example.com')).toBe(true);
    expect(rules[0].match.resourceTypes).toContain('Preflight');
    expect(rules.slice(1).every((rule) => !rule.match.resourceTypes?.includes('Preflight'))).toBe(true);
    expect(rules[0].actions[0]).toMatchObject({ allowCredentials: true, allowOrigin: 'initiator' });
  });
});


it('defaults omitted cache flags to off for existing v2 session callers', () => {
  expect(parseQuickControls({ cors: false, credentials: false, delayMs: 0, failure: false }).disableCache).toBe(false);
});
