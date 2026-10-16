import { useEffect, useState } from 'react';
import browser from 'webextension-polyfill';
import { t, translateError } from '@/common/i18n';
import { APP_STATE_KEY } from '@/common/proxy-state';
import { LEGACY_UPGRADE_KEY, UPGRADE_SEEN_KEY, upgradeNoticeStatus } from '@/common/upgrade-notice-state';
import { BrandMark } from './brand-mark';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Button } from './ui/button';

export function UpgradeNotice({ onViewRules, onViewRecovery, expanded = false, onAcknowledged }: {
  onViewRules: () => void; onViewRecovery: () => void; expanded?: boolean; onAcknowledged?: () => Promise<void>;
}) {
  const [notice, setNotice] = useState({ visible: false, recovered: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    let revision = 0;
    const keys = [APP_STATE_KEY, UPGRADE_SEEN_KEY, LEGACY_UPGRADE_KEY];
    const refresh = async () => {
      const current = ++revision;
      try {
        const stored = await browser.storage.local.get(keys);
        if (active && current === revision) setNotice(upgradeNoticeStatus(
          stored[APP_STATE_KEY], stored[UPGRADE_SEEN_KEY], stored[LEGACY_UPGRADE_KEY],
        ));
      } catch { /* Configuration errors are shown by the surrounding app. */ }
    };
    const changed = (changes: Record<string, browser.Storage.StorageChange>, area: string) => {
      if (area === 'local' && keys.some((key) => Object.hasOwn(changes, key))) void refresh();
    };
    browser.storage.onChanged.addListener(changed);
    void refresh();
    return () => { active = false; browser.storage.onChanged.removeListener(changed); };
  }, []);
  const acknowledge = async () => {
    setBusy(true); setError('');
    try {
      await browser.storage.local.set({ [UPGRADE_SEEN_KEY]: '2.0' });
      setNotice((current) => ({ ...current, visible: false }));
      await onAcknowledged?.();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };
  if (!notice.visible) return null;
  if (!expanded && notice.recovered) return <div role="region" aria-label={t('About your Wireflip upgrade')} className="flex flex-wrap items-start gap-x-4 gap-y-2 rounded-md border bg-muted/30 px-3 py-2">
    <details className="min-w-0 flex-1 text-xs">
      <summary className="w-fit cursor-pointer rounded font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t('CORS Unlocker is now Wireflip')}</summary>
      <p className="mt-2 leading-5 text-muted-foreground">{t('Your local rules and settings are preserved. Saved CORS rules are in Rules and Existing site CORS rules.')}</p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button className="rounded underline underline-offset-4" onClick={onViewRules}>{t('View saved rules')}</button>
        <a href="https://wireflip.forth.ink/migration/" target="_blank" rel="noopener noreferrer" className="rounded underline underline-offset-4">{t('Read the migration guide')}</a>
      </div>
    </details>
    <Button size="xs" variant="ghost" disabled={busy} onClick={() => void acknowledge()}>{t('Got it')}</Button>
    {error ? <p role="alert" className="w-full text-xs text-destructive">{translateError(error)}</p> : null}
  </div>;
  return <Alert role="region" aria-label={t('About your Wireflip upgrade')} className={expanded ? 'p-6' : undefined}>
    {expanded ? <div className="mb-5 flex flex-wrap items-center gap-4" aria-label={t('New name and logo')}>
      <div className="flex items-center gap-2"><img src="/icon/legacy-128.png" alt="CORS Unlocker" className="size-12 object-contain" /><span>CORS Unlocker</span></div>
      <span aria-hidden="true">→</span>
      <div className="flex items-center gap-2"><BrandMark className="size-12" /><span>Wireflip</span></div>
    </div> : null}
    <AlertTitle>{t('CORS Unlocker is now Wireflip')}</AlertTitle>
    <AlertDescription>
      <p>{t(notice.recovered
        ? 'Your local rules and settings are preserved. Saved CORS rules are in Rules and Existing site CORS rules.'
        : 'Your configuration needs attention. Open Data & recovery before changing rules.')}</p>
      <details open={expanded}>
        <summary className="cursor-pointer">{t('What changed in 2.0')}</summary>
        <div className="mt-2 flex flex-col gap-2">
          <p>{t('Inspect requests, create local mocks, and test delays and failures. Saved rules and temporary tab controls are separate.')}</p>
          <p>{t('Use Inspector for request activity, Rules for saved configurations, and Data & recovery for backups. Existing site CORS rules remain available in the popup.')}</p>
          <p>{t(__TARGET__ === 'chrome'
            ? 'Advanced features start only when you choose a tab session. Chrome shows a debugging banner; stopping the session clears temporary controls.'
            : 'Interception starts only when you choose a tab session. Firefox response replacement still contacts the server and keeps its status.')}</p>
          <p>{t('No account or cloud sync. Your existing cors-unlocker SDK integration can keep using the original bridge.')}</p>
          <a href="https://wireflip.forth.ink/migration/" target="_blank" rel="noopener noreferrer" className="underline">{t('Read the migration guide')}</a>
        </div>
      </details>
      <div className="flex flex-wrap gap-2">
        <Button size="xs" variant="outline" onClick={notice.recovered ? onViewRules : onViewRecovery}>
          {t(notice.recovered ? 'View saved rules' : 'Open Data & recovery')}
        </Button>
        <Button size="xs" disabled={busy} onClick={() => void acknowledge()}>{t('Got it')}</Button>
      </div>
      {error ? <p role="alert">{translateError(error)}</p> : null}
    </AlertDescription>
  </Alert>;
}
