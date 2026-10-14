import { t, translateError, formatDate, initializeLocale, useLocale } from '@/common/i18n';
import { StrictMode, useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import browser from 'webextension-polyfill';
import { Download, Plus, ListFilter, Database, Upload, ChevronDown, ChevronRight, Folder, Pencil, Trash2 } from 'lucide-react';
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
import { RecoveryPanel } from './recovery-panel';
import { dataStorage } from '@/common/storage';
import { APP_STATE_KEY, isProxyAppState, type IProxyProfile, type IProxyAppState, type IProxyRule } from '@/common/proxy-state';
import { ACTION_TEMPLATES, draftFromRule, EMPTY_DRAFT, type RuleDraft } from '@/components/rule-dialog';
import { ACTION_LABELS } from '@/components/action-fields';
import { needsProxy } from '@/common/quick-controls';
import { RESOURCE_TYPES } from '@/common/request-match';
import { parseImport, previewImport, previewGroupImport } from '@/common/import-preview';
import '@/common/tailwind.css';
import './style.scss';

function ProxyRules({ state, reload, navigate, onDirtyChange }: {
  state: IProxyAppState; reload: () => Promise<void>; navigate: (action: () => void) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState<RuleDraft | null>(null);
  const [pendingDelete, setPendingDelete] = useState<IProxyRule | null>(null);
  const [query, setQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [resourceFilter, setResourceFilter] = useState('all');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [groupDialog, setGroupDialog] = useState<{ kind: 'create' | 'rename' | 'remove'; profile?: IProxyProfile } | null>(null);
  const [groupName, setGroupName] = useState('');
  const [groupError, setGroupError] = useState('');
  useEffect(() => {
    void browser.storage.local.get('collapsedRuleGroups').then((stored) => {
      if (Array.isArray(stored.collapsedRuleGroups)) setCollapsed(stored.collapsedRuleGroups.filter((id: unknown) => typeof id === 'string'));
    });
  }, []);
  const collapse = (id: string) => {
    const next = collapsed.includes(id) ? collapsed.filter((value) => value !== id) : [...collapsed, id];
    setCollapsed(next);
    void browser.storage.local.set({ collapsedRuleGroups: next }).catch((error) => setMessage(String(error)));
  };
  const openGroup = (kind: 'create' | 'rename' | 'remove', profile?: IProxyProfile) => {
    setGroupName(profile?.name || ''); setGroupError(''); setGroupDialog({ kind, profile });
  };
  const changeGroup = async (payload: unknown, inDialog = false): Promise<boolean> => {
    setBusy(true); setMessage(''); setGroupError('');
    try {
      const response = await browser.runtime.sendMessage({ type: 'proxyStateOperation', payload });
      if (!isProxyAppState(response?.state)) throw new Error(response?.error || 'Unable to update rules.');
      await reload();
      return true;
    } catch (error) {
      if (inDialog) setGroupError(String(error)); else setMessage(String(error));
      return false;
    } finally { setBusy(false); }
  };
  const search = useRef<HTMLInputElement>(null);
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
    if (draft?.id !== rule.id) leave(() => setDraft(draftFromRule(rule, state.profiles)));
  };
  const groupsByRule = new Map(state.profiles.flatMap((profile) => profile.ruleIds.map((id) => [id, profile] as const)));
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
    const apply = () => void mutate('saveProxyRule', { rule: { id: rule.id, enabled } }).then((result) => {
      if (result && draft?.id === rule.id) setDraft(draftFromRule(typeof result === 'object' ? result : { ...rule, enabled }, state.profiles));
    });
    if (draft?.id === rule.id) leave(() => { setDraft(draftFromRule(rule, state.profiles)); apply(); });
    else apply();
  };
  const selected = state.rules.find((rule) => rule.id === draft?.id);
  const copy = () => {
    if (!selected) return;
    leave(() => {
      // A duplicate is a disabled draft until the user explicitly saves it.
      setDraft({ ...draftFromRule(selected, state.profiles), id: undefined, source: 'user', legacyRuleId: undefined, name: `${selected.name} copy`, enabled: false });
    });
  };
  const searching = !!query.trim() || actionFilter !== 'all' || resourceFilter !== 'all';
  const sections = [
    ...state.profiles.map((profile) => ({ profile, rules: filtered.filter((rule) => groupsByRule.get(rule.id)?.id === profile.id) })),
    { profile: undefined, rules: filtered.filter((rule) => !groupsByRule.get(rule.id)) },
  ].filter((section) => section.rules.length || (!searching && section.profile));
  const visibleRules = sections.filter(({ profile }) => !profile || searching || !collapsed.includes(profile.id)).flatMap(({ rules }) => rules);
  const renderRule = (rule: IProxyRule, index: number) => <div key={rule.id} className={cn('flex items-start gap-2 border-b px-3 py-2', draft?.id === rule.id && 'bg-muted')}>
          <button type="button" data-rule-select={rule.id} aria-label={t('Edit {name}', { name: rule.name })} aria-current={draft?.id === rule.id ? 'true' : undefined}
            className="flex min-w-0 flex-1 flex-col gap-1 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => select(rule)}
            onKeyDown={(event) => {
              if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? visibleRules.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + visibleRules.length) % visibleRules.length;
              const button = Array.from(event.currentTarget.closest('aside')?.querySelectorAll<HTMLButtonElement>('[data-rule-select]') || []).filter((item) => !item.closest('[hidden]'))[next];
              leave(() => { setDraft(draftFromRule(visibleRules[next], state.profiles)); button?.focus(); });
            }}>
            <span className="w-full truncate text-sm font-medium">{rule.name}</span>
            <span className="w-full truncate font-mono text-xs text-muted-foreground" title={rule.match.urlPattern}>{rule.match.urlPattern}</span>
            <span className="w-full truncate text-xs text-muted-foreground" title={rule.match.initiatorOrigins.join(', ')}>{rule.actions.map((action) => t(ACTION_LABELS[action.type])).join(' · ')} · {groupsByRule.get(rule.id)?.enabled === false ? t('Group paused') : !rule.enabled ? t('Disabled') : needsProxy(rule) ? t('Requires a connected tab') : t('Enabled')}</span>
          </button>
          <Switch checked={rule.enabled} disabled={busy || groupsByRule.get(rule.id)?.enabled === false} aria-label={t('Toggle {name}', { name: rule.name })} onCheckedChange={(enabled) => toggle(rule, enabled)} />
        </div>;
  const welcome = (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <BrandMark />
      <h2 className="text-lg font-medium">{t(state.rules.length ? 'Choose a rule to edit' : 'Make your first request change')}</h2>
      <p className="max-w-sm text-sm text-muted-foreground">{t('Open the extension on your app, choose Inspect and modify requests, then select a request to start.')}</p>
      <p className="text-xs text-muted-foreground">{t('Or create a rule manually:')}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {['mock', 'delay', 'responseHeaders', 'redirect', 'block', 'cors'].map((template) => (
          <Button key={template} size="sm" variant="outline" onClick={() => leave(() => setDraft({
            ...EMPTY_DRAFT,
            name: t(ACTION_LABELS[ACTION_TEMPLATES[template][0].type]),
            actions: JSON.stringify(ACTION_TEMPLATES[template], null, 2),
          }))}>
            {t(__TARGET__ === 'firefox' && template === 'mock' ? 'Replace response body' : ACTION_LABELS[ACTION_TEMPLATES[template][0].type])}
          </Button>
        ))}
      </div>
    </div>
  );
  return <div className="relative grid h-full min-h-0 min-w-0 grid-cols-1 md:grid-cols-[288px_minmax(0,1fr)]">
    <aside aria-label={t("Rule list")} className={cn('flex min-h-0 min-w-0 flex-col border-r', draft && 'max-md:hidden')}>
      <div className="flex shrink-0 flex-col gap-2 border-b p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{t('Rules')}</h2>
          <div className="ml-auto flex items-center gap-1">
            <Button size="xs" variant="ghost" disabled={busy} onClick={() => openGroup('create')}><Folder data-icon="inline-start" />{t('New group')}</Button>
            <Button size="sm" disabled={busy} onClick={() => leave(() => setDraft({ ...EMPTY_DRAFT }))}><Plus data-icon="inline-start" />{t('New rule')}</Button>
          </div>
        </div>
        <Input ref={search} aria-label={t("Search rules")} placeholder={t("Search rules · ⌘/Ctrl K")} value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          <Select value={actionFilter} onValueChange={(value) => value && setActionFilter(value)}><SelectTrigger className="w-full min-w-0" aria-label={t("Filter actions")}><SelectValue>{actionFilter === 'all' ? t("All actions") : t(ACTION_LABELS[actionFilter as keyof typeof ACTION_LABELS])}</SelectValue></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">{t("All actions")}</SelectItem>{Object.entries(ACTION_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{t(label)}</SelectItem>)}</SelectGroup></SelectContent></Select>
          <Select value={resourceFilter} onValueChange={(value) => value && setResourceFilter(value)}><SelectTrigger className="w-full min-w-0" aria-label={t("Filter resource types")}><SelectValue>{resourceFilter === 'all' ? t("All types") : resourceFilter}</SelectValue></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">{t("All resource types")}</SelectItem>{RESOURCE_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectGroup></SelectContent></Select>
        </div>
        <div className="flex justify-between text-xs text-muted-foreground"><span>{t('{shown} of {total} rules', { shown: filtered.length, total: state.rules.length })}</span><span>{t("↑ ↓ to navigate")}</span></div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto" aria-label={t("Rules")}>
        {sections.map(({ profile, rules }) => <section key={profile?.id || 'ungrouped'} aria-label={profile?.name || t('Ungrouped')}>
          {profile ? <div className="flex flex-wrap items-center gap-1 border-b bg-muted/40 px-2 py-2">
            <button type="button" className="flex min-w-0 flex-1 basis-[140px] items-center gap-1.5 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" disabled={searching} title={searching ? t('Clear filters to collapse groups.') : profile.name} aria-expanded={searching || !collapsed.includes(profile.id)} aria-controls={`group-${profile.id}`} onClick={() => collapse(profile.id)}>
              {searching || !collapsed.includes(profile.id) ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
              <Folder className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0"><span className="block truncate text-sm font-medium" title={profile.name}>{profile.name}</span><span className="block text-xs text-muted-foreground">{profile.enabled ? t('{on} of {total} rules on', { on: state.rules.filter((rule) => profile.ruleIds.includes(rule.id) && rule.enabled).length, total: profile.ruleIds.length }) : t('Group paused')}</span></span>
            </button>
            <div className="ml-auto flex shrink-0 items-center gap-1">
            <Switch size="sm" checked={profile.enabled} disabled={busy} aria-label={t('Enable group {name}', { name: profile.name })} onCheckedChange={(enabled) => void changeGroup({ kind: 'updateGroup', id: profile.id, enabled })} />
            <Button variant="ghost" size="icon-xs" disabled={busy} title={t('Create rule in {name}', { name: profile.name })} aria-label={t('Create rule in {name}', { name: profile.name })} onClick={() => leave(() => setDraft({ ...EMPTY_DRAFT, groupId: profile.id }))}><Plus /></Button>
            <Button variant="ghost" size="icon-xs" disabled={busy} title={t('Rename group {name}', { name: profile.name })} aria-label={t('Rename group {name}', { name: profile.name })} onClick={() => openGroup('rename', profile)}><Pencil /></Button>
            <Button variant="ghost" size="icon-xs" disabled={busy} title={t('Delete group {name}', { name: profile.name })} aria-label={t('Delete group {name}', { name: profile.name })} onClick={() => openGroup('remove', profile)}><Trash2 /></Button>
            </div>
          </div> : state.profiles.length ? <h3 className="border-b bg-muted/40 px-3 py-2 text-sm font-medium">{t('Ungrouped')}</h3> : null}
          <div id={profile ? `group-${profile.id}` : undefined} hidden={!!profile && !searching && collapsed.includes(profile.id)}>
            {rules.map((rule) => renderRule(rule, visibleRules.findIndex((item) => item.id === rule.id)))}
            {profile && !rules.length ? <p className="p-3 text-xs text-muted-foreground">{t('No rules in this group. Use + to add one, or choose this group in a rule editor.')}</p> : null}
          </div>
        </section>)}
        {!filtered.length ? state.rules.length ? <p className="p-6 text-sm text-muted-foreground">{t("No rules match these filters. Your draft is preserved.")}</p> : <><p className="hidden p-6 text-sm text-muted-foreground md:block">{t("Create a rule or start from a captured request in Site controls.")}</p><div className="md:hidden">{welcome}</div></> : null}
      </div>
    </aside>
    <div className={cn('min-h-0 min-w-0', !draft && 'max-md:hidden')}>
      {draft ? <WorkspaceRuleEditor profiles={state.profiles} key={draft.id || 'new'} draft={draft} onDirtyChange={onDirtyChange}
        onCopy={selected ? copy : undefined} onDelete={selected ? () => setPendingDelete(selected) : undefined}
        onOpenChange={(open) => { if (!open) { onDirtyChange(false); setDraft(null); } }}
        onSaved={async (rule, groupId) => { await reload(); if (rule) setDraft({ ...draftFromRule(rule, state.profiles), ...(groupId !== undefined ? { groupId } : {}) }); setMessage('Rule saved.'); }} /> :
        welcome}
    </div>
    {message ? <Alert role={message === 'Rule saved.' ? 'status' : 'alert'} className="pointer-events-none absolute bottom-16 right-4 max-w-[min(24rem,calc(100%-2rem))] shadow-sm"><AlertDescription>{translateError(message)}</AlertDescription></Alert> : null}
    <Dialog open={!!groupDialog} onOpenChange={(open) => { if (!busy && !open) setGroupDialog(null); }}><DialogContent>
      <form onSubmit={async (event) => {
        event.preventDefault();
        if (!groupDialog || busy) return;
        const payload = groupDialog.kind === 'create' ? { kind: 'createGroup', name: groupName } : groupDialog.kind === 'rename' ? { kind: 'updateGroup', id: groupDialog.profile?.id, name: groupName } : { kind: 'removeGroup', id: groupDialog.profile?.id };
        if (await changeGroup(payload, true)) {
          setGroupDialog(null);
        }
      }} className="space-y-4">
        <DialogHeader><DialogTitle>{t(groupDialog?.kind === 'remove' ? 'Delete group?' : groupDialog?.kind === 'rename' ? 'Rename group' : 'New group')}</DialogTitle><DialogDescription>{t(groupDialog?.kind === 'remove' ? 'Rules move to Ungrouped and keep their switches. Enabled rules in a paused group will resume. No rules are deleted.' : 'Group off pauses its rules without changing their switches.')}</DialogDescription></DialogHeader>
        {groupDialog?.kind !== 'remove' ? <><label htmlFor="group-name" className="text-sm font-medium">{t('Group name')}</label><Input id="group-name" autoFocus maxLength={80} value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder={t('For example, Staging')} /></> : <p className="text-sm font-medium">{groupDialog.profile?.name}</p>}
        {groupError ? <p role="alert" className="text-sm text-destructive">{translateError(groupError)}</p> : null}
        <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setGroupDialog(null)}>{t('Cancel')}</Button><Button type="submit" variant={groupDialog?.kind === 'remove' ? 'destructive' : 'default'} disabled={busy || (groupDialog?.kind !== 'remove' && !groupName.trim())}>{t(groupDialog?.kind === 'remove' ? 'Delete group' : groupDialog?.kind === 'rename' ? 'Save name' : 'Create group')}</Button></DialogFooter>
      </form>
    </DialogContent></Dialog>
    <Dialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}><DialogContent><DialogHeader><DialogTitle>{t("Delete proxy rule?")}</DialogTitle><DialogDescription>{t('Delete {name} and its unsaved edits? This cannot be undone.', { name: pendingDelete?.name || '' })}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setPendingDelete(null)}>{t("Cancel")}</Button><Button variant="destructive" disabled={busy} onClick={async () => { if (pendingDelete && await mutate('deleteProxyRule', { id: pendingDelete.id })) { if (draft?.id === pendingDelete.id) { setDraft(null); onDirtyChange(false); } setPendingDelete(null); } }}>{t("Delete rule")}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

function DataSettings({ state, reload }: { state: IProxyAppState; reload: () => Promise<void> }) {
  const [message, setMessage] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<IProxyAppState | null>(null);
  const [merge, setMerge] = useState(true);
  const [busy, setBusy] = useState(false);
  const counts = incoming ? previewImport(state, incoming, merge) : null;
  const groupCounts = incoming ? previewGroupImport(state, incoming, merge) : null;
  const applyImport = async () => {
    if (!incoming) return;
    setBusy(true);
    try {
      const current = await browser.runtime.sendMessage({ type: 'getProxyState' });
      if (JSON.stringify(current) !== JSON.stringify(state)) { await reload(); throw new Error('Configuration changed. Review the updated preview and try again.'); }
      if (!await dataStorage.importRules(JSON.stringify({ version: '2.0', state: incoming }), merge, state)) throw new Error('Import failed.');
      setIncoming(null); setMessage('Import completed. A pre-import recovery backup was saved locally.'); await reload();
    } catch (error) { setMessage(String(error)); }
    finally { setBusy(false); }
  };
  const exportRecovery = async () => {
    const { preImportBackup } = await browser.storage.local.get('preImportBackup');
    if (!preImportBackup) { setMessage('No pre-import backup yet.'); return; }
    download(JSON.stringify(preImportBackup), 'wireflip-recovery.json');
  };
  const download = (json: string, filename: string) => {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
  };
  const exportState = async () => {
    const json = await dataStorage.exportRules();
    download(json, `wireflip-${new Date().toISOString().slice(0, 10)}.json`);
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
            {groupCounts ? <p className="text-sm">{t('{groups} groups · {paused} paused after import', groupCounts)}</p> : null}
            <p className="text-xs text-muted-foreground">{merge ? t("Matching IDs are overwritten; current settings are retained and groups are merged.") : t("All current rules, settings and groups are replaced.")} {t("A local recovery backup is saved before applying; export it to restore through this same preview.")}</p>
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
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);
  const reload = useCallback(async () => {
    try {
      const next = await browser.runtime.sendMessage({ type: 'getProxyState' });
      if (!isProxyAppState(next)) throw new Error(next?.error || 'Unable to load proxy state.');
      setState(next); setError(null);
    }
    catch (cause) { setState(null); setError(cause instanceof Error ? cause.message : 'Unable to load proxy state.'); }
  }, []);
  const navigate = useCallback((action: () => void) => { if (dirty) setPendingNavigation(() => action); else action(); }, [dirty]);
  useEffect(() => {
    void reload();
    const changed = (changes: Record<string, browser.Storage.StorageChange>, area: string) => { if (area === 'local' && changes[APP_STATE_KEY]) void reload(); };
    browser.storage.onChanged.addListener(changed);
    return () => browser.storage.onChanged.removeListener(changed);
  }, [reload]);
  return <main className="flex h-dvh min-h-0 flex-col overflow-hidden bg-background text-foreground">
    {error ? <Alert variant="destructive"><AlertTitle>{t("Unable to load")}</AlertTitle><AlertDescription>{translateError(error)}</AlertDescription></Alert> : null}
    <div className="flex min-h-0 flex-1">
      <nav aria-label={t("Workspace navigation")} className="flex w-14 shrink-0 flex-col gap-1 border-r bg-muted/30 p-2 lg:w-36">
        <div className="mb-2 flex h-9 shrink-0 items-center justify-center gap-2 lg:justify-start lg:px-1" title="Wireflip">
          <BrandMark className="size-7 shrink-0" /><h1 className="sr-only text-sm font-semibold lg:not-sr-only">Wireflip</h1>
        </div>
        <Button variant={view === 'rules' ? 'secondary' : 'ghost'} className="h-auto min-h-9 w-full lg:justify-start" aria-label={t("Rules")} title={t("Rules")} aria-current={view === 'rules' ? 'page' : undefined} onClick={() => { if (view !== 'rules') navigate(() => setView('rules')); }}><ListFilter data-icon="inline-start" /><span className="hidden min-w-0 whitespace-normal text-left lg:block">{t("Rules")}</span></Button>
        <Button variant={view === 'data' ? 'secondary' : 'ghost'} className="h-auto min-h-9 w-full py-2 lg:justify-start" aria-label={t("Data & migration")} title={t("Data & migration")} aria-current={view === 'data' ? 'page' : undefined} onClick={() => { if (view !== 'data') navigate(() => setView('data')); }}><Database data-icon="inline-start" /><span className="hidden min-w-0 whitespace-normal text-left lg:block">{t("Data & migration")}</span></Button>
        <div className="mt-auto pt-3"><LanguageSelect compact /></div>
      </nav>
      <div className="min-h-0 min-w-0 flex-1">
        {state ? view === 'rules' ? <ProxyRules state={state} reload={reload} navigate={navigate} onDirtyChange={setDirty} /> :
          <section aria-label={t("Data management")} className="h-full overflow-y-auto p-4 lg:p-6"><div className="mx-auto max-w-5xl"><h2 className="mb-4 text-xl font-semibold">{t("Data & recovery")}</h2><DataSettings state={state} reload={reload} /></div></section> :
          <>{error ? <RecoveryPanel reload={reload} /> : <p className="p-6 text-sm text-muted-foreground">{t("Loading configuration…")}</p>}</>}
      </div>
    </div>
    <Dialog open={!!pendingNavigation} onOpenChange={(open) => !open && setPendingNavigation(null)}><DialogContent><DialogHeader><DialogTitle>{t("Discard unsaved changes?")}</DialogTitle><DialogDescription>{t("Save your draft or discard it before leaving.")}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setPendingNavigation(null)}>{t("Keep editing")}</Button><Button variant="destructive" onClick={() => { const action = pendingNavigation; setPendingNavigation(null); setDirty(false); action?.(); }}>{t("Discard changes")}</Button></DialogFooter></DialogContent></Dialog>
  </main>;
}

void initializeLocale().then(() => createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>));
