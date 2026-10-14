import { useSyncExternalStore } from 'react';
import browser from 'webextension-polyfill';

export type ThemePreference = 'system' | 'light' | 'dark';
export const THEME_KEY = 'uiTheme';
let preference: ThemePreference = 'system';
let system: MediaQueryList;
let initialized: Promise<void> | undefined;
const listeners = new Set<() => void>();

function apply(value: unknown) {
  preference = value === 'light' || value === 'dark' ? value : 'system';
  const dark = preference === 'dark' || (preference === 'system' && system?.matches);
  document.documentElement.classList.toggle('dark', !!dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  document.documentElement.dataset.theme = preference;
  listeners.forEach((listener) => listener());
}

export function initializeTheme(): Promise<void> {
  if (!initialized) initialized = (async () => {
    system = window.matchMedia('(prefers-color-scheme: dark)');
    system.addEventListener('change', () => apply(preference));
    browser.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[THEME_KEY]) apply(changes[THEME_KEY].newValue);
    });
    try { const stored = await browser.storage.local.get(THEME_KEY); apply(stored[THEME_KEY]); }
    catch { apply('system'); }
  })();
  return initialized;
}

export async function setTheme(value: ThemePreference) {
  await browser.storage.local.set({ [THEME_KEY]: value });
  apply(value);
}

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function useTheme() {
  return useSyncExternalStore(subscribe, () => preference);
}
