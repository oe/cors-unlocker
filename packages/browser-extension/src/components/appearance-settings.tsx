import { useState } from 'react';
import { Settings } from 'lucide-react';
import { t } from '@/common/i18n';
import { setTheme, useTheme, type ThemePreference } from '@/common/theme';
import { LanguageSelect } from './language-select';
import { Button } from './ui/button';
import { Field, FieldGroup, FieldLabel } from './ui/field';
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from './ui/popover';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from './ui/select';

const THEMES: Record<ThemePreference, string> = { system: 'Follow system', light: 'Light', dark: 'Dark' };

export function AppearanceSettings() {
  const theme = useTheme();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  return <Popover>
    <PopoverTrigger render={<Button variant="ghost" className="h-9 w-full lg:justify-start" aria-label={t('Settings')} title={t('Settings')} />}>
      <Settings data-icon="inline-start" /><span className="hidden min-w-0 truncate lg:block">{t('Settings')}</span>
    </PopoverTrigger>
    <PopoverContent side="top" align="start" sideOffset={8} className="max-w-[calc(100vw-1rem)] gap-4 p-4">
      <PopoverHeader><PopoverTitle>{t('Settings')}</PopoverTitle></PopoverHeader>
      <FieldGroup>
        <Field><FieldLabel htmlFor="settings-language">{t('Language')}</FieldLabel><LanguageSelect id="settings-language" /></Field>
        <Field>
          <FieldLabel htmlFor="settings-theme">{t('Theme')}</FieldLabel>
          <Select value={theme} disabled={pending} onValueChange={async (value) => {
            if (!value) return;
            setPending(true); setError(false);
            try { await setTheme(value as ThemePreference); } catch { setError(true); } finally { setPending(false); }
          }}>
            <SelectTrigger id="settings-theme" aria-label={t('Theme')} className="w-full"><SelectValue>{t(THEMES[theme])}</SelectValue></SelectTrigger>
            <SelectContent><SelectGroup>{Object.entries(THEMES).map(([value, label]) => <SelectItem key={value} value={value}>{t(label)}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
          {error ? <p role="alert" className="text-xs text-destructive">{t('Unable to save theme.')}</p> : null}
        </Field>
      </FieldGroup>
    </PopoverContent>
  </Popover>;
}
