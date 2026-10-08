import { useState } from 'react';
import browser from 'webextension-polyfill';
import { t, translateError } from '@/common/i18n';
import { APP_STATE_KEY, performProxyStateOperation, type IProxyAppState } from '@/common/proxy-state';
import { parseImport } from '@/common/import-preview';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function RecoveryPanel({ reload }: { reload: () => Promise<void> }) {
  const [incoming, setIncoming] = useState<IProxyAppState | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const exportOriginal = async () => {
    try {
      const raw = await browser.storage.local.get([APP_STATE_KEY, 'invalidProxyStateBackup', 'preRecoveryBackup']);
      const url = URL.createObjectURL(new Blob([JSON.stringify(raw, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'forth-intercept-original-data.json'; link.click();
      URL.revokeObjectURL(url);
    } catch (cause) { setMessage(String(cause)); }
  };
  const recover = async () => {
    if (!incoming) return;
    setBusy(true);
    try { await performProxyStateOperation({ kind: 'recover', state: incoming }); await reload(); }
    catch (cause) { setMessage(String(cause)); }
    finally { setBusy(false); }
  };
  return <section className="flex max-w-2xl flex-col gap-4 p-6" aria-label={t('Data & recovery')}>
    <h2 className="text-lg font-semibold">{t('Data & recovery')}</h2>
    <p className="text-sm">{t('Original data is preserved. Export it before restoring a valid backup.')}</p>
    <Button variant="outline" onClick={exportOriginal}>{t('Export original data')}</Button>
    <label htmlFor="restore-backup">{t('Import')}</label>
    <Input id="restore-backup" type="file" accept="application/json" disabled={busy} onChange={async (event) => {
      const file = event.target.files?.[0]; event.target.value = '';
      if (!file) return;
      try { setIncoming(parseImport(await file.text())); setMessage(''); }
      catch (cause) { setIncoming(null); setMessage(String(cause)); }
    }} />
    {incoming ? <section aria-label={t('Import preview')} className="flex flex-col gap-3 rounded-lg border p-4">
      <p>{t('{added} added · {replaced} replaced · {removed} removed · {total} total', { added: incoming.rules.length, replaced: 0, removed: 0, total: incoming.rules.length })}</p>
      <p className="text-sm">{t('All current rules, settings and profiles are replaced.')}</p>
      <Button disabled={busy} onClick={recover}>{t('Apply import')}</Button>
    </section> : null}
    {message ? <p role="alert" className="text-sm">{translateError(message)}</p> : null}
  </section>;
}

