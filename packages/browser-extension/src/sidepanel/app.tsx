import { t, translateError, initializeLocale, useLocale } from '@/common/i18n';
import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import browser from 'webextension-polyfill';
import { CircleSlash2, Eraser, ExternalLink, Plus, Search } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { BrandMark } from '@/components/brand-mark';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RuleDialog, draftFromRule, EMPTY_DRAFT, ACTION_TEMPLATES, type RuleDraft } from '@/components/rule-dialog';
import { APP_STATE_KEY, type IProxyRule } from '@/common/proxy-state';
import { explainRuleMatch, ruleAppliesToOrigin } from '@/common/rule-explanation';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import type { IAdvancedProxyStatus, IRequestLogEntry } from '@/background/advanced-proxy';
import { parseInspectorTabId } from '@/common/inspector-target';
import { isSupportedProtocol } from '@/common/utils';
import '@/common/tailwind.css';
import './style.scss';

function statusVariant(entry: IRequestLogEntry): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (entry.outcome === 'blocked' || entry.outcome === 'failed') return 'destructive';
  if (entry.outcome === 'mocked') return 'secondary';
  return entry.status && entry.status >= 400 ? 'destructive' : 'outline';
}

function App() {
  useLocale();
  const requestedTabId = useMemo(() => {
    return parseInspectorTabId(location.search);
  }, []);
  const [tabId, setTabId] = useState<number | null>(null);
  const [origin, setOrigin] = useState('');
  const [status, setStatus] = useState<IAdvancedProxyStatus | null>(null);
  const [entries, setEntries] = useState<IRequestLogEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = entries.find((entry) => entry.id === selectedId);
  const [rules, setRules] = useState<IProxyRule[]>([]);
  const [draft, setDraft] = useState<RuleDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const siteRules = rules.filter((rule) => ruleAppliesToOrigin(rule, origin));
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [targetError, setTargetError] = useState<string | null>(null);
  const syncVersion = useRef(0);
  const target = useRef('');

  const sync = useCallback(async () => {
    const version = ++syncVersion.current;
    const tab = requestedTabId === null
      ? (await browser.tabs.query({ active: true, lastFocusedWindow: true }))[0]
      : await browser.tabs.get(requestedTabId).catch(() => undefined);
    if (version !== syncVersion.current) return;
    if (typeof tab?.id !== 'number' || !tab.url) {
      setTabId(null); setRules([]); setSelectedId(null); setDraft(null);
      setOrigin('');
      setStatus(null);
      setEntries([]);
      setTargetError('Select a regular HTTP or HTTPS tab, then reopen the inspector.');
      return;
    }
    let url: URL;
    try {
      url = new URL(tab.url);
    } catch {
      setTabId(null); setRules([]); setSelectedId(null); setDraft(null);
      setOrigin('');
      setStatus(null);
      setEntries([]);
      setTargetError('The selected tab has an invalid URL. Select an HTTP or HTTPS tab.');
      return;
    }
    if (!isSupportedProtocol(url.protocol)) {
      setTabId(null); setRules([]); setSelectedId(null); setDraft(null);
      setOrigin('');
      setStatus(null);
      setEntries([]);
      setTargetError(`${url.protocol} pages cannot be inspected. Select an HTTP or HTTPS tab.`);
      return;
    }
    if (target.current !== `${tab.id}:${url.origin}`) { setSelectedId(null); setDraft(null); setEntries([]); setRules([]); setMessage(null); }
    target.current = `${tab.id}:${url.origin}`;
    setTabId(tab.id);
    setOrigin(url.origin);
    setTargetError(null);
    const [nextStatus, nextEntries, state] = await Promise.all([
      browser.runtime.sendMessage({ type: 'getAdvancedProxyStatus', payload: { tabId: tab.id } }),
      browser.runtime.sendMessage({ type: 'getAdvancedProxyLog', payload: { tabId: tab.id } }),
      browser.runtime.sendMessage({ type: 'getProxyState' }),
    ]);
    if (version !== syncVersion.current) return;
    setRules(state.rules || []);
    setStatus(nextStatus);
    setEntries(nextEntries || []);
  }, [requestedTabId]);

  useEffect(() => {
    void sync().catch((error) => setMessage(String(error)));
    const listener = (message: any) => {
      if (
        (message?.type === 'advancedProxyLogChange' || message?.type === 'advancedProxyStatusChange')
        && message.payload?.tabId === tabId
      ) void sync();
    };
    const onTabUpdated = (updatedTabId: number, changeInfo: browser.Tabs.OnUpdatedChangeInfoType) => {
      if (!changeInfo.url) return;
      if (requestedTabId === updatedTabId || (requestedTabId === null && tabId === updatedTabId)) {
        void sync();
      }
    };
    const onStorage = (changes: Record<string, browser.Storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[APP_STATE_KEY]) void sync();
    };
    browser.storage.onChanged.addListener(onStorage);
    browser.runtime.onMessage.addListener(listener);
    browser.tabs.onUpdated.addListener(onTabUpdated);
    if (requestedTabId === null) browser.tabs.onActivated.addListener(sync);
    return () => {
      browser.storage.onChanged.removeListener(onStorage);
      browser.runtime.onMessage.removeListener(listener);
      browser.tabs.onUpdated.removeListener(onTabUpdated);
      if (requestedTabId === null) browser.tabs.onActivated.removeListener(sync);
    };
  }, [requestedTabId, sync, tabId]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query
      ? entries.filter((entry) => `${entry.method} ${entry.url} ${entry.status || ''}`.toLowerCase().includes(query))
      : entries;
  }, [entries, search]);

  const toggle = async (enabled: boolean) => {
    if (tabId === null) return;
    setBusy(true);
    try {
    const next = await browser.runtime.sendMessage({
      type: enabled ? 'enableAdvancedProxy' : 'disableAdvancedProxy',
      payload: { tabId },
    });
    setStatus(next);
    } catch (error) { setMessage(String(error)); }
    finally { setBusy(false); }
  };

  const clear = async () => {
    if (tabId === null) return;
    await browser.runtime.sendMessage({ type: 'clearAdvancedProxyLog', payload: { tabId } });
    setEntries([]);
    setSelectedId(null);
  };

  const createRule = (entry: IRequestLogEntry, template = 'responseHeaders') => {
    setDraft({ ...EMPTY_DRAFT, name: `${template} · ${new URL(entry.url).pathname}`,
      origins: origin, urlPattern: entry.url, methods: entry.method,
      resourceTypes: [entry.resourceType], actions: JSON.stringify(ACTION_TEMPLATES[template], null, 2) });
  };
  const toggleRule = async (rule: IProxyRule, enabled: boolean) => {
    setBusy(true);
    try {
      const result = await browser.runtime.sendMessage({ type: 'saveProxyRule', payload: { rule: { ...rule, enabled } } });
      if (!result?.success) throw new Error(result?.error || 'Unable to update rule.');
      await sync();
    } catch (error) { setMessage(String(error)); } finally { setBusy(false); }
  };

  return (
    <main className="flex min-h-screen flex-col gap-3 bg-background p-3 text-foreground">
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <BrandMark />
          <div className="min-w-0">
            <h1 className="text-sm font-semibold">{t("Site controls")}</h1>
            <p className="truncate text-xs text-muted-foreground">{origin || t("No supported tab")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2"><span className="text-xs">{t("Advanced proxy")}</span><Switch
          checked={status?.phase === 'connected'}
          disabled={busy || tabId === null || status?.phase === 'connecting'}
          onCheckedChange={toggle}
          aria-label={t("Toggle advanced proxy")}
        /></div>
      </header>

      {status?.phase !== 'connected' ? (
        <Alert>
          <CircleSlash2 />
          <AlertTitle>{targetError ? t("This page is unavailable") : status?.phase === 'error' ? t("Advanced proxy could not start") : t("Advanced proxy is off")}</AlertTitle>
          <AlertDescription>
            {targetError || status?.error ? translateError(targetError || status?.error || '') : (__TARGET__ === 'firefox'
              ? t("Turn it on to apply advanced actions, repair CORS and record activity for this tab.")
              : t("Turn it on to apply advanced actions, repair CORS and record activity. Chrome shows a debugging banner."))}
          </AlertDescription>
        </Alert>
      ) : null}
      {message ? <Alert><AlertDescription>{translateError(message)}</AlertDescription></Alert> : null}

      <p className="text-xs text-muted-foreground">{t("Advanced proxy changes requests; it is not a capture-only switch. Basic header, redirect and block rules can remain enabled when it is off.")}</p>
      <Card size="sm">
        <CardHeader><CardTitle>{t("Rules for this site")}</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button variant="outline" disabled={tabId === null} onClick={() => setDraft({ ...EMPTY_DRAFT, origins: origin })}><Plus data-icon="inline-start" />{t("New rule for this site")}</Button>
          {!siteRules.length ? <p className="text-sm text-muted-foreground">{t("No rules for this site yet.")}</p> : null}
          {siteRules.map((rule) => <section key={rule.id} aria-label={rule.name} className="flex flex-col gap-2 rounded-lg border p-2">
            <div className="flex items-center justify-between gap-2">
              <Button variant="ghost" className="min-w-0 justify-start" onClick={() => setDraft(draftFromRule(rule))}><span className="truncate">{rule.name}</span></Button>
              <Switch checked={rule.enabled} disabled={busy} aria-label={t('Enable {name}', { name: rule.name })} onCheckedChange={(enabled) => void toggleRule(rule, enabled)} />
            </div>
            <p className="break-all text-xs text-muted-foreground">{rule.match.methods?.join(', ') || t("All methods")} · {rule.match.urlPattern}</p>
            <div className="flex flex-wrap gap-1">
              <Badge variant="outline">{!rule.enabled ? t("Disabled") : status?.phase !== 'connected' && rule.actions.some((action) => ['mockResponse', 'delay', 'networkFailure'].includes(action.type)) ? t("Needs advanced proxy") : t("Enabled")}</Badge>
              <Badge variant="secondary">{t('{count} recorded matches', { count: entries.filter((entry) => entry.matchedRuleIds.includes(rule.id)).length })}</Badge>
            </div>
          </section>)}
        </CardContent>
      </Card>
      <h2 className="text-sm font-semibold">{t("Recent activity")}</h2>
      <p className="text-xs text-muted-foreground">{t("Advanced proxy records only. Basic browser rules may act before capture; this is not a complete network log.")}</p>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("Filter URL, method, status")} />
        </div>
        <Button size="icon" variant="outline" onClick={clear} aria-label={t("Clear requests")}><Eraser /></Button>
      </div>

      <ScrollArea className="h-64 rounded-lg border">
        <div className="flex flex-col">
          {filtered.map((entry) => (
            <button key={entry.id} className="flex items-center gap-2 p-2 text-left hover:bg-muted" onClick={() => setSelectedId(entry.id)}>
              <Badge variant="secondary">{entry.method}</Badge>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{entry.url}</p>
                <p className="text-xs text-muted-foreground">{entry.resourceType} · {entry.duration ?? 0} ms</p>
              </div>
              <Badge variant={statusVariant(entry)}>{entry.status || t(entry.outcome)}</Badge>
            </button>
          ))}
          {filtered.length === 0 ? (
            <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">{t("No matching activity. Connect advanced proxy, then trigger a request on the page.")}</div>
          ) : null}
        </div>
      </ScrollArea>

      {selected ? (
        <Card size="sm">
          <CardHeader>
            <CardTitle className="truncate">{selected.method} {selected.url}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{selected.resourceType}</Badge>
              <Badge variant="outline">{t(selected.outcome)}</Badge>
              {(selected.matchedRules || selected.matchedRuleIds.map((id) => ({ id, name: id }))).map((rule) => <Badge key={rule.id} variant="secondary">{rule.name}</Badge>)}
            </div>
            {selected.diagnostics.map((diagnostic) => (
              <Alert key={translateError(diagnostic)}><AlertDescription>{translateError(diagnostic)}</AlertDescription></Alert>
            ))}
            <p className="text-xs text-muted-foreground">{t("Rules above matched at capture. Matching does not guarantee every action ran.")}</p>
            <div aria-label={t("Applied changes")} className="flex flex-col gap-2">
              {(selected.changes || []).map((change, index) => <div key={index} className="rounded-lg border p-2 text-xs">
                <p className="font-medium">{translateError(change.label)}</p>
                {change.before !== undefined ? <p className="break-all text-muted-foreground">{t("Before:")} {change.before}</p> : null}
                <p className="break-all">{t("After:")} {change.after}</p>
              </div>)}
              {!selected.changes?.length ? <p className="text-xs text-muted-foreground">{t("No detailed change record for this request.")}</p> : null}
            </div>
            <details><summary className="cursor-pointer text-sm font-medium">{t("Check against current rules")}</summary>
              <p className="my-2 text-xs text-muted-foreground">{t("Current conditions, not historical execution or priority. Trigger a new request after editing.")}</p>
              {siteRules.map((rule) => {
                const reasons = explainRuleMatch(rule, origin, selected, __TARGET__ === 'firefox');
                return <div key={rule.id} className="flex flex-col gap-1 py-2">
                  <Button variant="link" className="justify-start" onClick={() => setDraft(draftFromRule(rule))}>{rule.name}</Button>
                  <p className="text-xs">{reasons.length ? reasons.map((reason) => translateError(reason)).join(' · ') : t("Conditions match now; see applied changes for execution evidence.")}</p>
                </div>;
              })}
            </details>
            <Separator />
            <details>
              <summary className="cursor-pointer text-xs font-medium">{t("Request headers")}</summary>
              <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">{JSON.stringify(selected.requestHeaders, null, 2)}</pre>
            </details>
            {selected.responseHeaders ? (
              <details>
                <summary className="cursor-pointer text-xs font-medium">{t("Response headers")}</summary>
                <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">{JSON.stringify(selected.responseHeaders, null, 2)}</pre>
              </details>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => createRule(selected, 'mock')}>{__TARGET__ === 'firefox' ? t("Replace body") : t("Mock")}</Button>
              <Button size="sm" variant="outline" onClick={() => createRule(selected, 'delay')}>{t("Delay")}</Button>
              <Button size="sm" variant="outline" onClick={() => createRule(selected, 'block')}>{t("Block")}</Button>
              <Button size="sm" variant="outline" onClick={() => createRule(selected)}>{t("Headers")}</Button>
              <Button size="sm" variant="outline" onClick={() => browser.runtime.openOptionsPage()}> {t("Open rules")}<ExternalLink data-icon="inline-end" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
      <RuleDialog key={draft?.id || (draft ? 'new' : 'closed')} draft={draft} onOpenChange={(open) => { if (!open) setDraft(null); }} onSaved={async () => { await sync(); setMessage('Rule saved. Trigger a new request on the page to verify it.'); }} />
    </main>
  );
}

void initializeLocale().then(() => createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>));
