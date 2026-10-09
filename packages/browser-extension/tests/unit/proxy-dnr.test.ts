import { describe, expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';
import { compileFirefoxSessionCors, compileProxyRules as compileRules, reconcileProxyDnrRules } from '../../src/background/proxy-dnr';
import { EMPTY_QUICK_CONTROLS } from '../../src/common/quick-controls';
import type { IProxyRule } from '../../src/common/proxy-state';

const tabs = [{ id: 9, url: 'https://app.example.com/' }];
const compileProxyRules = (rules: IProxyRule[]) => compileRules(rules, tabs);

function rule(overrides: Partial<IProxyRule> = {}): IProxyRule {
  return {
    id: 'rule-1',
    name: 'Headers',
    enabled: true,
    source: 'user',
    match: {
      initiatorOrigins: ['https://app.example.com'],
      urlPattern: '*://api.example.com/*',
      methods: ['GET'],
      resourceTypes: ['XHR', 'Fetch'],
    },
    actions: [{ type: 'setResponseHeaders', headers: { 'X-Debug': 'yes' } }],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('proxy DNR compiler', () => {
  it('compiles header actions with page, URL, method, and resource matching', () => {
    const [compiled] = compileProxyRules([rule()]);
    expect(compiled.condition).toMatchObject({
      regexFilter: '^.*://api\\.example\\.com/.*$',
      tabIds: [9],
      requestMethods: ['get'],
      resourceTypes: ['xmlhttprequest'],
    });
    expect(compiled.action).toMatchObject({
      type: 'modifyHeaders',
      responseHeaders: [{ header: 'X-Debug', operation: 'set', value: 'yes' }],
    });
  });

  it('uses terminal DNR actions and leaves CDP-only actions out', () => {
    expect(compileProxyRules([rule({ actions: [{ type: 'block' }] })])[0].action.type).toBe('block');
    expect(compileProxyRules([rule({ actions: [{ type: 'redirect', url: 'https://example.com/' }] })])[0].action.type).toBe('redirect');
    expect(compileProxyRules([rule({ actions: [{ type: 'delay', milliseconds: 100 }] })])).toEqual([]);
    expect(compileProxyRules([rule({ actions: [{ type: 'mockResponse', status: 200, headers: {}, body: '{}' }] })])).toEqual([]);
  });

  it('does not recompile migrated CORS rules', () => {
    expect(compileProxyRules([rule({ source: 'legacy-cors', legacyRuleId: 1 })])).toEqual([]);
  });

  it('keeps CDP-only resource types out of the broad DNR fast path', () => {
    expect(compileProxyRules([rule({
      match: {
        initiatorOrigins: ['https://app.example.com'],
        urlPattern: '*://api.example.com/*',
        resourceTypes: ['Preflight'],
      },
    })])).toEqual([]);
  });
});


it('isolates full origins across ports, protocols and subdomains', () => {
  const scoped = rule({ match: { initiatorOrigins: ['http://localhost:3000'], urlPattern: '*' } });
  const [compiled] = compileRules([scoped], [
    { id: 1, url: 'http://localhost:3000/app' }, { id: 2, url: 'http://localhost:3001/app' },
    { id: 3, url: 'https://localhost:3000/app' }, { id: 4, url: 'http://sub.localhost:3000/app' },
  ]);
  expect(compiled.condition.tabIds).toEqual([1]);
  expect(compileRules([scoped], [])).toEqual([]);
});
it('never turns malformed origin scopes into global rules', () => {
  expect(compileProxyRules([rule({ match: { initiatorOrigins: ['app.example.com'], urlPattern: '*' } })])).toEqual([]);
  expect(compileProxyRules([rule({ match: { initiatorOrigins: [], urlPattern: '*' } })])).toEqual([]);
  expect(compileProxyRules([rule({ match: { initiatorOrigins: ['*', 'app.example.com'], urlPattern: '*' } })])).toEqual([]);
  expect(compileProxyRules([rule({ match: { initiatorOrigins: ['*'], urlPattern: '*' } })])[0].condition.tabIds).toBeUndefined();
});
it('uses complete literal URLs instead of DNR substring filters', () => {
  const [compiled] = compileProxyRules([rule({ match: { initiatorOrigins: ['*'], urlPattern: 'https://api.example.com/users?x=1' } })]);
  const regex = new RegExp(compiled.condition.regexFilter!);
  expect(regex.test('https://api.example.com/users?x=1')).toBe(true);
  expect(regex.test('https://api.example.com/users?x=10')).toBe(false);
  expect(regex.test('https://other.example/?next=https://api.example.com/users?x=1')).toBe(false);
});
it('cleans stale v1 and v2 dynamic rules when no saved rules remain', async () => {
  vi.mocked(browser.declarativeNetRequest.getDynamicRules).mockResolvedValueOnce([{ id: 7 }, { id: 1000001 }] as any);
  vi.mocked(browser.declarativeNetRequest.getSessionRules).mockResolvedValueOnce([{ id: 1000002 }] as any);
  vi.mocked(browser.tabs.query).mockResolvedValueOnce([]);
  await reconcileProxyDnrRules([]);
  expect(browser.declarativeNetRequest.updateDynamicRules).toHaveBeenLastCalledWith({ removeRuleIds: [7, 1000001] });
  expect(browser.declarativeNetRequest.updateSessionRules).toHaveBeenLastCalledWith({ removeRuleIds: [1000002], addRules: [] });
});
it('keeps compatibility CORS rules active only on the matching tabs', () => {
  const legacy = rule({ source: 'legacy-cors', legacyRuleId: 1, actions: [{ type: 'cors', allowCredentials: true, allowOrigin: 'initiator', allowMethods: ['GET'], allowHeaders: [] }] });
  const [compiled] = compileRules([legacy], tabs);
  expect(compiled.condition.tabIds).toEqual([9]);
  expect(compiled.action.responseHeaders).toContainEqual({ header: 'Access-Control-Allow-Origin', operation: 'set', value: 'https://app.example.com' });
});

describe('Firefox MV3 session CORS', () => {
  it('confines quick CORS to its connected tab even when another tab has the same origin', () => {
    const sessions = new Map([[9, { origin: 'https://app.example.com', quickControls: { ...EMPTY_QUICK_CONTROLS, cors: true, credentials: true } }]]);
    const [compiled] = compileFirefoxSessionCors([], [...tabs, { id: 10, url: tabs[0].url }], sessions);
    expect(compiled.condition.tabIds).toEqual([9]);
    expect(compiled.action.responseHeaders).toContainEqual({ header: 'Access-Control-Allow-Origin', operation: 'set', value: 'https://app.example.com' });
    expect(compiled.action.responseHeaders).toContainEqual({ header: 'Access-Control-Allow-Credentials', operation: 'set', value: 'true' });
  });
  it('preserves saved CORS matching and skips disabled rules and previous-origin sessions', () => {
    const cors = rule({ actions: [{ type: 'cors', allowOrigin: '*', allowCredentials: false, allowHeaders: [], allowMethods: ['GET'] }] });
    const sessions = new Map([[9, { origin: 'https://app.example.com', quickControls: EMPTY_QUICK_CONTROLS }]]);
    expect(compileFirefoxSessionCors([cors], tabs, sessions)[0].condition).toMatchObject({ tabIds: [9], requestMethods: ['get'], regexFilter: '^.*://api\\.example\\.com/.*$' });
    expect(compileFirefoxSessionCors([{ ...cors, enabled: false }], tabs, sessions)).toEqual([]);
    expect(compileFirefoxSessionCors([cors], [{ id: 9, url: 'https://other.example.com/' }], sessions)).toEqual([]);
  });
});
