import { StrictMode, useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import browser from 'webextension-polyfill';
import { CircleSlash2, Eraser, ExternalLink, Network, Plus, Search } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  const requestedTabId = useMemo(() => {
    return parseInspectorTabId(location.search);
  }, []);
  const [tabId, setTabId] = useState<number | null>(null);
  const [origin, setOrigin] = useState('');
  const [status, setStatus] = useState<IAdvancedProxyStatus | null>(null);
  const [entries, setEntries] = useState<IRequestLogEntry[]>([]);
  const [selected, setSelected] = useState<IRequestLogEntry | null>(null);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [targetError, setTargetError] = useState<string | null>(null);

  const sync = useCallback(async () => {
    const tab = requestedTabId === null
      ? (await browser.tabs.query({ active: true, lastFocusedWindow: true }))[0]
      : await browser.tabs.get(requestedTabId).catch(() => undefined);
    if (typeof tab?.id !== 'number' || !tab.url) {
      setTabId(null);
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
      setTabId(null);
      setOrigin('');
      setStatus(null);
      setEntries([]);
      setTargetError('The selected tab has an invalid URL. Select an HTTP or HTTPS tab.');
      return;
    }
    if (!isSupportedProtocol(url.protocol)) {
      setTabId(null);
      setOrigin('');
      setStatus(null);
      setEntries([]);
      setTargetError(`${url.protocol} pages cannot be inspected. Select an HTTP or HTTPS tab.`);
      return;
    }
    setTabId(tab.id);
    setOrigin(url.origin);
    setTargetError(null);
    const [nextStatus, nextEntries] = await Promise.all([
      browser.runtime.sendMessage({ type: 'getAdvancedProxyStatus', payload: { tabId: tab.id } }),
      browser.runtime.sendMessage({ type: 'getAdvancedProxyLog', payload: { tabId: tab.id } }),
    ]);
    setStatus(nextStatus);
    setEntries(nextEntries || []);
  }, [requestedTabId]);

  useEffect(() => {
    void sync();
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
    browser.runtime.onMessage.addListener(listener);
    browser.tabs.onUpdated.addListener(onTabUpdated);
    if (requestedTabId === null) browser.tabs.onActivated.addListener(sync);
    return () => {
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
    const next = await browser.runtime.sendMessage({
      type: enabled ? 'enableAdvancedProxy' : 'disableAdvancedProxy',
      payload: { tabId },
    });
    setStatus(next);
  };

  const clear = async () => {
    if (tabId === null) return;
    await browser.runtime.sendMessage({ type: 'clearAdvancedProxyLog', payload: { tabId } });
    setEntries([]);
    setSelected(null);
  };

  const createRule = async (entry: IRequestLogEntry) => {
    const response = await browser.runtime.sendMessage({
      type: 'createRuleFromRequest',
      payload: { request: entry, initiatorOrigin: origin },
    });
    if (!response?.success) {
      setMessage(response?.error || 'Unable to create rule.');
      return;
    }
    setMessage('A disabled rule was created. Review it before enabling.');
  };

  return (
    <main className="flex min-h-screen flex-col gap-3 bg-background p-3 text-foreground">
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Network /></div>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold">Traffic inspector</h1>
            <p className="truncate text-xs text-muted-foreground">{origin || 'No supported tab'}</p>
          </div>
        </div>
        <Switch
          checked={status?.phase === 'connected'}
          disabled={tabId === null || status?.phase === 'connecting'}
          onCheckedChange={toggle}
          aria-label="Toggle advanced proxy"
        />
      </header>

      {status?.phase !== 'connected' ? (
        <Alert>
          <CircleSlash2 />
          <AlertTitle>{targetError ? 'This tab cannot be inspected' : status?.phase === 'error' ? 'Inspector could not start' : 'Inspector is paused'}</AlertTitle>
          <AlertDescription>
            {targetError || status?.error || (__TARGET__ === 'firefox'
              ? 'Turn it on to capture and patch requests from this tab using Firefox WebRequest.'
              : 'Turn it on to attach CDP and capture this tab. Chrome will show its debugging banner.')}
          </AlertDescription>
        </Alert>
      ) : null}
      {message ? <Alert><AlertDescription>{message}</AlertDescription></Alert> : null}

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter URL, method, status" />
        </div>
        <Button size="icon" variant="outline" onClick={clear} aria-label="Clear requests"><Eraser /></Button>
      </div>

      <ScrollArea className="h-[48vh] rounded-lg border">
        <div className="flex flex-col">
          {filtered.map((entry) => (
            <button key={entry.id} className="flex items-center gap-2 p-2 text-left hover:bg-muted" onClick={() => setSelected(entry)}>
              <Badge variant="secondary">{entry.method}</Badge>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{entry.url}</p>
                <p className="text-xs text-muted-foreground">{entry.resourceType} · {entry.duration ?? 0} ms</p>
              </div>
              <Badge variant={statusVariant(entry)}>{entry.status || entry.outcome}</Badge>
            </button>
          ))}
          {filtered.length === 0 ? (
            <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">No matching requests</div>
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
              <Badge variant="outline">{selected.outcome}</Badge>
              {selected.matchedRuleIds.map((id) => <Badge key={id} variant="secondary">rule matched</Badge>)}
            </div>
            {selected.diagnostics.map((diagnostic) => (
              <Alert key={diagnostic}><AlertDescription>{diagnostic}</AlertDescription></Alert>
            ))}
            <Separator />
            <details>
              <summary className="cursor-pointer text-xs font-medium">Request headers</summary>
              <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">{JSON.stringify(selected.requestHeaders, null, 2)}</pre>
            </details>
            {selected.responseHeaders ? (
              <details>
                <summary className="cursor-pointer text-xs font-medium">Response headers</summary>
                <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">{JSON.stringify(selected.responseHeaders, null, 2)}</pre>
              </details>
            ) : null}
            <div className="flex gap-2">
              <Button size="sm" onClick={() => createRule(selected)}><Plus data-icon="inline-start" />Create rule</Button>
              <Button size="sm" variant="outline" onClick={() => browser.runtime.openOptionsPage()}>
                Open rules<ExternalLink data-icon="inline-end" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
