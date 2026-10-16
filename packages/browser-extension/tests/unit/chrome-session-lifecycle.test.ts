import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';
import { ensureProxyAppState, migrateLegacyState } from '../../src/common/proxy-state';
import { EMPTY_QUICK_CONTROLS } from '../../src/common/quick-controls';

vi.mock('../../src/common/proxy-state', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/common/proxy-state')>(),
  ensureProxyAppState: vi.fn(async () => ({ rules: [], profiles: [], settings: { requestLogLimit: 500 } })),
}));
let storageChanged: (changes: any, area: string) => void;
let tabUpdated: (tabId: number, changes: browser.Tabs.OnUpdatedChangeInfoType) => void;
let event: (source: any, method: string, params: any) => Promise<void>;
let removed: (tabId: number) => void;
let engine: typeof import('../../src/background/advanced-proxy');
const debuggerApi = { attach: vi.fn(), detach: vi.fn(), sendCommand: vi.fn(), onEvent: { addListener: vi.fn() }, onDetach: { addListener: vi.fn() } };
const cache = { ...EMPTY_QUICK_CONTROLS, disableCache: true };
beforeAll(async () => {
  vi.stubGlobal('__TARGET__', 'chrome');
  chrome.debugger = debuggerApi as any;
  chrome.tabs.onRemoved = { addListener: vi.fn() } as any;
  engine = await import('../../src/background/advanced-proxy');
  event = debuggerApi.onEvent.addListener.mock.calls[0][0];
  removed = vi.mocked(chrome.tabs.onRemoved.addListener).mock.calls[0][0];
  storageChanged = vi.mocked(browser.storage.onChanged.addListener).mock.calls[0][0];
  tabUpdated = vi.mocked(browser.tabs.onUpdated.addListener).mock.calls[0][0];
});
beforeEach(() => {
  vi.clearAllMocks();
  debuggerApi.attach.mockResolvedValue(undefined);
  debuggerApi.detach.mockResolvedValue(undefined);
  debuggerApi.sendCommand.mockResolvedValue(undefined);
  vi.mocked(browser.tabs.get).mockResolvedValue({ id: 9, url: 'https://example.com/' } as browser.Tabs.Tab);
});
afterEach(async () => { await engine.disableAdvancedProxyTransport(9); });

describe('pending Chrome attachments', () => {
  it.each(['navigation', 'stop', 'close'] as const)('cancels a pending attachment on %s', async (reason) => {
    let finish!: () => void;
    debuggerApi.attach.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const pending = engine.enableAdvancedProxy(9);
    await vi.waitFor(() => expect(finish).toBeDefined());
    if (reason === 'navigation') {
      vi.mocked(browser.tabs.get).mockResolvedValue({ id: 9, url: 'https://other.example.test/' } as browser.Tabs.Tab);
      tabUpdated(9, { url: 'https://other.example.test/' });
    } else if (reason === 'close') removed(9);
    else await engine.disableAdvancedProxyTransport(9);
    finish();
    expect((await pending).phase).toBe('disabled');
    expect(engine.getAdvancedProxyStatus(9).phase).toBe('disabled');
    expect(debuggerApi.detach).toHaveBeenCalledWith({ tabId: 9 });
    expect(debuggerApi.sendCommand.mock.calls.some((call) => call[1] === 'Fetch.enable')).toBe(false);
  });
  it('rechecks the current origin even if the navigation event has not arrived', async () => {
    let finish!: () => void;
    debuggerApi.attach.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const pending = engine.enableAdvancedProxy(9);
    await vi.waitFor(() => expect(finish).toBeDefined());
    vi.mocked(browser.tabs.get).mockResolvedValue({ id: 9, url: 'https://other.example.test/' } as browser.Tabs.Tab);
    finish();
    expect((await pending).phase).toBe('disabled');
    expect(debuggerApi.sendCommand.mock.calls.some((call) => call[1] === 'Fetch.enable')).toBe(false);
  });
  it('coalesces simultaneous starts and permits same-origin navigation', async () => {
    let finish!: () => void;
    debuggerApi.attach.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const first = engine.enableAdvancedProxy(9);
    const second = engine.enableAdvancedProxy(9);
    await vi.waitFor(() => expect(finish).toBeDefined());
    tabUpdated(9, { url: 'https://example.com/another-path' });
    finish();
    expect((await first).phase).toBe('connected');
    expect((await second).phase).toBe('connected');
    expect(debuggerApi.attach).toHaveBeenCalledTimes(1);
  });
  it('honors stop before the initial tab lookup finishes', async () => {
    let finish!: (tab: browser.Tabs.Tab) => void;
    vi.mocked(browser.tabs.get).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const pending = engine.enableAdvancedProxy(9);
    await vi.waitFor(() => expect(finish).toBeDefined());
    await engine.disableAdvancedProxyTransport(9);
    finish({ id: 9, url: 'https://example.com/' } as browser.Tabs.Tab);
    expect((await pending).phase).toBe('disabled');
    expect(debuggerApi.attach).not.toHaveBeenCalled();
  });
  it('preserves a real setup error when its own cleanup emits a detach event', async () => {
    debuggerApi.sendCommand.mockRejectedValueOnce(new Error('Network setup failed'));
    debuggerApi.detach.mockImplementationOnce(async () => {
      debuggerApi.onDetach.addListener.mock.calls[0][0]({ tabId: 9 }, 'target_closed');
    });
    expect(await engine.enableAdvancedProxy(9)).toMatchObject({ phase: 'error', error: 'Network setup failed' });
  });
});

it('keeps redirected request and response headers bound to the original request matcher', async () => {
  const state = migrateLegacyState([], {});
  state.rules = [{ id: 'combo', name: 'Redirect with headers', enabled: true, source: 'user', createdAt: 1, updatedAt: 1,
    match: { initiatorOrigins: ['https://example.com'], urlPattern: 'https://api.example.com/source' },
    actions: [{ type: 'redirect', url: 'https://staging.example.com/target' },
      { type: 'setRequestHeaders', headers: { 'X-Staging': 'yes' } },
      { type: 'setResponseHeaders', headers: { 'X-Response': 'yes' } }] }];
  vi.mocked(ensureProxyAppState).mockResolvedValueOnce(state);
  await engine.enableAdvancedProxy(9);
  await event({ tabId: 9 }, 'Fetch.requestPaused', { requestId: 'combo', resourceType: 'Fetch',
    request: { url: 'https://api.example.com/source', method: 'GET', headers: {} } });
  expect(debuggerApi.sendCommand).toHaveBeenLastCalledWith({ tabId: 9 }, 'Fetch.continueRequest', {
    requestId: 'combo', url: 'https://staging.example.com/target', headers: [{ name: 'X-Staging', value: 'yes' }],
  });
  await event({ tabId: 9 }, 'Fetch.requestPaused', { requestId: 'combo', resourceType: 'Fetch', responseStatusCode: 200,
    request: { url: 'https://staging.example.com/target', method: 'GET', headers: {} }, responseHeaders: [] });
  expect(debuggerApi.sendCommand).toHaveBeenLastCalledWith({ tabId: 9 }, 'Fetch.continueResponse', expect.objectContaining({
    responseHeaders: [{ name: 'X-Response', value: 'yes' }],
  }));
  await event({ tabId: 9 }, 'Fetch.requestPaused', { requestId: 'direct', resourceType: 'Fetch',
    request: { url: 'https://staging.example.com/target', method: 'GET', headers: {} } });
  expect(debuggerApi.sendCommand).toHaveBeenLastCalledWith({ tabId: 9 }, 'Fetch.continueRequest', { requestId: 'direct' });
  await event({ tabId: 9 }, 'Fetch.requestPaused', { requestId: 'evicted-combo', resourceType: 'Fetch',
    request: { url: 'https://api.example.com/source', method: 'GET', headers: {} } });
  for (let i = 0; i < 510; i++) await event({ tabId: 9 }, 'Fetch.requestPaused', { requestId: `unmatched-${i}`, resourceType: 'Fetch',
    request: { url: 'https://unmatched.example.com/', method: 'GET', headers: {} } });
  expect(engine.getRequestLog(9).some((entry) => entry.id === 'evicted-combo')).toBe(false);
  await event({ tabId: 9 }, 'Fetch.requestPaused', { requestId: 'evicted-combo', resourceType: 'Fetch', responseStatusCode: 200,
    request: { url: 'https://staging.example.com/target', method: 'GET', headers: {} }, responseHeaders: [] });
  expect(debuggerApi.sendCommand).toHaveBeenLastCalledWith({ tabId: 9 }, 'Fetch.continueResponse', expect.objectContaining({
    responseHeaders: [{ name: 'X-Response', value: 'yes' }],
  }));
});

it('records a failed response without treating it as a new request', async () => {
  engine.clearRequestLog(9);
  await engine.enableAdvancedProxy(9);
  const request = { requestId: 'failed-response', resourceType: 'Fetch', request: { url: 'https://example.com/api', method: 'GET', headers: {} } };
  await event({ tabId: 9 }, 'Fetch.requestPaused', request);
  await event({ tabId: 9 }, 'Fetch.requestPaused', { ...request, responseErrorReason: 'ConnectionRefused' });
  expect(engine.getRequestLog(9)).toHaveLength(1);
  expect(engine.getRequestLog(9)[0]).toMatchObject({ outcome: 'failed', diagnostics: ['ConnectionRefused'] });
});

it('clears a failed connection on cross-origin navigation instead of reviving a stale red icon', async () => {
  debuggerApi.attach.mockRejectedValueOnce(new Error('Debugger unavailable'));
  expect((await engine.enableAdvancedProxy(9)).phase).toBe('error');
  tabUpdated(9, { url: 'https://other.example.test/' });
  expect(engine.getAdvancedProxyStatus(9).phase).toBe('disabled');
  tabUpdated(9, { url: 'https://example.com/' });
  expect(engine.getAdvancedProxyStatus(9).phase).toBe('disabled');
});

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
    await engine.disableAdvancedProxyTransport(9);
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

it('stops interception when stored configuration becomes invalid', async () => {
  await engine.enableAdvancedProxy(9);
  storageChanged({ proxyAppState: { newValue: { schemaVersion: 99 } } }, 'local');
  expect(debuggerApi.detach).toHaveBeenCalledWith({ tabId: 9 });
  await Promise.resolve(); await Promise.resolve();
  expect(engine.getAdvancedProxyStatus(9).phase).toBe('disabled');
});


it('pauses and resumes group header actions in an already connected Chrome tab', async () => {
  const state = migrateLegacyState([], {});
  state.rules = [{ id: 'group-header', name: 'Header', enabled: true, source: 'user', createdAt: 1, updatedAt: 1,
    match: { initiatorOrigins: ['https://example.com'], urlPattern: '*' },
    actions: [{ type: 'setRequestHeaders', headers: { 'X-Group': 'yes' } }] }];
  state.profiles = [{ id: 'group', name: 'Staging', enabled: true, ruleIds: ['group-header'] }];
  vi.mocked(ensureProxyAppState).mockResolvedValueOnce(state);
  await engine.enableAdvancedProxy(9);
  const request = (requestId: string) => event({ tabId: 9 }, 'Fetch.requestPaused', { requestId, resourceType: 'Fetch',
    request: { url: 'https://example.com/api', method: 'GET', headers: {} } });
  await request('on');
  expect(debuggerApi.sendCommand).toHaveBeenLastCalledWith({ tabId: 9 }, 'Fetch.continueRequest', expect.objectContaining({ headers: [{ name: 'X-Group', value: 'yes' }] }));
  state.profiles[0].enabled = false;
  storageChanged({ proxyAppState: { newValue: state } }, 'local');
  await request('off');
  expect(debuggerApi.sendCommand).toHaveBeenLastCalledWith({ tabId: 9 }, 'Fetch.continueRequest', { requestId: 'off' });
  state.profiles[0].enabled = true;
  storageChanged({ proxyAppState: { newValue: state } }, 'local');
  await request('resumed');
  expect(debuggerApi.sendCommand).toHaveBeenLastCalledWith({ tabId: 9 }, 'Fetch.continueRequest', expect.objectContaining({ headers: [{ name: 'X-Group', value: 'yes' }] }));
});

it('keeps persistent interception running when request recording stops', async () => {
  const state = migrateLegacyState([], {}, 1);
  state.rules = [{
    id: 'persistent-failure', name: 'Persistent failure', enabled: true, source: 'user', createdAt: 1, updatedAt: 1,
    match: { initiatorOrigins: ['https://example.com'], urlPattern: '*' },
    actions: [{ type: 'networkFailure', reason: 'Failed' }],
  }];
  vi.mocked(ensureProxyAppState).mockResolvedValueOnce(state);
  await engine.enableAdvancedProxy(9);
  debuggerApi.detach.mockClear();
  expect(await engine.disableAdvancedProxy(9)).toMatchObject({ phase: 'connected', recording: false });
  expect(debuggerApi.detach).not.toHaveBeenCalled();
  await event({ tabId: 9 }, 'Fetch.requestPaused', {
    requestId: 'saved-after-stop', resourceType: 'Fetch', request: { url: 'https://example.com/api', method: 'GET', headers: {} },
  });
  expect(debuggerApi.sendCommand).toHaveBeenLastCalledWith({ tabId: 9 }, 'Fetch.failRequest', { requestId: 'saved-after-stop', errorReason: 'Failed' });
});
