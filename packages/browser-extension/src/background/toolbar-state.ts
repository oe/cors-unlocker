import type browser from 'webextension-polyfill';
import type { IAdvancedProxyStatus } from './advanced-proxy';
import { toolbarMessages } from '@/common/toolbar-messages';
import type { Locale } from '@/common/locale';

export const TOOLBAR_COLORS = { idle: '#64748b', rules: '#2563eb', connected: '#15803d', connecting: '#b45309', error: '#dc2626' } as const;
export type ToolbarState = keyof typeof TOOLBAR_COLORS;
export interface ToolbarPresentation { state: ToolbarState; badge: string; title: string }

export function toolbarPresentation(url: string | undefined, status: IAdvancedProxyStatus, persistentCount: number, locale: Locale): ToolbarPresentation {
  const text = (key: keyof typeof toolbarMessages) => toolbarMessages[key][locale];
  let origin: string;
  try {
    const parsed = new URL(url || '');
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
    origin = parsed.origin;
  } catch { return { state: 'idle', badge: '', title: `Forth Intercept\n${text('Select an HTTP or HTTPS tab.')}` }; }
  // A navigation can precede the engine's asynchronous detach notification.
  const phase = status.origin && status.origin !== origin ? 'disabled' : status.phase;
  const state: ToolbarState = phase === 'error' ? 'error' : phase === 'connecting' ? 'connecting'
    : phase === 'connected' ? 'connected' : persistentCount > 0 ? 'rules' : 'idle';
  const heading = text(state === 'error' ? 'Tab session error' : state === 'connecting' ? 'Connecting…'
    : state === 'connected' ? 'Tab session active' : 'Tab session stopped');
  const count = text('{count} persistent rules enabled').replace('{count}', String(persistentCount));
  const badge = state === 'rules' ? (persistentCount > 99 ? '99+' : String(persistentCount))
    : state === 'connected' ? 'ON' : state === 'connecting' ? '…' : state === 'error' ? '!' : '';
  return { state, badge, title: `Forth Intercept\n${heading}\n${count}` };
}

export function countTabBrowserRules(rules: browser.DeclarativeNetRequest.Rule[], tabId: number): number {
  return rules.filter(({ condition }) => (!condition.tabIds || condition.tabIds.includes(tabId))
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
    // The F and intercepted crossbar keep the existing brand recognizable at 16 px.
    ctx.lineWidth = 4.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(10, 25); ctx.lineTo(10, 12); ctx.quadraticCurveTo(10, 8, 14, 8); ctx.lineTo(24, 8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(10, 18); ctx.lineTo(19, 18); ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = '#111827';
    ctx.beginPath(); ctx.moveTo(18, 14); ctx.lineTo(25, 14); ctx.stroke();
    result[size] = ctx.getImageData(0, 0, size, size) as browser.Action.ImageDataType;
  }
  icons.set(state, result);
  return result;
}
