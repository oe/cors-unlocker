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
