import { hasPersistentActions, needsProxy } from '@/common/quick-controls';
import { t, translateError, useLocale } from '@/common/i18n';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { IAdvancedProxyStatus, IRequestLogEntry } from '@/background/advanced-proxy';
import { parseInspectorTabId } from '@/common/inspector-target';
import { isSupportedProtocol } from '@/common/utils';

function statusVariant(entry: IRequestLogEntry): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (entry.outcome === 'blocked' || entry.outcome === 'failed') return 'destructive';
  if (entry.outcome === 'mocked') return 'secondary';
  return entry.status && entry.status >= 400 ? 'destructive' : 'outline';
}

function verificationMessage(rule: IProxyRule, connected: boolean, entry: IRequestLogEntry | null | undefined): string {
  if (!rule.enabled) return 'Rule disabled. Requests use their original behavior unless other rules apply.';
  if (needsProxy(rule) && !connected) return 'Start a tab session to apply';
  if (!entry) return 'Saved. Trigger the request again on the page to verify it.';
  if (entry.outcome === 'pending') return 'Request in progress. Waiting for the result.';
  if (entry.diagnostics.length) return 'Request matched with warnings. Review the result.';
  return entry.changes?.length
    ? 'Request matched. Recorded changes are ready to review.'
    : 'Request matched, but no changes were recorded. Check the request details.';
}

export function Inspector() {
  useLocale();
  const requestedTabId = useMemo(() => {
    return parseInspectorTabId(location.search);
  }, []);
  const [tabId, setTabId] = useState<number | null>(null);
  const [origin, setOrigin] = useState('');
  const [status, setStatus] = useState<IAdvancedProxyStatus | null>(null);
  const [entries, setEntries] = useState<IRequestLogEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rules, setRules] = useState<IProxyRule[]>([]);
  const [draft, setDraft] = useState<RuleDraft | null>(null);
  const [verification, setVerification] = useState<{ ruleId: string; since: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState('requests');
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
      setTabId(null); setRules([]); setSelectedId(null); setDraft(null); setVerification(null);
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
      setTabId(null); setRules([]); setSelectedId(null); setDraft(null); setVerification(null);
      setOrigin('');
      setStatus(null);
      setEntries([]);
      setTargetError('The selected tab has an invalid URL. Select an HTTP or HTTPS tab.');
      return;
    }
    if (!isSupportedProtocol(url.protocol)) {
      setTabId(null); setRules([]); setSelectedId(null); setDraft(null); setVerification(null);
      setOrigin('');
      setStatus(null);
      setEntries([]);
      setTargetError(`${url.protocol} pages cannot be inspected. Select an HTTP or HTTPS tab.`);
      return;
    }
    if (target.current !== `${tab.id}:${url.origin}`) { setSelectedId(null); setDraft(null); setEntries([]); setRules([]); setMessage(null); setVerification(null); }
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

  const logRefresh = useRef({ running: false, again: false });
  const refreshLogs = useCallback(async () => {
    if (logRefresh.current.running) { logRefresh.current.again = true; return; }
    logRefresh.current.running = true;
    try {
      do {
        logRefresh.current.again = false;
        const version = syncVersion.current;
        const currentTarget = target.current;
        const id = Number(currentTarget.split(':')[0]);
        if (!currentTarget) return;
        const next = await browser.runtime.sendMessage({ type: 'getAdvancedProxyLog', payload: { tabId: id } });
        if (version === syncVersion.current && currentTarget === target.current) setEntries(next || []);
      } while (logRefresh.current.again);
    } catch (error) { setMessage(String(error)); }
    finally { logRefresh.current.running = false; }
  }, []);

  useEffect(() => {
    void sync().catch((error) => setMessage(String(error)));
    const listener = (message: any) => {
      if (message?.payload?.tabId !== tabId) return;
      if (message.type === 'advancedProxyLogChange') void refreshLogs();
      if (message.type === 'advancedProxyStatusChange') void sync();
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
  }, [requestedTabId, sync, tabId, refreshLogs]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query
      ? entries.filter((entry) => `${entry.method} ${entry.url} ${entry.status || ''}`.toLowerCase().includes(query))
      : entries;
  }, [entries, search]);
  const selected = filtered.find((entry) => entry.id === selectedId);
  const savedRule = rules.find((rule) => rule.id === verification?.ruleId);
  const verifiedRequest = verification && entries.find((entry) => entry.startedAt >= verification.since && entry.matchedRuleIds.includes(verification.ruleId));

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
    setDraft({ ...EMPTY_DRAFT, capturedRequest: entry.url, name: `${t(template === 'mock' ? 'Mock response' : template === 'delay' ? 'Delay' : template === 'failure' ? 'Network failure' : template === 'block' ? 'Block request' : 'Set response headers')} · ${new URL(entry.url).pathname}`,
      origins: origin, urlPattern: entry.url, methods: entry.method,
      resourceTypes: [entry.resourceType], actions: JSON.stringify(ACTION_TEMPLATES[template], null, 2) });
  };
  const toggleRule = async (rule: IProxyRule, enabled: boolean) => {
    setBusy(true);
    try {
      const result = await browser.runtime.sendMessage({ type: 'saveProxyRule', payload: { rule: { id: rule.id, enabled } } });
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
            <h1 className="text-sm font-semibold">{t("Inspector")}</h1>
            <p className="truncate text-xs text-muted-foreground">{origin || t("No supported tab")}</p>
          </div>
        </div>
        <Button size="sm" variant={status?.phase === 'connected' ? 'outline' : 'default'}
          disabled={busy || tabId === null || status?.phase === 'connecting'}
          onClick={() => void toggle(status?.phase !== 'connected')}
        >{t(status?.phase === 'connecting' ? 'Connecting…' : status?.phase === 'connected' ? 'Stop tab session' : 'Start tab session')}</Button>
      </header>

      <div className="rounded-lg border bg-muted/20 p-2.5 text-xs">
        <p className="font-medium"><span>{t(status?.phase === 'connected' ? 'Tab session active' : 'Tab session stopped')}</span> · <span>{t(status?.phase === 'connected' && status.captureEnabled !== false ? 'Recording requests' : 'Not recording')}</span></p>
        <p className="mt-1 text-muted-foreground">{t('{count} persistent rules enabled', { count: siteRules.filter((rule) => rule.enabled && hasPersistentActions(rule)).length })}</p>
        <p className="mt-1 text-muted-foreground">{t('Stopping resets temporary changes and pauses session actions. Persistent rules stay enabled.')}</p>
      </div>

      {targetError || status?.phase === 'error' ? (
        <Alert>
          <CircleSlash2 />
          <AlertTitle>{targetError ? t("This page is unavailable") : t("Advanced proxy could not start")}</AlertTitle>
          <AlertDescription>
            {targetError || status?.error ? translateError(targetError || status?.error || '') : t("Start the proxy, then trigger a request on the page. Enabled rules also apply.")}
          </AlertDescription>
        </Alert>
      ) : null}
      {savedRule ? <Alert role="status"><AlertTitle>{savedRule.name}</AlertTitle><AlertDescription className="text-wrap [&_p:not(:last-child)]:mb-2">
        <p>{t(verificationMessage(savedRule, status?.phase === 'connected', verifiedRequest))}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {verifiedRequest ? <Button size="sm" variant="outline" onClick={() => { setView('requests'); setSearch(''); setSelectedId(verifiedRequest.id); }}>{t('View request')}</Button> : null}
          {savedRule.enabled && status?.phase !== 'connected' && !verifiedRequest ? <Button size="sm" disabled={busy || tabId === null} onClick={() => void toggle(true)}>{t('Start recording requests')}</Button> : null}
          {savedRule.enabled ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void toggleRule(savedRule, false)}>{t('Disable this rule')}</Button> : null}
          <Button size="sm" variant="ghost" onClick={() => setVerification(null)}>{t('Dismiss')}</Button>
        </div>
      </AlertDescription></Alert> : null}
      {message ? <Alert><AlertDescription>{translateError(message)}</AlertDescription></Alert> : null}

      <Tabs value={view} onValueChange={setView}>
      <TabsList className="w-full"><TabsTrigger value="requests">{t('Requests')} ({entries.length})</TabsTrigger><TabsTrigger value="rules">{t('Rules')} ({siteRules.length})</TabsTrigger></TabsList>
      <TabsContent value="requests" className="flex flex-col gap-3">
      {status?.phase !== 'connected' && tabId !== null ? <p className="text-xs text-muted-foreground">{t(__TARGET__ === 'chrome' ? 'Chrome shows a debugging banner during the session. Requests stay on your device.' : 'Firefox CORS: response headers only.')}</p> : null}
      {status?.phase === 'connected' && status.captureEnabled === false ? <Button disabled={busy} onClick={() => void toggle(true)}>{t('Start recording requests')}</Button> : null}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label={t("Filter URL, method, status")} className="pl-8" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("Filter URL, method, status")} />
        </div>
        <Button size="icon" variant="outline" disabled={!entries.length || busy} onClick={() => void clear().catch((error) => setMessage(String(error)))} aria-label={t("Clear requests")}><Eraser /></Button>
      </div>

      <ScrollArea className={selected ? 'h-40 rounded-lg border' : 'h-[clamp(16rem,45vh,28rem)] rounded-lg border'} aria-label={t('Recent activity')}>
        {filtered.length > 0 ? (
          <div key="activity-rows" className="flex flex-col gap-1 p-2">
            {filtered.map((entry) => (
              <button key={entry.id} aria-pressed={selectedId === entry.id} className="flex items-center gap-2 rounded-md p-2.5 text-left hover:bg-muted aria-pressed:bg-muted focus-visible:outline-2 focus-visible:outline-ring" onClick={() => setSelectedId(entry.id)}>
                <Badge variant="secondary">{entry.method}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium" title={entry.url}>{entry.url}</p>
                  <p className="text-xs text-muted-foreground">{entry.resourceType} · {entry.duration ?? 0} ms{entry.changes?.length ? ` · ${t('Modified')}` : ''}</p>
                </div>
                <Badge variant={statusVariant(entry)}>{entry.status || t(entry.outcome)}</Badge>
              </button>
            ))}
          </div>
        ) : (
          <div key="activity-empty" role="status" className="flex min-h-[12rem] flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
            <p>{t(entries.length > 0 ? 'No requests match this filter.' : 'No activity recorded yet.')}</p>
            {entries.length > 0 ? (
              <Button size="sm" variant="ghost" onClick={() => setSearch('')}>{t('Clear filter')}</Button>
            ) : (
              <p className="text-xs leading-relaxed">{t(status?.phase === 'connected'
                ? (status.captureEnabled === false ? 'Start recording requests' : 'Trigger a request on the page to see it here.')
                : 'Start a tab session to record requests from this tab.')}</p>
            )}
            {entries.length === 0 ? <ol className="mt-2 space-y-2 text-left text-xs"><li>1. {t('Start a tab session.')}</li><li>2. {t('Repeat an action on your page, then select its request here.')}</li><li>3. {t('Choose a change, save it, and repeat the action to verify.')}</li></ol> : null}
          </div>
        )}
      </ScrollArea>
      <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">{t('About request capture')}</summary><p className="mt-2">{t('Advanced proxy records only. Basic browser rules may act before capture; this is not a complete network log.')}</p><p className="mt-2">{t(__TARGET__ === 'chrome' ? 'Chrome shows a debugging banner during the session. Requests stay on your device.' : 'Firefox CORS: response headers only.')}</p></details>

      {!selected && filtered.length > 0 ? <p className="text-xs text-muted-foreground">{t("Select a request to mock its response or change its behavior.")}</p> : null}
      {selected ? (
        <Card size="sm">
          <CardHeader>
            <CardTitle className="break-all text-xs">{selected.method} {selected.url}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => createRule(selected, 'mock')}>{__TARGET__ === 'firefox' ? t("Replace body") : t("Mock")}</Button>
              <Button size="sm" variant="outline" onClick={() => createRule(selected, 'delay')}>{t("Delay")}</Button>
              <Button size="sm" variant="outline" onClick={() => createRule(selected, 'failure')}>{t("Network failure")}</Button>
              <Button size="sm" variant="outline" onClick={() => createRule(selected, 'block')}>{t("Block")}</Button>
              <Button size="sm" variant="outline" onClick={() => createRule(selected)}>{t("Headers")}</Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{selected.resourceType}</Badge>
              <Badge variant="outline">{t(selected.outcome)}</Badge>
              {(selected.matchedRules || selected.matchedRuleIds.map((id) => ({ id, name: id }))).map((rule) => <Badge key={rule.id} variant="secondary">{rule.name}</Badge>)}
            </div>
            {selected.diagnostics.map((diagnostic) => (
              <Alert key={translateError(diagnostic)}><AlertDescription>{translateError(diagnostic)}</AlertDescription></Alert>
            ))}
            <h3 className="text-sm font-semibold">{t('Applied changes')}</h3>
            <div aria-label={t("Applied changes")} className="flex flex-col gap-2">
              {(selected.changes || []).map((change, index) => <div key={index} className="rounded-lg border p-2 text-xs">
                <p className="font-medium">{translateError(change.label)}</p>
                {change.before !== undefined ? <p className="break-all text-muted-foreground">{t("Before:")} {change.before}</p> : null}
                <p className="break-all">{t("After:")} {change.after}</p>
              </div>)}
              {!selected.changes?.length ? <p className="text-xs text-muted-foreground">{t("No detailed change record for this request.")}</p> : null}
            </div>
            <details><summary className="cursor-pointer text-sm font-medium">{t("Check against current rules")}</summary>
              <p className="my-2 text-xs text-muted-foreground">{t("Rules above matched at capture. Matching does not guarantee every action ran.")}</p>
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

          </CardContent>
        </Card>
      ) : null}
      </TabsContent>
      <TabsContent value="rules">
      <section aria-label={t("Rules for this site")} className="flex flex-col gap-2 border-t pt-3">
      <Card size="sm" className="mt-3">
        <CardHeader><CardTitle>{t("Rules for this site")}</CardTitle><Button size="sm" variant="outline" onClick={() => browser.runtime.openOptionsPage()}>{t('Manage rules')}<ExternalLink /></Button></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button variant="outline" disabled={tabId === null} onClick={() => setDraft({ ...EMPTY_DRAFT, origins: origin })}><Plus data-icon="inline-start" />{t("New rule for this site")}</Button>
          {!siteRules.length ? <><p className="text-sm text-muted-foreground">{t("No rules for this site yet.")}</p><Button variant="outline" onClick={() => setView('requests')}>{t('Start from a request')}</Button></> : null}
          {siteRules.map((rule) => <section key={rule.id} aria-label={rule.name} className="flex flex-col gap-2 rounded-lg border p-2">
            <div className="flex items-center justify-between gap-2">
              <Button variant="ghost" className="min-w-0 justify-start" onClick={() => setDraft(draftFromRule(rule))}><span className="truncate">{rule.name}</span></Button>
              <Switch checked={rule.enabled} disabled={busy} aria-label={t('Enable {name}', { name: rule.name })} onCheckedChange={(enabled) => void toggleRule(rule, enabled)} />
            </div>
            <p className="break-all text-xs text-muted-foreground">{rule.match.methods?.join(', ') || t("All methods")} · {rule.match.urlPattern}</p>
            <div className="flex flex-wrap gap-1">
              {!rule.enabled ? <Badge variant="outline">{t('Disabled')}</Badge> : <>
                {hasPersistentActions(rule) ? <Badge variant="outline">{t('Persistent · across tabs')}</Badge> : null}
                {needsProxy(rule) ? <Badge variant="outline">{t(status?.phase !== 'connected' ? 'Start a tab session to apply' : 'Active in this session')}</Badge> : null}
              </>}
              <Badge variant="secondary">{t('{count} recorded matches', { count: entries.filter((entry) => entry.matchedRuleIds.includes(rule.id)).length })}</Badge>
            </div>
          </section>)}
        </CardContent>
      </Card>
      </section>
      </TabsContent>
      </Tabs>
      <RuleDialog key={draft?.id || (draft ? 'new' : 'closed')} draft={draft} onOpenChange={(open) => { if (!open) setDraft(null); }} onSaved={async (rule) => { if (rule) setVerification({ ruleId: rule.id, since: Date.now() }); setView('requests'); setMessage(null); await sync(); }} />
    </main>
  );
}
