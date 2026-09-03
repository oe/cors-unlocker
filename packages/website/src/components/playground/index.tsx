import { useEffect, useState } from 'react';
import { intercept, type InterceptSession, type InterceptStatus } from 'cors-unlocker';

export default function Playground() {
  const [session, setSession] = useState<InterceptSession | null>(null);
  const [status, setStatus] = useState<InterceptStatus | null>(null);
  const [message, setMessage] = useState('Looking for the local extension…');
  const [pending, setPending] = useState(false);

  const connect = async () => {
    setPending(true);
    try {
      const next = await intercept.connect();
      setSession(next);
      setStatus(await next.getStatus());
      setMessage(`Connected locally to ${next.origin}`);
    } catch (error) {
      setSession(null);
      setMessage(error instanceof Error ? error.message : 'Forth Intercept is unavailable.');
    } finally {
      setPending(false);
    }
  };

  useEffect(() => { void connect(); }, []);

  const run = async (operation: (active: InterceptSession) => Promise<InterceptStatus>) => {
    if (!session) return;
    setPending(true);
    try {
      const next = await operation(session);
      setStatus(next);
      setMessage('Extension status updated.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The operation failed.');
    } finally {
      setPending(false);
    }
  };

  const createDraft = async () => {
    if (!session) return;
    setPending(true);
    try {
      await session.createRuleDraft({
        name: 'Playground · slow JSON API',
        urlPattern: 'https://jsonplaceholder.typicode.com/*',
        methods: ['GET'],
        resourceTypes: ['XHR', 'Fetch'],
        actions: [{ type: 'delay', milliseconds: 800 }],
      });
      setMessage('A disabled rule draft was created and opened for review.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create the draft.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[.75fr_1.25fr]">
      <div>
        <h1 className="text-5xl font-semibold leading-[1.02] tracking-[-.05em] sm:text-6xl">SDK playground</h1>
        <p className="mt-6 text-lg leading-8 text-neutral-600">Exercise the same origin-scoped bridge your app can use. Nothing is sent through this website.</p>
        <div className="mt-8 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm">
          <p className="font-medium">{message}</p>
          <p className="mt-2 text-neutral-500">Origin: {session?.origin || 'current page'}</p>
        </div>
      </div>
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl shadow-black/5 sm:p-8">
        <div className="flex items-center justify-between border-b border-neutral-200 pb-5">
          <div><h2 className="font-semibold">Local session</h2><p className="mt-1 text-sm text-neutral-500">Protocol v{session?.capabilities.protocolVersion || 2}</p></div>
          <span className={`size-3 rounded-full ${session ? 'bg-emerald-500' : 'bg-neutral-300'}`} aria-label={session ? 'Connected' : 'Disconnected'} />
        </div>
        <dl className="grid grid-cols-2 gap-y-4 py-6 text-sm">
          <dt className="text-neutral-500">CORS</dt><dd className="text-right font-medium">{status?.cors.enabled ? 'Enabled' : 'Disabled'}</dd>
          <dt className="text-neutral-500">Credentials</dt><dd className="text-right font-medium">{status?.cors.credentials ? 'Allowed' : 'Off'}</dd>
          <dt className="text-neutral-500">Advanced mode</dt><dd className="text-right font-medium">{status?.advancedMode || 'disabled'}</dd>
        </dl>
        <div className="grid gap-3 sm:grid-cols-2">
          <button disabled={pending || !session} onClick={() => run((active) => active.requestCors({ reason: 'Testing the Forth Intercept SDK playground' }))} className="min-h-11 rounded-lg bg-black px-4 text-sm font-semibold text-white disabled:opacity-40">Request CORS</button>
          <button disabled={pending || !session} onClick={() => run((active) => active.disableCors())} className="min-h-11 rounded-lg border border-neutral-300 px-4 text-sm font-semibold disabled:opacity-40">Disable CORS</button>
          <button disabled={pending || !session} onClick={createDraft} className="min-h-11 rounded-lg border border-neutral-300 px-4 text-sm font-semibold disabled:opacity-40">Create safe draft</button>
          <button disabled={pending} onClick={connect} className="min-h-11 rounded-lg border border-neutral-300 px-4 text-sm font-semibold disabled:opacity-40">Reconnect</button>
        </div>
        {!session ? <button onClick={() => intercept.openStorePage()} className="mt-5 text-sm font-semibold text-blue-700 hover:underline">Add Forth Intercept to Chrome →</button> : null}
      </div>
    </div>
  );
}
