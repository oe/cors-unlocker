import { useState } from 'react';
import { Languages } from 'lucide-react';
import { LANGUAGES, setLanguage, t, useLocale, type LanguagePreference } from '@/common/i18n';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function LanguageSelect() {
  const { preference } = useLocale();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  return <div className="flex shrink-0 flex-col gap-1">
    <Select value={preference} disabled={pending} onValueChange={async (value) => {
      if (!value) return;
      setPending(true); setError(false);
      try { await setLanguage(value as LanguagePreference); } catch { setError(true); } finally { setPending(false); }
    }}>
      <SelectTrigger aria-label={t('Language')} className="max-w-40"><Languages aria-hidden="true" /><SelectValue>{preference === 'auto' ? t('Browser language') : LANGUAGES[preference]}</SelectValue></SelectTrigger>
      <SelectContent><SelectGroup><SelectItem value="auto">{t('Browser language')}</SelectItem>{Object.entries(LANGUAGES).map(([code, name]) => <SelectItem key={code} value={code}>{name}</SelectItem>)}</SelectGroup></SelectContent>
    </Select>
    {error ? <span role="alert" className="text-xs text-destructive">{t('Unable to save language.')}</span> : null}
  </div>;
}
