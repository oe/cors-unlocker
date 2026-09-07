import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';
import { migrateLegacyState } from '../../src/common/proxy-state';
import { EMPTY_QUICK_CONTROLS } from '../../src/common/quick-controls';

vi.mock('../../src/common/proxy-state', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/common/proxy-state')>(),
  ensureProxyAppState: vi.fn(async () => ({ rules: [], settings: { requestLogLimit: 500 } })),
}));
let storageChanged: (changes: any, area: string) => void;
let event: (source: any, method: string, params: any) => Promise<void>;
let engine: typeof import('../../src/background/advanced-proxy');
const debuggerApi = { attach: vi.fn(), detach: vi.fn(), sendCommand: vi.fn(), onEvent: { addListener: vi.fn() }, onDetach: { addListener: vi.fn() } };
const cache = { ...EMPTY_QUICK_CONTROLS, disableCache: true };
beforeAll(async () => {
  vi.stubGlobal('__TARGET__', 'chrome');
  chrome.debugger = debuggerApi as any;
  chrome.tabs.onRemoved = { addListener: vi.fn() } as any;
  engine = await import('../../src/background/advanced-proxy');
  event = debuggerApi.onEvent.addListener.mock.calls[0][0];
  storageChanged = vi.mocked(browser.storage.onChanged.addListener).mock.calls[0][0];
});
beforeEach(() => {
  vi.clearAllMocks();
  debuggerApi.attach.mockResolvedValue(undefined);
  debuggerApi.detach.mockResolvedValue(undefined);
  debuggerApi.sendCommand.mockResolvedValue(undefined);
  vi.mocked(browser.tabs.get).mockResolvedValue({ id: 9, url: 'https://example.com/' } as browser.Tabs.Tab);
});
afterEach(async () => { await engine.disableAdvancedProxy(9); });

describe('Chrome automatic debugger session lifetime', () => {
  it('restores caching and detaches after the final quick control is disabled', async () => {
    await engine.enableAdvancedProxy(9, { quickControls: cache });
    const result = await engine.updateQuickControls(9, { ...EMPTY_QUICK_CONTROLS, credentials: true });
    expect(result.phase).toBe('disabled');
    expect(debuggerApi.sendCommand).toHaveBeenLastCalledWith({ tabId: 9 }, 'Network.setCacheDisabled', { cacheDisabled: false });
    expect(debuggerApi.detach).toHaveBeenCalledTimes(1);
    expect(debuggerApi.detach).toHaveBeenCalledWith({ tabId: 9 });
    expect(debuggerApi.sendCommand.mock.invocationCallOrder.at(-1)).toBeLessThan(debuggerApi.detach.mock.invocationCallOrder[0]);
    expect(engine.getAdvancedProxyStatus(9).phase).toBe('disabled');
  });
  it.each(['cors', 'delayMs', 'failure'] as const)('keeps the session while %s is active', async (key) => {
    await engine.enableAdvancedProxy(9, { quickControls: cache });
    const next = { ...EMPTY_QUICK_CONTROLS, [key]: key === 'delayMs' ? 500 : true };
    expect((await engine.updateQuickControls(9, next)).phase).toBe('connected');
    expect(debuggerApi.detach).not.toHaveBeenCalled();
    expect((await engine.updateQuickControls(9, EMPTY_QUICK_CONTROLS)).phase).toBe('disabled');
  });
  it('preserves an explicitly started inspector session', async () => {
    await engine.enableAdvancedProxy(9);
    await engine.updateQuickControls(9, cache);
    expect((await engine.updateQuickControls(9, EMPTY_QUICK_CONTROLS)).phase).toBe('connected');
    expect(debuggerApi.detach).not.toHaveBeenCalled();
  });
  it('preserves an automatic session explicitly claimed by a manual start', async () => {
    await engine.enableAdvancedProxy(9, { quickControls: cache });
    await engine.enableAdvancedProxy(9);
    expect((await engine.updateQuickControls(9, EMPTY_QUICK_CONTROLS)).phase).toBe('connected');
    expect(debuggerApi.attach).toHaveBeenCalledTimes(1);
    expect(debuggerApi.detach).not.toHaveBeenCalled();
  });
});

it('uses Network only for cache and upgrades on explicit inspection', async () => {
  expect((await engine.enableAdvancedProxy(9, { quickControls: cache })).captureEnabled).toBe(false);
  expect(debuggerApi.sendCommand.mock.calls.some((call) => call[1] === 'Fetch.enable')).toBe(false);
  expect((await engine.enableAdvancedProxy(9)).captureEnabled).toBe(true);
  expect(debuggerApi.sendCommand.mock.calls.filter((call) => call[1] === 'Fetch.enable')).toHaveLength(1);
});
it('upgrades a cache session when request modifications are enabled', async () => {
  await engine.enableAdvancedProxy(9, { quickControls: cache });
  expect((await engine.updateQuickControls(9, { ...cache, cors: true })).captureEnabled).toBe(true);
  expect(debuggerApi.sendCommand.mock.calls.some((call) => call[1] === 'Fetch.enable')).toBe(true);
});
it('evicts the index as well as the visible log', async () => {
  engine.clearRequestLog(9);
  await engine.enableAdvancedProxy(9);
  const params = (id: string) => ({ requestId: id, resourceType: 'Fetch', request: { url: 'https://example.com/api', method: 'GET', headers: {} } });
  await event({ tabId: 9 }, 'Fetch.requestPaused', params('old'));
  const old = engine.getRequestLog(9)[0];
  for (let i = 0; i < 600; i++) await event({ tabId: 9 }, 'Fetch.requestPaused', params(String(i)));
  expect(engine.getRequestLog(9)).toHaveLength(500);
  await event({ tabId: 9 }, 'Fetch.requestPaused', { ...params('old'), responseStatusCode: 201 });
  expect(old.status).toBeUndefined();
});
it('releases delayed work immediately when the session stops', async () => {
  vi.useFakeTimers();
  try {
    await engine.enableAdvancedProxy(9, { quickControls: { ...cache, delayMs: 3000, failure: true } });
    const pending = event({ tabId: 9 }, 'Fetch.requestPaused', { requestId: 'waiting', resourceType: 'Fetch', request: { url: 'https://example.com/api', method: 'GET', headers: {} } });
    await engine.disableAdvancedProxy(9);
    await pending;
    expect(debuggerApi.sendCommand.mock.calls.some((call) => call[1] === 'Fetch.failRequest')).toBe(false);
  } finally { vi.useRealTimers(); }
});

it('starts interception when a saved site rule becomes enabled during cache-only mode', async () => {
  await engine.enableAdvancedProxy(9, { quickControls: cache });
  const state = migrateLegacyState([], {});
  state.rules = [{ id: 'new-mock', name: 'Mock', enabled: true, source: 'user', createdAt: 1, updatedAt: 1,
    match: { initiatorOrigins: ['https://example.com'], urlPattern: '*' },
    actions: [{ type: 'mockResponse', status: 200, body: '{}', headers: {} }] }];
  storageChanged({ proxyAppState: { newValue: state } }, 'local');
  await vi.waitFor(() => expect(engine.getAdvancedProxyStatus(9).captureEnabled).toBe(true));
  expect(debuggerApi.sendCommand.mock.calls.filter((call) => call[1] === 'Fetch.enable')).toHaveLength(1);
});
