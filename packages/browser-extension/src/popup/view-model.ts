import browser from 'webextension-polyfill';
import { useCallback, useEffect, useRef, useState } from 'react';
import { isSupportedProtocol } from '@/common/utils';
import { inspectorPathForTab, parseInspectorTabId } from '@/common/inspector-target';
import { APP_STATE_KEY, type IProxyRule } from '@/common/proxy-state';
import { EMPTY_QUICK_CONTROLS, PINNED_RULES_KEY, type QuickControls } from '@/common/quick-controls';
import { ruleAppliesToOrigin } from '@/common/rule-explanation';
import type { IAdvancedProxyStatus } from '@/background/advanced-proxy';

export function useViewModel() {
  const [origin, setOrigin] = useState('');
  const [rules, setRules] = useState<IProxyRule[]>([]);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [status, setStatus] = useState<IAdvancedProxyStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const tabId = useRef<number | null>(null);
  const mounted = useRef(false);
  const busyRef = useRef(false);
  const version = useRef(0);

  const sync = useCallback(async () => {
    const current = ++version.current;
    if (tabId.current === null) return;
    const [tab, nextStatus, state, pins] = await Promise.all([
      browser.tabs.get(tabId.current),
      browser.runtime.sendMessage({ type: 'getAdvancedProxyStatus', payload: { tabId: tabId.current } }),
      browser.runtime.sendMessage({ type: 'getProxyState' }),
      browser.storage.local.get(PINNED_RULES_KEY),
    ]);
    if (!mounted.current || current !== version.current) return;
    const url = tab.url ? new URL(tab.url) : null;
    setOrigin(url && isSupportedProtocol(url.protocol) ? url.origin : '');
    if (!state?.rules) throw new Error(state?.error || 'Failed to load rule data');
    setRules(state.rules);
    setStatus(nextStatus);
    setPinnedIds(Array.isArray(pins[PINNED_RULES_KEY]) ? pins[PINNED_RULES_KEY].filter((id: unknown) => typeof id === 'string') : []);
    setReady(true);
  }, []);

  useEffect(() => {
    mounted.current = true;
    const refresh = () => { void sync().catch((cause) => { if (mounted.current) setError(String(cause)); }); };
    const onMessage = (message: any) => {
      if (message?.type === 'advancedProxyStatusChange' && message.payload?.tabId === tabId.current) refresh();
    };
    const onStorage = (changes: Record<string, browser.Storage.StorageChange>, area: string) => {
      if (area === 'local' && (changes[APP_STATE_KEY] || changes[PINNED_RULES_KEY])) refresh();
    };
    const onUpdated = (id: number, change: browser.Tabs.OnUpdatedChangeInfoType) => {
      if (id === tabId.current && change.url) refresh();
    };
    const onRemoved = (id: number) => {
      if (id === tabId.current) { ++version.current; tabId.current = null; setOrigin(''); setStatus(null); }
    };
    browser.runtime.onMessage.addListener(onMessage);
    browser.storage.onChanged.addListener(onStorage);
    browser.tabs.onUpdated.addListener(onUpdated);
    browser.tabs.onRemoved.addListener(onRemoved);
    void (async () => {
      // Explicit targets also let the popup be opened as a standalone control surface.
      const requested = parseInspectorTabId(location.search);
      const tab = requested === null
        ? (await browser.tabs.query({ active: true, currentWindow: true }))[0]
        : await browser.tabs.get(requested);
      if (!mounted.current) return;
      if (typeof tab?.id !== 'number') throw new Error('No active tab found or tab URL is unavailable');
      tabId.current = tab.id;
      await sync();
    })().catch((cause) => { if (mounted.current) { setError(String(cause)); setReady(true); } });
    return () => {
      mounted.current = false;
      ++version.current;
      browser.runtime.onMessage.removeListener(onMessage);
      browser.storage.onChanged.removeListener(onStorage);
      browser.tabs.onUpdated.removeListener(onUpdated);
      browser.tabs.onRemoved.removeListener(onRemoved);
    };
  }, [sync]);

  const run = async (action: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setError(null);
    try { await action(); await sync(); }
    catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  };

  const connected = status?.phase === 'connected';
  const quickControls = connected ? status.quickControls || EMPTY_QUICK_CONTROLS : EMPTY_QUICK_CONTROLS;
  const sendSession = async (type: string, controls?: QuickControls) => {
    if (tabId.current === null) throw new Error('No active tab found or tab URL is unavailable');
    const next = await browser.runtime.sendMessage({ type, payload: { tabId: tabId.current, quickControls: controls } });
    if (!next?.phase || next.phase === 'error' || next.error) throw new Error(next?.error || 'Unable to start proxy session.');
    if (mounted.current) setStatus(next);
  };
  const setQuickControls = (patch: Partial<QuickControls>) => run(async () => {
    const controls = { ...quickControls, ...patch };
    await sendSession(connected ? 'updateQuickControls' : 'enableAdvancedProxy', controls);
  });
  const toggleSession = () => run(() => sendSession(connected ? 'disableAdvancedProxy' : 'enableAdvancedProxy'));
  const toggleRule = (rule: IProxyRule, enabled: boolean) => run(async () => {
    const result = await browser.runtime.sendMessage({ type: 'saveProxyRule', payload: { rule: { id: rule.id, enabled } } });
    if (!result?.success) throw new Error(result?.error || 'Failed to update rule');
  });
  const pinRule = (id: string, pinned: boolean) => run(async () => {
    const next = pinned ? [...new Set([...pinnedIds, id])] : pinnedIds.filter((value) => value !== id);
    await browser.storage.local.set({ [PINNED_RULES_KEY]: next });
  });
  const gotoOptionsPage = () => run(async () => { await browser.runtime.openOptionsPage(); window.close(); });
  const openInspector = () => run(async () => {
    if (tabId.current === null) return;
    if (__TARGET__ === 'chrome') {
      await chrome.sidePanel.setOptions({ tabId: tabId.current, path: inspectorPathForTab(tabId.current), enabled: true });
      await chrome.sidePanel.open({ tabId: tabId.current });
    } else {
      await browser.runtime.sendMessage({ type: 'openSidePanel', payload: { tabId: tabId.current } });
    }
    window.close();
  });

  const siteRules = rules.filter((rule) => ruleAppliesToOrigin(rule, origin));
  return {
    origin, ready, busy, error, connected, quickControls, status,
    isSupported: ready && !!origin,
    siteRules,
    pinnedRules: siteRules.filter((rule) => pinnedIds.includes(rule.id)),
    pinnableRules: siteRules.filter((rule) => rule.source === 'user'),
    legacyCorsRules: siteRules.filter((rule) => rule.source === 'legacy-cors'),
    pinnedIds, setQuickControls, toggleSession, toggleRule, pinRule, openInspector, gotoOptionsPage,
    clearError: () => setError(null),
  };
}
