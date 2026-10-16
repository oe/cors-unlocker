import { describe, expect, it } from 'vitest';
import { migrateLegacyState, type IProxyRule } from '../../src/common/proxy-state';
import { summarizeTabRules } from '../../src/common/tab-rule-summary';
import { toolbarPresentation } from '../../src/background/toolbar-state';
import { EMPTY_QUICK_CONTROLS } from '../../src/common/quick-controls';

const origin = 'https://app.example';
const rule = (id: string, overrides: Partial<IProxyRule> = {}): IProxyRule => ({
  id, name: id, enabled: true, source: 'user', createdAt: 1, updatedAt: 1,
  match: { initiatorOrigins: [origin], urlPattern: '*' }, actions: [{ type: 'delay', milliseconds: 500 }], ...overrides,
});

describe('toolbar and popup group summary', () => {
  it('separates paused rules from enabled session rules and ignores other origins', () => {
    const state = migrateLegacyState([], {}, 1);
    state.rules = [rule('paused'), rule('waiting'), rule('off', { enabled: false }), rule('other', { match: { initiatorOrigins: ['https://other.example'], urlPattern: '*' } })];
    state.profiles = [{ id: 'staging', name: 'Staging', enabled: false, ruleIds: ['paused', 'off'] }, { id: 'other', name: 'Other', enabled: false, ruleIds: ['other'] }];
    expect(summarizeTabRules(state, origin)).toEqual({ enabledRules: 1, pausedGroups: ['Staging'], pausedRules: 1, sessionRules: 1 });
    expect(summarizeTabRules(state, '')).toEqual({ enabledRules: 0, pausedGroups: [], pausedRules: 0, sessionRules: 0 });
    expect(state.rules[0].enabled).toBe(true);
  });
  it('gates wildcard groups but does not count persistent-only rules as waiting', () => {
    const state = migrateLegacyState([], {}, 1);
    state.rules = [rule('global', { match: { initiatorOrigins: ['*'], urlPattern: '*' } }), rule('header', { actions: [{ type: 'setRequestHeaders', headers: { 'X-Debug': 'yes' } }] })];
    state.profiles = [{ id: 'all', name: 'Global', enabled: false, ruleIds: ['global'] }];
    expect(summarizeTabRules(state, 'https://any.example')).toEqual({ enabledRules: 0, pausedGroups: ['Global'], pausedRules: 1, sessionRules: 0 });
    expect(summarizeTabRules({ ...state, profiles: [] }, origin).sessionRules).toBe(1);
  });
  it('shows OFF only when the paused group explains why no saved changes are active', () => {
    const summary = { pausedGroups: ['Staging'], pausedRules: 2, sessionRules: 0 };
    expect(toolbarPresentation(origin, { tabId: 1, phase: 'disabled' }, 0, 'en', summary)).toMatchObject({ state: 'idle', badge: 'OFF' });
    expect(toolbarPresentation(origin, { tabId: 1, phase: 'disabled' }, 1, 'en', summary)).toMatchObject({ state: 'rules', badge: '1' });
    expect(toolbarPresentation(origin, { tabId: 1, phase: 'disabled' }, 0, 'en', { ...summary, sessionRules: 1 }).badge).toBe('');
    expect(toolbarPresentation(origin, { tabId: 1, phase: 'disabled' }, 0, 'en', { ...summary, pausedRules: 0 }).badge).toBe('');
  });
  it('keeps temporary controls active while explaining paused groups', () => {
    const result = toolbarPresentation(origin, { tabId: 1, phase: 'connected', quickControls: { ...EMPTY_QUICK_CONTROLS, disableCache: true } }, 0, 'zh-CN', { pausedGroups: ['Staging'], pausedRules: 2, sessionRules: 1 });
    expect(result).toMatchObject({ state: 'connected', badge: 'ON' });
    expect(result.title).toContain('禁用缓存');
    expect(result.title).toContain('1 个分组已暂停');
    expect(result.title).not.toContain('等待连接');
  });
  it('offers useful waiting and error hints without letting names inject tooltip lines', () => {
    const result = toolbarPresentation(origin, { tabId: 1, phase: 'error', error: 'Debugger unavailable' }, 0, 'en', { pausedGroups: ['Staging\nFake status'], pausedRules: 1, sessionRules: 2 });
    expect(result).toMatchObject({ state: 'error', badge: '!' });
    expect(result.title).toContain('Preparing enabled rules');
    expect(result.title).toContain('• Staging Fake status');
    expect(result.title).toContain('Debugger unavailable');
    expect(result.title).toContain('Click for rules and temporary changes');
    expect(toolbarPresentation('chrome://extensions', { tabId: 1, phase: 'error' }, 0, 'en', { pausedGroups: ['Staging'], pausedRules: 1, sessionRules: 2 }).title).not.toContain('Staging');
  });
});
