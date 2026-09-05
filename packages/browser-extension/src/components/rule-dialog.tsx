import { useEffect, useState } from 'react';
import browser from 'webextension-polyfill';
import { Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { MultiSelectField } from '@/components/multi-select-field';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { isProxyAction, type IProxyAction, type IProxyRule } from '@/common/proxy-state';
import { ActionFields, ACTION_LABELS } from '@/components/action-fields';
import { explainRuleMatch } from '@/common/rule-explanation';
import { RESOURCE_TYPES } from '@/common/request-match';

export const ACTION_TEMPLATES: Record<string, IProxyAction[]> = {
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

type ActionTemplate = keyof typeof ACTION_TEMPLATES;

function actionTemplateLabel(template: ActionTemplate, isFirefox: boolean): string {
  const labels: Record<ActionTemplate, string> = {
    cors: 'Repair CORS',
    responseHeaders: 'Set response headers',
    requestHeaders: 'Set request headers',
    mock: isFirefox ? 'Replace response body' : 'Mock response',
    redirect: 'Redirect',
    block: 'Block request',
    delay: 'Delay',
    failure: 'Network failure',
  };
  return labels[template];
}

export type RuleDraft = {
  id?: string;
  source?: IProxyRule['source'];
  legacyRuleId?: number;
  name: string;
  enabled: boolean;
  origins: string;
  urlPattern: string;
  methods: string;
  resourceTypes: string[];
  actions: string;
};

export const EMPTY_DRAFT: RuleDraft = {
  name: 'New proxy rule',
  enabled: true,
  origins: '*',
  urlPattern: '*',
  methods: '',
  resourceTypes: ['XHR', 'Fetch'],
  actions: JSON.stringify(ACTION_TEMPLATES.responseHeaders, null, 2),
};

export function draftFromRule(rule: IProxyRule): RuleDraft {
  return {
    id: rule.id,
    source: rule.source,
    legacyRuleId: rule.legacyRuleId,
    name: rule.name,
    enabled: rule.enabled,
    origins: rule.match.initiatorOrigins.join(', '),
    urlPattern: rule.match.urlPattern,
    methods: rule.match.methods?.join(', ') || '',
    resourceTypes: [...(rule.match.resourceTypes || [])],
    actions: JSON.stringify(rule.actions, null, 2),
  };
}

function splitList(value: string): string[] | undefined {
  const items = value.split(',').map((item) => item.trim()).filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function actionScriptContains(actions: string, type: IProxyAction['type']): boolean {
  try {
    const parsed = JSON.parse(actions);
    return Array.isArray(parsed) && parsed.some((action) => action?.type === type);
  } catch {
    return false;
  }
}

export function RuleDialog({
  draft,
  onOpenChange,
  onSaved,
  inline = false,
  onDirtyChange,
}: {
  draft: RuleDraft | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (rule?: IProxyRule) => Promise<void>;
  inline?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [form, setForm] = useState<RuleDraft>(draft || EMPTY_DRAFT);
  const [actionTemplate, setActionTemplate] = useState<ActionTemplate>('responseHeaders');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [baseline, setBaseline] = useState(JSON.stringify(draft || EMPTY_DRAFT));
  const [discard, setDiscard] = useState(false);
  const [testUrl, setTestUrl] = useState('');
  const [testOrigin, setTestOrigin] = useState('');
  const [testMethod, setTestMethod] = useState('GET');
  const [testType, setTestType] = useState('Fetch');
  const [testResult, setTestResult] = useState<string | null>(null);
  const dirty = JSON.stringify(form) !== baseline;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [dirty]);
  const requestClose = () => { if (pending) return; if (dirty) setDiscard(true); else onOpenChange(false); };
  let actions: IProxyAction[] | null = null;
  try {
    const value = JSON.parse(form.actions);
    if (Array.isArray(value) && value.every((action) => {
      if (!action || typeof action !== 'object') return false;
      if (action.type === 'redirect' && typeof action.url !== 'string') return false;
      if (action.type === 'networkFailure' && typeof action.reason !== 'string') return false;
      if (action.type === 'delay' && typeof action.milliseconds !== 'number') return false;
      if (action.type === 'mockResponse' && typeof action.status !== 'number') return false;
      const headers = action.headers;
      if (['setRequestHeaders', 'setResponseHeaders', 'mockResponse'].includes(action.type)
        && (!headers || Array.isArray(headers) || typeof headers !== 'object' || !Object.values(headers).every((v) => typeof v === 'string'))) return false;
      return isProxyAction({ ...action,
        ...(['setRequestHeaders', 'setResponseHeaders', 'mockResponse'].includes(action.type) ? { headers: { valid: '' } } : {}),
        ...(action.type === 'delay' ? { milliseconds: 0 } : {}),
        ...(action.type === 'mockResponse' ? { status: 200 } : {}),
        ...(action.type === 'redirect' ? { url: 'https://example.com' } : {}),
        ...(action.type === 'networkFailure' ? { reason: 'Failed' } : {}),
      });
    })) actions = value;
  } catch { /* Invalid JSON remains editable in the advanced field. */ }
  const setActions = (value: IProxyAction[]) => setForm({ ...form, actions: JSON.stringify(value, null, 2) });
  const testMatch = () => {
    try {
      if (!/^https?:$/.test(new URL(testUrl).protocol) || !/^https?:$/.test(new URL(testOrigin).protocol)) throw new Error('Enter an HTTP or HTTPS page origin and request URL.');
      const rule: IProxyRule = {
        id: 'preview', name: form.name, enabled: true, source: 'user', createdAt: 0, updatedAt: 0,
        match: { initiatorOrigins: splitList(form.origins) || [], urlPattern: form.urlPattern, methods: splitList(form.methods)?.map((method) => method.toUpperCase()), resourceTypes: form.resourceTypes },
        actions: [],
      };
      const reasons = explainRuleMatch(rule, new URL(testOrigin).origin, { url: testUrl, method: testMethod, resourceType: testType }, __TARGET__ === 'firefox');
      setTestResult(reasons.length ? reasons.join(' · ') : 'Conditions match. Execution still depends on rule state, browser support and other rules.');
    } catch (cause) { setTestResult(cause instanceof Error ? cause.message : 'Invalid test input.'); }
  };
  useEffect(() => { setTestResult(null); }, [form.origins, form.urlPattern, form.methods, form.resourceTypes, testUrl, testOrigin, testMethod, testType]);
  const isFirefox = __TARGET__ === 'firefox';
  const replacesResponseBody = isFirefox && actionScriptContains(form.actions, 'mockResponse');

  useEffect(() => {
    if (draft) {
      setForm(draft);
      setBaseline(JSON.stringify(draft));
      setActionTemplate((Object.keys(ACTION_TEMPLATES).find((key) => {
        try { return ACTION_TEMPLATES[key][0].type === JSON.parse(draft.actions)[0]?.type; }
        catch { return false; }
      }) || 'responseHeaders') as ActionTemplate);
      setError(null);
    }
  }, [draft]);

  const save = async () => {
    try {
      setPending(true);
      const actions = JSON.parse(form.actions);
      if (!Array.isArray(actions) || actions.length === 0 || !actions.every(isProxyAction)) {
        throw new Error('Check action fields: valid header names, status 100–599, delay 0–30,000 ms and HTTP(S) redirect URLs are required.');
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
            source: form.source || 'user',
            ...(form.legacyRuleId !== undefined ? { legacyRuleId: form.legacyRuleId } : {}),
            match: {
              initiatorOrigins: origins,
              urlPattern: form.urlPattern.trim(),
              methods: splitList(form.methods)?.map((method) => method.toUpperCase()),
              resourceTypes: form.resourceTypes.length > 0 ? form.resourceTypes : undefined,
            },
            actions,
          },
        },
      });
      if (!response?.success) throw new Error(response?.error || 'Unable to save rule.');
      setBaseline(JSON.stringify(form));
      onDirtyChange?.(false);
      await onSaved(response.rule);
      if (!inline) onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save rule.');
    } finally {
      setPending(false);
    }
  };

  const content = (<>

        <DialogHeader>
          {inline ? <h2 className="text-lg font-semibold">{form.id ? 'Edit proxy rule' : 'Create proxy rule'}</h2> : <DialogTitle>{form.id ? 'Edit proxy rule' : 'Create proxy rule'}</DialogTitle>}
          {inline ? <p className="text-sm text-muted-foreground">Match traffic from a page, then configure actions.</p> : <DialogDescription>Match traffic from a page, then run one or more local actions.</DialogDescription>}
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
              <FieldDescription>Comma-separated origins. Use * only when every page should match.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="rule-pattern">Request URL pattern</FieldLabel>
              <Input id="rule-pattern" value={form.urlPattern} onChange={(event) => setForm({ ...form, urlPattern: event.target.value })} placeholder="*://api.example.com/*" />
              <FieldDescription>Use * as a wildcard. Matching is case-insensitive.</FieldDescription>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="rule-methods">Methods</FieldLabel>
              <Input id="rule-methods" value={form.methods} onChange={(event) => setForm({ ...form, methods: event.target.value })} placeholder="GET, POST (blank = all)" />
              <FieldDescription>Comma-separated HTTP methods. Leave blank to match every method.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="rule-resources">Resource types</FieldLabel>
              <MultiSelectField
                id="rule-resources"
                label="Resource types"
                options={RESOURCE_TYPES}
                value={form.resourceTypes}
                allLabel="All resource types"
                onChange={(resourceTypes) => setForm({ ...form, resourceTypes })}
              />
              <FieldDescription>{isFirefox ? 'Firefox reports Fetch and XMLHttpRequest together as XHR.' : 'Choose one or more CDP resource types; no selection matches all.'}</FieldDescription>
            </Field>
          </div>
          <section aria-label="Actions" className="flex flex-col gap-4">
            <h3 className="text-base font-semibold">Actions</h3>
            <p className="text-xs text-muted-foreground">Actions use engine precedence, not a general-purpose script sequence. A block or mock can prevent later effects.</p>
            {actions ? actions.map((action, index) => <section key={index} aria-label={`Action ${index + 1}`} className="flex flex-col gap-4 rounded-lg border p-4">
              <div className="flex items-center justify-between gap-2"><h4 className="text-sm font-medium">{index + 1}. {ACTION_LABELS[action.type]}</h4>
                <Button variant="ghost" size="sm" disabled={actions!.length === 1} onClick={() => setActions(actions!.filter((_, i) => i !== index))}>Remove action {index + 1}</Button>
              </div>
              <ActionFields action={action} onChange={(value) => setActions(actions!.map((item, i) => i === index ? value : item))} />
            </section>) : <Alert variant="destructive"><AlertDescription>Invalid action structure. Correct it in Advanced JSON below.</AlertDescription></Alert>}
            <div className="flex flex-wrap items-center gap-2">
              <Select value={actionTemplate} onValueChange={(value) => { if (value && value in ACTION_TEMPLATES) setActionTemplate(value); }}>
                <SelectTrigger aria-label="Action to add"><SelectValue>{actionTemplateLabel(actionTemplate, isFirefox)}</SelectValue></SelectTrigger>
                <SelectContent><SelectGroup>{Object.keys(ACTION_TEMPLATES).map((key) => <SelectItem key={key} value={key}>{actionTemplateLabel(key, isFirefox)}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
              <Button variant="outline" disabled={!actions} onClick={() => setActions([...(actions || []), ...structuredClone(ACTION_TEMPLATES[actionTemplate])])}>Add action</Button>
            </div>
          </section>
          {replacesResponseBody ? (
            <Alert>
              <Info />
              <AlertTitle>Firefox response replacement</AlertTitle>
              <AlertDescription>
                Firefox still sends the request and preserves the server status. The JSON status value remains for portable Chrome rules and is ignored by Firefox.
              </AlertDescription>
            </Alert>
          ) : null}
          <details><summary className="cursor-pointer text-sm font-medium">Advanced JSON</summary>
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
          </details>
          {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
          <details><summary className="cursor-pointer text-sm font-medium">Test matching</summary>
            <FieldGroup className="mt-4">
              <Field><FieldLabel>Test page origin</FieldLabel><Input aria-label="Test page origin" placeholder="https://app.example.com" value={testOrigin} onChange={(e) => setTestOrigin(e.target.value)} /></Field>
              <Field><FieldLabel>Test request URL</FieldLabel><Input aria-label="Test request URL" placeholder="https://api.example.com/users" value={testUrl} onChange={(e) => setTestUrl(e.target.value)} /></Field>
              <Field><FieldLabel>Test method</FieldLabel><Input aria-label="Test method" value={testMethod} onChange={(e) => setTestMethod(e.target.value.toUpperCase())} /></Field>
              <Field><FieldLabel>Test resource type</FieldLabel><Select value={testType} onValueChange={(value) => value && setTestType(value)}><SelectTrigger aria-label="Test resource type"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{RESOURCE_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
              <Button variant="outline" onClick={testMatch}>Test conditions</Button>
              {testResult ? <p role="status" className="text-sm">{testResult}</p> : null}
              <FieldDescription>Checks unsaved conditions without sending any network requests. Uses advanced-proxy matching semantics.</FieldDescription>
            </FieldGroup>
          </details>
        </FieldGroup>
        <DialogFooter className="sticky bottom-0 border-t bg-background py-3">
          <Button variant="outline" disabled={pending} onClick={requestClose}>{inline ? 'Close editor' : 'Cancel'}</Button>
          <Button disabled={pending} onClick={save}>{pending ? 'Saving…' : 'Save rule'}</Button>
        </DialogFooter>
      </>);
  return <>
    {inline ? <section aria-label="Rule editor" className="flex min-w-0 flex-col gap-5 p-4 sm:p-6">{content}</section> :
      <Dialog open={!!draft} onOpenChange={(open) => { if (!open) requestClose(); }}><DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">{content}</DialogContent></Dialog>}
    <Dialog open={discard} onOpenChange={setDiscard}><DialogContent>
      <DialogHeader><DialogTitle>Discard unsaved changes?</DialogTitle><DialogDescription>Your edits have not been saved.</DialogDescription></DialogHeader>
      <DialogFooter><Button variant="outline" onClick={() => setDiscard(false)}>Keep editing</Button><Button variant="destructive" onClick={() => { setDiscard(false); onDirtyChange?.(false); onOpenChange(false); }}>Discard changes</Button></DialogFooter>
    </DialogContent></Dialog>
  </>;
}
