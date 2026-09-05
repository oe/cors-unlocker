import { isProxyAppState, migrateLegacyState, type IProxyAppState } from './proxy-state';
import type { IRuleItem } from '../types';

/** Parse without touching storage. Legacy backups are converted once into v2. */
export function parseImport(text: string): IProxyAppState {
  const data = JSON.parse(text);
  if (data?.version === '2.0') {
    if (!isProxyAppState(data.state)) throw new Error('Invalid v2 configuration.');
    const state: IProxyAppState = data.state;
    if (new Set(state.rules.map((rule) => rule.id)).size !== state.rules.length) throw new Error('Duplicate rule IDs.');
    return data.state;
  }
  if (!Array.isArray(data?.rules) || !data.rules.every((rule: IRuleItem) => rule
    && Number.isFinite(rule.id) && typeof rule.origin === 'string'
    && Number.isFinite(rule.createdAt) && Number.isFinite(rule.updatedAt)
    && (rule.extraHeaders === undefined || typeof rule.extraHeaders === 'string'))) throw new Error('Invalid backup format.');
  const migrated = migrateLegacyState(data.rules, {});
  if (!isProxyAppState(migrated) || new Set(migrated.rules.map((rule) => rule.id)).size !== migrated.rules.length) throw new Error('Invalid legacy rules.');
  return migrated;
}

export function previewImport(current: IProxyAppState, incoming: IProxyAppState, merge: boolean) {
  const ids = new Set(current.rules.map((rule) => rule.id));
  const incomingIds = new Set(incoming.rules.map((rule) => rule.id));
  return {
    added: incoming.rules.filter((rule) => !ids.has(rule.id)).length,
    replaced: incoming.rules.filter((rule) => ids.has(rule.id)).length,
    removed: merge ? 0 : current.rules.filter((rule) => !incomingIds.has(rule.id)).length,
    total: merge ? new Set([...ids, ...incomingIds]).size : incoming.rules.length,
  };
}
