import browser from 'webextension-polyfill';
import { effectiveRules, type IProxyAppState } from '@/common/proxy-state';
import { hasActiveQuickControls, hasRuntimeRules } from '@/common/quick-controls';
import { disableAdvancedProxyTransport, enableAdvancedProxy, getAdvancedProxyStatus } from '@/background/advanced-proxy';
import { setRuleRuntimeHooks } from './rule-runtime-bridge';
import { logger } from '@/common/logger';

const PAUSED_TABS = 'wireflipPausedRuleTabs';
let rules: ReturnType<typeof effectiveRules> = [];
const paused = new Map<number, string>();
const queues = new Map<number, Promise<unknown>>();
let initialized = false;
let restored: Promise<void> = Promise.resolve();

function pageOrigin(tab: browser.Tabs.Tab): string | undefined {
  try {
    const url = new URL((tab as browser.Tabs.Tab & { pendingUrl?: string }).pendingUrl || tab.url || '');
    return /^https?:$/.test(url.protocol) ? url.origin : undefined;
  } catch { return undefined; }
}
function persistPauses() {
  void browser.storage.session.set({ [PAUSED_TABS]: Object.fromEntries(paused) }).catch(() => undefined);
}

/** Rule switches describe persistent execution, never an Inspector connection. */
export function reconcileSavedRuleTab(tabId: number): Promise<unknown> {
  const previous = queues.get(tabId) || Promise.resolve();
  const next = previous.catch(() => undefined).then(async () => {
    await restored;
    let tab: browser.Tabs.Tab;
    try { tab = await browser.tabs.get(tabId); } catch { return; }
    const origin = pageOrigin(tab);
    let status = getAdvancedProxyStatus(tabId);
    if (status.origin && status.origin !== origin) {
      await disableAdvancedProxyTransport(tabId);
      status = getAdvancedProxyStatus(tabId);
    }
    if (paused.has(tabId) && paused.get(tabId) !== origin) {
      paused.delete(tabId); persistPauses(); status = getAdvancedProxyStatus(tabId);
    }
    const needed = !!origin && hasRuntimeRules(rules, origin);
    if (!needed) {
      if (paused.delete(tabId)) persistPauses();
      if (['connected', 'connecting', 'error'].includes(status.phase) && status.recording === false
        && !(status.quickControls && hasActiveQuickControls(status.quickControls))) {
        return disableAdvancedProxyTransport(tabId);
      }
      return status;
    }
    // A browser Stop action or attach conflict must never trigger a reconnect loop.
    if (paused.has(tabId) || status.phase === 'error') return status;
    if (status.phase === 'connected' && status.captureEnabled !== false) return status;
    return enableAdvancedProxy(tabId, { automatic: true });
  });
  queues.set(tabId, next);
  void next.finally(() => { if (queues.get(tabId) === next) queues.delete(tabId); }).catch(() => undefined);
  return next;
}

/** An explicit retry resumes saved execution without opting into recording. */
export async function retrySavedRuleTab(tabId: number): Promise<unknown> {
  if (paused.delete(tabId)) persistPauses();
  if (getAdvancedProxyStatus(tabId).phase === 'error') await disableAdvancedProxyTransport(tabId);
  return reconcileSavedRuleTab(tabId);
}

export function clearSavedRuleRuntime() { rules = []; }

export async function reconcileSavedRuleRuntime(state: IProxyAppState): Promise<void> {
  rules = effectiveRules(state);
  const tabs = await browser.tabs.query({});
  await Promise.all(tabs.flatMap(tab => typeof tab.id === 'number' ? [reconcileSavedRuleTab(tab.id).catch(error => { logger.debug('Rule preparation failed for tab:', tab.id, error); })] : []));
}

export function initializeSavedRuleRuntime() {
  if (initialized) return;
  initialized = true;
  restored = browser.storage.session.get(PAUSED_TABS).then(stored => {
    const values = stored[PAUSED_TABS];
    if (values && typeof values === 'object') for (const [id, origin] of Object.entries(values)) {
      if (/^\d+$/.test(id) && typeof origin === 'string') paused.set(Number(id), origin);
    }
  }).catch(() => undefined);
  setRuleRuntimeHooks({
    ensure: reconcileSavedRuleTab,
    pausedOrigin: id => paused.get(id),
    pause: (id, origin) => { if (origin) { paused.set(id, origin); persistPauses(); } },
    resume: id => { if (paused.delete(id)) persistPauses(); },
  });
  browser.tabs.onCreated.addListener(tab => {
    if (typeof tab.id === 'number') void reconcileSavedRuleTab(tab.id).catch(error => logger.debug('Rule preparation failed:', error));
  });
  browser.tabs.onUpdated.addListener((id, change) => {
    if (change.url || change.status === 'loading' || change.status === 'complete') {
      void reconcileSavedRuleTab(id).catch(error => logger.debug('Rule preparation failed:', error));
    }
  });
  browser.tabs.onRemoved.addListener(id => { if (paused.delete(id)) persistPauses(); });
}
