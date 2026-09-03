import browser from 'webextension-polyfill';
import type { IRuleItem } from '@/types';

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
    && Object.entries(value).every(([name, headerValue]) => name.length > 0
      && typeof headerValue === 'string');
}

function isProxyAction(value: unknown): value is IProxyAction {
  if (!value || typeof value !== 'object' || !('type' in value)) return false;
  const action = value as Record<string, unknown>;
  switch (action.type) {
    case 'cors':
      return typeof action.allowCredentials === 'boolean'
        && (action.allowOrigin === '*' || action.allowOrigin === 'initiator')
        && isStringArray(action.allowMethods)
        && isStringArray(action.allowHeaders);
    case 'setRequestHeaders':
    case 'setResponseHeaders':
      return isHeaderMap(action.headers);
    case 'redirect':
      return typeof action.url === 'string' && /^https?:\/\//i.test(action.url);
    case 'block':
      return true;
    case 'mockResponse':
      return isFiniteNumber(action.status)
        && action.status >= 100
        && action.status <= 599
        && isHeaderMap(action.headers)
        && typeof action.body === 'string';
    case 'delay':
      return isFiniteNumber(action.milliseconds)
        && action.milliseconds >= 0
        && action.milliseconds <= 30_000;
    case 'networkFailure':
      return typeof action.reason === 'string' && action.reason.length > 0;
    default:
      return false;
  }
}

function isProxyRule(value: unknown): value is IProxyRule {
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
    && typeof rule.match.urlPattern === 'string'
    && rule.match.urlPattern.length > 0
    && (rule.match.methods === undefined || isStringArray(rule.match.methods))
    && (rule.match.resourceTypes === undefined || isStringArray(rule.match.resourceTypes))
    && Array.isArray(rule.actions)
    && rule.actions.length > 0
    && rule.actions.every(isProxyAction)
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
    && typeof settings.dftEnableCredentials === 'boolean'
    && typeof settings.debugMode === 'boolean'
    && isFiniteNumber(settings.maxRules)
    && settings.maxRules > 0
    && isFiniteNumber(settings.autoCleanupDays)
    && settings.autoCleanupDays >= 0;
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

export async function saveProxyAppState(state: IProxyAppState): Promise<void> {
  if (!isProxyAppState(state)) throw new Error('Invalid proxy state.');
  await browser.storage.local.set({ [APP_STATE_KEY]: state });
}

export async function addProxyRule(
  input: Omit<IProxyRule, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<IProxyRule> {
  const state = await ensureProxyAppState();
  const now = Date.now();
  const rule: IProxyRule = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
  await saveProxyAppState({
    ...state,
    rules: [...state.rules, rule],
  });
  return rule;
}

export async function updateProxyRule(
  id: string,
  update: Partial<Omit<IProxyRule, 'id'>>,
): Promise<IProxyRule> {
  const state = await ensureProxyAppState();
  const existing = state.rules.find((rule) => rule.id === id);
  if (!existing) throw new Error(`Proxy rule not found: ${id}`);
  const next = { ...existing, ...update, id, updatedAt: Date.now() };
  await saveProxyAppState({
    ...state,
    rules: state.rules.map((rule) => rule.id === id ? next : rule),
  });
  return next;
}

export async function removeProxyRule(id: string): Promise<void> {
  const state = await ensureProxyAppState();
  await saveProxyAppState({
    ...state,
    rules: state.rules.filter((rule) => rule.id !== id),
    profiles: state.profiles.map((profile) => ({
      ...profile,
      ruleIds: profile.ruleIds.filter((ruleId) => ruleId !== id),
    })),
  });
}

let migrationInFlight: Promise<IProxyAppState> | undefined;

async function ensureProxyAppStateInternal(): Promise<IProxyAppState> {
  const stored = await browser.storage.local.get([
    APP_STATE_KEY,
    LEGACY_BACKUP_KEY,
    LEGACY_RULES_KEY,
    LEGACY_CONFIG_KEY,
  ]);

  if (isProxyAppState(stored[APP_STATE_KEY])) {
    return stored[APP_STATE_KEY];
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

  await browser.storage.local.set(values);
  const verification = await browser.storage.local.get(APP_STATE_KEY);
  if (!isProxyAppState(verification[APP_STATE_KEY])) {
    throw new Error('Proxy state migration could not be verified. Legacy data was left untouched.');
  }
  return verification[APP_STATE_KEY];
}

export async function ensureProxyAppState(): Promise<IProxyAppState> {
  if (migrationInFlight) return migrationInFlight;
  const operation = ensureProxyAppStateInternal();
  migrationInFlight = operation;
  try {
    return await operation;
  } finally {
    if (migrationInFlight === operation) migrationInFlight = undefined;
  }
}
