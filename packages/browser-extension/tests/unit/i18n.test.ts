import { describe, expect, it } from 'vitest';
import { LANGUAGES, resolveLocale, translate } from '../../src/common/i18n';
import { messages } from '../../src/common/locales';

describe('six-language UI catalog', () => {
  it('maps browser language variants with a predictable English fallback', () => {
    for (const [input, expected] of Object.entries({ 'en-US': 'en', 'zh-CN': 'zh-CN', zh: 'zh-CN', 'zh_Hans_SG': 'zh-CN', 'ko-KR': 'ko', 'ja-JP': 'ja', 'fr-CA': 'fr', 'es-MX': 'es', 'zh-TW': 'en', 'zh-Hant': 'en', de: 'en', '': 'en' })) {
      expect(resolveLocale(input)).toBe(expected);
    }
  });
  it('includes all six translations with identical interpolation variables', () => {
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    for (const [key, translations] of Object.entries(messages)) {
      expect(Object.keys(translations).sort(), key).toEqual(Object.keys(LANGUAGES).sort());
      for (const text of Object.values(translations)) {
        expect(text.trim().length, key).toBeGreaterThan(0);
        expect(placeholders(text), key).toEqual(placeholders(key));
      }
    }
  });
  it('preserves user values and unknown browser diagnostics without interpretation', () => {
    const name = 'My $& {rule} https://example.com';
    expect(translate('Edit {name}', 'zh-CN', { name })).toContain(name);
    expect(translate('ERR_CONNECTION_RESET', 'ja')).toBe('ERR_CONNECTION_RESET');
    expect(translate('{count} selected', 'en', { count: 3 })).toBe('3 selected');
  });
});
