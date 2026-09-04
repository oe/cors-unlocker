import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';
import type { IProxyAction, IProxyAppState, IProxyRule } from '../../src/common/proxy-state';

type Listener = (details: any) => any;

let engine: typeof import('../../src/background/advanced-proxy-firefox');

function rule(actions: IProxyAction[]): IProxyRule {
  return {
    id: 'firefox-rule',
    name: 'Firefox rule',
    enabled: true,
    source: 'user',
    match: {
      initiatorOrigins: ['http://test.localhost:3000'],
      urlPattern: 'http://api.localhost:3000/*',
      methods: ['GET'],
      resourceTypes: ['Fetch'],
    },
    actions,
    createdAt: 1,
    updatedAt: 1,
  };
}

function state(actions: IProxyAction[]): IProxyAppState {
  return {
    schemaVersion: 2,
    settings: {
      advancedModeDefault: false,
      redactSensitiveHeaders: true,
      requestLogLimit: 50,
      dftEnableCredentials: false,
      debugMode: false,
      maxRules: 100,
      autoCleanupDays: 30,
    },
    profiles: [],
    rules: [rule(actions)],
    migration: { source: 'fresh-install', migratedAt: 1 },
  };
}

function listener(event: { addListener: ReturnType<typeof vi.fn> }): Listener {
  return event.addListener.mock.calls[0][0] as Listener;
}

function requestDetails(tabId: number, requestId: string) {
  return {
    tabId,
    requestId,
    url: 'http://api.localhost:3000/api/users',
    method: 'GET',
    type: 'xmlhttprequest',
  };
}

beforeAll(async () => {
  engine = await import('../../src/background/advanced-proxy-firefox');
});

beforeEach(() => {
  vi.mocked(browser.runtime.sendMessage).mockResolvedValue(undefined);
  vi.mocked(browser.tabs.get).mockImplementation(async (tabId) => ({
    id: tabId,
    url: 'http://test.localhost:3000/',
  }));
});

describe('Firefox WebRequest interception engine', () => {
  it('cancels matching blocked requests and records the outcome', async () => {
    vi.mocked(browser.storage.local.get).mockResolvedValue({ proxyAppState: state([{ type: 'block' }]) });
    await engine.enableAdvancedProxy(7);

    const result = await listener(browser.webRequest.onBeforeRequest)(requestDetails(7, 'blocked'));

    expect(result).toEqual({ cancel: true });
    expect(engine.getRequestLog(7)[0]).toMatchObject({
      id: 'blocked',
      outcome: 'blocked',
      resourceType: 'XHR',
      matchedRuleIds: ['firefox-rule'],
    });
  });

  it('patches request, response, and CORS headers for Fetch/XHR traffic', async () => {
    vi.mocked(browser.storage.local.get).mockResolvedValue({
      proxyAppState: state([
        { type: 'setRequestHeaders', headers: { 'X-Forth': 'request' } },
        { type: 'setResponseHeaders', headers: { 'X-Forth': 'response' } },
      ]),
    });
    await engine.enableAdvancedProxy(8);
    const details = requestDetails(8, 'headers');
    await listener(browser.webRequest.onBeforeRequest)(details);

    const requestResult = listener(browser.webRequest.onBeforeSendHeaders)({
      ...details,
      requestHeaders: [{ name: 'Origin', value: 'http://test.localhost:3000' }],
    });
    const responseResult = listener(browser.webRequest.onHeadersReceived)({
      ...details,
      statusCode: 200,
      responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
    });

    expect(requestResult.requestHeaders).toContainEqual({ name: 'X-Forth', value: 'request' });
    expect(responseResult.responseHeaders).toEqual(expect.arrayContaining([
      { name: 'Access-Control-Allow-Origin', value: '*' },
      { name: 'X-Forth', value: 'response' },
    ]));
    expect(engine.getRequestLog(8)[0]).toMatchObject({ status: 200, outcome: 'continued' });
  });

  it('replaces a response body while preserving the Firefox response status', async () => {
    const filter = {
      ondata: null as null | ((event: { data: ArrayBuffer }) => void),
      onstop: null as null | (() => void),
      onerror: null as null | (() => void),
      write: vi.fn(),
      close: vi.fn(),
      disconnect: vi.fn(),
    };
    vi.mocked(browser.webRequest.filterResponseData).mockReturnValue(filter as never);
    vi.mocked(browser.storage.local.get).mockResolvedValue({
      proxyAppState: state([{
        type: 'mockResponse',
        status: 202,
        headers: { 'Content-Type': 'application/json' },
        body: '{"source":"firefox"}',
      }]),
    });
    await engine.enableAdvancedProxy(9);
    const details = requestDetails(9, 'mock');
    await listener(browser.webRequest.onBeforeRequest)(details);
    listener(browser.webRequest.onBeforeSendHeaders)({ ...details, requestHeaders: [] });
    listener(browser.webRequest.onHeadersReceived)({
      ...details,
      statusCode: 200,
      responseHeaders: [{ name: 'Content-Length', value: '999' }],
    });
    filter.onstop?.();

    expect(filter.write).toHaveBeenCalledOnce();
    expect(filter.close).toHaveBeenCalledOnce();
    expect(engine.getRequestLog(9)[0]).toMatchObject({ status: 200, outcome: 'mocked' });
    expect(engine.getRequestLog(9)[0].diagnostics).toContain(
      'Firefox replaced the response body; the original HTTP status was preserved.',
    );
  });

  it('redirects a matching request before it reaches the server', async () => {
    vi.mocked(browser.storage.local.get).mockResolvedValue({
      proxyAppState: state([{ type: 'redirect', url: 'https://example.com/replacement' }]),
    });
    await engine.enableAdvancedProxy(10);

    const result = await listener(browser.webRequest.onBeforeRequest)(requestDetails(10, 'redirect'));

    expect(result).toEqual({ redirectUrl: 'https://example.com/replacement' });
    expect(engine.getRequestLog(10)[0]).toMatchObject({ outcome: 'continued' });
    expect(engine.getRequestLog(10)[0].diagnostics).toContain(
      'Redirected to https://example.com/replacement',
    );
  });

  it('represents Firefox network failures as request cancellation', async () => {
    vi.mocked(browser.storage.local.get).mockResolvedValue({
      proxyAppState: state([{ type: 'networkFailure', reason: 'ConnectionRefused' }]),
    });
    await engine.enableAdvancedProxy(11);

    const result = await listener(browser.webRequest.onBeforeRequest)(requestDetails(11, 'failure'));

    expect(result).toEqual({ cancel: true });
    expect(engine.getRequestLog(11)[0]).toMatchObject({ outcome: 'failed' });
    expect(engine.getRequestLog(11)[0].diagnostics).toContain(
      'Firefox cancelled this request: ConnectionRefused',
    );
  });

  it('delays a matching request before allowing it to continue', async () => {
    vi.mocked(browser.storage.local.get).mockResolvedValue({
      proxyAppState: state([{ type: 'delay', milliseconds: 20 }]),
    });
    await engine.enableAdvancedProxy(12);
    const startedAt = performance.now();

    const result = await listener(browser.webRequest.onBeforeRequest)(requestDetails(12, 'delay'));

    expect(result).toEqual({});
    expect(performance.now() - startedAt).toBeGreaterThanOrEqual(15);
    expect(engine.getRequestLog(12)[0]).toMatchObject({ outcome: 'continued' });
  });

  it('gives body replacement precedence over redirects like the Chrome engine', async () => {
    const filter = {
      ondata: null,
      onstop: null,
      onerror: null,
      write: vi.fn(),
      close: vi.fn(),
      disconnect: vi.fn(),
    };
    vi.mocked(browser.webRequest.filterResponseData).mockReturnValue(filter as never);
    vi.mocked(browser.storage.local.get).mockResolvedValue({
      proxyAppState: state([
        { type: 'redirect', url: 'https://example.com/replacement' },
        { type: 'mockResponse', status: 200, headers: {}, body: '{}' },
      ]),
    });
    await engine.enableAdvancedProxy(13);

    const result = await listener(browser.webRequest.onBeforeRequest)(requestDetails(13, 'precedence'));

    expect(result).toEqual({});
    expect(browser.webRequest.filterResponseData).toHaveBeenCalledWith('precedence');
  });
});
