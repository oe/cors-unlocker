import { beforeEach, describe, expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';
import type { IAdvancedProxyStatus } from '../../src/background/advanced-proxy';

vi.mock('../../src/background/toolbar-state', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/background/toolbar-state')>(),
  toolbarIcon: vi.fn(() => ({ '16': {}, '32': {} })),
}));
const action = { setIcon: vi.fn(), setTitle: vi.fn(), setBadgeText: vi.fn(), setBadgeBackgroundColor: vi.fn() };
const tab = { id: 1, url: 'https://app.example.test/' } as browser.Tabs.Tab;
let statuses: Map<number, IAdvancedProxyStatus>;
let toolbar: typeof import('../../src/background/toolbar-status');
beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks();
  Object.assign(browser, { action, i18n: { getUILanguage: () => 'en-US' } });
  for (const fn of Object.values(action)) fn.mockReset().mockResolvedValue(undefined);
  vi.mocked(browser.tabs.get).mockResolvedValue(tab);
  vi.mocked(browser.tabs.query).mockResolvedValue([tab]);
  vi.mocked(browser.storage.local.get).mockResolvedValue({ uiLanguage: 'en' });
  vi.mocked(browser.declarativeNetRequest.getSessionRules).mockResolvedValue([]);
  statuses = new Map();
  toolbar = await import('../../src/background/toolbar-status');
  toolbar.initializeToolbarStatus((tabId) => statuses.get(tabId) || { tabId, phase: 'disabled' });
  await toolbar.refreshAllToolbar();
  for (const fn of Object.values(action)) fn.mockClear();
});

describe('event-driven toolbar updates', () => {
  it('returns to blue after stopping a connected tab while a persistent rule remains', async () => {
    vi.mocked(browser.declarativeNetRequest.getSessionRules).mockResolvedValue([{ id: 1, condition: { tabIds: [1] }, action: { type: 'block' } }]);
    statuses.set(1, { tabId: 1, phase: 'connected' }); await toolbar.refreshToolbarTab(1);
    expect(action.setBadgeText).toHaveBeenLastCalledWith({ tabId: 1, text: 'ON' });
    statuses.set(1, { tabId: 1, phase: 'disabled' }); await toolbar.refreshToolbarTab(1);
    expect(action.setBadgeText).toHaveBeenLastCalledWith({ tabId: 1, text: '1' });
    expect(action.setBadgeBackgroundColor).toHaveBeenLastCalledWith({ tabId: 1, color: '#2563eb' });
    vi.mocked(browser.declarativeNetRequest.getSessionRules).mockResolvedValue([]); await toolbar.refreshToolbarTab(1);
    expect(action.setBadgeText).toHaveBeenLastCalledWith({ tabId: 1, text: '' });
  });
  it('restores every tab independently and never derives active rules from saved drafts', async () => {
    vi.mocked(browser.tabs.query).mockResolvedValue([tab, { id: 2, url: 'https://other.example.test/' } as browser.Tabs.Tab]);
    statuses.set(1, { tabId: 1, phase: 'connected', origin: new URL(tab.url!).origin });
    await toolbar.refreshAllToolbar();
    expect(action.setBadgeText).toHaveBeenCalledWith({ tabId: 1, text: 'ON' });
    expect(action.setBadgeText).toHaveBeenCalledWith({ tabId: 2, text: '' });
    expect(browser.storage.local.get).toHaveBeenLastCalledWith('uiLanguage');
  });
  it('skips identical paints and updates tooltips when the language preference changes', async () => {
    await toolbar.refreshToolbarTab(1); expect(action.setIcon).not.toHaveBeenCalled();
    vi.mocked(browser.storage.local.get).mockResolvedValue({ uiLanguage: 'zh-CN' });
    await toolbar.refreshAllToolbar();
    expect(action.setTitle).toHaveBeenLastCalledWith({ tabId: 1, title: 'Forth Intercept\n本页调试已停止\n0 条持久规则已启用' });
  });
  it('does not paint a tab closed while asynchronous lookups are pending', async () => {
    let finish!: (tab: browser.Tabs.Tab) => void;
    vi.mocked(browser.tabs.get).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    statuses.set(1, { tabId: 1, phase: 'connected' });
    const pending = toolbar.refreshToolbarTab(1);
    await vi.waitFor(() => expect(finish).toBeDefined());
    toolbar.forgetToolbarTab(1); finish(tab); await pending;
    expect(action.setIcon).not.toHaveBeenCalled(); expect(action.setTitle).not.toHaveBeenCalled();
  });
  it('serializes native writes so a delayed connecting paint cannot replace a connected icon', async () => {
    let finish!: () => void;
    action.setIcon.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    statuses.set(1, { tabId: 1, phase: 'connecting' });
    const connecting = toolbar.refreshToolbarTab(1);
    await vi.waitFor(() => expect(finish).toBeDefined());
    statuses.set(1, { tabId: 1, phase: 'connected' });
    const connected = toolbar.refreshToolbarTab(1);
    finish(); await connecting; await connected;
    expect(action.setBadgeText.mock.calls.map(([details]) => details.text)).toEqual(['…', 'ON']);
    expect(action.setTitle).toHaveBeenLastCalledWith({ tabId: 1, title: 'Forth Intercept\nTab session active\n0 persistent rules enabled' });
  });
  it('recovers from native icon API failures without rejecting the proxy operation', async () => {
    statuses.set(1, { tabId: 1, phase: 'error' });
    action.setIcon.mockRejectedValueOnce(new Error('Native action failure'));
    await expect(toolbar.refreshToolbarTab(1)).resolves.toBeUndefined();
    await toolbar.refreshToolbarTab(1);
    expect(action.setIcon).toHaveBeenCalledTimes(2);
    expect(action.setBadgeText).toHaveBeenLastCalledWith({ tabId: 1, text: '!' });
  });
});
