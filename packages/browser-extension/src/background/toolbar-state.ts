import { runtimeMessages } from '@/common/runtime-messages';
import { hasActiveQuickControls } from '@/common/quick-controls';
import type browser from 'webextension-polyfill';
import type { IAdvancedProxyStatus } from './advanced-proxy';
import { toolbarMessages } from '@/common/toolbar-messages';
import type { Locale } from '@/common/locale';
import { TEMPORARY_CORS_RULE_ID_BASE } from '@/common/session-dnr';
import { BRAND_PATHS, BRAND_VIEWBOX } from '@/common/brand-geometry';
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
  persistentCount = summary?.enabledRules ?? persistentCount;
  const state: ToolbarState = phase === 'error' ? 'error' : phase === 'connecting' ? 'connecting'
    : automatic ? 'rules' : phase === 'connected' ? 'connected' : persistentCount > 0 ? 'rules' : 'idle';
  const allPaused = state === 'idle' && !!summary?.pausedRules && !summary.sessionRules;
  const heading = text(state === 'error' ? 'Rule execution needs attention' : state === 'connecting' ? 'Connecting…' : allPaused ? 'Saved rules paused'
    : state === 'rules' ? 'Saved rules active' : state === 'connected' ? 'Recording requests' : 'Not recording requests');
  const count = text('{count} persistent rules enabled').replace('{count}', String(persistentCount));
  const badge = state === 'rules' ? (persistentCount > 99 ? '99+' : String(persistentCount))
    : state === 'connected' ? 'ON' : state === 'connecting' ? '…' : state === 'error' ? '!' : allPaused ? 'OFF' : '';
  const details: string[] = [];
  // Report applied controls only; pending, failed and previous-origin sessions are inactive.
  if (phase === 'connected') {
    if (status.captureEnabled !== undefined) details.push(text((status.recording ?? status.captureEnabled) ? 'Recording requests' : 'Not recording requests'));
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
    if (phase !== 'connected' && summary.sessionRules) details.push(text('Preparing enabled rules'));
    if (summary.pausedGroups.length) {
      details.push(text('Paused groups: {count}').replace('{count}', String(summary.pausedGroups.length)));
      // User names must not create extra tooltip lines; keep the native hover card compact.
      details.push(...summary.pausedGroups.slice(0, 3).map((name) => `• ${name.replace(/[\r\n\t]/g, ' ').slice(0, 60)}`));
    }
    if (phase === 'error' && status.error) details.push(status.error.replace(/[\r\n\t]/g, ' ').slice(0, 180));
  }
  return { state, badge, title: ['Wireflip', heading, ...details, count, ...(summary ? [text('Click for session controls and group switches')] : [])].join('\n') };
}

export function countTabBrowserRules(rules: browser.DeclarativeNetRequest.Rule[], tabId: number): number {
  return rules.filter(({ id, condition }) => !(id >= TEMPORARY_CORS_RULE_ID_BASE) && (!condition.tabIds || condition.tabIds.includes(tabId))
    && !condition.excludedTabIds?.includes(tabId)).length;
}

const icons = new Map<ToolbarState, Record<string, browser.Action.ImageDataType>>();
export function toolbarIcon(state: ToolbarState): Record<string, browser.Action.ImageDataType> {
  const cached = icons.get(state);
  if (cached) return cached;
  const result: Record<string, browser.Action.ImageDataType> = {};
  for (const size of [16, 32]) {
    const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(size, size) : Object.assign(document.createElement('canvas'), { width: size, height: size });
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!ctx) throw new Error('Toolbar icon canvas unavailable.');
    ctx.scale(size / 32, size / 32);
    ctx.fillStyle = TOOLBAR_COLORS[state];
    ctx.beginPath(); ctx.roundRect(1, 1, 30, 30, 10); ctx.fill();
    // A white version of the approved mark stays readable on every status color.
    const [left, top, width, height] = BRAND_VIEWBOX;
    ctx.scale(32 / width, 32 / height);
    ctx.translate(-left, -top);
    ctx.fillStyle = '#ffffff';
    for (const d of BRAND_PATHS) ctx.fill(new Path2D(d));
    result[size] = ctx.getImageData(0, 0, size, size) as browser.Action.ImageDataType;
  }
  icons.set(state, result);
  return result;
}
