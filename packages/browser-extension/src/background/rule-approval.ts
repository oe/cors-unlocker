import { addProxyRule, ensureProxyAppState, isProxyRule, isRuleEnabled, performProxyStateOperation, type IProxyRule } from '@/common/proxy-state';
import { ownsSdkRule } from '@/common/sdk-access';
import { needsProxy } from '@/common/quick-controls';
import { reconcileSavedRuleRuntime, reconcileSavedRuleTab } from './saved-rule-runtime';
import { resumeSavedRuleRuntime } from './rule-runtime-bridge';
import { disableAdvancedProxyTransport, getAdvancedProxyStatus } from '@/background/advanced-proxy';

export function normalizeSdkRule(data: any, origin: string) {
  const input = data?.rule;
  const rule: Omit<IProxyRule, 'id' | 'createdAt' | 'updatedAt'> = {
    name: typeof input?.name === 'string' ? input.name.trim().slice(0, 120) : '',
    enabled: true, source: 'user', sdkOrigin: origin,
    match: {
      initiatorOrigins: [origin],
      urlPattern: typeof input?.urlPattern === 'string' ? input.urlPattern.trim().slice(0, 2048) : '',
      methods: Array.isArray(input?.methods) ? input.methods.slice(0, 16).map((value: unknown) => String(value).toUpperCase()) : undefined,
      resourceTypes: Array.isArray(input?.resourceTypes) ? input.resourceTypes.slice(0, 16).map(String) : undefined,
    },
    actions: Array.isArray(input?.actions) ? input.actions : [],
  };
  if (!isProxyRule({ ...rule, id: 'approval', createdAt: 1, updatedAt: 1 })) throw new Error('Invalid rule.');
  return rule;
}
export async function ownedSdkRule(id: unknown, origin: string) {
  const state = await ensureProxyAppState();
  const rule = state.rules.find(rule => rule.id === id);
  if (!rule || !ownsSdkRule(rule, origin)) throw new Error('This page cannot change that rule.');
  return rule;
}
export async function applySdkRule(data: any, tabId: number, origin: string, enabled = true) {
  const input = normalizeSdkRule(data, origin);
  if (data?.id !== undefined) await ownedSdkRule(data.id, origin);
  const saved = data?.id !== undefined
    ? (await performProxyStateOperation({ kind: 'update', id: data.id, update: { ...input, enabled }, sdkOrigin: origin })).rules.find(rule => rule.id === data.id)!
    : await addProxyRule({ ...input, enabled });
  return sdkRuleResult(saved, tabId, origin);
}
export async function sdkRuleResult(saved: IProxyRule, tabId: number, origin: string) {
  try {
    const state = await ensureProxyAppState();
    if (saved.enabled) {
      resumeSavedRuleRuntime(tabId);
      if (getAdvancedProxyStatus(tabId).phase === 'error') await disableAdvancedProxyTransport(tabId);
    }
    await reconcileSavedRuleRuntime(state);
    await reconcileSavedRuleTab(tabId);
    const status = getAdvancedProxyStatus(tabId);
    const enabled = isRuleEnabled(saved, state.profiles);
    const ready = enabled && (!needsProxy(saved) || status.phase === 'connected' && status.origin === origin && status.captureEnabled !== false);
    return { id: saved.id, enabled: saved.enabled, ready, error: saved.enabled && !ready ? status.error || 'The rule group is paused.' : undefined, workspaceOpened: false as const };
  } catch (error) { return { id: saved.id, enabled: saved.enabled, ready: false, error: String(error), workspaceOpened: false as const }; }
}
