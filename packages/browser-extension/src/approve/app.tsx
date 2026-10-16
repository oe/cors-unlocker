import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import browser from 'webextension-polyfill';
import { t, initializeLocale, translateError, useLocale } from '@/common/i18n';
import { initializeTheme } from '@/common/theme';
import { BrandMark } from '@/components/brand-mark';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { ACTION_LABELS } from '@/components/action-fields';
import type { IProxyAction } from '@/common/proxy-state';
import '@/common/tailwind.css';

type Request = { origin: string; name: string; pattern: string; actions: IProxyAction[] };
function Approval() {
  useLocale();
  const id = new URLSearchParams(location.search).get('id');
  const [request, setRequest] = useState<Request | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void browser.runtime.sendMessage({ type: 'getRuleApproval', payload: { id } }).then(value => {
      if (value?.error) throw new Error(value.error);
      setRequest(value);
    }).catch(cause => setError(String(cause)));
  }, [id]);
  const decide = async (accepted: boolean) => {
    setBusy(true); setError('');
    try {
      const result = await browser.runtime.sendMessage({ type: 'resolveRuleApproval', payload: { id, accepted } });
      if (result?.error) throw new Error(result.error);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); setBusy(false); }
  };
  return <main className="mx-auto flex max-w-lg flex-col gap-5 p-6">
    <header className="flex items-center gap-2 text-sm font-semibold"><BrandMark />Wireflip</header>
    <div><h1 className="text-xl font-semibold">{t('Enable this rule?')}</h1><p className="mt-2 break-all text-sm text-muted-foreground">{request?.origin || t('Loading…')}</p></div>
    {error ? <Alert variant="destructive"><AlertDescription role="alert">{translateError(error)}</AlertDescription></Alert> : null}
    {request ? <>
      <Card><CardHeader><CardTitle className="break-words">{request.name}</CardTitle><CardDescription>{t('Runs automatically on matching pages from this site')}</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <code className="break-all text-xs">{request.pattern}</code>
          <p className="text-sm">{request.actions.map(action => t(ACTION_LABELS[action.type])).join(' · ')}</p>
          <details className="text-xs"><summary className="cursor-pointer">{t('Actions')}</summary><pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(request.actions, null, 2)}</pre></details>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">{t(__TARGET__ === 'chrome' ? 'Chrome may show its debugging indicator on matching pages. You can disable this rule in Wireflip at any time.' : request.actions.some(action => action.type === 'mockResponse') ? 'You can disable this rule in Wireflip at any time. Firefox still contacts the server and keeps its status.' : 'You can disable this rule in Wireflip at any time.')}</p>
    </> : null}
    <div className="flex justify-end gap-2">
      <Button variant="outline" disabled={busy} onClick={() => request ? void decide(false) : window.close()}>{t('Cancel')}</Button>
      <Button disabled={!request || busy} onClick={() => void decide(true)}>{t(busy ? 'Preparing…' : 'Enable rule')}</Button>
    </div>
  </main>;
}
void Promise.all([initializeLocale(), initializeTheme()]).then(() => createRoot(document.getElementById('root')!).render(<Approval />));
