import { beforeEach, describe, expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';
import {
  APP_STATE_KEY, addProxyRule, ensureProxyAppState, initializeProxyStateWriter, isProxyAction,
  isProxyAppState, migrateLegacyState, performProxyStateOperation, removeProxyRule, updateProxyRule,
  type IProxyAppState, type IProxyRule,
} from '../../src/common/proxy-state';
import { diffRules } from '../../src/background/user-rule';
import { mergeHeaderMaps } from '../../src/common/validation';

let stored: Record<string, any>;
const input = (name: string) => ({ name, enabled: true, source: 'user' as const,
  match: { initiatorOrigins: ['https://app.example'], urlPattern: '*' }, actions: [{ type: 'block' as const }] });
beforeEach(() => {
  vi.restoreAllMocks();
  initializeProxyStateWriter();
  stored = { [APP_STATE_KEY]: migrateLegacyState([], {}, 1) };
  vi.mocked(browser.storage.local.get).mockImplementation(async (keys) => {
    const wanted = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(stored);
    return structuredClone(Object.fromEntries(wanted.filter((key) => key in stored).map((key) => [key, stored[key]])));
  });
  vi.mocked(browser.storage.local.set).mockImplementation(async (values) => { Object.assign(stored, structuredClone(values)); });
});

describe('serialized state writes', () => {
  it('preserves every concurrent addition and unique ID', async () => {
    const created = await Promise.all(Array.from({ length: 20 }, (_, index) => addProxyRule(input(`rule-${index}`))));
    expect(stored[APP_STATE_KEY].rules.map((rule: IProxyRule) => rule.name)).toEqual(created.map((rule) => rule.name));
    expect(new Set(created.map((rule) => rule.id)).size).toBe(20);
  });
  it('preserves independent rule edits and settings changes from different surfaces', async () => {
    const [a, b] = await Promise.all([addProxyRule(input('A')), addProxyRule(input('B'))]);
    await Promise.all([updateProxyRule(a.id, { name: 'edited' }), removeProxyRule(b.id),
      performProxyStateOperation({ kind: 'config', config: { debugMode: true } })]);
    expect(stored[APP_STATE_KEY].rules).toHaveLength(1);
    expect(stored[APP_STATE_KEY].rules[0].name).toBe('edited');
    expect(stored[APP_STATE_KEY].settings.debugMode).toBe(true);
  });
  it('merges simultaneous legacy CORS updates without losing user rules', async () => {
    await addProxyRule(input('user'));
    await Promise.all(['https://a.example', 'https://b.example'].map((origin) =>
      performProxyStateOperation({ kind: 'legacyPatch', intent: 'upsert', rule: { origin, disabled: false } })));
    expect(stored[APP_STATE_KEY].rules).toHaveLength(3);
    expect(new Set(stored[APP_STATE_KEY].rules.map((rule: IProxyRule) => rule.id)).size).toBe(3);
  });
  it('enforces the shared quota for SDK, native and legacy additions under concurrency', async () => {
    stored[APP_STATE_KEY].settings.maxRules = 1;
    const results = await Promise.allSettled([addProxyRule(input('A')), addProxyRule(input('B'))]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(stored[APP_STATE_KEY].rules).toHaveLength(1);
    await expect(performProxyStateOperation({ kind: 'legacyPatch', intent: 'upsert', rule: { origin: 'https://a.example' } })).rejects.toThrow('Maximum limit');
    await removeProxyRule(stored[APP_STATE_KEY].rules[0].id);
    expect((await addProxyRule(input('after failure'))).name).toBe('after failure');
  });
  it('rolls back persisted state when browser rule application fails and permits subsequent writes', async () => {
    const before = structuredClone(stored[APP_STATE_KEY]);
    const apply = vi.fn().mockRejectedValueOnce(new Error('invalid browser rule')).mockResolvedValue(undefined);
    initializeProxyStateWriter(apply);
    await expect(addProxyRule(input('bad'))).rejects.toThrow('invalid browser rule');
    expect(stored[APP_STATE_KEY]).toEqual(before);
    expect(apply).toHaveBeenLastCalledWith(before);
    await addProxyRule(input('good'));
    expect(stored[APP_STATE_KEY].rules[0].name).toBe('good');
  });
  it('checks import previews inside the write queue and backs up the actual pre-import state', async () => {
    const before = structuredClone(stored[APP_STATE_KEY]);
    await addProxyRule(input('newer'));
    const incoming = migrateLegacyState([], {}, 1);
    await expect(performProxyStateOperation({ kind: 'import', state: incoming, merge: false, expectedState: before })).rejects.toThrow('Configuration changed');
    expect(stored.preImportBackup).toBeUndefined();
    await performProxyStateOperation({ kind: 'import', state: incoming, merge: false });
    expect(stored.preImportBackup.state.rules[0].name).toBe('newer');
    expect(stored[APP_STATE_KEY].rules).toEqual([]);
  });
});

describe('migration and recovery', () => {
  it.each([{}, null, { schemaVersion: 3 }])('preserves invalid or newer stored state %j instead of rerunning migration', async (invalid) => {
    stored[APP_STATE_KEY] = invalid;
    stored.allowedOrigins = [{ id: 1, origin: 'https://stale.example' }];
    await expect(ensureProxyAppState()).rejects.toThrow('CORRUPTION');
    expect(stored[APP_STATE_KEY]).toEqual(invalid);
    expect(stored.invalidProxyStateBackup.state).toEqual(invalid);
    const capturedAt = stored.invalidProxyStateBackup.capturedAt;
    await expect(ensureProxyAppState()).rejects.toThrow('CORRUPTION');
    expect(stored.invalidProxyStateBackup.capturedAt).toBe(capturedAt);
  });
  it('restores only validated backups and retains the damaged original', async () => {
    const damaged = { schemaVersion: 99, rules: ['original'] };
    stored[APP_STATE_KEY] = damaged;
    await expect(performProxyStateOperation({ kind: 'recover', state: {} as IProxyAppState })).rejects.toThrow('Invalid recovery');
    expect(stored[APP_STATE_KEY]).toEqual(damaged);
    const valid = migrateLegacyState([], {}, 1);
    await performProxyStateOperation({ kind: 'recover', state: valid });
    expect(stored.preRecoveryBackup.state).toEqual(damaged);
    expect(await ensureProxyAppState()).toEqual(valid);
  });
});

describe('rule and action validation', () => {
  it.each(['app.example', '', 'ftp://app.example', 'https://app.example/path', 'https://app.example@other.example'])('rejects invalid page scopes %s', async (origin) => {
    await expect(addProxyRule({ ...input('invalid'), match: { initiatorOrigins: [origin], urlPattern: '*' } })).rejects.toThrow('Invalid rule');
    expect(stored[APP_STATE_KEY].rules).toEqual([]);
  });
  it.each([{ 'bad header': 'value' }, { Good: 'value\r\ninjected: true' }, { Header: 'a', header: 'b' }])('rejects invalid field names, values and case duplicates %j', (headers) => {
    expect(isProxyAction({ type: 'setRequestHeaders', headers })).toBe(false);
  });
  it('rejects malformed redirect URLs, fractional status and unsupported failure reasons', () => {
    expect(isProxyAction({ type: 'redirect', url: 'https://' })).toBe(false);
    expect(isProxyAction({ type: 'mockResponse', status: 200.5, body: '', headers: {} })).toBe(false);
    expect(isProxyAction({ type: 'networkFailure', reason: 'InvalidReason' })).toBe(false);
    const state = migrateLegacyState([], {}, 1); state.settings.requestLogLimit = 1.5;
    expect(isProxyAppState(state)).toBe(false);
  });
  it('overrides request and mock headers case-insensitively', () => {
    expect(mergeHeaderMaps({ authorization: 'original', 'Content-Type': 'old' }, { Authorization: 'updated', 'content-type': 'new' }))
      .toEqual({ Authorization: 'updated', 'content-type': 'new' });
  });
  it('emits a removal when the last compatibility rule is deleted', () => {
    const legacy = { id: 1, origin: 'https://app.example', domain: 'app.example', createdAt: 1, updatedAt: 1 };
    expect(diffRules([], [legacy])).toEqual([{ ...legacy, disabled: true }]);
    expect(diffRules(undefined, [legacy])).toEqual([{ ...legacy, disabled: true }]);
  });
});

it('forwards an extension-page mutation to the authoritative background writer', async () => {
  vi.resetModules();
  vi.stubGlobal('location', { protocol: 'chrome-extension:' });
  try {
    const clientBrowser = (await import('webextension-polyfill')).default;
    const client = await import('../../src/common/proxy-state');
    const state = migrateLegacyState([], {}, 1);
    state.rules.push({ ...input('from UI'), id: 'background-id', createdAt: 1, updatedAt: 1 });
    vi.mocked(clientBrowser.runtime.sendMessage).mockResolvedValue({ state });
    vi.mocked(clientBrowser.storage.local.set).mockClear();
    expect((await client.addProxyRule(input('from UI'))).id).toBe('background-id');
    expect(clientBrowser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'proxyStateOperation', payload: { kind: 'add', input: input('from UI') } });
    expect(clientBrowser.storage.local.set).not.toHaveBeenCalled();
  } finally { vi.unstubAllGlobals(); }
});
