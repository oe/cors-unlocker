import browser from 'webextension-polyfill';
import type { IProxyRule } from './proxy-state';

export const SDK_ACCESS_KEY = 'sdkSiteAccess';
export interface SiteAccess {
  origin: string;
  trusted: boolean;
  lastOperation?: { label: string; at: number };
}
let writes: Promise<unknown> = Promise.resolve();
export async function getSiteAccess(origin: string): Promise<SiteAccess> {
  const stored = (await browser.storage.local.get(SDK_ACCESS_KEY))[SDK_ACCESS_KEY];
  const entry = Array.isArray(stored) ? stored.find(value => value?.origin === origin) : undefined;
  return { origin, trusted: entry?.trusted === true, lastOperation: entry?.lastOperation };
}
export function updateSiteAccess(origin: string, update: Partial<Omit<SiteAccess, 'origin'>>): Promise<void> {
  const next = writes.then(async () => {
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) throw new Error('Invalid site origin.');
    const stored = (await browser.storage.local.get(SDK_ACCESS_KEY))[SDK_ACCESS_KEY];
    const entries: SiteAccess[] = Array.isArray(stored) ? stored : [];
    const current = entries.find(value => value.origin === origin);
    await browser.storage.local.set({ [SDK_ACCESS_KEY]: [...entries.filter(value => value.origin !== origin),
      { origin, trusted: false, ...current, ...update }] });
  });
  writes = next.catch(() => undefined);
  return next;
}
export function ownsSdkRule(rule: IProxyRule, origin: string): boolean {
  return rule.sdkOrigin === origin && rule.match.initiatorOrigins.length === 1
    && rule.match.initiatorOrigins[0] === origin;
}
