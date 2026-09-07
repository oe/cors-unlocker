import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';
import { EMPTY_QUICK_CONTROLS } from '../../src/common/quick-controls';

vi.mock('../../src/common/proxy-state', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/common/proxy-state')>(),
  ensureProxyAppState: vi.fn(async () => ({ rules: [], settings: { requestLogLimit: 500 } })),
}));
let engine: typeof import('../../src/background/advanced-proxy');
const debuggerApi = { attach: vi.fn(), detach: vi.fn(), sendCommand: vi.fn(), onEvent: { addListener: vi.fn() }, onDetach: { addListener: vi.fn() } };
const cache = { ...EMPTY_QUICK_CONTROLS, disableCache: true };
beforeAll(async () => {
  vi.stubGlobal('__TARGET__', 'chrome');
  chrome.debugger = debuggerApi as any;
  chrome.tabs.onRemoved = { addListener: vi.fn() } as any;
  engine = await import('../../src/background/advanced-proxy');
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
