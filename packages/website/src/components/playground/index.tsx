import { useEffect, useState, type ComponentType } from 'react';
import {
  ArrowRightLeft,
  Ban,
  Braces,
  Check,
  Clock3,
  ExternalLink,
  FilePlus2,
  FlaskConical,
  Play,
  RefreshCw,
  Route,
  ShieldCheck,
  WifiOff,
} from 'lucide-react';
import {
  intercept,
  type DraftAction,
  type InterceptSession,
  type InterceptStatus,
} from 'wireflip';

type ScenarioId = 'cors' | 'requestHeaders' | 'responseHeaders' | 'mock' | 'redirect' | 'block' | 'delay' | 'failure';

type Scenario = {
  id: ScenarioId;
  name: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  urlPattern: string;
  testUrl: string;
  actions: DraftAction[];
};

const SCENARIOS: Scenario[] = [
  {
    id: 'cors',
    name: 'Repair CORS',
    description: 'Patch preflight and response headers for this page.',
    icon: ShieldCheck,
    urlPattern: 'https://httpbin.org/*',
    testUrl: 'https://httpbin.org/anything',
    actions: [{
      type: 'cors',
      allowCredentials: false,
      allowOrigin: '*',
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
      allowHeaders: [],
    }],
  },
  {
    id: 'requestHeaders',
    name: 'Request headers',
    description: 'Inject or override headers before a request leaves.',
    icon: ArrowRightLeft,
    urlPattern: 'https://httpbin.org/*',
    testUrl: 'https://httpbin.org/anything',
    actions: [{ type: 'setRequestHeaders', headers: { 'X-Wireflip-Debug': 'playground' } }],
  },
  {
    id: 'responseHeaders',
    name: 'Response headers',
    description: 'Patch response metadata before page code receives it.',
    icon: Braces,
    urlPattern: 'https://httpbin.org/*',
    testUrl: 'https://httpbin.org/anything',
    actions: [{ type: 'setResponseHeaders', headers: { 'X-Wireflip-Intercepted': 'true' } }],
  },
  {
    id: 'mock',
    name: 'Mock response',
    description: 'Replace an API response with your own JSON',
    icon: FlaskConical,
    urlPattern: 'https://jsonplaceholder.typicode.com/todos/2',
    testUrl: 'https://jsonplaceholder.typicode.com/todos/2',
    actions: [{
      type: 'mockResponse',
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: '{\n  "source": "Wireflip",\n  "mocked": true\n}',
    }],
  },
  {
    id: 'redirect',
    name: 'Redirect',
    description: 'Route a matching request to another endpoint.',
    icon: Route,
    urlPattern: 'https://httpbin.org/anything',
    testUrl: 'https://httpbin.org/anything',
    actions: [{ type: 'redirect', url: 'https://httpbin.org/json' }],
  },
  {
    id: 'block',
    name: 'Block request',
    description: 'Stop trackers, noisy endpoints, or known failures.',
    icon: Ban,
    urlPattern: 'https://httpbin.org/anything',
    testUrl: 'https://httpbin.org/anything',
    actions: [{ type: 'block' }],
  },
  {
    id: 'delay',
    name: 'Simulate latency',
    description: 'Exercise loading and timeout states with a fixed delay.',
    icon: Clock3,
    urlPattern: 'https://httpbin.org/anything',
    testUrl: 'https://httpbin.org/anything',
    actions: [{ type: 'delay', milliseconds: 1200 }],
  },
  {
    id: 'failure',
    name: 'Network failure',
    description: 'Verify retry and offline behavior on demand.',
    icon: WifiOff,
    urlPattern: 'https://httpbin.org/anything',
    testUrl: 'https://httpbin.org/anything',
    actions: [{ type: 'networkFailure', reason: 'ConnectionRefused' }],
  },
];

const DEFAULT_SCENARIO = SCENARIOS.find(scenario => scenario.id === 'mock') || SCENARIOS[0];
const ORDERED_SCENARIOS = [DEFAULT_SCENARIO, ...SCENARIOS.filter(scenario => scenario.id !== DEFAULT_SCENARIO.id)];

type RequestResult = {
  kind: 'verified' | 'observed' | 'error';
  summary: string;
  detail: string;
};

function capabilityLabel(value: string | undefined): string {
  if (!value) return 'Unavailable';
  const labels: Record<string, string> = {
    synthetic: 'Synthetic',
    'body-replacement': 'Body replacement',
    'headers-only': 'Headers only',
    reasoned: 'Reasoned failures',
    cancel: 'Request cancellation',
    'distinct-fetch-xhr': 'Separate Fetch / XHR',
    'combined-fetch-xhr': 'Combined Fetch / XHR',
  };
  return labels[value] || value;
}

export default function Playground() {
  const [session, setSession] = useState<InterceptSession | null>(null);
  const [status, setStatus] = useState<InterceptStatus | null>(null);
  const [selectedId, setSelectedId] = useState<ScenarioId>(DEFAULT_SCENARIO.id);
  const [name, setName] = useState('Playground · ' + DEFAULT_SCENARIO.name);
  const [urlPattern, setUrlPattern] = useState(DEFAULT_SCENARIO.urlPattern);
  const [testUrl, setTestUrl] = useState(DEFAULT_SCENARIO.testUrl);
  const [actionJson, setActionJson] = useState(JSON.stringify(DEFAULT_SCENARIO.actions, null, 2));
  const [operationError, setOperationError] = useState('');
  const [message, setMessage] = useState('Looking for the local extension…');
  const [pending, setPending] = useState<'connect' | 'draft' | 'request' | null>('connect');
  const [result, setResult] = useState<RequestResult | null>(null);
  const [draftFingerprint, setDraftFingerprint] = useState<string | null>(null);
  const fingerprint = JSON.stringify([name, urlPattern, actionJson]);
  const draftCreated = draftFingerprint === fingerprint;
  let actions: DraftAction[] = [];
  try { const parsed: unknown = JSON.parse(actionJson); if (Array.isArray(parsed)) actions = parsed; } catch { /* The editor reports syntax errors on submission. */ }
  const requiresSession = actions.some(action => ['mockResponse', 'cors', 'delay', 'networkFailure'].includes(action?.type))
    || (actions.some(action => action?.type === 'redirect') && actions.some(action => action?.type === 'setRequestHeaders' || action?.type === 'setResponseHeaders'));
  const mock = actions.find(action => action?.type === 'mockResponse');
  const readyToTest = !!session && draftCreated && (!requiresSession || status?.advancedMode === 'connected');

  const selected = SCENARIOS.find((scenario) => scenario.id === selectedId) || SCENARIOS[0];

  const connect = async () => {
    setPending('connect');
    try {
      const next = await intercept.connect();
      setSession(next);
      setStatus(await next.getStatus());
      setMessage('Extension detected. Add the recipe, enable its rule in Wireflip, then return to this tab.');
    } catch (error) {
      setSession(null);
      setStatus(null);
      setMessage(error instanceof Error ? error.message : 'Wireflip is unavailable.');
    } finally {
      setPending(null);
    }
  };

  useEffect(() => {
    try {
      let saved = JSON.parse(sessionStorage.getItem('wireflip:playground-draft') || 'null');
      // Replace only the untouched, previously shipped default recipe. Its old
      // saved rule targets /todos/1 and cannot override the corrected /todos/2 recipe.
      const oldActions = [{ type: 'mockResponse', status: 200, headers: { 'Content-Type': 'application/json' }, body: DEFAULT_SCENARIO.actions[0].type === 'mockResponse' ? DEFAULT_SCENARIO.actions[0].body : '' }];
      if (saved?.selectedId === 'mock' && saved.name === 'Playground · Mock response'
        && saved.urlPattern === 'https://jsonplaceholder.typicode.com/todos/1'
        && saved.testUrl === saved.urlPattern && JSON.stringify(JSON.parse(saved.actionJson)) === JSON.stringify(oldActions)) {
        saved = null;
        sessionStorage.removeItem('wireflip:playground-draft');
      }
      if (saved && SCENARIOS.some(scenario => scenario.id === saved.selectedId)
        && ['name', 'urlPattern', 'testUrl', 'actionJson', 'fingerprint'].every(key => typeof saved[key] === 'string')) {
        setSelectedId(saved.selectedId); setName(saved.name); setUrlPattern(saved.urlPattern);
        setTestUrl(saved.testUrl); setActionJson(saved.actionJson); setDraftFingerprint(saved.fingerprint);
      }
    } catch { /* Storage may be unavailable. */ }
    void connect();
  }, []);

  useEffect(() => {
    if (!session) return;
    let active = true;
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      void session.getStatus().then((next) => { if (active) setStatus(next); }).catch(() => {
        if (active) { setStatus(null); setSession(null); setMessage('Connection lost. Check the extension and reconnect.'); }
      });
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    const timer = window.setInterval(refresh, 2_000);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [session]);

  const formatActions = () => {
    setOperationError('');
    try { setActionJson(JSON.stringify(JSON.parse(actionJson), null, 2)); }
    catch { setOperationError('Invalid action JSON. Fix the syntax before creating a draft.'); }
  };

  const chooseScenario = (scenario: Scenario) => {
    setOperationError('');
    setSelectedId(scenario.id);
    setName(`Playground · ${scenario.name}`);
    setUrlPattern(scenario.urlPattern);
    setTestUrl(scenario.testUrl);
    setActionJson(JSON.stringify(scenario.actions, null, 2));
    setResult(null);
    setDraftFingerprint(null);
  };

  const createDraft = async () => {
    if (!session) return;
    setPending('draft');
    setOperationError('');
    try {
      if (draftCreated) { await session.openWorkspace(); return; }
      const parsed = JSON.parse(actionJson);
      if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Action JSON must be a non-empty array.');
      await session.createRuleDraft({
        name: name.trim() || `Playground · ${selected.name}`,
        urlPattern: urlPattern.trim(),
        methods: ['GET'],
        resourceTypes: ['XHR', 'Fetch'],
        actions: parsed as DraftAction[],
      });
      setDraftFingerprint(fingerprint);
      try { sessionStorage.setItem('wireflip:playground-draft', JSON.stringify({ selectedId, name, urlPattern, testUrl, actionJson, fingerprint })); } catch { /* Testing still works without storage. */ }
      setMessage('Rule added disabled. Turn on its switch in Wireflip, then return to the Playground tab' + (requiresSession ? ' and open the toolbar icon → Start tab session.' : ' to test it.'));
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : 'Unable to create the draft.');
    } finally {
      setPending(null);
    }
  };

  const sendRequest = async () => {
    if (!session || !draftCreated) return;
    setPending('request');
    setResult(null);
    const controller = new AbortController();
    let timeout: number | undefined;
    const startedAt = performance.now();
    try {
      const current = await session.getStatus();
      setStatus(current);
      if (requiresSession && current.advancedMode !== 'connected') {
        setMessage('This tab’s session is stopped. Return to the Playground tab, click the Wireflip toolbar icon, then Start tab session.');
        return;
      }
      timeout = window.setTimeout(() => controller.abort(), 15_000);
      const response = await fetch(testUrl, { signal: controller.signal, cache: 'no-store' });
      const body = await response.text();
      const elapsed = Math.round(performance.now() - startedAt);
      const matches = mock?.type === 'mockResponse' && body.trim() === mock.body.trim();
      const summary = mock
        ? matches ? 'Mock verified' : 'Mock did not match'
        : response.ok ? 'Response received · check the changes in Inspector' : 'HTTP error';
      setResult({
        kind: mock ? matches ? 'verified' : 'error' : response.ok ? 'observed' : 'error',
        summary: summary + ` · ${response.status} · ${elapsed} ms`,
        detail: (mock && !matches ? 'The response differs from the expected response. Check that the recipe rule is enabled, its group is on, and no other matching rule overrides it.\n\nReceived:\n' : '') + (body.slice(0, 2_000) || '(empty body)'),
      });
    } catch (error) {
      setResult({
        kind: 'error',
        summary: `Request failed · ${Math.round(performance.now() - startedAt)} ms`,
        detail: (error instanceof Error ? error.message : 'Unknown network error') + (mock ? ' — For a cross-origin Mock, include Access-Control-Allow-Origin in the saved rule’s response headers. Also check that the endpoint is reachable in Firefox.' : ' — For block or failure recipes, a failed request is expected; confirm the matching rule in Inspector.'),
      });
    } finally {
      window.clearTimeout(timeout);
      setPending(null);
    }
  };

  const capabilities = session?.capabilities.interception;
  const sessionRunning = status?.advancedMode === 'connected';
  const stepTitle = !session ? 'Connect Wireflip to try this example' : !draftCreated ? 'Add and enable the rule' : requiresSession && !sessionRunning ? 'Start this tab’s session' : 'Ready to test';
  const stepHelp = !session ? 'Install the extension and reconnect first' : !draftCreated ? 'First add and enable the recipe rule in Wireflip, then return to this tab' : requiresSession && !sessionRunning ? 'Enable the rule in Wireflip. Return here, click the Wireflip toolbar icon → Start tab session for this Playground tab' : 'The saved rule and its group must be enabled in Wireflip';
  const displayBody = (body: string) => { try { return JSON.stringify(JSON.parse(body), null, 2); } catch { return body; } };


  return (
    <div className="flex flex-col gap-5" data-playground-version="3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Playground</h1>
        <p className="mt-1 text-sm text-neutral-600">Try an example and compare the response</p>
      </div>
      <div className="grid overflow-hidden rounded-lg border border-neutral-200 bg-white lg:grid-cols-[200px_minmax(0,1fr)]">
        <aside className="border-b border-neutral-200 bg-neutral-50 p-3 lg:border-b-0 lg:border-r" aria-label="Examples">
          <label className="flex items-center gap-3 text-sm font-medium lg:hidden">
            Example
            <select aria-label="Example" className="focus-ring min-h-10 min-w-0 flex-1 rounded-md border border-neutral-300 bg-white px-2 font-normal" value={selectedId} disabled={pending === 'draft' || pending === 'request'} onChange={event => chooseScenario(SCENARIOS.find(scenario => scenario.id === event.target.value) || DEFAULT_SCENARIO)}>
              {ORDERED_SCENARIOS.map(scenario => <option key={scenario.id} value={scenario.id}>{scenario.name}</option>)}
            </select>
          </label>
          <p className="mb-3 hidden px-2 text-xs font-semibold text-neutral-500 lg:block">Examples</p>
          <div className="hidden gap-1 lg:grid">
            {ORDERED_SCENARIOS.map(scenario => {
              const Icon = scenario.icon;
              return <button key={scenario.id} aria-pressed={scenario.id === selectedId} disabled={pending === 'draft' || pending === 'request'} onClick={() => chooseScenario(scenario)} className={`focus-ring flex min-h-10 items-center gap-2.5 rounded-md px-2.5 text-left text-sm disabled:opacity-50 ${scenario.id === selectedId ? 'bg-white font-medium text-black ring-1 ring-neutral-200' : 'text-neutral-600 hover:bg-white'}`}>
                <Icon className="size-4 shrink-0" />{scenario.name}
              </button>;
            })}
          </div>
        </aside>
        <div className="min-w-0 p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">{selected.name}</h2>
              <p className="mt-1 text-sm text-neutral-600">{selected.description.replace(/\.$/, '')}</p>
            </div>
            <h3 className="flex items-center gap-2 text-xs text-neutral-500">
              <span aria-hidden="true" className={`size-1.5 rounded-full ${session ? 'bg-emerald-500' : 'bg-neutral-300'}`} />
              {session ? `Extension connected · ${session.capabilities.browser}` : pending === 'connect' ? 'Connecting to local extension' : 'Extension not connected'}
            </h3>
          </div>
          <section className="mt-5 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-3 sm:px-4" aria-label="Next step">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex-1 basis-52">
                <h3 className="text-sm font-medium">{stepTitle}</h3>
                <p className="mt-1 text-xs leading-5 text-neutral-600">{stepHelp}</p>
              </div>
              {!session ? <div className="flex flex-wrap gap-2">
                <button className="button-primary focus-ring" onClick={() => intercept.openStorePage()}>Install extension <ExternalLink className="size-4" /></button>
                <button className="button-secondary focus-ring" disabled={pending !== null} onClick={() => void connect()}><RefreshCw className="size-4" />Reconnect</button>
              </div> : <button className={`${draftCreated ? 'button-secondary' : 'button-primary'} focus-ring`} disabled={pending !== null} onClick={() => void createDraft()}>
                <FilePlus2 className="size-4" />{draftCreated ? 'Open rule in Wireflip' : 'Add rule in Wireflip'}
              </button>}
            </div>
          </section>
          {operationError ? <p role="alert" className="mt-3 text-sm text-red-700">{operationError}</p> : null}
          <section className="mt-5" aria-label="Request">
            <label htmlFor="probe-url" className="text-xs font-medium text-neutral-700">Request URL</label>
            <div className="mt-2 flex flex-wrap gap-2">
              <div className="flex min-w-0 flex-1 basis-52 overflow-hidden rounded-md border border-neutral-300">
                <span className="flex items-center border-r border-neutral-200 bg-neutral-50 px-3 font-mono text-xs text-neutral-600">GET</span>
                <input id="probe-url" aria-label="Probe URL" className="focus-ring min-h-10 w-full min-w-0 px-3 font-mono text-xs" value={testUrl} onChange={event => setTestUrl(event.target.value)} />
              </div>
              <button aria-label={mock ? 'Test mock' : 'Test recipe'} className="focus-ring flex min-h-10 items-center justify-center gap-2 rounded-md bg-black px-4 text-sm text-white disabled:opacity-40" disabled={!readyToTest || pending !== null} onClick={() => void sendRequest()}>
                <Play className="size-3.5" />{pending === 'request' ? 'Testing…' : mock ? 'Test mock' : 'Test recipe'}
              </button>
            </div>
          </section>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <section className="min-w-0 overflow-hidden rounded-md border border-neutral-200" aria-label="Expected response">
              <h3 className="border-b border-neutral-200 px-3 py-2 text-xs font-medium">Expected response</h3>
              <pre className="min-h-36 max-h-56 overflow-auto whitespace-pre-wrap break-words bg-neutral-50 p-3 font-mono text-xs leading-6 text-neutral-700">{mock?.type === 'mockResponse' ? displayBody(mock.body) : selected.id === 'block' || selected.id === 'failure' ? 'Request fails\nConfirm the matched rule in Inspector' : selected.id === 'delay' ? 'Response arrives after the configured delay\nConfirm timing and the matched rule in Inspector' : selected.id === 'responseHeaders' ? 'Inspect response headers for the configured changes' : selected.id === 'requestHeaders' ? 'Inspect request headers for the configured changes' : selected.id === 'cors' ? 'Your affected API becomes readable by this page\nThe demo service may already allow CORS' : 'The request reaches the configured redirect URL'}</pre>
            </section>
            <section className="min-w-0 overflow-hidden rounded-md border border-neutral-200" aria-label="Actual response" aria-live="polite" aria-busy={pending === 'request'}>
              <h3 className="border-b border-neutral-200 px-3 py-2 text-xs font-medium">Actual response</h3>
              <div className="min-h-36 bg-neutral-50 p-3">
                {result ? <><p className={`flex items-center gap-2 text-xs font-medium ${result.kind === 'verified' ? 'text-emerald-700' : result.kind === 'error' ? 'text-red-700' : 'text-neutral-700'}`}>{result.kind === 'error' ? <WifiOff className="size-3.5 shrink-0" /> : <Check className="size-3.5 shrink-0" />}{result.summary}</p><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-6 text-neutral-700">{displayBody(result.detail)}</pre></> : <p className="py-2 text-xs text-neutral-500">{pending === 'request' ? 'Sending request…' : 'Run the request to see the response'}</p>}
              </div>
            </section>
          </div>
          <details className="mt-5 border-t border-neutral-200 pt-3">
            <summary className="focus-ring cursor-pointer rounded text-xs font-medium text-neutral-600">Advanced options</summary>
            <div className="mt-4 grid gap-4">
              <label className="flex flex-col gap-2 text-sm font-medium">Rule name<input className="focus-ring min-h-10 rounded-md border border-neutral-300 px-3 font-normal" value={name} onChange={event => setName(event.target.value)} /></label>
              <label className="flex flex-col gap-2 text-sm font-medium">Request URL pattern<input className="focus-ring min-h-10 rounded-md border border-neutral-300 px-3 font-mono text-xs font-normal" value={urlPattern} onChange={event => setUrlPattern(event.target.value)} /></label>
              <label className="flex flex-col gap-2 text-sm font-medium">Action JSON<textarea aria-label="Action JSON" className="focus-ring min-h-56 resize-y rounded-md border border-neutral-300 bg-neutral-50 p-3 font-mono text-xs font-normal leading-6" value={actionJson} onChange={event => setActionJson(event.target.value)} spellCheck={false} /></label>
              <button className="focus-ring w-fit rounded text-sm font-medium underline underline-offset-4" onClick={formatActions}>Format JSON</button>
              <details>
                <summary className="focus-ring cursor-pointer rounded text-xs font-medium">Browser capabilities</summary>
                <dl className="mt-3 grid max-w-md grid-cols-[1fr_auto] gap-2 text-xs text-neutral-600">
                  <dt>Response mock</dt><dd>{capabilityLabel(capabilities?.responseMock)}</dd>
                  <dt>Preflight</dt><dd>{capabilityLabel(capabilities?.preflight)}</dd>
                  <dt>Network failure</dt><dd>{capabilityLabel(capabilities?.networkFailure)}</dd>
                  <dt>Fetch / XHR</dt><dd>{capabilityLabel(capabilities?.resourceTypes)}</dd>
                </dl>
              </details>
            </div>
          </details>
          <details className="mt-3 text-xs text-neutral-500">
            <summary className="focus-ring w-fit cursor-pointer rounded">How setup works</summary>
            <ol className="mt-3 list-decimal space-y-2 pl-5 leading-5">
              <li>Add the example and enable its rule in Wireflip. Website rules start disabled and only apply to this origin.</li>
              <li>{requiresSession ? 'Return to this Playground tab → Wireflip toolbar icon → Start tab session. A session on the workspace tab does not apply here.' : 'Return here. This example uses browser rules and does not need a tab session.'}</li>
              <li>Test the request. A received response alone does not prove a rule ran; use Inspector to verify other actions.</li>
            </ol>
            <p className="mt-3 leading-5">Requests contact the URL above. Firefox replaces the upstream body and preserves its HTTP status, so the endpoint must be reachable.</p>
          </details>
          <details className="mt-3 text-xs text-neutral-500">
            <summary className="focus-ring w-fit cursor-pointer rounded">Connection details</summary>
            <p className="mt-2 break-words leading-5" role="status">{message}</p>
            {session ? <button className="focus-ring mt-2 rounded underline underline-offset-4" disabled={pending !== null} onClick={() => void connect()}>Reconnect</button> : null}
          </details>
        </div>
      </div>
    </div>
  );
}
