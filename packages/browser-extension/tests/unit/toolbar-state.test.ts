import { describe, expect, it } from 'vitest';
import type browser from 'webextension-polyfill';
import { countTabBrowserRules, toolbarPresentation } from '../../src/background/toolbar-state';

const url = 'https://app.example.test/';
describe('toolbar state semantics', () => {
  it('shows idle for stopped tabs and blue for actual persistent browser rules', () => {
    expect(toolbarPresentation(url, { tabId: 1, phase: 'disabled' }, 0, 'en')).toMatchObject({ state: 'idle', badge: '' });
    expect(toolbarPresentation(url, { tabId: 1, phase: 'disabled' }, 2, 'en')).toEqual({
      state: 'rules', badge: '2', title: 'Forth Intercept\nTab session stopped\n2 persistent rules enabled',
    });
    expect(toolbarPresentation(url, { tabId: 1, phase: 'disabled' }, 120, 'en').badge).toBe('99+');
  });
  it.each([
    ['connected', 'ON', 'Tab session active'], ['connecting', '…', 'Connecting…'], ['error', '!', 'Tab session error'],
  ] as const)('shows %s without hiding independently active rules', (phase, badge, heading) => {
    const result = toolbarPresentation(url, { tabId: 1, phase, origin: new URL(url).origin }, 1, 'en');
    expect(result).toEqual({ state: phase, badge, title: `Forth Intercept\n${heading}\n1 persistent rules enabled` });
  });
  it('ignores a previous origin status and keeps unsupported tabs inactive', () => {
    const previous = { tabId: 1, phase: 'connected' as const, origin: 'https://other.example.test' };
    expect(toolbarPresentation(url, previous, 1, 'en').state).toBe('rules');
    for (const unsupported of [undefined, 'chrome://extensions', 'about:blank', 'file:///tmp/test.html']) {
      expect(toolbarPresentation(unsupported, previous, 1, 'en')).toEqual({ state: 'idle', badge: '', title: 'Forth Intercept\nSelect an HTTP or HTTPS tab.' });
    }
  });
  it('localizes both the session and persistent rule count', () => {
    expect(toolbarPresentation(url, { tabId: 1, phase: 'connected' }, 1, 'zh-CN').title).toBe('Forth Intercept\n本页调试已启动\n1 条持久规则已启用');
  });
  it('counts installed tab-scoped and wildcard browser rules, with exclusions', () => {
    const rules = [{ condition: { tabIds: [1] } }, { condition: { tabIds: [2] } }, { condition: {} }, { condition: { excludedTabIds: [1] } }] as browser.DeclarativeNetRequest.Rule[];
    expect(countTabBrowserRules(rules, 1)).toBe(2);
    expect(countTabBrowserRules(rules, 2)).toBe(3);
  });
});
