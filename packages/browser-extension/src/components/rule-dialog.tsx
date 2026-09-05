import { useEffect, useState } from 'react';
import browser from 'webextension-polyfill';
import { Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { MultiSelectField } from '@/components/multi-select-field';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { IProxyAction, IProxyRule } from '@/common/proxy-state';
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
}: {
  draft: RuleDraft | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState<RuleDraft>(draft || EMPTY_DRAFT);
  const [actionTemplate, setActionTemplate] = useState<ActionTemplate>('responseHeaders');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const isFirefox = __TARGET__ === 'firefox';
  const replacesResponseBody = isFirefox && actionScriptContains(form.actions, 'mockResponse');

  useEffect(() => {
    if (draft) {
      setForm(draft);
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
              resourceTypes: form.resourceTypes.length > 0 ? form.resourceTypes : undefined,
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
          <Field>
            <FieldLabel>Action template</FieldLabel>
            <Select
              value={actionTemplate}
              onValueChange={(value) => {
                if (!value || !(value in ACTION_TEMPLATES)) return;
                const template = value as ActionTemplate;
                setActionTemplate(template);
                setForm({
                  ...form,
                  actions: JSON.stringify(ACTION_TEMPLATES[template], null, 2),
                });
              }}
            >
              <SelectTrigger><SelectValue>{actionTemplateLabel(actionTemplate, isFirefox)}</SelectValue></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="cors">Repair CORS</SelectItem>
                  <SelectItem value="responseHeaders">Set response headers</SelectItem>
                  <SelectItem value="requestHeaders">Set request headers</SelectItem>
                  <SelectItem value="mock">{isFirefox ? 'Replace response body' : 'Mock response'}</SelectItem>
                  <SelectItem value="redirect">Redirect</SelectItem>
                  <SelectItem value="block">Block request</SelectItem>
                  <SelectItem value="delay">Delay</SelectItem>
                  <SelectItem value="failure">Network failure</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>Selecting a template replaces the JSON below.</FieldDescription>
          </Field>
          {replacesResponseBody ? (
            <Alert>
              <Info />
              <AlertTitle>Firefox response replacement</AlertTitle>
              <AlertDescription>
                Firefox still sends the request and preserves the server status. The JSON status value remains for portable Chrome rules and is ignored by Firefox.
              </AlertDescription>
            </Alert>
          ) : null}
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

