import { runtimeMessages } from '@/common/runtime-messages';
import { hasActiveQuickControls } from '@/common/quick-controls';
import type browser from 'webextension-polyfill';
import type { IAdvancedProxyStatus } from './advanced-proxy';
import { toolbarMessages } from '@/common/toolbar-messages';
import type { Locale } from '@/common/locale';
import { TEMPORARY_CORS_RULE_ID_BASE } from '@/common/session-dnr';
import type { TabRuleSummary } from '@/common/tab-rule-summary';

export const TOOLBAR_COLORS = { idle: '#64748b', rules: '#2563eb', connected: '#15803d', connecting: '#b45309', error: '#dc2626' } as const;
export type ToolbarState = keyof typeof TOOLBAR_COLORS;
export interface ToolbarPresentation { state: ToolbarState; badge: string; title: string }

export function toolbarPresentation(url: string | undefined, status: IAdvancedProxyStatus, persistentCount: number, locale: Locale, summary?: TabRuleSummary): ToolbarPresentation {
  const text = (key: string) => runtimeMessages[key]?.[locale] || toolbarMessages[key as keyof typeof toolbarMessages]?.[locale] || key;
  let origin: string;
  try {
    const parsed = new URL(url || '');
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
    origin = parsed.origin;
  } catch { return { state: 'idle', badge: '', title: `Wireflip\n${text('Select an HTTP or HTTPS tab.')}` }; }
  // A navigation can precede the engine's asynchronous detach notification.
  const phase = status.origin && status.origin !== origin ? 'disabled' : status.phase;
  const automatic = phase === 'connected' && status.recording === false && !(status.quickControls && hasActiveQuickControls(status.quickControls));
  persistentCount = Math.max(persistentCount, summary?.enabledRules ?? 0);
  const preparing = phase === 'connecting' || phase === 'disabled' && !!summary?.sessionRules;
  const state: ToolbarState = phase === 'error' ? 'error' : preparing ? 'connecting'
    : automatic ? 'rules' : phase === 'connected' ? 'connected' : persistentCount > 0 ? 'rules' : 'idle';
  const allPaused = state === 'idle' && !!summary?.pausedRules && !summary.sessionRules;
  const heading = text(state === 'error' ? 'Rule execution needs attention' : state === 'connecting' ? 'Connecting…' : allPaused ? 'Saved rules paused'
    : state === 'rules' ? 'Saved rules active' : state === 'connected' ? (status.recording === false ? 'Temporary changes active' : 'Recording requests') : 'Not recording requests');
  const count = text('{count} persistent rules enabled').replace('{count}', String(persistentCount));
  const badge = state === 'rules' ? (persistentCount > 99 ? '99+' : String(persistentCount))
    : state === 'connected' ? 'ON' : state === 'connecting' ? '…' : state === 'error' ? '!' : allPaused ? 'OFF' : '';
  const details: string[] = [];
  // Report applied controls only; pending, failed and previous-origin sessions are inactive.
  if (phase === 'connected') {
    if (status.captureEnabled !== undefined && !(status.recording ?? status.captureEnabled)) details.push(text('Not recording requests'));
    const controls = status.quickControls;
    const active: string[] = [];
    if (controls?.cors) active.push(text('CORS repair') + (controls.credentials ? ` · ${text('Allow credentials')}` : ''));
    if (controls?.disableCache) active.push(text('Disable cache'));
    if (controls && controls.delayMs > 0) {
      const duration = controls.delayMs < 1000 ? `${controls.delayMs} ms` : `${controls.delayMs / 1000} s`;
      active.push(text('Request delay: {duration}').replace('{duration}', duration));
    }
    if (controls?.failure) active.push(text('Simulate failure'));
    if (active.length) details.push(text('This tab · temporary'), ...active.map((label) => `• ${label}`));
  }
  if (summary) {
    if ((phase === 'disabled' || phase === 'connecting') && summary.sessionRules) details.push(text('Preparing enabled rules'));
    if (summary.pausedGroups.length) {
      details.push(text('Paused groups: {count}').replace('{count}', String(summary.pausedGroups.length)));
      // User names must not create extra tooltip lines; keep the native hover card compact.
      details.push(...summary.pausedGroups.slice(0, 3).map((name) => `• ${name.replace(/[\r\n\t]/g, ' ').slice(0, 60)}`));
    }
    if (phase === 'error' && status.error) details.push(text(status.error).replace(/[\r\n\t]/g, ' ').slice(0, 180));
  }
  return { state, badge, title: ['Wireflip', heading, ...details, count, ...(summary ? [text('Click for rules and temporary changes')] : [])].join('\n') };
}

export function countTabBrowserRules(rules: browser.DeclarativeNetRequest.Rule[], tabId: number): number {
  return rules.filter(({ id, condition }) => !(id >= TEMPORARY_CORS_RULE_ID_BASE) && (!condition.tabIds || condition.tabIds.includes(tabId))
    && !condition.excludedTabIds?.includes(tabId)).length;
}
