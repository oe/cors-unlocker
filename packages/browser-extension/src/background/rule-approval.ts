import browser from 'webextension-polyfill';
import { addProxyRule, ensureProxyAppState, isProxyRule, isRuleEnabled, updateProxyRule, type IProxyRule } from '@/common/proxy-state';
import { needsProxy } from '@/common/quick-controls';
import { reconcileSavedRuleRuntime, reconcileSavedRuleTab } from './saved-rule-runtime';
import { getAdvancedProxyStatus } from '@/background/advanced-proxy';

type Approval = {
  id: string; origin: string; tabId: number; rule: Omit<IProxyRule, 'id' | 'createdAt' | 'updatedAt'>;
  existingId?: string; windowId?: number; timer: ReturnType<typeof setTimeout>;
  finish: (result: unknown) => void;
};
const approvals = new Map<string, Approval>();
export function approvalInfo(id: string) {
  const request = approvals.get(id);
  if (!request) throw new Error('This approval request has expired.');
  return { id, origin: request.origin, name: request.rule.name, pattern: request.rule.match.urlPattern, actions: request.rule.actions };
}
function finish(request: Approval, result: unknown) {
  if (!approvals.delete(request.id)) return;
  clearTimeout(request.timer);
  request.finish(result);
  if (request.windowId !== undefined) void browser.windows.remove(request.windowId).catch(() => undefined);
}
export async function requestRuleApproval(data: any, tabId: number, origin: string): Promise<unknown> {
  if ([...approvals.values()].some(request => request.tabId === tabId)) throw new Error('An approval is already open for this tab.');
  const input = data?.rule;
  const rule: Approval['rule'] = {
    name: typeof input?.name === 'string' ? input.name.trim().slice(0, 120) : '',
    enabled: true, source: 'user',
    match: {
      initiatorOrigins: [origin],
      urlPattern: typeof input?.urlPattern === 'string' ? input.urlPattern.trim().slice(0, 2048) : '',
      methods: Array.isArray(input?.methods) ? input.methods.slice(0, 16).map((value: unknown) => String(value).toUpperCase()) : undefined,
      resourceTypes: Array.isArray(input?.resourceTypes) ? input.resourceTypes.slice(0, 16).map(String) : undefined,
    },
    actions: Array.isArray(input?.actions) ? input.actions : [],
  };
  if (!isProxyRule({ ...rule, id: 'approval', createdAt: 1, updatedAt: 1 })) throw new Error('Invalid rule.');
  const id = crypto.randomUUID();
  return new Promise(resolve => {
    const request: Approval = {
      id, origin, tabId, rule, existingId: typeof data?.id === 'string' ? data.id : undefined,
      finish: resolve,
      timer: setTimeout(() => finish(request, { error: { type: 'user-cancel', message: 'Rule approval expired.' } }), 120_000),
    };
    approvals.set(id, request);
    void browser.windows.create({
      url: browser.runtime.getURL('src/approve/index.html') + '?id=' + encodeURIComponent(id),
      type: 'popup', width: 520, height: 600,
    }).then(window => {
      if (!approvals.has(id)) { if (window.id !== undefined) void browser.windows.remove(window.id); return; }
      request.windowId = window.id;
    }).catch(error => finish(request, { error: { type: 'communication-failed', message: String(error) } }));
  });
}
export async function resolveRuleApproval(id: string, accepted: boolean) {
  const request = approvals.get(id);
  if (!request) throw new Error('This approval request has expired.');
  if (!accepted) { finish(request, { error: { type: 'user-cancel', message: 'The user declined the rule.' } }); return; }
  const tab = await browser.tabs.get(request.tabId);
  if (!tab.url || new URL(tab.url).origin !== request.origin) throw new Error('The requesting page has changed. Try again from that page.');
  let saved: IProxyRule;
  if (request.existingId) {
    const state = await ensureProxyAppState();
    const existing = state.rules.find(rule => rule.id === request.existingId);
    if (!existing || existing.source !== 'user' || existing.match.initiatorOrigins.length !== 1
      || existing.match.initiatorOrigins[0] !== request.origin) throw new Error('This page cannot change that rule.');
    saved = await updateProxyRule(existing.id, request.rule);
  } else saved = await addProxyRule(request.rule);
  const state = await ensureProxyAppState();
  await reconcileSavedRuleRuntime(state);
  await reconcileSavedRuleTab(request.tabId);
  const status = getAdvancedProxyStatus(request.tabId);
  const ready = isRuleEnabled(saved, state.profiles) && (!needsProxy(saved) || status.phase === 'connected');
  finish(request, { id: saved.id, enabled: true, ready, error: ready ? undefined : status.error || 'The rule group is paused.', workspaceOpened: false });
  await browser.tabs.update(request.tabId, { active: true }).catch(() => undefined);
}
browser.windows.onRemoved.addListener(windowId => {
  for (const request of approvals.values()) if (request.windowId === windowId) {
    finish(request, { error: { type: 'user-cancel', message: 'The approval window was closed.' } });
  }
});
browser.tabs.onRemoved.addListener(tabId => {
  for (const request of approvals.values()) if (request.tabId === tabId) {
    finish(request, { error: { type: 'user-cancel', message: 'The requesting tab was closed.' } });
  }
});
