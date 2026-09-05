import { useSyncExternalStore } from 'react';
import browser from 'webextension-polyfill';
import { messages } from './locales';

export const LANGUAGES = { en: 'English', 'zh-CN': '简体中文', ko: '한국어', ja: '日本語', fr: 'Français', es: 'Español' } as const;
export type Locale = keyof typeof LANGUAGES;
export type LanguagePreference = Locale | 'auto';
export const LANGUAGE_KEY = 'uiLanguage';
export function resolveLocale(language: string): Locale {
  const code = language.toLowerCase().replaceAll('_', '-');
  if (/^zh(?:$|-)/.test(code)) return /hant|tw|hk|mo/.test(code) ? 'en' : 'zh-CN';
  const base = code.split('-')[0];
  return Object.hasOwn(LANGUAGES, base) ? base as Locale : 'en';
}
let preference: LanguagePreference = 'auto';
let locale: Locale = resolveLocale(typeof navigator === 'undefined' ? 'en' : navigator.language);
const listeners = new Set<() => void>();
export function translate(key: string, target: Locale, params: Record<string, string | number> = {}): string {
  const text = messages[key]?.[target] || key;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => Object.hasOwn(params, name) ? String(params[name]) : match);
}
export const t = (key: string, params?: Record<string, string | number>) => translate(key, locale, params);
// Keep unknown browser diagnostics and user-provided values intact.
export function translateError(message: string): string {
  const clean = message.replace(/^Error: /, '');
  if (clean.startsWith('Nothing imported: ')) return t('Nothing imported: {error}', { error: translateError(clean.slice(18)) });
  const protocol = clean.match(/^(\S+) pages cannot be inspected\. Select an HTTP or HTTPS tab\.$/);
  if (protocol) return t('{protocol} pages cannot be inspected. Select an HTTP or HTTPS tab.', { protocol: protocol[1] });
  const unsupported = clean.match(/^(\S+) protocol is not supported\. Only http:\/\/ and https:\/\/ are supported\.$/);
  if (unsupported) return t('{protocol} protocol is not supported. Only http:// and https:// are supported.', { protocol: unsupported[1] });
  const header = clean.match(/^(Request|Response) header: (.*)$/);
  if (header) return t(`${header[1]} header: {name}`, { name: header[2] });
  return t(clean);
}
export const formatDate = (timestamp: number) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp);
function apply(value: unknown) {
  preference = typeof value === 'string' && (value === 'auto' || Object.hasOwn(LANGUAGES, value)) ? value as LanguagePreference : 'auto';
  locale = preference === 'auto' ? resolveLocale(navigator.language) : preference;
  document.documentElement.lang = locale;
  document.title = `Forth Intercept · ${t(location.pathname.includes('sidepanel') ? 'Site controls' : location.pathname.includes('options') ? 'Rules' : 'Local request controls')}`;
  listeners.forEach((listener) => listener());
}
let initialized: Promise<void> | undefined;
export function initializeLocale(): Promise<void> {
  if (!initialized) initialized = (async () => {
    browser.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[LANGUAGE_KEY]) apply(changes[LANGUAGE_KEY].newValue);
    });
    try { const stored = await browser.storage.local.get(LANGUAGE_KEY); apply(stored[LANGUAGE_KEY]); }
    catch { apply('auto'); }
  })();
  return initialized;
}
export async function setLanguage(value: LanguagePreference) {
  await browser.storage.local.set({ [LANGUAGE_KEY]: value });
  apply(value);
}
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function useLocale() {
  useSyncExternalStore(subscribe, () => `${preference}:${locale}`);
  return { locale, preference };
}
