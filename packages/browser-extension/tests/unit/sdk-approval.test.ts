import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const browser = vi.hoisted(() => ({
  storage: { local: { get: vi.fn(), set: vi.fn() } },
  runtime: { getURL: (path: string) => `chrome-extension://test/${path}` },
  tabs: { get: vi.fn(), onRemoved: { addListener: vi.fn() } },
  windows: { create: vi.fn(), remove: vi.fn().mockResolvedValue(undefined), onRemoved: { addListener: vi.fn() } },
}));
vi.mock('webextension-polyfill', () => ({ default: browser }));
import { approveSdkOperation, sdkApprovalInfo, resolveSdkApproval } from '../../src/background/sdk-approval';
import { getSiteAccess, ownsSdkRule, SDK_ACCESS_KEY, updateSiteAccess } from '../../src/common/sdk-access';
import type { IProxyRule } from '../../src/common/proxy-state';
const origin = 'https://app.example';
const options = { tabId: 1, requesterOrigin: origin, userActivated: true,
  info: { origin, title: 'Disable this rule?', button: 'Allow change', name: 'Mock', actions: [] } };
let stored: Record<string, unknown>;
beforeEach(() => {
  stored = {};
  browser.storage.local.get.mockImplementation(async (key: string) => ({ [key]: stored[key] }));
  browser.storage.local.set.mockImplementation(async (value: object) => { Object.assign(stored, value); });
  browser.tabs.get.mockResolvedValue({ url: origin + '/page' });
  browser.windows.create.mockResolvedValue({ id: 10 });
  browser.windows.create.mockClear();
});
afterEach(() => vi.useRealTimers());
async function approvalId() {
  await vi.waitFor(() => expect(browser.windows.create).toHaveBeenCalled());
  return new URL(browser.windows.create.mock.calls.at(-1)![0].url).searchParams.get('id')!;
}
describe('SDK authorization', () => {
  it('never mutates before explicit approval and records the completed operation', async () => {
    const execute = vi.fn().mockResolvedValue({ enabled: false });
    const result = approveSdkOperation(options, execute);
    const id = await approvalId();
    expect(sdkApprovalInfo(id).origin).toBe(origin);
    expect(execute).not.toHaveBeenCalled();
    await resolveSdkApproval(id, true);
    expect(await result).toEqual({ enabled: false });
    expect(execute).toHaveBeenCalledTimes(1);
    expect((await getSiteAccess(origin)).lastOperation?.label).toBe('Rule disabled');
    expect((await getSiteAccess(origin)).trusted).toBe(false);
  });
  it('declining leaves rules unchanged', async () => {
    const execute = vi.fn();
    const result = approveSdkOperation(options, execute);
    await resolveSdkApproval(await approvalId(), false);
    expect(await result).toMatchObject({ error: { type: 'user-cancel' } });
    expect(execute).not.toHaveBeenCalled();
  });
  it('requires a gesture when untrusted, and ignores page-supplied trust', async () => {
    const execute = vi.fn();
    const result = await approveSdkOperation({ ...options, userActivated: false }, execute);
    expect(result).toMatchObject({ error: { type: 'invalid-request' } });
    expect(execute).not.toHaveBeenCalled();
    expect(browser.windows.create).not.toHaveBeenCalled();
  });
  it('trust is exact-origin, survives operations and can be revoked without changing rules', async () => {
    await updateSiteAccess(origin, { trusted: true });
    const execute = vi.fn().mockResolvedValue({ enabled: false });
    expect(await approveSdkOperation({ ...options, userActivated: false }, execute)).toEqual({ enabled: false });
    expect(browser.windows.create).not.toHaveBeenCalled();
    expect((await getSiteAccess(origin)).trusted).toBe(true);
    for (const site of ['http://app.example', 'https://sub.app.example', 'https://app.example:8443'])
      expect((await getSiteAccess(site)).trusted).toBe(false);
    await updateSiteAccess(origin, { trusted: false });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(await approveSdkOperation({ ...options, userActivated: false }, execute)).toMatchObject({ error: { type: 'invalid-request' } });
  });
  it('credential access still prompts even for a trusted site', async () => {
    await updateSiteAccess(origin, { trusted: true });
    const execute = vi.fn();
    const result = approveSdkOperation({ ...options, sensitive: true }, execute);
    const id = await approvalId();
    expect(execute).not.toHaveBeenCalled();
    await resolveSdkApproval(id, false);
    expect(await result).toMatchObject({ error: { type: 'user-cancel' } });
  });
  it('rejects navigation while the approval is open', async () => {
    const execute = vi.fn();
    const result = approveSdkOperation(options, execute);
    const id = await approvalId();
    browser.tabs.get.mockResolvedValue({ url: 'https://other.example' });
    await resolveSdkApproval(id, true);
    expect(await result).toMatchObject({ error: { type: 'invalid-request' } });
    expect(execute).not.toHaveBeenCalled();
  });
  it('expires without executing the operation', async () => {
    vi.useFakeTimers();
    const execute = vi.fn();
    const result = approveSdkOperation(options, execute);
    await vi.advanceTimersByTimeAsync(120_001);
    expect(await result).toMatchObject({ error: { type: 'user-cancel' } });
    expect(execute).not.toHaveBeenCalled();
  });
  it('serializes trust and audit writes without losing another site', async () => {
    await Promise.all([updateSiteAccess(origin, { trusted: true }), updateSiteAccess('https://other.example', { trusted: true }),
      updateSiteAccess(origin, { lastOperation: { label: 'Test', at: 1 } })]);
    expect(stored[SDK_ACCESS_KEY]).toHaveLength(2);
    expect(await getSiteAccess(origin)).toMatchObject({ trusted: true, lastOperation: { label: 'Test' } });
  });
  it('matching an origin does not grant ownership of manual rules', () => {
    const rule = { match: { initiatorOrigins: [origin] } } as IProxyRule;
    expect(ownsSdkRule(rule, origin)).toBe(false);
    expect(ownsSdkRule({ ...rule, sdkOrigin: origin }, origin)).toBe(true);
    expect(ownsSdkRule({ ...rule, sdkOrigin: origin }, 'https://other.example')).toBe(false);
    expect(ownsSdkRule({ ...rule, sdkOrigin: origin, match: { initiatorOrigins: [origin, '*'], urlPattern: '*' } }, origin)).toBe(false);
  });
});

it('fails fast for published SDKs instead of leaving an approval executable after their 5s timeout', async () => {
  vi.useFakeTimers();
  const execute = vi.fn();
  expect(await approveSdkOperation({ ...options, supportsApproval: false }, execute)).toMatchObject({
    error: { type: 'invalid-request', message: expect.stringContaining('SDK 0.3.0') },
  });
  await vi.advanceTimersByTimeAsync(10_000);
  expect(browser.windows.create).not.toHaveBeenCalled();
  expect(execute).not.toHaveBeenCalled();
});
it('allows an older client on a manually trusted site but still rejects sensitive approval', async () => {
  await updateSiteAccess(origin, { trusted: true });
  const execute = vi.fn().mockResolvedValue({ enabled: false });
  expect(await approveSdkOperation({ ...options, supportsApproval: false }, execute)).toEqual({ enabled: false });
  expect(await approveSdkOperation({ ...options, supportsApproval: false, sensitive: true }, execute)).toMatchObject({ error: { type: 'invalid-request' } });
  expect(execute).toHaveBeenCalledTimes(1);
  expect(browser.windows.create).not.toHaveBeenCalled();
});
it('keeps new SDK approval valid after the published SDK timeout', async () => {
  vi.useFakeTimers();
  const execute = vi.fn().mockResolvedValue({ enabled: false });
  const result = approveSdkOperation({ ...options, supportsApproval: true }, execute);
  await vi.advanceTimersByTimeAsync(0);
  const id = new URL(browser.windows.create.mock.calls.at(-1)![0].url).searchParams.get('id')!;
  await vi.advanceTimersByTimeAsync(10_000);
  expect(execute).not.toHaveBeenCalled();
  await resolveSdkApproval(id, true);
  expect(await result).toEqual({ enabled: false });
  expect(execute).toHaveBeenCalledTimes(1);
});
