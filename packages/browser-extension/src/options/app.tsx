import { t, translateError, formatDate, initializeLocale, useLocale } from '@/common/i18n';
import { StrictMode, useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import browser from 'webextension-polyfill';
import { Download, Plus, ListFilter, Database, Upload } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { LanguageSelect } from '@/components/language-select';
import { BrandMark } from '@/components/brand-mark';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { WorkspaceRuleEditor } from './workspace-rule-editor';
import { dataStorage } from '@/common/storage';
import { APP_STATE_KEY, type IProxyAppState, type IProxyRule } from '@/common/proxy-state';
import { draftFromRule, EMPTY_DRAFT, type RuleDraft } from '@/components/rule-dialog';
import { ACTION_LABELS } from '@/components/action-fields';
import { RESOURCE_TYPES } from '@/common/request-match';
import { parseImport, previewImport } from '@/common/import-preview';
import '@/common/tailwind.css';
import './style.scss';

function ProxyRules({ state, reload, navigate, onDirtyChange, createToken }: {
  state: IProxyAppState; reload: () => Promise<void>; navigate: (action: () => void) => void;
  onDirtyChange: (dirty: boolean) => void; createToken: number;
}) {
  const [draft, setDraft] = useState<RuleDraft | null>(null);
  const [pendingDelete, setPendingDelete] = useState<IProxyRule | null>(null);
  const [query, setQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [resourceFilter, setResourceFilter] = useState('all');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const previousCreate = useRef(createToken);
  useEffect(() => {
    if (previousCreate.current !== createToken) {
      previousCreate.current = createToken;
      setDraft({ ...EMPTY_DRAFT });
      onDirtyChange(false);
    }
  }, [createToken, onDirtyChange]);
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        const focus = () => { setDraft(null); onDirtyChange(false); requestAnimationFrame(() => search.current?.focus()); };
        if (window.matchMedia('(max-width: 767px)').matches) navigate(focus);
        else search.current?.focus();
      }
    };
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, [navigate, onDirtyChange]);
  useEffect(() => {
    if (message !== 'Rule saved.') return;
    const timer = window.setTimeout(() => setMessage(''), 6000);
    return () => window.clearTimeout(timer);
  }, [message]);
  const leave = (action: () => void) => navigate(() => { onDirtyChange(false); action(); });
  const select = (rule: IProxyRule) => {
    if (draft?.id !== rule.id) leave(() => setDraft(draftFromRule(rule)));
  };
  const filtered = state.rules.filter((rule) =>
    `${rule.name} ${rule.match.urlPattern} ${rule.match.initiatorOrigins.join(' ')}`.toLowerCase().includes(query.trim().toLowerCase())
    && (actionFilter === 'all' || rule.actions.some((action) => action.type === actionFilter))
    && (resourceFilter === 'all' || !rule.match.resourceTypes?.length || rule.match.resourceTypes.includes(resourceFilter)));
  const mutate = async (type: string, payload: unknown): Promise<IProxyRule | true | false> => {
    setBusy(true); setMessage('');
    try {
      const response = await browser.runtime.sendMessage({ type, payload });
      if (!response?.success) throw new Error(response?.error || 'Unable to update rules.');
      await reload();
      return response.rule || true;
    } catch (error) { setMessage(String(error)); return false; }
    finally { setBusy(false); }
  };
  const toggle = (rule: IProxyRule, enabled: boolean) => {
    const apply = () => void mutate('saveProxyRule', { rule: { ...rule, enabled } }).then((result) => {
      if (result && draft?.id === rule.id) setDraft(draftFromRule(typeof result === 'object' ? result : { ...rule, enabled }));
    });
    if (draft?.id === rule.id) leave(() => { setDraft(draftFromRule(rule)); apply(); });
    else apply();
  };
  const selected = state.rules.find((rule) => rule.id === draft?.id);
  const copy = () => {
    if (!selected) return;
    leave(() => {
      // A duplicate is a disabled draft until the user explicitly saves it.
      setDraft({ ...draftFromRule(selected), id: undefined, source: 'user', legacyRuleId: undefined, name: `${selected.name} copy`, enabled: false });
    });
  };
  return <div className="relative grid h-full min-h-0 min-w-0 grid-cols-1 md:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)]">
    <aside aria-label={t("Rule list")} className={cn('flex min-h-0 min-w-0 flex-col border-r', draft && 'max-md:hidden')}>
      <div className="flex shrink-0 flex-col gap-2 border-b p-3">
        <Input ref={search} aria-label={t("Search rules")} placeholder={t("Search rules · ⌘/Ctrl K")} value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          <Select value={actionFilter} onValueChange={(value) => value && setActionFilter(value)}><SelectTrigger className="w-full min-w-0" aria-label={t("Filter actions")}><SelectValue>{actionFilter === 'all' ? t("All actions") : t(ACTION_LABELS[actionFilter as keyof typeof ACTION_LABELS])}</SelectValue></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">{t("All actions")}</SelectItem>{Object.entries(ACTION_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{t(label)}</SelectItem>)}</SelectGroup></SelectContent></Select>
          <Select value={resourceFilter} onValueChange={(value) => value && setResourceFilter(value)}><SelectTrigger className="w-full min-w-0" aria-label={t("Filter resource types")}><SelectValue>{resourceFilter === 'all' ? t("All types") : resourceFilter}</SelectValue></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">{t("All resource types")}</SelectItem>{RESOURCE_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectGroup></SelectContent></Select>
        </div>
        <div className="flex justify-between text-xs text-muted-foreground"><span>{t('{shown} of {total} rules', { shown: filtered.length, total: state.rules.length })}</span><span>{t("↑ ↓ to navigate")}</span></div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto" aria-label={t("Rules")}>
        {filtered.map((rule, index) => <div key={rule.id} className={cn('flex items-start gap-2 border-b px-3 py-2.5', draft?.id === rule.id && 'bg-muted')}>
          <button type="button" data-rule-select={rule.id} aria-label={t('Edit {name}', { name: rule.name })} aria-current={draft?.id === rule.id ? 'true' : undefined}
            className="flex min-w-0 flex-1 flex-col gap-1 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => select(rule)}
            onKeyDown={(event) => {
              if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? filtered.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + filtered.length) % filtered.length;
              const button = event.currentTarget.parentElement?.parentElement?.querySelectorAll<HTMLButtonElement>('[data-rule-select]')[next];
              leave(() => { setDraft(draftFromRule(filtered[next])); button?.focus(); });
            }}>
            <span className="w-full truncate text-sm font-medium">{rule.name}</span>
            <span className="w-full truncate font-mono text-xs text-muted-foreground" title={rule.match.urlPattern}>{rule.match.urlPattern}</span>
            <span className="w-full truncate text-xs text-muted-foreground" title={rule.match.initiatorOrigins.join(', ')}>{rule.actions.map((action) => t(ACTION_LABELS[action.type])).join(' · ')} · {rule.enabled ? t("Enabled") : t("Disabled")}</span>
          </button>
          <Switch checked={rule.enabled} disabled={busy} aria-label={t('Toggle {name}', { name: rule.name })} onCheckedChange={(enabled) => toggle(rule, enabled)} />
        </div>)}
        {!filtered.length ? <p className="p-6 text-sm text-muted-foreground">{state.rules.length ? t("No rules match these filters. Your draft is preserved.") : t("Create a rule or start from a captured request in Site controls.")}</p> : null}
      </div>
    </aside>
    <div className={cn('min-h-0 min-w-0', !draft && 'max-md:hidden')}>
      {draft ? <WorkspaceRuleEditor key={draft.id || 'new'} draft={draft} onDirtyChange={onDirtyChange}
        onCopy={selected ? copy : undefined} onDelete={selected ? () => setPendingDelete(selected) : undefined}
        onOpenChange={(open) => { if (!open) { onDirtyChange(false); setDraft(null); } }}
        onSaved={async (rule) => { await reload(); if (rule) setDraft(draftFromRule(rule)); setMessage('Rule saved.'); }} /> :
        <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center"><BrandMark /><h2 className="text-lg font-medium">{t("Choose a rule to edit")}</h2><p className="max-w-sm text-sm text-muted-foreground">{t("Search with ⌘/Ctrl K. Select a rule, configure its actions, then test its conditions.")}</p></div>}
    </div>
    {message ? <Alert role={message === 'Rule saved.' ? 'status' : 'alert'} className="pointer-events-none absolute bottom-16 right-4 max-w-[min(24rem,calc(100%-2rem))] shadow-sm"><AlertDescription>{translateError(message)}</AlertDescription></Alert> : null}
    <Dialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}><DialogContent><DialogHeader><DialogTitle>{t("Delete proxy rule?")}</DialogTitle><DialogDescription>{t('Delete {name} and its unsaved edits? This cannot be undone.', { name: pendingDelete?.name || '' })}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setPendingDelete(null)}>{t("Cancel")}</Button><Button variant="destructive" disabled={busy} onClick={async () => { if (pendingDelete && await mutate('deleteProxyRule', { id: pendingDelete.id })) { if (draft?.id === pendingDelete.id) { setDraft(null); onDirtyChange(false); } setPendingDelete(null); } }}>{t("Delete rule")}</Button></DialogFooter></DialogContent></Dialog>
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
          <CardTitle>{t("Upgrade status")}</CardTitle>
          <CardDescription>{t("The v1 snapshot is retained for recovery but is no longer used.")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t("Schema")}</span>
            <Badge variant="secondary">v{state.schemaVersion}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t("Source")}</span>
            <span className="text-sm font-medium">{t(state.migration.source === 'fresh-install' ? 'Fresh install' : 'Migrated from v1')}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t("Migrated")}</span>
            <span className="text-sm font-medium">{formatDate(state.migration.migratedAt)}</span>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("Portable configuration")}</CardTitle>
          <CardDescription>{t("Export v2 state or import either a v1 or v2 backup.")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportState}><Download data-icon="inline-start" />{t("Export")}</Button>
          <Button variant="outline" render={<label htmlFor="import-state" />}>
            <Upload data-icon="inline-start" />{t("Import")} </Button>
          <Input id="import-state" className="hidden" type="file" accept="application/json" onChange={importState} />
          <Button variant="ghost" onClick={exportRecovery}>{t("Export recovery backup")}</Button>
          {incoming && counts ? <section aria-label={t("Import preview")} className="flex w-full flex-col gap-3 rounded-lg border p-4">
            <h3 className="font-medium">{t("Import preview")}</h3>
            <p className="text-sm">{t("Nothing has been changed yet. Legacy backups are converted to v2.")}</p>
            <Select value={merge ? 'merge' : 'replace'} onValueChange={(value) => setMerge(value === 'merge')}><SelectTrigger aria-label={t("Import mode")}><SelectValue>{merge ? t("Merge rules") : t("Replace configuration")}</SelectValue></SelectTrigger><SelectContent><SelectGroup><SelectItem value="merge">{t("Merge rules")}</SelectItem><SelectItem value="replace">{t("Replace configuration")}</SelectItem></SelectGroup></SelectContent></Select>
            <p className="text-sm">{t('{added} added · {replaced} replaced · {removed} removed · {total} total', { ...counts })}</p>
            <p className="text-xs text-muted-foreground">{merge ? t("Matching IDs are overwritten; current settings and profiles are retained.") : t("All current rules, settings and profiles are replaced.")} {t("A local recovery backup is saved before applying; export it to restore through this same preview.")}</p>
            <div className="flex gap-2"><Button disabled={busy} onClick={applyImport}>{t("Apply import")}</Button><Button variant="outline" disabled={busy} onClick={() => setIncoming(null)}>{t("Cancel import")}</Button></div>
          </section> : null}
          {message ? <p className="w-full text-sm text-muted-foreground">{translateError(message)}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}


function App() {
  useLocale();
  const [state, setState] = useState<IProxyAppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState('rules');
  const [dirty, setDirty] = useState(false);
  const [createToken, setCreateToken] = useState(0);
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);
  const reload = useCallback(async () => {
    try { setState(await browser.runtime.sendMessage({ type: 'getProxyState' })); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load proxy state.'); }
  }, []);
  const navigate = useCallback((action: () => void) => { if (dirty) setPendingNavigation(() => action); else action(); }, [dirty]);
  useEffect(() => {
    void reload();
    const changed = (changes: Record<string, browser.Storage.StorageChange>, area: string) => { if (area === 'local' && changes[APP_STATE_KEY]) void reload(); };
    browser.storage.onChanged.addListener(changed);
    return () => browser.storage.onChanged.removeListener(changed);
  }, [reload]);
  return <main className="flex h-dvh min-h-0 flex-col overflow-hidden bg-background text-foreground">
    <header className="flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
      <div className="flex min-w-0 items-center gap-3"><BrandMark className="size-8" /><h1 className="truncate text-base font-semibold">Forth Intercept</h1></div>
      <div className="flex flex-wrap items-center gap-2"><LanguageSelect />{view === 'rules' ? <Button size="sm" disabled={!state} onClick={() => navigate(() => setCreateToken((token) => token + 1))}><Plus data-icon="inline-start" />{t("New rule")}</Button> : <span className="text-sm text-muted-foreground">{t("Data management")}</span>}</div>
    </header>
    {error ? <Alert variant="destructive"><AlertTitle>{t("Unable to load")}</AlertTitle><AlertDescription>{translateError(error)}</AlertDescription></Alert> : null}
    <div className="flex min-h-0 flex-1">
      <nav aria-label={t("Workspace navigation")} className="flex w-14 shrink-0 flex-col items-center gap-2 border-r bg-muted/30 py-3 sm:w-16">
        <Button variant={view === 'rules' ? 'secondary' : 'ghost'} size="icon" aria-label={t("Rules")} title={t("Rules")} aria-current={view === 'rules' ? 'page' : undefined} onClick={() => { if (view !== 'rules') navigate(() => setView('rules')); }}><ListFilter /></Button>
        <Button variant={view === 'data' ? 'secondary' : 'ghost'} size="icon" aria-label={t("Data & migration")} title={t("Data & migration")} aria-current={view === 'data' ? 'page' : undefined} onClick={() => { if (view !== 'data') navigate(() => setView('data')); }}><Database /></Button>
      </nav>
      <div className="min-h-0 min-w-0 flex-1">
        {state ? view === 'rules' ? <ProxyRules state={state} reload={reload} navigate={navigate} onDirtyChange={setDirty} createToken={createToken} /> :
          <section aria-label={t("Data management")} className="h-full overflow-y-auto p-4 lg:p-8"><div className="mx-auto max-w-5xl"><h2 className="mb-5 text-xl font-semibold">{t("Data & recovery")}</h2><DataSettings state={state} reload={reload} /></div></section> :
          <p className="p-6 text-sm text-muted-foreground">{t("Loading configuration…")}</p>}
      </div>
    </div>
    <Dialog open={!!pendingNavigation} onOpenChange={(open) => !open && setPendingNavigation(null)}><DialogContent><DialogHeader><DialogTitle>{t("Discard unsaved changes?")}</DialogTitle><DialogDescription>{t("Save your draft or discard it before leaving.")}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setPendingNavigation(null)}>{t("Keep editing")}</Button><Button variant="destructive" onClick={() => { const action = pendingNavigation; setPendingNavigation(null); setDirty(false); action?.(); }}>{t("Discard changes")}</Button></DialogFooter></DialogContent></Dialog>
  </main>;
}

void initializeLocale().then(() => createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>));
