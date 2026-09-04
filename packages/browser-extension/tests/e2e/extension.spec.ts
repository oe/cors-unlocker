import { test, expect, chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';

test.describe.configure({ mode: 'serial' });
test.setTimeout(90_000);

let context: BrowserContext;
const extensionId = 'knhlkjdfmgkmelcjfnbbhpphkmjjacng';
let worker: Worker;
let control: Page;
let extensionPath: string;
const userDataDir = mkdtempSync(path.join(tmpdir(), 'forth-intercept-e2e-'));

async function currentWorker() {
  const workers = context.serviceWorkers();
  return workers[workers.length - 1] || context.waitForEvent('serviceworker');
}

async function getTabId(urlPrefix: string): Promise<number> {
  return worker.evaluate(async (prefix) => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find((item) => item.url?.startsWith(prefix));
    if (typeof tab?.id !== 'number') throw new Error(`Tab not found: ${prefix}`);
    return tab.id;
  }, urlPrefix);
}

test.beforeAll(async () => {
  const directory = path.dirname(fileURLToPath(import.meta.url));
  extensionPath = path.join(directory, '../../dist/chrome');
  await launchContext();
});

async function launchContext() {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    ...(executablePath ? { executablePath } : {}),
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });
  control = await context.newPage();
  await control.goto(`chrome-extension://${extensionId}/src/options/index.html`);
  worker = await currentWorker();
}

test.afterAll(async () => {
  await context?.close();
  rmSync(userDataDir, { recursive: true, force: true });
});

test('migrates v1 storage once and keeps a recovery snapshot', async () => {
  expect(extensionId).toBe('knhlkjdfmgkmelcjfnbbhpphkmjjacng');
  await expect.poll(async () => worker.evaluate(async () => {
    const values = await chrome.storage.local.get('proxyAppState');
    return values.proxyAppState?.schemaVersion;
  })).toBe(2);
  await worker.evaluate(async () => {
    await chrome.storage.local.clear();
    await chrome.storage.local.set({
      allowedOrigins: [{
        id: 9,
        origin: 'http://test.localhost:3000',
        domain: 'test.localhost',
        credentials: true,
        extraHeaders: 'X-Legacy',
        disabled: false,
        createdAt: 100,
        updatedAt: 200,
      }],
      extConfig: {
        dftEnableCredentials: true,
        debugMode: true,
        maxRules: 250,
        autoCleanupDays: 14,
      },
    });
  });
  await context.close();
  await launchContext();
  await expect.poll(async () => worker.evaluate(async () => {
    const values = await chrome.storage.local.get(['proxyAppState', 'legacyBackupV1']);
    return {
      schema: values.proxyAppState?.schemaVersion,
      ruleId: values.proxyAppState?.rules?.[0]?.id,
      maxRules: values.proxyAppState?.settings?.maxRules,
      backupRuleId: values.legacyBackupV1?.allowedOrigins?.[0]?.id,
    };
  })).toEqual({ schema: 2, ruleId: 'legacy-cors-9', maxRules: 250, backupRuleId: 9 });

  await worker.evaluate(async () => {
    await chrome.storage.local.set({
      allowedOrigins: [{
        id: 999,
        origin: 'https://stale-v1.example',
        domain: 'stale-v1.example',
        credentials: false,
        extraHeaders: '',
        disabled: false,
        createdAt: 300,
        updatedAt: 300,
      }],
      extConfig: { maxRules: 1 },
    });
  });
  await context.close();
  await launchContext();
  await expect.poll(async () => worker.evaluate(async () => {
    const values = await chrome.storage.local.get(['proxyAppState', 'legacyBackupV1']);
    return {
      ruleIds: values.proxyAppState?.rules?.map((rule: any) => rule.id),
      maxRules: values.proxyAppState?.settings?.maxRules,
      backupRuleId: values.legacyBackupV1?.allowedOrigins?.[0]?.id,
    };
  })).toEqual({ ruleIds: ['legacy-cors-9'], maxRules: 250, backupRuleId: 9 });
});

test('renders the shadcn proxy workspace and popup', async () => {
  await control.reload();
  await expect(control.getByRole('heading', { name: 'Forth Intercept' })).toBeVisible();
  await expect(control.getByRole('tab', { name: 'Rules' })).toBeVisible();
  await control.screenshot({ path: 'test-results/forth-intercept-options.png', fullPage: true });

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/src/popup/index.html`);
  await expect(popup.getByText('Advanced proxy')).toBeVisible();
  await expect(popup.getByText('v2.0')).toBeVisible();
  await popup.screenshot({ path: 'test-results/forth-intercept-popup.png', fullPage: true });
  await popup.close();

  const inspector = await context.newPage();
  await inspector.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`);
  await expect(inspector.getByRole('heading', { name: 'Traffic inspector' })).toBeVisible();
  await inspector.setViewportSize({ width: 420, height: 820 });
  await inspector.screenshot({ path: 'test-results/forth-intercept-inspector.png', fullPage: true });
  await inspector.close();
});

test('exposes an origin-scoped SDK bridge with consent and disabled drafts', async () => {
  const target = await context.newPage();
  await target.goto('http://test.localhost:3000/');

  const sdkRequest = async (method: string, payload?: unknown) => target.evaluate(({ method: sdkMethod, payload: sdkPayload }) => new Promise<any>((resolve, reject) => {
    const clientId = crypto.randomUUID();
    const id = crypto.randomUUID();
    const timer = setTimeout(() => reject(new Error('SDK response timeout')), 5_000);
    const listener = (event: MessageEvent) => {
      if (event.data?.type !== 'forth-intercept:sdk-response'
        || event.data.clientId !== clientId
        || event.data.id !== id) return;
      clearTimeout(timer);
      window.removeEventListener('message', listener);
      resolve(event.data);
    };
    window.addEventListener('message', listener);
    window.postMessage({
      type: 'forth-intercept:sdk-request',
      clientId,
      id,
      method: sdkMethod,
      payload: sdkPayload,
    }, location.origin);
  }), { method, payload });

  const connected = await sdkRequest('connect');
  expect(connected.data).toMatchObject({
    origin: 'http://test.localhost:3000',
    capabilities: {
      protocolVersion: 2,
      product: 'Forth Intercept',
      browser: 'chrome',
      interception: {
        responseMock: 'synthetic',
        preflight: 'synthetic',
        networkFailure: 'reasoned',
        resourceTypes: 'distinct-fetch-xhr',
      },
    },
  });

  target.once('dialog', (dialog) => dialog.accept());
  const enabled = await sdkRequest('requestCors', { reason: 'E2E consent check' });
  expect(enabled.data.cors).toEqual({ enabled: true, credentials: false });

  const draft = await sdkRequest('createRuleDraft', {
    openWorkspace: false,
    rule: {
      name: 'SDK safe draft',
      urlPattern: 'http://api.localhost:3000/api/*',
      methods: ['GET'],
      resourceTypes: ['Fetch'],
      actions: [{ type: 'delay', milliseconds: 400 }],
    },
  });
  expect(draft.data).toMatchObject({ enabled: false, workspaceOpened: false });
  const stored = await control.evaluate(async () => chrome.runtime.sendMessage({ type: 'getProxyState' }));
  expect(stored.rules.find((rule: any) => rule.id === draft.data.id)).toMatchObject({
    enabled: false,
    match: { initiatorOrigins: ['http://test.localhost:3000'] },
  });
  const disabled = await sdkRequest('disableCors');
  expect(disabled.data.cors.enabled).toBe(false);
  await target.close();
});

test('repairs a genuinely failing preflight and records the request', async () => {
  const target = await context.newPage();
  await target.goto('http://test.localhost:3000/');
  const apiUrl = 'http://api.localhost:3000/api/custom-headers';

  const before = await target.evaluate(async (url) => {
    try {
      await fetch(url, { headers: { 'X-Blocked-Preflight': 'yes' } });
      return 'unexpected-success';
    } catch (error) {
      return error instanceof Error ? error.name : 'failed';
    }
  }, apiUrl);
  expect(before).not.toBe('unexpected-success');

  const tabId = await getTabId('http://test.localhost:3000/');
  const status = await control.evaluate(async (id) => chrome.runtime.sendMessage({
    type: 'enableAdvancedProxy',
    payload: { tabId: id, credentials: true, extraHeaders: 'X-Blocked-Preflight' },
  }), tabId);
  expect(status.phase).toBe('connected');

  const after = await target.evaluate(async (url) => {
    const response = await fetch(url, { headers: { 'X-Blocked-Preflight': 'yes' } });
    return { ok: response.ok, status: response.status };
  }, apiUrl);
  expect(after).toEqual({ ok: true, status: 200 });

  const log = await control.evaluate(async (id) => chrome.runtime.sendMessage({
    type: 'getAdvancedProxyLog',
    payload: { tabId: id },
  }), tabId);
  expect(log.some((entry: any) => entry.method === 'OPTIONS' && entry.status === 204)).toBe(true);
  expect(log.some((entry: any) => entry.url === apiUrl && entry.status === 200)).toBe(true);

  await control.evaluate(async (id) => chrome.runtime.sendMessage({
    type: 'disableAdvancedProxy',
    payload: { tabId: id },
  }), tabId);
  await target.close();
});

test('mocks a response from a captured-rule-compatible matcher', async () => {
  const target = await context.newPage();
  await target.goto('http://test.localhost:3000/');
  const tabId = await getTabId('http://test.localhost:3000/');
  const mockUrl = 'http://api.localhost:3000/api/mock-me';
  await control.evaluate(async (url) => chrome.runtime.sendMessage({
    type: 'saveProxyRule',
    payload: {
      rule: {
        name: 'Mock captured request',
        enabled: true,
        source: 'user',
        match: {
          initiatorOrigins: ['http://test.localhost:3000'],
          urlPattern: url,
          methods: ['GET'],
          resourceTypes: ['XHR', 'Fetch'],
        },
        actions: [{
          type: 'mockResponse',
          status: 202,
          headers: { 'Content-Type': 'application/json' },
          body: '{"source":"forth-intercept"}',
        }],
      },
    },
  }), mockUrl);
  await control.evaluate(async (id) => chrome.runtime.sendMessage({
    type: 'enableAdvancedProxy', payload: { tabId: id },
  }), tabId);

  const result = await target.evaluate(async (url) => {
    const response = await fetch(url);
    return { status: response.status, body: await response.json() };
  }, mockUrl);
  expect(result).toEqual({ status: 202, body: { source: 'forth-intercept' } });

  await control.evaluate(async (id) => chrome.runtime.sendMessage({
    type: 'disableAdvancedProxy', payload: { tabId: id },
  }), tabId);
  await target.close();
});

test('applies fast-path request headers and blocking through DNR', async () => {
  const target = await context.newPage();
  await target.goto('http://test.localhost:3000/');
  const echoUrl = 'http://api.localhost:3000/api/headers-echo';
  const blockUrl = 'http://api.localhost:3000/api/users/1';
  for (const rule of [
    {
      name: 'DNR request header',
      enabled: true,
      source: 'user',
      match: { initiatorOrigins: ['http://test.localhost:3000'], urlPattern: echoUrl },
      actions: [
        { type: 'setRequestHeaders', headers: { 'X-Proxy-E2E': 'active' } },
        {
          type: 'setResponseHeaders',
          headers: {
            'Access-Control-Allow-Origin': 'http://test.localhost:3000',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'X-Proxy-E2E',
          },
        },
      ],
    },
    {
      name: 'DNR block',
      enabled: true,
      source: 'user',
      match: { initiatorOrigins: ['http://test.localhost:3000'], urlPattern: blockUrl },
      actions: [{ type: 'block' }],
    },
  ]) {
    await control.evaluate(async (value) => chrome.runtime.sendMessage({
      type: 'saveProxyRule', payload: { rule: value },
    }), rule);
  }

  await expect.poll(async () => target.evaluate(async (url) => {
    const response = await fetch(url);
    const body = await response.json();
    return body.data.headers['x-proxy-e2e'];
  }, echoUrl)).toBe('active');

  const blocked = await target.evaluate(async (url) => {
    try { await fetch(url); return false; } catch { return true; }
  }, blockUrl);
  expect(blocked).toBe(true);
  await target.close();
});

test('applies CDP delay and simulated network failure', async () => {
  const target = await context.newPage();
  await target.goto('http://test.localhost:3000/');
  const tabId = await getTabId('http://test.localhost:3000/');
  const delayUrl = 'http://api.localhost:3000/time';
  const failureUrl = 'http://api.localhost:3000/api/error/503';
  for (const rule of [
    {
      name: 'CDP delay',
      enabled: true,
      source: 'user',
      match: { initiatorOrigins: ['http://test.localhost:3000'], urlPattern: delayUrl },
      actions: [{ type: 'delay', milliseconds: 250 }],
    },
    {
      name: 'CDP failure',
      enabled: true,
      source: 'user',
      match: { initiatorOrigins: ['http://test.localhost:3000'], urlPattern: failureUrl },
      actions: [{ type: 'networkFailure', reason: 'Failed' }],
    },
  ]) {
    await control.evaluate(async (value) => chrome.runtime.sendMessage({
      type: 'saveProxyRule', payload: { rule: value },
    }), rule);
  }
  await control.evaluate(async (id) => chrome.runtime.sendMessage({
    type: 'enableAdvancedProxy', payload: { tabId: id },
  }), tabId);

  const duration = await target.evaluate(async (url) => {
    const startedAt = performance.now();
    await fetch(url);
    return performance.now() - startedAt;
  }, delayUrl);
  expect(duration).toBeGreaterThanOrEqual(220);
  const failed = await target.evaluate(async (url) => {
    try { await fetch(url); return false; } catch { return true; }
  }, failureUrl);
  expect(failed).toBe(true);

  await control.evaluate(async (id) => chrome.runtime.sendMessage({
    type: 'disableAdvancedProxy', payload: { tabId: id },
  }), tabId);
  await target.close();
});
