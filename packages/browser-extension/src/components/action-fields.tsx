import { useState } from 'react';
import type { IProxyAction, ProxyHeaderMap } from '@/common/proxy-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field, FieldLabel, FieldDescription, FieldGroup } from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const FAILURE_REASONS = ['Failed', 'Aborted', 'TimedOut', 'AccessDenied', 'ConnectionClosed', 'ConnectionReset', 'ConnectionRefused', 'ConnectionAborted', 'ConnectionFailed', 'NameNotResolved', 'InternetDisconnected', 'AddressUnreachable', 'BlockedByClient', 'BlockedByResponse'];

export const ACTION_LABELS: Record<IProxyAction['type'], string> = {
  cors: 'Repair CORS', setRequestHeaders: 'Request headers', setResponseHeaders: 'Response headers',
  redirect: 'Redirect', block: 'Block request', mockResponse: 'Mock response', delay: 'Delay', networkFailure: 'Network failure',
};

function Headers({ value, onChange }: { value: ProxyHeaderMap; onChange: (value: ProxyHeaderMap) => void }) {
  const [error, setError] = useState('');
  const rows = Object.entries(value);
  const change = (index: number, name: string, text: string) => {
    if (rows.some(([other], i) => i !== index && other.toLowerCase() === name.toLowerCase())) {
      setError('Each header name must be unique.'); return;
    }
    setError('');
    onChange(Object.fromEntries(rows.map((row, i) => i === index ? [name, text] : row)));
  };
  return <FieldGroup>
    {rows.map(([name, text], index) => <Field key={index}>
      <FieldLabel>Header {index + 1}</FieldLabel>
      <div className="flex flex-wrap gap-2">
        <Input className="min-w-0 flex-1" aria-label={`Header ${index + 1} name`} value={name} onChange={(e) => change(index, e.target.value, text)} placeholder="X-Debug" />
        <Input className="min-w-0 flex-1" aria-label={`Header ${index + 1} value`} value={text} onChange={(e) => change(index, name, e.target.value)} placeholder="Value" />
        <Button variant="ghost" aria-label={`Remove header ${index + 1}`} onClick={() => onChange(Object.fromEntries(rows.filter((_, i) => i !== index)))}>Remove</Button>
      </div>
    </Field>)}
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    <Button variant="outline" disabled={Object.hasOwn(value, '')} onClick={() => onChange({ ...value, '': '' })}>Add header</Button>
  </FieldGroup>;
}

export function ActionFields({ action, onChange }: { action: IProxyAction; onChange: (value: IProxyAction) => void }) {
  switch (action.type) {
    case 'setRequestHeaders':
    case 'setResponseHeaders':
      return <Headers value={action.headers} onChange={(headers) => onChange({ ...action, headers })} />;
    case 'mockResponse':
      return <FieldGroup>
        <Field><FieldLabel>HTTP status</FieldLabel><Input aria-label="HTTP status" type="number" min={100} max={599} value={action.status} onChange={(e) => onChange({ ...action, status: Number(e.target.value) })} />
          {__TARGET__ === 'firefox' ? <FieldDescription>Firefox contacts the server and preserves its status; only the response body is replaced.</FieldDescription> : null}
        </Field>
        <Headers value={action.headers} onChange={(headers) => onChange({ ...action, headers })} />
        <Field><FieldLabel>Response body</FieldLabel><Textarea aria-label="Response body" className="min-h-36 font-mono" value={action.body} onChange={(e) => onChange({ ...action, body: e.target.value })} /></Field>
      </FieldGroup>;
    case 'delay':
      return <Field><FieldLabel>Delay in milliseconds</FieldLabel><Input aria-label="Delay in milliseconds" type="number" min={0} max={30000} value={action.milliseconds} onChange={(e) => onChange({ ...action, milliseconds: Number(e.target.value) })} /><FieldDescription>0–30,000 ms. Requires advanced proxy.</FieldDescription></Field>;
    case 'redirect':
      return <Field><FieldLabel>Destination URL</FieldLabel><Input aria-label="Destination URL" value={action.url} onChange={(e) => onChange({ ...action, url: e.target.value })} placeholder="https://localhost.example/api" /></Field>;
    case 'networkFailure':
      return <Field><FieldLabel>Failure reason</FieldLabel><Select value={action.reason} onValueChange={(reason) => reason && onChange({ ...action, reason })}><SelectTrigger aria-label="Failure reason"><SelectValue>{action.reason}</SelectValue></SelectTrigger><SelectContent><SelectGroup>{[...new Set([...FAILURE_REASONS, action.reason])].map((reason) => <SelectItem key={reason} value={reason}>{reason}</SelectItem>)}</SelectGroup></SelectContent></Select><FieldDescription>Chrome error reason. Firefox cancels the request.</FieldDescription></Field>;
    case 'cors':
      return <FieldGroup>
        <Field><FieldLabel>Allow credentials</FieldLabel><Switch aria-label="Allow credentials" checked={action.allowCredentials} onCheckedChange={(allowCredentials) => onChange({ ...action, allowCredentials, allowOrigin: allowCredentials ? 'initiator' : action.allowOrigin })} /></Field>
        <Field><FieldLabel>Echo page origin</FieldLabel><Switch aria-label="Echo page origin" disabled={action.allowCredentials} checked={action.allowOrigin === 'initiator'} onCheckedChange={(echo) => onChange({ ...action, allowOrigin: echo ? 'initiator' : '*' })} /><FieldDescription>Required when credentials are allowed.</FieldDescription></Field>
        <Field><FieldLabel>Allowed methods</FieldLabel><Input aria-label="Allowed methods" value={action.allowMethods.join(', ')} onChange={(e) => onChange({ ...action, allowMethods: e.target.value.split(',').map((s) => s.trim().toUpperCase()) })} /></Field>
        <Field><FieldLabel>Allowed headers</FieldLabel><Input aria-label="Allowed headers" value={action.allowHeaders.join(', ')} onChange={(e) => onChange({ ...action, allowHeaders: e.target.value.split(',').map((s) => s.trim()) })} /></Field>
      </FieldGroup>;
    case 'block':
      return <p className="text-sm text-muted-foreground">Matching requests are blocked. No additional configuration is needed.</p>;
  }
}
