import { describe, expect, it } from 'vitest';
import type browser from 'webextension-polyfill';
import { countTabBrowserRules, toolbarPresentation } from '../../src/background/toolbar-state';
import { EMPTY_QUICK_CONTROLS } from '../../src/common/quick-controls';
import { TEMPORARY_CORS_RULE_ID_BASE } from '../../src/common/session-dnr';

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
  it('explains a cache-only session without claiming to record requests', () => {
    const result = toolbarPresentation(url, {
      tabId: 1, phase: 'connected', captureEnabled: false,
      quickControls: { ...EMPTY_QUICK_CONTROLS, disableCache: true },
    }, 0, 'zh-CN');
    expect(result).toEqual({ state: 'connected', badge: 'ON', title: 'Forth Intercept\n本页调试已启动\n未开启请求记录\n当前页 · 临时\n• 禁用缓存\n0 条持久规则已启用' });
  });
  it('lists combined controls and capture independently of persistent rules', () => {
    expect(toolbarPresentation(url, {
      tabId: 1, phase: 'connected', captureEnabled: true,
      quickControls: { cors: true, credentials: true, disableCache: true, delayMs: 1000, failure: true },
    }, 2, 'en').title).toBe('Forth Intercept\nTab session active\nRecording requests\nThis tab · temporary\n• CORS repair · Allow credentials\n• Disable cache\n• Request delay: 1 s\n• Simulate failure\n2 persistent rules enabled');
  });
  it.each([[500, '500 ms'], [1000, '1 s'], [3000, '3 s']])('shows the applied delay of %s ms', (delayMs, duration) => {
    expect(toolbarPresentation(url, { tabId: 1, phase: 'connected', quickControls: { ...EMPTY_QUICK_CONTROLS, delayMs } }, 0, 'en').title)
      .toContain(`• Request delay: ${duration}`);
  });
  it('never describes credentials alone as an active feature', () => {
    const result = toolbarPresentation(url, { tabId: 1, phase: 'connected', quickControls: { ...EMPTY_QUICK_CONTROLS, credentials: true } }, 0, 'en');
    expect(result.title).not.toContain('Allow credentials');
    expect(result.title).not.toContain('temporary');
  });
  it('hides unapplied or stale control and capture details', () => {
    const status = { tabId: 1, captureEnabled: true, quickControls: { ...EMPTY_QUICK_CONTROLS, disableCache: true } };
    for (const phase of ['connecting', 'error', 'disabled'] as const) {
      const title = toolbarPresentation(url, { ...status, phase }, 0, 'en').title;
      expect(title).not.toContain('Disable cache');
      expect(title).not.toContain('Recording requests');
    }
    expect(toolbarPresentation(url, { ...status, phase: 'connected', origin: 'https://other.example.test' }, 1, 'en').title)
      .toBe('Forth Intercept\nTab session stopped\n1 persistent rules enabled');
  });
  it('counts installed tab-scoped and wildcard browser rules, with exclusions', () => {
    const rules = [{ condition: { tabIds: [1] } }, { condition: { tabIds: [2] } }, { condition: {} }, { condition: { excludedTabIds: [1] } }] as browser.DeclarativeNetRequest.Rule[];
    expect(countTabBrowserRules(rules, 1)).toBe(2);
    expect(countTabBrowserRules(rules, 2)).toBe(3);
    expect(countTabBrowserRules([...rules, { id: TEMPORARY_CORS_RULE_ID_BASE, condition: { tabIds: [1] } } as browser.DeclarativeNetRequest.Rule], 1)).toBe(2);
  });
});
