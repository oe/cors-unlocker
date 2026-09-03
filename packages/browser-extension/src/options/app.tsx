import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import browser from 'webextension-polyfill';
import { Download, Network, Plus, RotateCcw, Trash2, Upload } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Textarea } from '@/components/ui/textarea';
import { dataStorage } from '@/common/storage';
import type { IProxyAction, IProxyAppState, IProxyRule } from '@/common/proxy-state';
import '@/common/tailwind.css';
import './style.scss';

const ACTION_TEMPLATES: Record<string, IProxyAction[]> = {
  cors: [{
    type: 'cors',
    allowCredentials: false,
    allowOrigin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowHeaders: [],
  }],
  responseHeaders: [{ type: 'setResponseHeaders', headers: { 'X-Debug': 'true' } }],
  requestHeaders: [{ type: 'setRequestHeaders', headers: { 'X-Debug': 'true' } }],
  mock: [{
    type: 'mockResponse',
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: '{\n  "ok": true\n}',
  }],
  redirect: [{ type: 'redirect', url: 'https://example.com/' }],
  block: [{ type: 'block' }],
  delay: [{ type: 'delay', milliseconds: 1000 }],
  failure: [{ type: 'networkFailure', reason: 'Failed' }],
};

type RuleDraft = {
  id?: string;
  name: string;
  enabled: boolean;
  origins: string;
  urlPattern: string;
  methods: string;
  resourceTypes: string;
  actions: string;
};

const EMPTY_DRAFT: RuleDraft = {
  name: 'New proxy rule',
  enabled: true,
  origins: '*',
  urlPattern: '*',
  methods: '',
  resourceTypes: 'XHR,Fetch',
  actions: JSON.stringify(ACTION_TEMPLATES.responseHeaders, null, 2),
};

function draftFromRule(rule: IProxyRule): RuleDraft {
  return {
    id: rule.id,
    name: rule.name,
    enabled: rule.enabled,
    origins: rule.match.initiatorOrigins.join(', '),
    urlPattern: rule.match.urlPattern,
    methods: rule.match.methods?.join(', ') || '',
    resourceTypes: rule.match.resourceTypes?.join(', ') || '',
    actions: JSON.stringify(rule.actions, null, 2),
  };
}

function splitList(value: string): string[] | undefined {
  const items = value.split(',').map((item) => item.trim()).filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function RuleDialog({
  draft,
  onOpenChange,
  onSaved,
}: {
  draft: RuleDraft | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState<RuleDraft>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (draft) {
      setForm(draft);
      setError(null);
    }
  }, [draft]);

  const save = async () => {
    try {
      setPending(true);
      const actions = JSON.parse(form.actions);
      if (!Array.isArray(actions) || actions.length === 0) {
        throw new Error('Actions must be a non-empty JSON array.');
      }
      const origins = splitList(form.origins);
      if (!form.name.trim() || !origins?.length || !form.urlPattern.trim()) {
        throw new Error('Name, page origins, and URL pattern are required.');
      }
      const response = await browser.runtime.sendMessage({
        type: 'saveProxyRule',
        payload: {
          rule: {
            ...(form.id ? { id: form.id } : {}),
            name: form.name.trim(),
            enabled: form.enabled,
            source: 'user',
            match: {
              initiatorOrigins: origins,
              urlPattern: form.urlPattern.trim(),
              methods: splitList(form.methods)?.map((method) => method.toUpperCase()),
              resourceTypes: splitList(form.resourceTypes),
            },
            actions,
          },
        },
      });
      if (!response?.success) throw new Error(response?.error || 'Unable to save rule.');
      await onSaved();
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save rule.');
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={!!draft} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{form.id ? 'Edit proxy rule' : 'Create proxy rule'}</DialogTitle>
          <DialogDescription>Match traffic from a page, then run one or more local actions.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="rule-name">Name</FieldLabel>
            <Input id="rule-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="rule-origins">Page origins</FieldLabel>
              <Input id="rule-origins" value={form.origins} onChange={(event) => setForm({ ...form, origins: event.target.value })} placeholder="https://app.example.com or *" />
            </Field>
            <Field>
              <FieldLabel htmlFor="rule-pattern">Request URL pattern</FieldLabel>
              <Input id="rule-pattern" value={form.urlPattern} onChange={(event) => setForm({ ...form, urlPattern: event.target.value })} placeholder="*://api.example.com/*" />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="rule-methods">Methods</FieldLabel>
              <Input id="rule-methods" value={form.methods} onChange={(event) => setForm({ ...form, methods: event.target.value })} placeholder="GET, POST (blank = all)" />
            </Field>
            <Field>
              <FieldLabel htmlFor="rule-resources">Resource types</FieldLabel>
              <Input id="rule-resources" value={form.resourceTypes} onChange={(event) => setForm({ ...form, resourceTypes: event.target.value })} placeholder="XHR, Fetch" />
            </Field>
          </div>
          <Field>
            <FieldLabel>Action template</FieldLabel>
            <Select
              defaultValue="responseHeaders"
              onValueChange={(value) => {
                if (!value) return;
                setForm({
                  ...form,
                  actions: JSON.stringify(ACTION_TEMPLATES[value], null, 2),
                });
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="cors">Repair CORS</SelectItem>
                  <SelectItem value="responseHeaders">Set response headers</SelectItem>
                  <SelectItem value="requestHeaders">Set request headers</SelectItem>
                  <SelectItem value="mock">Mock response</SelectItem>
                  <SelectItem value="redirect">Redirect</SelectItem>
                  <SelectItem value="block">Block request</SelectItem>
                  <SelectItem value="delay">Delay</SelectItem>
                  <SelectItem value="failure">Network failure</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>Selecting a template replaces the JSON below.</FieldDescription>
          </Field>
          <Field data-invalid={!!error}>
            <FieldLabel htmlFor="rule-actions">Action script (JSON)</FieldLabel>
            <Textarea
              id="rule-actions"
              className="min-h-52 font-mono text-xs"
              aria-invalid={!!error}
              value={form.actions}
              onChange={(event) => setForm({ ...form, actions: event.target.value })}
            />
            {error ? <FieldDescription className="text-destructive">{error}</FieldDescription> : null}
            {!error ? <FieldDescription>Compose multiple validated actions without executing arbitrary JavaScript.</FieldDescription> : null}
          </Field>
        </FieldGroup>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button disabled={pending} onClick={save}>{pending ? 'Saving…' : 'Save rule'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProxyRules({ state, reload }: { state: IProxyAppState; reload: () => Promise<void> }) {
  const [draft, setDraft] = useState<RuleDraft | null>(null);
  const remove = async (id: string) => {
    await browser.runtime.sendMessage({ type: 'deleteProxyRule', payload: { id } });
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
      <CardContent>
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
                  <button className="flex flex-col gap-1 text-left" onClick={() => setDraft(draftFromRule(rule))}>
                    <span className="font-medium">{rule.name}</span>
                    <Badge variant={rule.source === 'legacy-cors' ? 'secondary' : 'outline'}>{rule.source}</Badge>
                  </button>
                </TableCell>
                <TableCell className="max-w-72">
                  <p className="truncate font-mono text-xs">{rule.match.urlPattern}</p>
                  <p className="truncate text-xs text-muted-foreground">{rule.match.initiatorOrigins.join(', ')}</p>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{rule.actions.map((action) => action.type).join(', ')}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Switch checked={rule.enabled} onCheckedChange={(enabled) => toggle(rule, enabled)} aria-label={`Toggle ${rule.name}`} />
                    <Button size="icon-sm" variant="ghost" aria-label={`Delete ${rule.name}`} onClick={() => remove(rule.id)}>
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
            <Network className="size-8 text-muted-foreground" />
            <p className="font-medium">No proxy rules yet</p>
            <p className="text-sm text-muted-foreground">Capture a request or create your first rule.</p>
          </div>
        ) : null}
      </CardContent>
      <RuleDialog draft={draft} onOpenChange={(open) => !open && setDraft(null)} onSaved={reload} />
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
    link.download = `browser-proxy-${new Date().toISOString().slice(0, 10)}.json`;
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
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Network /></div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Browser Proxy</h1>
              <p className="text-sm text-muted-foreground">Local request interception for Chrome</p>
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
