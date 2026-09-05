import { t, translateError, initializeLocale, useLocale } from '@/common/i18n';
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AlertCircle, ArrowUpRight, Settings, Activity, Pin, PinOff } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { BrandMark } from '@/components/brand-mark';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { needsProxy } from '@/common/quick-controls';
import { useViewModel } from './view-model';
import '@/common/tailwind.css';
import './style.scss';

function App() {
  useLocale();
  const vm = useViewModel();
  const [delay, setDelay] = useState(1000);
  const disabled = !vm.isSupported || vm.busy;
  const activeSaved = vm.siteRules.filter((rule) => rule.enabled).length;
  const scope = (requiresProxy: boolean) => t(requiresProxy
    ? vm.connected ? 'Saved · proxy active' : 'Saved · needs proxy'
    : 'Persistent · across tabs');

  return (
    <main className="flex min-h-full flex-col gap-2.5 bg-background p-3 text-foreground">
      <header className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <BrandMark />
          <div className="min-w-0">
            <h1 className="text-sm font-semibold">Forth Intercept</h1>
          </div>
        </div>
        <Button size="icon-sm" variant="ghost" aria-label={t('Open settings')} onClick={vm.gotoOptionsPage}><Settings /></Button>
      </header>

      {vm.error ? <Alert variant="destructive">
        <AlertCircle /><AlertTitle>{t('Action failed')}</AlertTitle>
        <AlertDescription>{translateError(vm.error)}</AlertDescription>
        <Button size="xs" variant="ghost" onClick={vm.clearError}>{t('Dismiss')}</Button>
      </Alert> : null}

      <section className="rounded-lg border bg-muted/20 px-2.5 py-2" aria-label={t('Current tab')}>
        <div className="control-row">
          <p className="min-w-0 flex-1 truncate text-sm font-medium" title={vm.origin}>{vm.origin || t(vm.ready ? 'Select an HTTP or HTTPS tab.' : 'Loading…')}</p>
          <Button size="xs" disabled={disabled} aria-label={t('Open Inspector')} onClick={vm.openInspector}><Activity />Inspector<ArrowUpRight /></Button>
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={`size-1.5 shrink-0 rounded-full ${vm.connected ? 'bg-emerald-500' : 'bg-muted-foreground/50'}`} />
          <span>{t(vm.connected ? 'Proxy connected' : 'Proxy off')}</span>
          <Button className="ml-auto" size="xs" variant="ghost" disabled={disabled} onClick={vm.toggleSession}>{t(vm.connected ? 'Stop this session' : 'Start proxy session')}</Button>
        </div>
      </section>

      <section aria-labelledby="quick-heading">
        <div className="control-row text-xs">
          <h2 id="quick-heading" className="font-semibold">{t('Quick debug')}</h2>
          <span className="text-muted-foreground">{t('This tab · temporary')}</span>
        </div>
        <div className="mt-1 divide-y">
          <div className="py-1.5">
            <div className="control-row min-h-7">
              <span className="text-sm">{t('CORS repair')}</span>
              <Switch aria-label={t('CORS repair')} checked={vm.quickControls.cors} disabled={disabled} onCheckedChange={(cors) => vm.setQuickControls({ cors })} />
            </div>
            <div className="control-row min-h-6 pl-3 text-xs text-muted-foreground">
              <span>{t('Allow credentials')}</span>
              <Switch size="sm" aria-label={t('Allow credentials')} checked={vm.quickControls.credentials} disabled={disabled || !vm.quickControls.cors} onCheckedChange={(credentials) => vm.setQuickControls({ credentials })} />
            </div>
          </div>
          <div className="control-row min-h-10" title={t(__TARGET__ === 'chrome' ? 'Bypass HTTP cache for this tab. Does not clear stored data or bypass service workers.' : 'Cache control is available in Chrome only.')}>
            <span className="text-sm">{t('Disable cache')}</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{__TARGET__ === 'chrome' ? 'HTTP' : 'Chrome'}</span>
              <Switch aria-label={t('Disable cache')} checked={vm.quickControls.disableCache} disabled={disabled || __TARGET__ !== 'chrome'} onCheckedChange={(disableCache) => vm.setQuickControls({ disableCache })} />
            </div>
          </div>
          <div className="control-row min-h-10" title="Fetch / XHR">
            <span className="text-sm">{t('Request delay')}</span>
            <div className="flex shrink-0 items-center gap-2">
              <select className="rounded-md border bg-background px-1.5 py-1 text-xs" aria-label={t('Delay duration')} disabled={disabled} value={vm.quickControls.delayMs || delay} onChange={(event) => {
                const milliseconds = Number(event.target.value); setDelay(milliseconds);
                if (vm.quickControls.delayMs) void vm.setQuickControls({ delayMs: milliseconds });
              }}>
                <option value={500}>500 ms</option><option value={1000}>1 s</option><option value={3000}>3 s</option>
              </select>
              <Switch aria-label={t('Request delay')} checked={!!vm.quickControls.delayMs} disabled={disabled} onCheckedChange={(enabled) => {
                if (!enabled) setDelay(vm.quickControls.delayMs || delay);
                void vm.setQuickControls({ delayMs: enabled ? delay : 0 });
              }} />
            </div>
          </div>
          <div className="control-row min-h-10" title="Fetch / XHR">
            <span className="text-sm">{t('Simulate failure')}</span>
            <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">Fetch / XHR</span>
              <Switch aria-label={t('Simulate failure')} checked={vm.quickControls.failure} disabled={disabled} onCheckedChange={(failure) => vm.setQuickControls({ failure })} />
            </div>
          </div>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{t(__TARGET__ === 'chrome' ? 'Enabling starts Chrome debugging.' : 'Firefox CORS: response headers only.')}</p>
      </section>

      <section className="border-t pt-2" aria-labelledby="pinned-heading">
        <div className="flex items-center justify-between gap-2">
          <h2 id="pinned-heading" className="text-xs font-semibold">{t('Pinned rules')}</h2>
          <Button size="xs" variant="ghost" onClick={vm.gotoOptionsPage}>{t('Manage rules')}<ArrowUpRight /></Button>
        </div>
        {vm.pinnedRules.length ? <div className="mt-1 divide-y">{vm.pinnedRules.map((rule) => <div className="control-row py-1.5" key={rule.id}>
          <div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{rule.name}</p><p className="control-description">{scope(needsProxy(rule))}</p></div>
          <Switch aria-label={rule.name} checked={rule.enabled} disabled={disabled} onCheckedChange={(enabled) => vm.toggleRule(rule, enabled)} />
          <Button size="icon-xs" variant="ghost" aria-label={t('Unpin {name}', { name: rule.name })} disabled={disabled} onClick={() => vm.pinRule(rule.id, false)}><PinOff /></Button>
        </div>)}</div> : <p className="mt-1 text-xs text-muted-foreground">{t('Pin saved rules for quick access.')}</p>}
        {vm.pinnableRules.length ? <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-muted-foreground">{t('Choose pinned rules')}</summary>
          <div className="mt-2 space-y-1">{vm.pinnableRules.map((rule) => <div className="control-row" key={rule.id}>
            <span className="min-w-0 break-words">{rule.name}</span>
            <Button size="icon-xs" variant={vm.pinnedIds.includes(rule.id) ? 'secondary' : 'ghost'} aria-label={t(vm.pinnedIds.includes(rule.id) ? 'Unpin {name}' : 'Pin {name}', { name: rule.name })} disabled={disabled} onClick={() => vm.pinRule(rule.id, !vm.pinnedIds.includes(rule.id))}><Pin /></Button>
          </div>)}</div>
        </details> : null}
        {vm.legacyCorsRules.length ? <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-muted-foreground">{t('Existing site CORS rules')}</summary>
          {vm.legacyCorsRules.map((rule) => <div className="control-row mt-2" key={rule.id}>
            <div className="min-w-0"><p className="break-words">{rule.name}</p><p className="control-description">{t('Persistent · across tabs')}</p></div>
            <Switch aria-label={rule.name} checked={rule.enabled} disabled={disabled} onCheckedChange={(enabled) => vm.toggleRule(rule, enabled)} />
          </div>)}
        </details> : null}
      </section>
      <footer className="border-t pt-2">
        <p className="text-xs text-muted-foreground">{t('{count} saved rules on · stop resets temporary controls', { count: activeSaved })}</p>
      </footer>
    </main>
  );
}

void initializeLocale().then(() => createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>));
