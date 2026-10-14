import { beforeEach, describe, expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';
import {
  APP_STATE_KEY, addProxyRule, effectiveRules, getCorsCompatibilityRules, ensureProxyAppState, initializeProxyStateWriter, isProxyAction,
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
  it('rejects a merged import with duplicate compatibility IDs before changing storage', async () => {
    const state = migrateLegacyState([{ id: 9, origin: 'https://app.example', domain: 'app.example', createdAt: 1, updatedAt: 1 }], {}, 1);
    stored[APP_STATE_KEY] = state;
    const incoming = { ...state, rules: [{ ...state.rules[0], id: 'imported-copy' }], profiles: [{ ...state.profiles[0], ruleIds: ['imported-copy'] }] };
    await expect(performProxyStateOperation({ kind: 'import', state: incoming, merge: true })).rejects.toThrow('Invalid rule');
    expect(stored[APP_STATE_KEY]).toEqual(state);
    expect(stored.preImportBackup).toBeUndefined();
  });
  it('preserves imported rule IDs and profile references through compatibility edits', async () => {
    const state = migrateLegacyState([{ id: 9, origin: 'https://app.example', domain: 'app.example', createdAt: 1, updatedAt: 1 }], {}, 1);
    state.rules[0].id = 'imported-original';
    state.profiles[0].ruleIds = ['imported-original'];
    stored[APP_STATE_KEY] = state;
    await performProxyStateOperation({ kind: 'legacyPatch', intent: 'upsert', rule: { origin: 'https://app.example', credentials: true } });
    expect(stored[APP_STATE_KEY].rules[0]).toMatchObject({ id: 'imported-original', actions: [{ type: 'cors', allowCredentials: true }] });
    expect(stored[APP_STATE_KEY].profiles[0].ruleIds).toEqual(['imported-original']);
  });
  it('allocates compatibility IDs without colliding with converted user rules', async () => {
    stored[APP_STATE_KEY].rules = [{ ...input('converted'), id: 'legacy-cors-1', createdAt: 1, updatedAt: 1 }];
    const next = await performProxyStateOperation({ kind: 'legacyPatch', intent: 'upsert', rule: { origin: 'https://app.example' } });
    expect(next.rules.map((rule) => rule.id)).toEqual(['legacy-cors-1', 'legacy-cors-2']);
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


describe('rule groups', () => {
  const createGroup = async (name = 'Staging') => (await performProxyStateOperation({ kind: 'createGroup', name })).profiles.at(-1)!;
  it('pauses the group without changing individual switches and restores only enabled members', async () => {
    const group = await createGroup();
    const on = await addProxyRule(input('On'), group.id);
    const off = await addProxyRule({ ...input('Off'), enabled: false }, group.id);
    const outside = await addProxyRule(input('Ungrouped'));
    const paused = await performProxyStateOperation({ kind: 'updateGroup', id: group.id, enabled: false });
    expect(paused.rules.map((rule) => rule.enabled)).toEqual([true, false, true]);
    expect(effectiveRules(paused).filter((rule) => rule.enabled).map((rule) => rule.id)).toEqual([outside.id]);
    const resumed = await performProxyStateOperation({ kind: 'updateGroup', id: group.id, enabled: true });
    expect(effectiveRules(resumed).filter((rule) => rule.enabled).map((rule) => rule.id)).toEqual([on.id, outside.id]);
    expect(resumed.rules.find((rule) => rule.id === off.id)?.enabled).toBe(false);
  });
  it('moves a rule atomically and rejects a deleted destination without saving edits', async () => {
    const first = await createGroup(); const second = await createGroup('Local');
    const rule = await addProxyRule(input('Rule'), first.id);
    await updateProxyRule(rule.id, { name: 'Moved' }, second.id);
    expect(stored[APP_STATE_KEY].profiles.map((profile: any) => profile.ruleIds)).toEqual([[], [rule.id]]);
    await performProxyStateOperation({ kind: 'removeGroup', id: second.id });
    const before = structuredClone(stored[APP_STATE_KEY]);
    await expect(updateProxyRule(rule.id, { name: 'Lost' }, second.id)).rejects.toThrow('Group no longer exists');
    expect(stored[APP_STATE_KEY]).toEqual(before);
  });
  it('deletes a group without deleting rules and retains their switches', async () => {
    const group = await createGroup(); await addProxyRule(input('On'), group.id);
    await addProxyRule({ ...input('Off'), enabled: false }, group.id);
    await performProxyStateOperation({ kind: 'updateGroup', id: group.id, enabled: false });
    const result = await performProxyStateOperation({ kind: 'removeGroup', id: group.id });
    expect(result.profiles).toEqual([]);
    expect(result.rules.map((rule) => rule.enabled)).toEqual([true, false]);
  });
  it('preserves paused CORS membership and switches through legacy SDK updates and cleanup', async () => {
    await performProxyStateOperation({ kind: 'legacyPatch', intent: 'upsert', rule: { origin: 'https://app.example' } });
    const group = await createGroup(); const id = stored[APP_STATE_KEY].rules[0].id;
    await updateProxyRule(id, {}, group.id);
    await performProxyStateOperation({ kind: 'updateGroup', id: group.id, enabled: false });
    const result = await performProxyStateOperation({ kind: 'legacyPatch', intent: 'upsert', rule: { origin: 'https://app.example', credentials: true } });
    expect(result.rules[0].enabled).toBe(true);
    expect(result.profiles[0].ruleIds).toEqual([id]);
    expect(getCorsCompatibilityRules(result)[0]).toMatchObject({ disabled: true, credentials: true });
    expect((await performProxyStateOperation({ kind: 'cleanup' })).rules).toHaveLength(1);
  });
  it('merges group membership and paused flags without losing untouched local rules', async () => {
    const group = await createGroup(); const local = await addProxyRule(input('Local'), group.id);
    const overwritten = await addProxyRule(input('Old'), group.id);
    const incoming = migrateLegacyState([], {}, 1);
    incoming.rules = [{ ...overwritten, name: 'Imported' }];
    incoming.profiles = [{ ...group, enabled: false, ruleIds: [overwritten.id] }];
    const result = await performProxyStateOperation({ kind: 'import', state: incoming, merge: true });
    expect(result.profiles[0]).toMatchObject({ enabled: false, ruleIds: [local.id, overwritten.id] });
    expect(result.rules).toHaveLength(2);
    expect(effectiveRules(result).some((rule) => rule.enabled)).toBe(false);
    expect(stored.preImportBackup.state.profiles[0].enabled).toBe(true);
  });
  it('serializes group changes with rule edits and rolls back failed browser application', async () => {
    const group = await createGroup(); const rule = await addProxyRule(input('Old'), group.id);
    await Promise.all([updateProxyRule(rule.id, { name: 'Edited' }), performProxyStateOperation({ kind: 'updateGroup', id: group.id, enabled: false })]);
    expect(stored[APP_STATE_KEY].rules[0]).toMatchObject({ name: 'Edited', enabled: true });
    const before = structuredClone(stored[APP_STATE_KEY]);
    initializeProxyStateWriter(vi.fn().mockRejectedValueOnce(new Error('DNR failed')).mockResolvedValue(undefined));
    await expect(performProxyStateOperation({ kind: 'updateGroup', id: group.id, enabled: true })).rejects.toThrow('DNR failed');
    expect(stored[APP_STATE_KEY]).toEqual(before);
  });
  it('rejects ambiguous, orphaned memberships and duplicate group IDs on import', async () => {
    const group = await createGroup(); const rule = await addProxyRule(input('Rule'), group.id);
    const state = structuredClone(stored[APP_STATE_KEY]);
    for (const profiles of [[group, group], [{ ...group, ruleIds: ['missing'] }], [{ ...group, ruleIds: [rule.id] }, { ...group, id: 'other', ruleIds: [rule.id] }]]) {
      expect(isProxyAppState({ ...state, profiles })).toBe(false);
    }
    await expect(createGroup(' staging ')).rejects.toThrow('already exists');
  });
});
