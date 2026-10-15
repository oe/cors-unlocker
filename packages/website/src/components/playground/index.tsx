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
    description: 'Return deterministic JSON without changing application code.',
    icon: FlaskConical,
    urlPattern: 'https://jsonplaceholder.typicode.com/todos/1',
    testUrl: 'https://jsonplaceholder.typicode.com/todos/1',
    actions: [{
      type: 'mockResponse',
      status: 200,
      headers: { 'Content-Type': 'application/json' },
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
  kind: 'success' | 'error';
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
  const [message, setMessage] = useState('Looking for the local extension…');
  const [pending, setPending] = useState<'connect' | 'draft' | 'request' | null>('connect');
  const [result, setResult] = useState<RequestResult | null>(null);

  const selected = SCENARIOS.find((scenario) => scenario.id === selectedId) || SCENARIOS[0];

  const connect = async () => {
    setPending('connect');
    try {
      const next = await intercept.connect();
      setSession(next);
      setStatus(await next.getStatus());
      setMessage('The extension is ready. Review a recipe below; request interception is controlled in Wireflip.');
    } catch (error) {
      setSession(null);
      setStatus(null);
      setMessage(error instanceof Error ? error.message : 'Wireflip is unavailable.');
    } finally {
      setPending(null);
    }
  };

  useEffect(() => { void connect(); }, []);

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
    return () => { active = false; window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [session]);

  const formatActions = () => {
    try { setActionJson(JSON.stringify(JSON.parse(actionJson), null, 2)); }
    catch { setMessage('Invalid action JSON. Fix the syntax before creating a draft.'); }
  };

  const chooseScenario = (scenario: Scenario) => {
    setSelectedId(scenario.id);
    setName(`Playground · ${scenario.name}`);
    setUrlPattern(scenario.urlPattern);
    setTestUrl(scenario.testUrl);
    setActionJson(JSON.stringify(scenario.actions, null, 2));
    setResult(null);
  };

  const createDraft = async () => {
    if (!session) return;
    setPending('draft');
    try {
      const parsed = JSON.parse(actionJson);
      if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Action JSON must be a non-empty array.');
      await session.createRuleDraft({
        name: name.trim() || `Playground · ${selected.name}`,
        urlPattern: urlPattern.trim(),
        methods: ['GET'],
        resourceTypes: ['XHR', 'Fetch'],
        actions: parsed as DraftAction[],
      });
      setMessage('Rule draft created. Review and enable it in Wireflip before testing.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create the draft.');
    } finally {
      setPending(null);
    }
  };

  const sendRequest = async () => {
    setPending('request');
    setResult(null);
    const startedAt = performance.now();
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(testUrl, { signal: controller.signal });
      const body = await response.text();
      const elapsed = Math.round(performance.now() - startedAt);
      setResult({
        kind: 'success',
        summary: `${response.status} ${response.statusText || 'Response'} · ${elapsed} ms`,
        detail: body.slice(0, 2_000) || '(empty body)',
      });
    } catch (error) {
      const elapsed = Math.round(performance.now() - startedAt);
      setResult({
        kind: 'error',
        summary: `Request failed · ${elapsed} ms`,
        detail: error instanceof Error ? error.message : 'Unknown network error',
      });
    } finally {
      window.clearTimeout(timeout);
      setPending(null);
    }
  };

  const capabilities = session?.capabilities.interception;

  return (
    <div className="flex flex-col gap-10">
      <div className="grid items-end gap-8 lg:grid-cols-[1fr_auto]">
        <div className="max-w-3xl">
          <h1 className="text-5xl font-semibold leading-[1.02] tracking-[-.05em] sm:text-6xl">Playground</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-neutral-600">
            Try a ready-made recipe, review its rule in Wireflip, then send a request to see the result. You do not need to add the SDK to your application.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button className="button-secondary focus-ring" disabled={pending !== null} onClick={() => void connect()}>
            <RefreshCw className="size-4" /> Reconnect
          </button>
          {session ? (
            <button className="button-primary focus-ring" onClick={() => void session.openWorkspace()}>
              Open workspace <ExternalLink className="size-4" />
            </button>
          ) : (
            <button className="button-primary focus-ring" onClick={() => intercept.openStorePage()}>
              Install extension <ExternalLink className="size-4" />
            </button>
          )}
        </div>
      </div>

      <ol className="grid gap-4 rounded-xl border border-neutral-200 bg-neutral-50 p-5 text-sm sm:grid-cols-3" aria-label="Try a recipe">
        <li><strong className="block text-neutral-950">1. Choose a recipe</strong><span className="mt-1 block leading-6 text-neutral-600">Start with Mock response or select another example.</span></li>
        <li><strong className="block text-neutral-950">2. Review and enable</strong><span className="mt-1 block leading-6 text-neutral-600">Choose Review in Wireflip, enable the draft there, then start a tab session from the Popup when needed.</span></li>
        <li><strong className="block text-neutral-950">3. Run the request</strong><span className="mt-1 block leading-6 text-neutral-600">Return here, send the probe, then compare the result and Inspector changes.</span></li>
      </ol>

      <div className="grid overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl shadow-black/5 lg:grid-cols-[280px_1fr]">
        <aside className="border-b border-neutral-200 bg-neutral-50 p-4 lg:border-b-0 lg:border-r">
          <div className="mb-4 flex items-center justify-between px-2">
            <p className="text-xs font-semibold uppercase tracking-[.14em] text-neutral-500">Rule recipes</p>
            <span className="font-mono text-xs text-neutral-500">{SCENARIOS.length}</span>
          </div>
          <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-1">
            {ORDERED_SCENARIOS.map((scenario) => {
              const Icon = scenario.icon;
              const active = scenario.id === selectedId;
              return (
                <button
                  key={scenario.id}
                  aria-pressed={active}
                  disabled={pending === 'draft' || pending === 'request'}
                  onClick={() => chooseScenario(scenario)}
                  className={`focus-ring flex min-h-16 disabled:cursor-not-allowed disabled:opacity-50 items-start gap-3 rounded-xl px-3 py-3 text-left transition ${active ? 'bg-white shadow-sm ring-1 ring-neutral-200' : 'hover:bg-white/70'}`}
                >
                  <span className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${active ? 'bg-black text-white' : 'bg-white text-neutral-600 ring-1 ring-neutral-200'}`}>
                    <Icon className="size-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-neutral-900">{scenario.name}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-neutral-500">{scenario.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="min-w-0 p-5 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200 pb-6">
            <div>
              <div className="flex items-center gap-2">
                <span className={`size-2.5 rounded-full ${session ? 'bg-emerald-500' : 'bg-neutral-300'}`} />
                <h2 className="font-semibold">
                  {session ? `Extension connected · ${session.capabilities.browser}` : pending === 'connect' ? 'Connecting to local extension' : 'Extension not connected'}
                </h2>
              </div>
              <p className="mt-1 text-sm text-neutral-600" role="status" aria-live="polite">{message}</p>
            </div>
          </div>

          <div className="grid gap-8 py-7 xl:grid-cols-[1fr_340px]">
            <div className="flex min-w-0 flex-col gap-5">
              <label className="flex flex-col gap-2 text-sm font-medium">
                Rule name
                <input className="focus-ring min-h-11 rounded-lg border border-neutral-300 px-3 font-normal" value={name} onChange={(event) => setName(event.target.value)} />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium">
                Request URL pattern
                <input className="focus-ring min-h-11 rounded-lg border border-neutral-300 px-3 font-mono text-sm font-normal" value={urlPattern} onChange={(event) => setUrlPattern(event.target.value)} />
              </label>
              <details className="rounded-xl border border-neutral-200 p-4">
                <summary className="focus-ring cursor-pointer rounded text-sm font-medium">Advanced: edit rule JSON</summary>
                <label className="mt-4 flex flex-col gap-2 text-sm font-medium">
                  Action JSON
                  <textarea aria-label="Action JSON" className="focus-ring min-h-64 resize-y rounded-lg border border-neutral-300 bg-neutral-950 p-4 font-mono text-[13px] leading-6 text-neutral-100" value={actionJson} onChange={(event) => setActionJson(event.target.value)} spellCheck={false} />
                </label>
                <button className="focus-ring mt-3 rounded text-sm font-medium text-blue-700" onClick={formatActions}>Format JSON</button>
              </details>
              <div className="flex flex-wrap items-center gap-3">
                <button className="button-primary focus-ring" disabled={!session || pending !== null} onClick={() => void createDraft()}>
                  <FilePlus2 className="size-4" /> Review in Wireflip
                </button>
                <p className="text-xs leading-5 text-neutral-500">Drafts start disabled. Review and enable the rule in Wireflip before testing.</p>
              </div>
            </div>

            <div className="flex flex-col gap-6">
              <section className="rounded-xl border border-neutral-200 p-4" aria-label="Tab session">
                <h3 className="text-sm font-semibold">Tab session</h3>
                <p className="mt-2 text-sm text-neutral-700">{!session ? 'Connect the extension first' : status?.advancedMode === 'connected' ? 'Running for this page' : status?.advancedMode === 'connecting' ? 'Connecting…' : status?.advancedMode === 'error' ? 'Needs attention in Wireflip' : 'Stopped'}</p>
                <p className="mt-2 text-xs leading-5 text-neutral-600">Mocks, delays and failures need a tab session. Start it from the Wireflip Popup for this page; the website cannot start one for you.</p>
              </section>
              <details className="rounded-xl border border-neutral-200 p-4">
                <summary className="focus-ring cursor-pointer rounded text-sm font-semibold">Browser capabilities</summary>
                <dl className="mt-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-3 text-xs">
                  <dt className="text-neutral-500">SDK protocol</dt><dd className="font-medium">v{session?.capabilities.protocolVersion || 2}</dd>
                  <dt className="text-neutral-500">Advanced mode</dt><dd className="font-medium capitalize">{status?.advancedMode || 'Unavailable'}</dd>
                  <dt className="text-neutral-500">Response mock</dt><dd className="font-medium">{capabilityLabel(capabilities?.responseMock)}</dd>
                  <dt className="text-neutral-500">Preflight</dt><dd className="font-medium">{capabilityLabel(capabilities?.preflight)}</dd>
                  <dt className="text-neutral-500">Network failure</dt><dd className="font-medium">{capabilityLabel(capabilities?.networkFailure)}</dd>
                  <dt className="text-neutral-500">Fetch / XHR</dt><dd className="font-medium">{capabilityLabel(capabilities?.resourceTypes)}</dd>
                </dl>
                {session?.capabilities.browser === 'firefox' && selected.id === 'mock' ? (
                  <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900">Firefox replaces an upstream body and preserves its HTTP status.</p>
                ) : null}
              </details>

              <section className="rounded-xl border border-neutral-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">Request probe</h3>
                    <p className="mt-1 text-xs leading-5 text-neutral-500">Run once for a baseline, then again after enabling your rule.</p>
                  </div>
                  <button aria-label="Send request" className="focus-ring flex size-10 shrink-0 items-center justify-center rounded-lg bg-black text-white disabled:opacity-40" disabled={pending !== null} onClick={() => void sendRequest()}>
                    <Play className="size-4" />
                  </button>
                </div>
                <p className="mt-3 text-xs leading-5 text-neutral-600">Probes contact the URL below. Public example services may be unavailable. Verify the expected body or change in the Inspector; a successful request alone does not prove a rule ran.</p>
                {selected.id === 'cors' ? <p className="mt-3 text-xs leading-5 text-neutral-600">The demo service may already allow CORS. Use your affected API URL to compare behavior before and after repair.</p> : null}
                <input aria-label="Probe URL" className="focus-ring mt-4 min-h-10 w-full rounded-lg border border-neutral-300 px-3 font-mono text-xs" value={testUrl} onChange={(event) => setTestUrl(event.target.value)} />
                <div className="mt-4 min-h-32 overflow-hidden rounded-lg bg-neutral-950 p-3 font-mono text-xs leading-5 text-neutral-300">
                  {pending === 'request' ? 'Sending request…' : result ? (
                    <>
                      <p className={`flex items-center gap-2 font-semibold ${result.kind === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {result.kind === 'success' ? <Check className="size-3.5" /> : <WifiOff className="size-3.5" />}{result.summary}
                      </p>
                      <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap break-all text-neutral-500">{result.detail}</pre>
                    </>
                  ) : 'Ready. No request sent yet.'}
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-5 border-t border-neutral-200 pt-8 text-sm text-neutral-600 sm:grid-cols-3">
        <p><strong className="block text-neutral-950">Local by design</strong><span className="mt-1 block leading-6">Traffic stays between this browser and the destination.</span></p>
        <p><strong className="block text-neutral-950">Explicit control</strong><span className="mt-1 block leading-6">SDK recipes arrive disabled and scoped to this origin.</span></p>
        <p><strong className="block text-neutral-950">Portable recipes</strong><span className="mt-1 block leading-6">Capability flags explain where browser behavior differs.</span></p>
      </div>
    </div>
  );
}
