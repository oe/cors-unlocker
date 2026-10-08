import browser from 'webextension-polyfill';
import type { IRuleItem } from '@/types';
import { HTTP_TOKEN, isHttpOrigin, isHttpUrl } from './validation';
import { RESOURCE_TYPES } from './request-match';

export const APP_STATE_KEY = 'proxyAppState';
export const LEGACY_BACKUP_KEY = 'legacyBackupV1';
export const LEGACY_RULES_KEY = 'allowedOrigins';
export const LEGACY_CONFIG_KEY = 'extConfig';
export const CURRENT_SCHEMA_VERSION = 2 as const;

export interface ICorsAction {
  type: 'cors';
  allowCredentials: boolean;
  allowOrigin: '*' | 'initiator';
  allowMethods: string[];
  allowHeaders: string[];
}

export type ProxyHeaderMap = Record<string, string>;

export type IProxyAction = ICorsAction
  | { type: 'setRequestHeaders'; headers: ProxyHeaderMap }
  | { type: 'setResponseHeaders'; headers: ProxyHeaderMap }
  | { type: 'redirect'; url: string }
  | { type: 'block' }
  | {
    type: 'mockResponse';
    status: number;
    headers: ProxyHeaderMap;
    body: string;
  }
  | { type: 'delay'; milliseconds: number }
  | { type: 'networkFailure'; reason: string };

export interface IProxyRule {
  id: string;
  name: string;
  enabled: boolean;
  source: 'legacy-cors' | 'user';
  legacyRuleId?: number;
  match: {
    initiatorOrigins: string[];
    urlPattern: string;
    methods?: string[];
    resourceTypes?: string[];
  };
  actions: IProxyAction[];
  createdAt: number;
  updatedAt: number;
}

export interface IProxySettings {
  advancedModeDefault: boolean;
  redactSensitiveHeaders: boolean;
  requestLogLimit: number;
  dftEnableCredentials: boolean;
  debugMode: boolean;
  maxRules: number;
  autoCleanupDays: number;
}

export interface IProxyAppState {
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  settings: IProxySettings;
  profiles: Array<{
    id: string;
    name: string;
    enabled: boolean;
    ruleIds: string[];
  }>;
  rules: IProxyRule[];
  migration: {
    source: 'fresh-install' | 'cors-unlocker-v1';
    migratedAt: number;
  };
}

export interface ILegacyBackup {
  schemaVersion: 1;
  capturedAt: number;
  allowedOrigins: unknown;
  extConfig: unknown;
}

const DEFAULT_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'];

function parseHeaderList(value?: string): string[] {
  return (value || '')
    .split(',')
    .map((header) => header.trim())
    .filter(Boolean);
}

export function legacyRuleToProxyRule(rule: IRuleItem): IProxyRule {
  return {
    id: `legacy-cors-${rule.id}`,
    name: `CORS · ${rule.origin}`,
    enabled: !rule.disabled,
    source: 'legacy-cors',
    legacyRuleId: rule.id,
    match: {
      initiatorOrigins: [rule.origin],
      urlPattern: '*',
    },
    actions: [{
      type: 'cors',
      allowCredentials: !!rule.credentials,
      allowOrigin: rule.credentials ? 'initiator' : '*',
      allowMethods: DEFAULT_METHODS,
      allowHeaders: parseHeaderList(rule.extraHeaders),
    }],
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
  };
}

export function migrateLegacyState(
  legacyRules: IRuleItem[],
  legacyConfig: Record<string, unknown>,
  now = Date.now(),
): IProxyAppState {
  const rules = legacyRules.map(legacyRuleToProxyRule);
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    settings: {
      advancedModeDefault: false,
      redactSensitiveHeaders: true,
      requestLogLimit: 500,
      dftEnableCredentials: typeof legacyConfig.dftEnableCredentials === 'boolean'
        ? legacyConfig.dftEnableCredentials
        : false,
      debugMode: typeof legacyConfig.debugMode === 'boolean'
        ? legacyConfig.debugMode
        : false,
      maxRules: typeof legacyConfig.maxRules === 'number'
        ? legacyConfig.maxRules
        : 100,
      autoCleanupDays: typeof legacyConfig.autoCleanupDays === 'number'
        ? legacyConfig.autoCleanupDays
        : 30,
    },
    profiles: rules.length > 0 ? [{
      id: 'migrated-cors-rules',
      name: 'Migrated CORS rules',
      enabled: true,
      ruleIds: rules.map((rule) => rule.id),
    }] : [],
    rules,
    migration: {
      source: rules.length > 0 || Object.keys(legacyConfig).length > 0
        ? 'cors-unlocker-v1'
        : 'fresh-install',
      migratedAt: now,
    },
  };
}

export function isProxyAppState(value: unknown): value is IProxyAppState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<IProxyAppState>;
  return state.schemaVersion === CURRENT_SCHEMA_VERSION
    && isSettings(state.settings)
    && Array.isArray(state.rules)
    && state.rules.every(isProxyRule)
    && new Set(state.rules.map((rule) => rule.id)).size === state.rules.length
    && Array.isArray(state.profiles)
    && state.profiles.every((profile) => !!profile
      && typeof profile === 'object'
      && typeof profile.id === 'string'
      && typeof profile.name === 'string'
      && typeof profile.enabled === 'boolean'
      && isStringArray(profile.ruleIds))
    && !!state.migration
    && typeof state.migration === 'object'
    && (state.migration.source === 'fresh-install'
      || state.migration.source === 'cors-unlocker-v1')
    && isFiniteNumber(state.migration.migratedAt);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isHeaderMap(value: unknown): value is ProxyHeaderMap {
  return !!value
    && typeof value === 'object'
    && !Array.isArray(value)
    && new Set(Object.keys(value).map((name) => name.toLowerCase())).size === Object.keys(value).length
    && Object.entries(value).every(([name, headerValue]) => HTTP_TOKEN.test(name)
      // eslint-disable-next-line no-control-regex
      && typeof headerValue === 'string' && !/[\x00-\x08\x0a-\x1f\x7f]/.test(headerValue));
}

export function isProxyAction(value: unknown): value is IProxyAction {
  if (!value || typeof value !== 'object' || !('type' in value)) return false;
  const action = value as Record<string, unknown>;
  switch (action.type) {
    case 'cors':
      return typeof action.allowCredentials === 'boolean'
        && (action.allowOrigin === '*' || action.allowOrigin === 'initiator')
        && isStringArray(action.allowMethods) && action.allowMethods.every((method) => HTTP_TOKEN.test(method))
        && isStringArray(action.allowHeaders) && action.allowHeaders.every((name) => HTTP_TOKEN.test(name));
    case 'setRequestHeaders':
    case 'setResponseHeaders':
      return isHeaderMap(action.headers);
    case 'redirect':
      return typeof action.url === 'string' && isHttpUrl(action.url);
    case 'block':
      return true;
    case 'mockResponse':
      return isFiniteNumber(action.status)
        && Number.isInteger(action.status)
        && action.status >= 100
        && action.status <= 599
        && isHeaderMap(action.headers)
        && typeof action.body === 'string';
    case 'delay':
      return isFiniteNumber(action.milliseconds)
        && action.milliseconds >= 0
        && action.milliseconds <= 30_000;
    case 'networkFailure':
      return typeof action.reason === 'string' && ['Failed', 'Aborted', 'TimedOut', 'AccessDenied',
        'ConnectionClosed', 'ConnectionReset', 'ConnectionRefused', 'ConnectionAborted',
        'ConnectionFailed', 'NameNotResolved', 'InternetDisconnected', 'AddressUnreachable',
        'BlockedByClient', 'BlockedByResponse'].includes(action.reason);
    default:
      return false;
  }
}

export function isProxyRule(value: unknown): value is IProxyRule {
  if (!value || typeof value !== 'object') return false;
  const rule = value as Partial<IProxyRule>;
  return typeof rule.id === 'string'
    && rule.id.length > 0
    && typeof rule.name === 'string'
    && rule.name.length > 0
    && typeof rule.enabled === 'boolean'
    && (rule.source === 'legacy-cors' || rule.source === 'user')
    && (rule.legacyRuleId === undefined || isFiniteNumber(rule.legacyRuleId))
    && !!rule.match
    && typeof rule.match === 'object'
    && isStringArray(rule.match.initiatorOrigins)
    && rule.match.initiatorOrigins.length > 0
    && rule.match.initiatorOrigins.every((origin) => origin === '*' || isHttpOrigin(origin))
    && (rule.source !== 'legacy-cors' || (rule.match.initiatorOrigins.length === 1
      && isHttpOrigin(rule.match.initiatorOrigins[0]) && Number.isInteger(rule.legacyRuleId)
      && (rule.legacyRuleId || 0) > 0 && (rule.legacyRuleId || 0) < 1_000_000))
    && typeof rule.match.urlPattern === 'string'
    && rule.match.urlPattern.length > 0
    && (rule.match.methods === undefined || (isStringArray(rule.match.methods)
      && rule.match.methods.every((method) => HTTP_TOKEN.test(method) && method === method.toUpperCase())))
    && (rule.match.resourceTypes === undefined || (isStringArray(rule.match.resourceTypes)
      && rule.match.resourceTypes.every((type) => RESOURCE_TYPES.includes(type as typeof RESOURCE_TYPES[number]))))
    && Array.isArray(rule.actions)
    && rule.actions.length > 0
    && rule.actions.every(isProxyAction)
    && (rule.source !== 'legacy-cors' || (rule.actions.length === 1 && rule.actions[0].type === 'cors'))
    && isFiniteNumber(rule.createdAt)
    && isFiniteNumber(rule.updatedAt);
}

function isSettings(value: unknown): value is IProxySettings {
  if (!value || typeof value !== 'object') return false;
  const settings = value as Partial<IProxySettings>;
  return typeof settings.advancedModeDefault === 'boolean'
    && typeof settings.redactSensitiveHeaders === 'boolean'
    && isFiniteNumber(settings.requestLogLimit)
    && settings.requestLogLimit > 0
    && Number.isInteger(settings.requestLogLimit) && settings.requestLogLimit <= 5000
    && typeof settings.dftEnableCredentials === 'boolean'
    && typeof settings.debugMode === 'boolean'
    && isFiniteNumber(settings.maxRules)
    && settings.maxRules > 0
    && Number.isInteger(settings.maxRules) && settings.maxRules <= 1000
    && isFiniteNumber(settings.autoCleanupDays)
    && Number.isInteger(settings.autoCleanupDays) && settings.autoCleanupDays >= 0 && settings.autoCleanupDays <= 365;
}

export function withLegacyRules(
  state: IProxyAppState,
  legacyRules: IRuleItem[],
): IProxyAppState {
  const migratedRules = legacyRules.map(legacyRuleToProxyRule);
  const userRules = state.rules.filter((rule) => rule.source !== 'legacy-cors');
  const migratedProfile = state.profiles.find((profile) => profile.id === 'migrated-cors-rules');
  const otherProfiles = state.profiles.filter((profile) => profile.id !== 'migrated-cors-rules');

  return {
    ...state,
    rules: [...userRules, ...migratedRules],
    profiles: migratedRules.length > 0 ? [
      ...otherProfiles,
      {
        id: 'migrated-cors-rules',
        name: migratedProfile?.name || 'Migrated CORS rules',
        enabled: migratedProfile?.enabled ?? true,
        ruleIds: migratedRules.map((rule) => rule.id),
      },
    ] : otherProfiles,
  };
}

export function withLegacyConfig(
  state: IProxyAppState,
  legacyConfig: Record<string, unknown>,
): IProxyAppState {
  return {
    ...state,
    settings: {
      ...state.settings,
      dftEnableCredentials: typeof legacyConfig.dftEnableCredentials === 'boolean'
        ? legacyConfig.dftEnableCredentials
        : state.settings.dftEnableCredentials,
      debugMode: typeof legacyConfig.debugMode === 'boolean'
        ? legacyConfig.debugMode
        : state.settings.debugMode,
      maxRules: typeof legacyConfig.maxRules === 'number'
        ? legacyConfig.maxRules
        : state.settings.maxRules,
      autoCleanupDays: typeof legacyConfig.autoCleanupDays === 'number'
        ? legacyConfig.autoCleanupDays
        : state.settings.autoCleanupDays,
    },
  };
}

export function proxyRuleToLegacyRule(rule: IProxyRule): IRuleItem | null {
  if (rule.source !== 'legacy-cors' || typeof rule.legacyRuleId !== 'number') return null;
  const cors = rule.actions.find((action) => action.type === 'cors');
  const origin = rule.match.initiatorOrigins[0];
  if (!cors || !origin) return null;
  return {
    id: rule.legacyRuleId,
    createdAt: rule.createdAt,
    domain: new URL(origin).hostname,
    origin,
    credentials: cors.allowCredentials,
    extraHeaders: cors.allowHeaders.join(','),
    disabled: !rule.enabled,
    updatedAt: rule.updatedAt,
  };
}

export function getCorsCompatibilityRules(state: IProxyAppState): IRuleItem[] {
  return state.rules.flatMap((rule) => {
    const legacyRule = proxyRuleToLegacyRule(rule);
    return legacyRule ? [legacyRule] : [];
  });
}

export type ProxyStateOperation =
  | { kind: 'get' }
  | { kind: 'recover'; state: IProxyAppState }
  | { kind: 'add'; input: Omit<IProxyRule, 'id' | 'createdAt' | 'updatedAt'> }
  | { kind: 'update'; id: string; update: Partial<Omit<IProxyRule, 'id'>> }
  | { kind: 'remove'; id: string }
  | { kind: 'replace'; state: IProxyAppState }
  | { kind: 'import'; state: IProxyAppState; merge: boolean; expectedState?: IProxyAppState }
  | { kind: 'legacyRules'; rules: IRuleItem[] }
  | { kind: 'legacyPatch'; intent: 'add' | 'update' | 'upsert' | 'remove'; rule: Partial<IRuleItem> }
  | { kind: 'config'; config: Record<string, unknown> }
  | { kind: 'cleanup' };

let backgroundWriter = false;
let writeQueue: Promise<unknown> = Promise.resolve();
let onStateSaved: ((state: IProxyAppState) => Promise<void>) | undefined;

/** Only the background installs the writer. Extension pages send operations to it. */
export function initializeProxyStateWriter(onSaved?: (state: IProxyAppState) => Promise<void>) {
  backgroundWriter = true;
  onStateSaved = onSaved;
}

function forwardToBackground(): boolean {
  return !backgroundWriter && typeof location !== 'undefined'
    && ['chrome-extension:', 'moz-extension:'].includes(location.protocol);
}

export async function performProxyStateOperation(operation: ProxyStateOperation): Promise<IProxyAppState> {
  if (forwardToBackground()) {
    const response = await browser.runtime.sendMessage({ type: 'proxyStateOperation', payload: operation });
    if (!isProxyAppState(response?.state)) throw new Error(response?.error || 'Unable to update proxy state.');
    return response.state;
  }
  const run = writeQueue.then(() => applyStateOperation(operation));
  // A failed operation must not poison later writes.
  writeQueue = run.catch(() => undefined);
  return run;
}

async function applyStateOperation(operation: ProxyStateOperation): Promise<IProxyAppState> {
  if (operation?.kind === 'recover') {
    if (!isProxyAppState(operation.state) || operation.state.rules.length > operation.state.settings.maxRules) {
      throw new Error('Invalid recovery configuration.');
    }
    const raw = await browser.storage.local.get(APP_STATE_KEY);
    if (isProxyAppState(raw[APP_STATE_KEY])) throw new Error('Configuration already recovered. Reload before making further changes.');
    await browser.storage.local.set({ preRecoveryBackup: { capturedAt: Date.now(), state: raw[APP_STATE_KEY] } });
    await browser.storage.local.set({ [APP_STATE_KEY]: operation.state });
    try { await onStateSaved?.(operation.state); }
    catch (error) { await browser.storage.local.set(raw); throw error; }
    return operation.state;
  }
  const current = await ensureProxyAppState();
  let next = current;
  switch (operation?.kind) {
    case 'get': return current;
    case 'add': {
      const now = Date.now();
      next = { ...current, rules: [...current.rules, { ...operation.input,
        id: crypto.randomUUID(), createdAt: now, updatedAt: now }] };
      break;
    }
    case 'update': {
      if (!current.rules.some((rule) => rule.id === operation.id)) throw new Error(`Proxy rule not found: ${operation.id}`);
      next = { ...current, rules: current.rules.map((rule) => rule.id === operation.id
        ? { ...rule, ...operation.update, id: rule.id, updatedAt: Date.now() } : rule) };
      break;
    }
    case 'remove':
      next = { ...current, rules: current.rules.filter((rule) => rule.id !== operation.id),
        profiles: current.profiles.map((profile) => ({ ...profile, ruleIds: profile.ruleIds.filter((id) => id !== operation.id) })) };
      break;
    case 'replace': next = operation.state; break;
    case 'import': {
      if (!isProxyAppState(operation.state)) throw new Error('Invalid v2 configuration.');
      if (operation.expectedState && JSON.stringify(operation.expectedState) !== JSON.stringify(current)) {
        throw new Error('Configuration changed. Review the updated preview and try again.');
      }
      const rules = new Map(current.rules.map((rule) => [rule.id, rule]));
      for (const rule of operation.state.rules) rules.set(rule.id, rule);
      next = operation.merge ? { ...current, rules: [...rules.values()] } : operation.state;
      break;
    }
    case 'legacyRules': next = withLegacyRules(current, operation.rules); break;
    case 'legacyPatch': {
      const rules = getCorsCompatibilityRules(current);
      const patch = operation.rule;
      const existing = rules.find((rule) => operation.intent === 'upsert'
        ? rule.origin === patch.origin : rule.id === patch.id);
      if (operation.intent === 'remove') {
        next = withLegacyRules(current, rules.filter((rule) => rule.id !== patch.id));
        break;
      }
      if (operation.intent === 'update' && !existing) throw new Error(`Rule not found: ${patch.id}`);
      if (operation.intent === 'add' && rules.some((rule) => rule.origin === patch.origin)) {
        throw new Error(`Rule for origin "${patch.origin}" already exists`);
      }
      if (!existing && (!patch.origin || !isHttpOrigin(patch.origin))) throw new Error('A valid HTTP(S) page origin is required.');
      const now = Date.now();
      const rule = existing ? { ...existing, ...patch, id: existing.id, updatedAt: now }
        : { credentials: current.settings.dftEnableCredentials, disabled: false, ...patch,
          id: Math.max(0, ...rules.map((item) => item.id)) + 1, createdAt: patch.createdAt ?? now,
          updatedAt: now, domain: new URL(patch.origin!).hostname } as IRuleItem;
      next = withLegacyRules(current, existing ? rules.map((item) => item.id === existing.id ? rule : item) : [...rules, rule]);
      break;
    }
    case 'config': next = withLegacyConfig(current, operation.config); break;
    case 'cleanup': {
      if (!current.settings.autoCleanupDays) return current;
      const cutoff = Date.now() - current.settings.autoCleanupDays * 86400000;
      const rules = getCorsCompatibilityRules(current).filter((rule) => !rule.disabled || rule.updatedAt >= cutoff);
      next = withLegacyRules(current, rules);
      break;
    }
    default: throw new Error('Unsupported proxy state operation.');
  }
  if (!isProxyAppState(next)) throw new Error('Invalid rule or configuration. Use HTTP(S) page origins, valid headers and supported actions.');
  if (next.rules.length > next.settings.maxRules && next.rules.length > current.rules.length) {
    throw new Error(`Maximum limit of ${next.settings.maxRules} rules reached`);
  }
  if (operation.kind === 'import') {
    await browser.storage.local.set({ preImportBackup: { version: '2.0', state: current, timestamp: Date.now() } });
  }
  await browser.storage.local.set({ [APP_STATE_KEY]: next });
  try {
    await onStateSaved?.(next);
  } catch (error) {
    // Keep storage and browser rules at the previous configuration if application fails.
    await browser.storage.local.set({ [APP_STATE_KEY]: current });
    await onStateSaved?.(current).catch(() => undefined);
    throw error;
  }
  return next;
}

export async function saveProxyAppState(state: IProxyAppState): Promise<void> {
  await performProxyStateOperation({ kind: 'replace', state });
}

export async function addProxyRule(input: Omit<IProxyRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<IProxyRule> {
  const state = await performProxyStateOperation({ kind: 'add', input });
  return state.rules[state.rules.length - 1];
}

export async function updateProxyRule(id: string, update: Partial<Omit<IProxyRule, 'id'>>): Promise<IProxyRule> {
  const state = await performProxyStateOperation({ kind: 'update', id, update });
  return state.rules.find((rule) => rule.id === id)!;
}

export async function removeProxyRule(id: string): Promise<void> {
  await performProxyStateOperation({ kind: 'remove', id });
}

let migrationInFlight: Promise<IProxyAppState> | undefined;

async function ensureProxyAppStateInternal(): Promise<IProxyAppState> {
  const stored = await browser.storage.local.get([
    APP_STATE_KEY,
    LEGACY_BACKUP_KEY,
    LEGACY_RULES_KEY,
    LEGACY_CONFIG_KEY,
    'invalidProxyStateBackup',
  ]);

  if (isProxyAppState(stored[APP_STATE_KEY])) {
    return stored[APP_STATE_KEY];
  }

  if (stored[APP_STATE_KEY] !== undefined) {
    if (!stored.invalidProxyStateBackup) {
      await browser.storage.local.set({ invalidProxyStateBackup: { capturedAt: Date.now(), state: stored[APP_STATE_KEY] } });
    }
    throw new Error('CORRUPTION: Proxy state is invalid or uses an unsupported schema. Original data was preserved. Restore a valid backup to recover.');
  }

  const legacyRules = Array.isArray(stored[LEGACY_RULES_KEY])
    ? stored[LEGACY_RULES_KEY] as IRuleItem[]
    : [];
  const legacyConfig = stored[LEGACY_CONFIG_KEY]
    && typeof stored[LEGACY_CONFIG_KEY] === 'object'
    ? stored[LEGACY_CONFIG_KEY] as Record<string, unknown>
    : {};
  const now = Date.now();
  const state = migrateLegacyState(legacyRules, legacyConfig, now);
  const values: Record<string, unknown> = { [APP_STATE_KEY]: state };

  if (!stored[LEGACY_BACKUP_KEY]) {
    values[LEGACY_BACKUP_KEY] = {
      schemaVersion: 1,
      capturedAt: now,
      allowedOrigins: stored[LEGACY_RULES_KEY] ?? [],
      extConfig: stored[LEGACY_CONFIG_KEY] ?? {},
    } satisfies ILegacyBackup;
  }

  if (!isProxyAppState(state)) throw new Error('Invalid legacy data. Original data was preserved.');
  await browser.storage.local.set(values);
  const verification = await browser.storage.local.get(APP_STATE_KEY);
  if (!isProxyAppState(verification[APP_STATE_KEY])) {
    throw new Error('Proxy state migration could not be verified. Legacy data was left untouched.');
  }
  return verification[APP_STATE_KEY];
}

export async function ensureProxyAppState(): Promise<IProxyAppState> {
  if (forwardToBackground()) return performProxyStateOperation({ kind: 'get' });
  if (migrationInFlight) return migrationInFlight;
  const operation = ensureProxyAppStateInternal();
  migrationInFlight = operation;
  try {
    return await operation;
  } finally {
    if (migrationInFlight === operation) migrationInFlight = undefined;
  }
}
