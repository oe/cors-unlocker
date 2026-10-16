import { describe, expect, it } from 'vitest';
import { hasRuntimeRules } from '../../src/common/quick-controls';
import { effectiveRules, migrateLegacyState, type IProxyRule } from '../../src/common/proxy-state';
const origin = 'https://app.example';
const rule = (enabled = true): IProxyRule => ({
  id: 'mock', name: 'Mock', enabled, source: 'user', createdAt: 1, updatedAt: 1,
  match: { initiatorOrigins: [origin], urlPattern: 'https://api.example/*' },
  actions: [{ type: 'mockResponse', status: 200, headers: {}, body: '{}' }],
});
describe('automatic saved-rule execution policy', () => {
  it('does not attach for a disabled draft or an unrelated origin', () => {
    expect(hasRuntimeRules([rule(false)], origin)).toBe(false);
    expect(hasRuntimeRules([rule()], 'https://unrelated.example')).toBe(false);
    expect(hasRuntimeRules([rule()], origin)).toBe(true);
  });
  it('pauses and resumes the group without changing individual rule switches', () => {
    const state = migrateLegacyState([], {}, 1);
    state.rules = [rule()];
    state.profiles = [{ id: 'group', name: 'Staging', enabled: false, ruleIds: ['mock'] }];
    expect(hasRuntimeRules(effectiveRules(state), origin)).toBe(false);
    expect(state.rules[0].enabled).toBe(true);
    state.profiles[0].enabled = true;
    expect(hasRuntimeRules(effectiveRules(state), origin)).toBe(true);
  });
  it('keeps simple browser actions free of debugger connections', () => {
    const header = { ...rule(), actions: [{ type: 'setRequestHeaders' as const, headers: { 'X-Test': 'yes' } }] };
    expect(hasRuntimeRules([header], origin)).toBe(false);
    expect(hasRuntimeRules([{ ...rule(), match: { ...rule().match, initiatorOrigins: ['*'] } }], 'https://another.example')).toBe(true);
  });
});
