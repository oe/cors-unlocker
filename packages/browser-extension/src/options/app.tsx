import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import browser from 'webextension-polyfill';
import { Download, Info, Pencil, Plus, RotateCcw, Trash2, Upload } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { BrandMark } from '@/components/brand-mark';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { dataStorage } from '@/common/storage';
import type { IProxyAppState, IProxyRule } from '@/common/proxy-state';
import { RuleDialog, draftFromRule, EMPTY_DRAFT, type RuleDraft } from '@/components/rule-dialog';
import '@/common/tailwind.css';
import './style.scss';

function ProxyRules({ state, reload }: { state: IProxyAppState; reload: () => Promise<void> }) {
  const [draft, setDraft] = useState<RuleDraft | null>(null);
  const [pendingDelete, setPendingDelete] = useState<IProxyRule | null>(null);
  const remove = async (id: string) => {
    await browser.runtime.sendMessage({ type: 'deleteProxyRule', payload: { id } });
    setPendingDelete(null);
    await reload();
  };
  const toggle = async (rule: IProxyRule, enabled: boolean) => {
    await browser.runtime.sendMessage({
      type: 'saveProxyRule',
      payload: { rule: { ...rule, enabled } },
    });
    await reload();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Proxy rules</CardTitle>
        <CardDescription>Rules are evaluated locally in the order shown.</CardDescription>
        <CardAction>
          <Button onClick={() => setDraft({ ...EMPTY_DRAFT })}>
            <Plus data-icon="inline-start" />
            New rule
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {__TARGET__ === 'firefox' ? (
          <Alert>
            <Info />
            <AlertTitle>Firefox execution profile</AlertTitle>
            <AlertDescription>
              Response mocks replace an existing body, failed preflights cannot be synthesized, network failures cancel requests, and Fetch/XHR share one resource type.
            </AlertDescription>
          </Alert>
        ) : null}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rule</TableHead>
              <TableHead>Match</TableHead>
              <TableHead>Actions</TableHead>
              <TableHead className="w-28 text-right">Controls</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {state.rules.map((rule) => (
              <TableRow key={rule.id}>
                <TableCell>
                  <button className="flex flex-col gap-1 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setDraft(draftFromRule(rule))}>
                    <span className="font-medium">{rule.name}</span>
                    <Badge variant={rule.source === 'legacy-cors' ? 'secondary' : 'outline'}>{rule.source}</Badge>
                  </button>
                </TableCell>
                <TableCell className="max-w-72">
                  <p className="truncate font-mono text-xs" title={rule.match.urlPattern}>{rule.match.urlPattern}</p>
                  <p className="truncate text-xs text-muted-foreground" title={rule.match.initiatorOrigins.join(', ')}>{rule.match.initiatorOrigins.join(', ')}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {rule.match.methods?.join(', ') || 'All methods'} · {rule.match.resourceTypes?.join(', ') || 'All resource types'}
                  </p>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{rule.actions.map((action) => action.type).join(', ')}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Switch checked={rule.enabled} onCheckedChange={(enabled) => toggle(rule, enabled)} aria-label={`Toggle ${rule.name}`} />
                    <Button size="icon-sm" variant="ghost" aria-label={`Edit ${rule.name}`} onClick={() => setDraft(draftFromRule(rule))}>
                      <Pencil />
                    </Button>
                    <Button size="icon-sm" variant="ghost" aria-label={`Delete ${rule.name}`} onClick={() => setPendingDelete(rule)}>
                      <Trash2 />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {state.rules.length === 0 ? (
          <div className="flex min-h-52 flex-col items-center justify-center gap-2 text-center">
            <BrandMark className="size-9 opacity-60 grayscale" />
            <p className="font-medium">No proxy rules yet</p>
            <p className="text-sm text-muted-foreground">Capture a request or create your first rule.</p>
          </div>
        ) : null}
      </CardContent>
      <RuleDialog key={draft?.id || (draft ? 'new' : 'closed')} draft={draft} onOpenChange={(open) => !open && setDraft(null)} onSaved={reload} />
      <Dialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete proxy rule?</DialogTitle>
            <DialogDescription>
              “{pendingDelete?.name}” will stop matching immediately. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button variant="destructive" onClick={() => pendingDelete && remove(pendingDelete.id)}>Delete rule</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function DataSettings({ state, reload }: { state: IProxyAppState; reload: () => Promise<void> }) {
  const [message, setMessage] = useState<string | null>(null);
  const exportState = async () => {
    const json = await dataStorage.exportRules();
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `forth-intercept-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const importState = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const success = await dataStorage.importRules(await file.text(), false);
    setMessage(success ? 'Import completed.' : 'Import failed. The current state was not changed.');
    if (success) await reload();
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
          {message ? <p className="w-full text-sm text-muted-foreground">{message}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}

function App() {
  const [state, setState] = useState<IProxyAppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      const value = await browser.runtime.sendMessage({ type: 'getProxyState' });
      setState(value);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load proxy state.');
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  return (
    <main className="min-h-screen bg-muted/30 text-foreground">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-8">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BrandMark className="size-10" />
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Forth Intercept</h1>
              <p className="text-sm text-muted-foreground">Local request interception for {__TARGET__ === 'firefox' ? 'Firefox' : 'Chrome'}</p>
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={reload}><RotateCcw data-icon="inline-start" />Refresh</Button>
        </header>

        {error ? <Alert variant="destructive"><AlertTitle>Unable to load</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}

        {state ? (
          <Tabs defaultValue="rules">
            <TabsList>
              <TabsTrigger value="rules">Rules</TabsTrigger>
              <TabsTrigger value="data">Data & migration</TabsTrigger>
            </TabsList>
            <TabsContent value="rules"><ProxyRules state={state} reload={reload} /></TabsContent>
            <TabsContent value="data"><DataSettings state={state} reload={reload} /></TabsContent>
          </Tabs>
        ) : null}
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
