import { beforeEach, expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';
const state = vi.hoisted(() => ({ rules: [] as any[], profiles: [] as any[] }));
const approve = vi.hoisted(() => vi.fn());
vi.mock('../../src/background/sdk-approval', () => ({ approveSdkOperation: approve, sdkApprovalInfo: vi.fn(), resolveSdkApproval: vi.fn() }));
vi.mock('../../src/background/saved-rule-runtime', () => ({ reconcileSavedRuleRuntime: vi.fn(), reconcileSavedRuleTab: vi.fn(), retrySavedRuleTab: vi.fn() }));
vi.mock('../../src/background/rule-runtime-bridge', () => ({ resumeSavedRuleRuntime: vi.fn() }));
vi.mock('../../src/background/advanced-proxy', () => ({ getAdvancedProxyStatus: () => ({ phase: 'disabled' }), disableAdvancedProxyTransport: vi.fn(), clearRequestLog: vi.fn(), disableAdvancedProxy: vi.fn(), enableAdvancedProxy: vi.fn(), getRequestLog: vi.fn(), updateQuickControls: vi.fn() }));
vi.mock('../../src/common/storage', () => ({ getCurrentTabRule: vi.fn(), removeCurrentTabRule: vi.fn(), toggleRuleViaOrigin: vi.fn(), dataStorage: { getRules: async () => [] } }));
vi.mock('../../src/common/proxy-state', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/common/proxy-state')>();
  return { ...actual, ensureProxyAppState: async () => state, performProxyStateOperation: vi.fn(), updateProxyRule: vi.fn(), addProxyRule: vi.fn(), removeProxyRule: vi.fn() };
});
import { sdkRuleResult } from '../../src/background/rule-approval';
import { resumeSavedRuleRuntime } from '../../src/background/rule-runtime-bridge';
import type { IProxyRule } from '../../src/common/proxy-state';
import { onRuntimeMessage } from '../../src/background/messaging';
import { addProxyRule, removeProxyRule, updateProxyRule, performProxyStateOperation } from '../../src/common/proxy-state';
const origin = 'https://app.example';
const sender = { url: origin + '/page', frameId: 0, tab: { id: 1 } };
const rule = { id: 'owned', name: 'Rule', urlPattern: '*', enabled: true, source: 'user', sdkOrigin: origin, createdAt: 1, updatedAt: 1, match: { initiatorOrigins: [origin], urlPattern: '*' }, actions: [{ type: 'block' }] };
const sdk = (method: string, data?: unknown, from = sender) => onRuntimeMessage({ type: 'sdkRequest', payload: { method, data, userActivated: true } }, from);
beforeEach(() => {
  vi.clearAllMocks(); state.rules = [structuredClone(rule)]; state.profiles = [];
  approve.mockResolvedValue({ error: { type: 'user-cancel', message: 'Declined' } });
});
it('authorizes all mutations before writing any state', async () => {
  for (const [method, data] of [['requestCors', {}], ['disableCors', undefined], ['requestRule', { rule }], ['createRuleDraft', { rule }], ['enableRule', { id: 'owned' }], ['disableRule', { id: 'owned' }], ['deleteRule', { id: 'owned' }]] as const)
    expect(await sdk(method, data)).toMatchObject({ error: { type: 'user-cancel' } });
  expect(approve).toHaveBeenCalledTimes(7);
  for (const mutate of [addProxyRule, updateProxyRule, removeProxyRule, performProxyStateOperation]) expect(mutate).not.toHaveBeenCalled();
});
it('rejects manual and cross-origin rule IDs before approval', async () => {
  state.rules.push({ ...rule, id: 'manual', sdkOrigin: undefined });
  for (const method of ['requestRule', 'enableRule', 'disableRule', 'deleteRule']) {
    expect(await sdk(method, { id: 'manual', rule })).toMatchObject({ error: { type: 'invalid-request' } });
    expect(await sdk(method, { id: 'owned', rule }, { ...sender, url: 'https://other.example/page' })).toMatchObject({ error: { type: 'invalid-request' } });
  }
  expect(approve).not.toHaveBeenCalled();
  expect((await sdk('getStatus', { ruleId: 'manual' })).rule).toBeNull();
});
it('does not expose trust through SDK, options, or page runtime requests', async () => {
  const payload = { origin, tabId: 1, trusted: true };
  expect(await sdk('setSdkSiteTrust', payload)).toMatchObject({ error: { type: 'invalid-request' } });
  expect(await onRuntimeMessage({ type: 'setSdkSiteTrust', payload }, sender)).toBeUndefined();
  expect(await onRuntimeMessage({ type: 'setSdkSiteTrust', payload }, { url: browser.runtime.getURL('src/options/index.html') })).toMatchObject({ error: expect.stringContaining('only be changed') });
  expect(browser.storage.local.set).not.toHaveBeenCalled();
});
it('rejects setting trust when the popup target tab changed origin', async () => {
  vi.mocked(browser.tabs.get).mockResolvedValue({ id: 1, url: 'https://other.example' });
  expect(await onRuntimeMessage({ type: 'setSdkSiteTrust', payload: { origin, tabId: 1, trusted: true } }, { url: browser.runtime.getURL('src/popup/index.html') })).toMatchObject({ error: expect.stringContaining('active site changed') });
  expect(browser.storage.local.set).not.toHaveBeenCalled();
});
it('rejects iframe callers and oversized requests', async () => {
  expect(await sdk('disableCors', undefined, { ...sender, frameId: 2 })).toMatchObject({ error: { type: 'invalid-request' } });
  expect(await sdk('requestCors', { reason: 'x'.repeat(65_536) })).toMatchObject({ error: { type: 'invalid-request' } });
  expect(approve).not.toHaveBeenCalled();
});
it('marks credential access as sensitive even through raw response headers', async () => {
  await sdk('requestCors', { credentials: true });
  expect(approve.mock.calls.at(-1)?.[0].sensitive).toBe(true);
  await sdk('requestRule', { rule: { ...rule, actions: [{ type: 'setResponseHeaders', headers: { 'Access-Control-Allow-Credentials': 'true' } }] } });
  expect(approve.mock.calls.at(-1)?.[0].sensitive).toBe(true);
});
it('persists trust only after an explicit matching popup request', async () => {
  let access: unknown;
  vi.mocked(browser.tabs.get).mockResolvedValue({ id: 1, url: origin + '/page' });
  vi.mocked(browser.storage.local.get).mockImplementation(async () => ({ sdkSiteAccess: access }));
  vi.mocked(browser.storage.local.set).mockImplementation(async values => { access = values.sdkSiteAccess; });
  const result = await onRuntimeMessage({ type: 'setSdkSiteTrust', payload: { origin, tabId: 1, trusted: true } }, { url: browser.runtime.getURL('src/popup/index.html') + '?tabId=1' });
  expect(result).toMatchObject({ origin, trusted: true });
});

it('does not resume unrelated paused execution when creating a draft or disabling a rule', async () => {
  await sdkRuleResult({ ...rule, enabled: false } as IProxyRule, 1, origin);
  expect(resumeSavedRuleRuntime).not.toHaveBeenCalled();
});
