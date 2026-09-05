import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import browser from 'webextension-polyfill';
import { Download, Plus, RotateCcw, Trash2, Upload } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { BrandMark } from '@/components/brand-mark';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { dataStorage } from '@/common/storage';
import { APP_STATE_KEY, type IProxyAppState, type IProxyRule } from '@/common/proxy-state';
import { RuleDialog, draftFromRule, EMPTY_DRAFT, type RuleDraft } from '@/components/rule-dialog';
import { ACTION_LABELS } from '@/components/action-fields';
import { RESOURCE_TYPES } from '@/common/request-match';
import { parseImport, previewImport } from '@/common/import-preview';
import '@/common/tailwind.css';
import './style.scss';

function ProxyRules({ state, reload, navigate, onDirtyChange }: {
  state: IProxyAppState; reload: () => Promise<void>; navigate: (action: () => void) => void; onDirtyChange: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState<RuleDraft | null>(null);
  const [pendingDelete, setPendingDelete] = useState<IProxyRule | null>(null);
  const [query, setQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [resourceFilter, setResourceFilter] = useState('all');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const leave = (action: () => void) => navigate(() => { setDraft(null); onDirtyChange(false); action(); });
  const filtered = state.rules.filter((rule) =>
    `${rule.name} ${rule.match.urlPattern} ${rule.match.initiatorOrigins.join(' ')}`.toLowerCase().includes(query.trim().toLowerCase())
    && (actionFilter === 'all' || rule.actions.some((action) => action.type === actionFilter))
    && (resourceFilter === 'all' || !rule.match.resourceTypes?.length || rule.match.resourceTypes.includes(resourceFilter)));
  const mutate = async (type: string, payload: unknown) => {
    setBusy(true); setMessage('');
    try {
      const response = await browser.runtime.sendMessage({ type, payload });
      if (!response?.success) throw new Error(response?.error || 'Unable to update rules.');
      await reload();
      return true;
    } catch (error) { setMessage(String(error)); return false; }
    finally { setBusy(false); }
  };
  return <div className="grid min-h-[70vh] min-w-0 overflow-hidden rounded-xl border bg-background md:h-[calc(100vh-160px)] md:grid-cols-[300px_minmax(0,1fr)] lg:grid-cols-[340px_minmax(0,1fr)]">
    <aside aria-label="Rule list" className="flex min-h-0 min-w-0 flex-col gap-3 border-b p-4 md:border-r md:border-b-0">
      <div className="flex items-center justify-between"><h2 className="font-semibold">Rules <Badge variant="secondary">{state.rules.length}</Badge></h2>
        <Button size="sm" onClick={() => leave(() => setDraft({ ...EMPTY_DRAFT }))}><Plus data-icon="inline-start" />New rule</Button>
      </div>
      <Input aria-label="Search rules" placeholder="Search name, URL or site" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        <Select value={actionFilter} onValueChange={(value) => value && setActionFilter(value)}><SelectTrigger aria-label="Filter actions"><SelectValue>{actionFilter === 'all' ? 'All actions' : ACTION_LABELS[actionFilter as keyof typeof ACTION_LABELS]}</SelectValue></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">All actions</SelectItem>{Object.entries(ACTION_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectGroup></SelectContent></Select>
        <Select value={resourceFilter} onValueChange={(value) => value && setResourceFilter(value)}><SelectTrigger aria-label="Filter resource types"><SelectValue>{resourceFilter === 'all' ? 'All resource types' : resourceFilter}</SelectValue></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">All resource types</SelectItem>{RESOURCE_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectGroup></SelectContent></Select>
      </div>
      <p className="text-xs text-muted-foreground">{filtered.length} shown. Filtering keeps your open draft.</p>
      {message ? <Alert><AlertDescription>{message}</AlertDescription></Alert> : null}
      <div className="flex max-h-[40vh] flex-col gap-2 overflow-y-auto md:max-h-none">
        {filtered.map((rule) => <section key={rule.id} className="flex flex-col gap-2 rounded-lg border p-3">
          <div className="flex items-center justify-between gap-2">
            <Button className="min-w-0 justify-start" variant={draft?.id === rule.id ? 'secondary' : 'ghost'} aria-label={`Edit ${rule.name}`} onClick={() => leave(() => setDraft(draftFromRule(rule)))}><span className="truncate">{rule.name}</span></Button>
            <Switch checked={rule.enabled} disabled={busy} aria-label={`Toggle ${rule.name}`} onCheckedChange={(enabled) => leave(() => { void mutate('saveProxyRule', { rule: { ...rule, enabled } }).then((success) => { if (success && draft?.id === rule.id) setDraft(draftFromRule({ ...rule, enabled })); }); })} />
          </div>
          <p className="truncate text-xs text-muted-foreground" title={rule.match.urlPattern}>{rule.match.urlPattern}</p>
          <p className="truncate text-xs text-muted-foreground">{rule.match.initiatorOrigins.join(', ')}</p>
          <div className="flex flex-wrap items-center gap-1">
            <Badge variant="outline">{rule.enabled ? 'Enabled' : 'Disabled'}</Badge>
            {rule.actions.map((action, index) => <Badge key={index} variant="secondary">{ACTION_LABELS[action.type]}</Badge>)}
            <Button variant="ghost" size="icon-sm" disabled={busy} aria-label={`Delete ${rule.name}`} onClick={() => leave(() => setPendingDelete(rule))}><Trash2 /></Button>
          </div>
        </section>)}
        {!filtered.length ? <p className="py-8 text-center text-sm text-muted-foreground">{state.rules.length ? 'No rules match these filters.' : 'Create your first rule or capture a request in Site controls.'}</p> : null}
      </div>
    </aside>
    <div className="min-h-0 min-w-0 md:overflow-y-auto">
      {draft ? <RuleDialog key={draft.id || 'new'} inline draft={draft} onDirtyChange={onDirtyChange}
        onOpenChange={(open) => { if (!open) { onDirtyChange(false); setDraft(null); } }}
        onSaved={async (rule) => { await reload(); if (rule) setDraft(draftFromRule(rule)); setMessage('Rule saved.'); }} /> :
        <div className="flex min-h-72 flex-col items-center justify-center gap-3 p-8 text-center"><BrandMark /><h2 className="text-lg font-medium">Choose a rule to edit</h2><p className="text-sm text-muted-foreground">Configure actions and test conditions here. Use Site controls to verify actual request effects.</p></div>}
    </div>
    <Dialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}><DialogContent><DialogHeader><DialogTitle>Delete proxy rule?</DialogTitle><DialogDescription>“{pendingDelete?.name}” will stop matching immediately. This cannot be undone.</DialogDescription></DialogHeader><DialogFooter><DialogClose render={<Button variant="outline" />}>Cancel</DialogClose><Button variant="destructive" disabled={busy} onClick={async () => { if (pendingDelete && await mutate('deleteProxyRule', { id: pendingDelete.id })) { if (draft?.id === pendingDelete.id) { setDraft(null); onDirtyChange(false); } setPendingDelete(null); } }}>Delete rule</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

function DataSettings({ state, reload }: { state: IProxyAppState; reload: () => Promise<void> }) {
  const [message, setMessage] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<IProxyAppState | null>(null);
  const [merge, setMerge] = useState(true);
  const [busy, setBusy] = useState(false);
  const counts = incoming ? previewImport(state, incoming, merge) : null;
  const applyImport = async () => {
    if (!incoming) return;
    setBusy(true);
    try {
      const current = await browser.runtime.sendMessage({ type: 'getProxyState' });
      if (JSON.stringify(current) !== JSON.stringify(state)) { await reload(); throw new Error('Configuration changed. Review the updated preview and try again.'); }
      await browser.storage.local.set({ preImportBackup: { version: '2.0', state: current, timestamp: Date.now() } });
      if (!await dataStorage.importRules(JSON.stringify({ version: '2.0', state: incoming }), merge)) throw new Error('Import failed.');
      setIncoming(null); setMessage('Import completed. A pre-import recovery backup was saved locally.'); await reload();
    } catch (error) { setMessage(String(error)); }
    finally { setBusy(false); }
  };
  const exportRecovery = async () => {
    const { preImportBackup } = await browser.storage.local.get('preImportBackup');
    if (!preImportBackup) { setMessage('No pre-import backup yet.'); return; }
    download(JSON.stringify(preImportBackup), 'forth-intercept-recovery.json');
  };
  const download = (json: string, filename: string) => {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
  };
  const exportState = async () => {
    const json = await dataStorage.exportRules();
    download(json, `forth-intercept-${new Date().toISOString().slice(0, 10)}.json`);
  };
  const importState = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try { setIncoming(parseImport(await file.text())); setMerge(true); setMessage(null); }
    catch (error) { setIncoming(null); setMessage(`Nothing imported: ${String(error)}`); }
    event.target.value = '';
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Upgrade status</CardTitle>
          <CardDescription>The v1 snapshot is retained for recovery but is no longer used.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Schema</span>
            <Badge variant="secondary">v{state.schemaVersion}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Source</span>
            <span className="text-sm font-medium">{state.migration.source}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Migrated</span>
            <span className="text-sm font-medium">{new Date(state.migration.migratedAt).toLocaleString()}</span>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Portable configuration</CardTitle>
          <CardDescription>Export v2 state or import either a v1 or v2 backup.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportState}><Download data-icon="inline-start" />Export</Button>
          <Button variant="outline" render={<label htmlFor="import-state" />}>
            <Upload data-icon="inline-start" />Import
          </Button>
          <Input id="import-state" className="hidden" type="file" accept="application/json" onChange={importState} />
          <Button variant="ghost" onClick={exportRecovery}>Export recovery backup</Button>
          {incoming && counts ? <section aria-label="Import preview" className="flex w-full flex-col gap-3 rounded-lg border p-4">
            <h3 className="font-medium">Import preview</h3>
            <p className="text-sm">Nothing has been changed yet. Legacy backups are converted to v2.</p>
            <Select value={merge ? 'merge' : 'replace'} onValueChange={(value) => setMerge(value === 'merge')}><SelectTrigger aria-label="Import mode"><SelectValue>{merge ? 'Merge rules' : 'Replace configuration'}</SelectValue></SelectTrigger><SelectContent><SelectGroup><SelectItem value="merge">Merge rules</SelectItem><SelectItem value="replace">Replace configuration</SelectItem></SelectGroup></SelectContent></Select>
            <p className="text-sm">{counts.added} added · {counts.replaced} replaced · {counts.removed} removed · {counts.total} total</p>
            <p className="text-xs text-muted-foreground">{merge ? 'Matching IDs are overwritten; current settings and profiles are retained.' : 'All current rules, settings and profiles are replaced.'} A local recovery backup is saved before applying; export it to restore through this same preview.</p>
            <div className="flex gap-2"><Button disabled={busy} onClick={applyImport}>Apply import</Button><Button variant="outline" disabled={busy} onClick={() => setIncoming(null)}>Cancel import</Button></div>
          </section> : null}
          {message ? <p className="w-full text-sm text-muted-foreground">{message}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}


function App() {
  const [state, setState] = useState<IProxyAppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState('rules');
  const [dirty, setDirty] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);
  const reload = useCallback(async () => {
    try { setState(await browser.runtime.sendMessage({ type: 'getProxyState' })); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load proxy state.'); }
  }, []);
  const navigate = (action: () => void) => { if (dirty) setPendingNavigation(() => action); else action(); };
  useEffect(() => {
    void reload();
    const changed = (changes: Record<string, browser.Storage.StorageChange>, area: string) => { if (area === 'local' && changes[APP_STATE_KEY]) void reload(); };
    browser.storage.onChanged.addListener(changed);
    return () => browser.storage.onChanged.removeListener(changed);
  }, [reload]);
  return <main className="min-h-screen bg-muted/30 text-foreground">
    <div className="mx-auto flex max-w-[1500px] flex-col gap-5 px-3 py-5 sm:px-6">
      <header className="flex items-center justify-between gap-4"><div className="flex items-center gap-3"><BrandMark className="size-9" /><div><h1 className="text-xl font-semibold">Forth Intercept</h1><p className="text-xs text-muted-foreground">Rules workspace · {__TARGET__ === 'firefox' ? 'Firefox' : 'Chrome'}</p></div></div><Button size="sm" variant="ghost" onClick={() => void reload()}><RotateCcw data-icon="inline-start" />Refresh</Button></header>
      {error ? <Alert variant="destructive"><AlertTitle>Unable to load</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      {state ? <Tabs value={view} onValueChange={(value) => { if (value !== view) navigate(() => setView(value)); }}><TabsList><TabsTrigger value="rules">Rules</TabsTrigger><TabsTrigger value="data">Data & migration</TabsTrigger></TabsList>
        <TabsContent value="rules"><ProxyRules state={state} reload={reload} navigate={navigate} onDirtyChange={setDirty} /></TabsContent>
        <TabsContent value="data"><DataSettings state={state} reload={reload} /></TabsContent>
      </Tabs> : null}
    </div>
    <Dialog open={!!pendingNavigation} onOpenChange={(open) => !open && setPendingNavigation(null)}><DialogContent><DialogHeader><DialogTitle>Discard unsaved changes?</DialogTitle><DialogDescription>Save your draft or discard it before leaving.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setPendingNavigation(null)}>Keep editing</Button><Button variant="destructive" onClick={() => { const action = pendingNavigation; setPendingNavigation(null); setDirty(false); action?.(); }}>Discard changes</Button></DialogFooter></DialogContent></Dialog>
  </main>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
