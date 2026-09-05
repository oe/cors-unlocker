import { test, expect, chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { createServer } from 'node:http';
import { messages } from '../../src/common/locales';

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

test('localizes all surfaces and preserves drafts and settings across language changes', async () => {
  const testInfo = test.info();
  await worker.evaluate(() => chrome.storage.local.set({ uiLanguage: 'en' }));
  await control.reload();
  await control.setViewportSize({ width: 1440, height: 900 });
  const original = await worker.evaluate(async () => (await chrome.storage.local.get('proxyAppState')).proxyAppState);
  await control.getByRole('button', { name: 'New rule', exact: true }).click();
  const draftName = '用户 $& / custom draft';
  await control.getByRole('textbox', { name: 'Name', exact: true }).fill(draftName);
  await control.getByRole('combobox', { name: 'Language', exact: true }).click();
  await control.getByRole('option', { name: '简体中文', exact: true }).click();
  await expect(control.locator('html')).toHaveAttribute('lang', 'zh-CN');
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/src/popup/index.html`);
  await popup.setViewportSize({ width: 360, height: 800 });
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`);
  await panel.setViewportSize({ width: 420, height: 900 });
  try {
    for (const locale of ['en', 'zh-CN', 'ko', 'ja', 'fr', 'es']) {
      await worker.evaluate((uiLanguage) => chrome.storage.local.set({ uiLanguage }), locale);
      for (const page of [control, popup, panel]) await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(control.getByRole('textbox', { name: messages.Name[locale], exact: true })).toHaveValue(draftName);
      await expect(popup.getByText(messages['Quick debug'][locale], { exact: true })).toBeVisible();
      await expect(panel.getByText(messages['Advanced proxy is off'][locale], { exact: true }).or(panel.getByText(messages['This page is unavailable'][locale], { exact: true }))).toBeVisible();
      for (const [name, page] of [['options', control], ['popup', popup], ['sidepanel', panel]] as const) {
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${name} ${locale} overflow`).toBe(true);
        await page.screenshot({ path: testInfo.outputPath(`${name}-${locale}.png`), fullPage: true });
      }
    }
    await control.setViewportSize({ width: 390, height: 844 });
    expect(await control.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    for (const tab of await control.getByRole('tab').all()) {
      const box = await tab.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    }
    await expect(control.getByRole('textbox', { name: messages.Name.es, exact: true })).toHaveValue(draftName);
    await control.screenshot({ path: testInfo.outputPath('options-es-narrow.png'), fullPage: true });
    expect(await worker.evaluate(async () => (await chrome.storage.local.get('proxyAppState')).proxyAppState)).toEqual(original);
    await control.reload();
    await expect(control.locator('html')).toHaveAttribute('lang', 'es');
    await expect(control.getByRole('combobox', { name: messages.Language.es, exact: true })).toContainText('Español');
  } finally {
    await worker.evaluate(() => chrome.storage.local.set({ uiLanguage: 'en' }));
    await popup.close(); await panel.close();
    await control.setViewportSize({ width: 1440, height: 900 });
    await control.reload();
  }
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
  await expect(control.getByRole('button', { name: 'Rules', exact: true })).toBeVisible();
  await control.getByRole('button', { name: 'New rule' }).click();
  await control.getByLabel('Name', { exact: true }).fill('Resource picker QA');
  const resources = control.getByRole('button', { name: 'Resource types: XHR, Fetch' });
  await resources.click();
  const resourceList = control.getByRole('listbox', { name: 'Resource types' });
  await expect(resourceList).toBeVisible();
  await expect(resourceList.getByRole('option', { name: 'XHR' })).toHaveAttribute('aria-selected', 'true');
  await expect(resourceList.getByRole('option', { name: 'Fetch', exact: true })).toHaveAttribute('aria-selected', 'true');
  await resourceList.getByRole('option', { name: 'Image' }).click();
  await expect(control.getByRole('button', { name: 'Resource types: 3 selected' })).toBeVisible();
  await expect(resourceList).toBeVisible();
  await resourceList.getByRole('option', { name: 'Script' }).click();
  await expect(control.getByRole('button', { name: 'Resource types: 4 selected' })).toBeVisible();
  await resourceList.getByRole('option', { name: 'XHR' }).click();
  await expect(resourceList.getByRole('option', { name: 'XHR' })).toHaveAttribute('aria-selected', 'false');
  await expect(control.getByRole('button', { name: 'Resource types: 3 selected' })).toBeVisible();
  await control.keyboard.press('Escape');
  await control.getByRole('button', { name: 'Save rule' }).click();
  await expect(control.getByRole('button', { name: 'Edit Resource picker QA' })).toBeVisible();
  await control.getByRole('button', { name: 'Edit Resource picker QA' }).click();
  const savedResources = control.getByRole('button', { name: 'Resource types: 3 selected' });
  await savedResources.click();
  const savedResourceList = control.getByRole('listbox', { name: 'Resource types' });
  await expect(savedResourceList.getByRole('option', { name: 'Fetch', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(savedResourceList.getByRole('option', { name: 'Image' })).toHaveAttribute('aria-selected', 'true');
  await expect(savedResourceList.getByRole('option', { name: 'Script' })).toHaveAttribute('aria-selected', 'true');
  await expect(savedResourceList.getByRole('option', { name: 'XHR' })).toHaveAttribute('aria-selected', 'false');
  await control.keyboard.press('Escape');
  await control.getByRole('button', { name: 'Back to rules' }).click();
  await control.screenshot({ path: 'test-results/forth-intercept-options.png', fullPage: true });

  const inspectedTab = await context.newPage();
  await inspectedTab.goto('http://test.localhost:3000/');
  const inspectedTabId = await getTabId('http://test.localhost:3000/');
  await control.evaluate((tabId) => {
    const trigger = document.createElement('button');
    trigger.id = 'test-open-inspector';
    trigger.textContent = 'Open test inspector';
    trigger.addEventListener('click', () => {
      void chrome.runtime.sendMessage({ type: 'openSidePanel', payload: { tabId } }).catch(() => undefined);
    });
    document.body.append(trigger);
  }, inspectedTabId);
  await control.locator('#test-open-inspector').click();
  await expect.poll(() => control.evaluate(async (tabId) => (
    await chrome.sidePanel.getOptions({ tabId })
  ).path, inspectedTabId)).toBe(`src/sidepanel/index.html?tabId=${inspectedTabId}`);

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/src/popup/index.html`);
  await expect(popup.getByRole('button', { name: 'Open Inspector' })).toBeVisible();
  await expect(popup.getByRole('heading', { name: 'Forth Intercept' })).toBeVisible();
  await popup.screenshot({ path: 'test-results/forth-intercept-popup.png', fullPage: true });
  await popup.close();

  const inspector = await context.newPage();
  await inspector.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html?tabId=${inspectedTabId}`);
  await expect(inspector.getByRole('heading', { name: 'Site controls' })).toBeVisible();
  await expect(inspector.getByText('http://test.localhost:3000', { exact: true })).toBeVisible();
  const inspectorToggle = inspector.getByRole('switch', { name: 'Toggle advanced proxy' });
  await expect(inspectorToggle).toBeEnabled();
  await inspectorToggle.click();
  await expect(inspectorToggle).toBeChecked();
  await inspectorToggle.click();
  await expect(inspectorToggle).not.toBeChecked();
  await inspector.setViewportSize({ width: 420, height: 820 });
  await inspector.screenshot({ path: 'test-results/forth-intercept-inspector.png', fullPage: true });
  await inspector.close();
  await inspectedTab.close();
});

test('edits structured actions, protects drafts and previews imports', async () => {
  await control.reload();
  await control.getByRole('button', { name: 'New rule' }).click();
  await control.getByLabel('Name', { exact: true }).fill('Workspace QA');
  await control.getByLabel('Page origins').fill('http://console.localhost:3000');
  await control.getByLabel('URL pattern').fill('*://console.localhost:3000/health*');
  await control.getByRole('tab', { name: 'Actions', exact: true }).click();
  await control.getByLabel('Header 1 name', { exact: true }).fill('X-Workspace-QA');
  await control.getByLabel('Header 1 value', { exact: true }).fill('verified');
  await control.getByLabel('Action to add').click();
  await control.getByRole('option', { name: 'Delay', exact: true }).click();
  await control.getByRole('button', { name: 'Add action', exact: true }).click();
  await control.getByLabel('Delay in milliseconds').fill('125');
  await control.getByText('Test matching', { exact: true }).click();
  await control.getByLabel('Test page origin').fill('http://console.localhost:3000');
  await control.getByLabel('Test request URL').fill('http://console.localhost:3000/health');
  await control.getByRole('button', { name: 'Test conditions' }).click();
  await expect(control.getByText(/^Conditions match/)).toBeVisible();
  await control.getByLabel('Test page origin').fill('http://other.localhost:3000');
  await control.getByRole('button', { name: 'Test conditions' }).click();
  await expect(control.getByRole('status')).toContainText('origin');
  await control.getByLabel('Search rules').fill('no-such-rule');
  await control.getByRole('tab', { name: 'Match', exact: true }).click();
  await expect(control.getByLabel('Name', { exact: true })).toHaveValue('Workspace QA');
  await control.getByRole('button', { name: 'Data & migration' }).click();
  await expect(control.getByRole('dialog', { name: 'Discard unsaved changes?' })).toBeVisible();
  await control.getByRole('button', { name: 'Keep editing' }).click();
  await control.getByRole('button', { name: 'Save rule', exact: true }).click();
  await control.getByLabel('Search rules').fill('');
  await expect(control.getByRole('button', { name: 'Edit Workspace QA' })).toBeVisible();
  await control.getByLabel('Name', { exact: true }).fill('Discard me');
  await control.getByRole('button', { name: 'New rule' }).click();
  await control.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(control.getByLabel('Name', { exact: true })).toHaveValue('New proxy rule');
  await control.getByRole('button', { name: 'Back to rules' }).click();
  await control.getByRole('button', { name: 'Edit Workspace QA' }).click();
  await control.getByRole('tab', { name: 'Actions', exact: true }).click();
  await expect(control.getByLabel('Delay in milliseconds')).toHaveValue('125');
  await expect(control.getByLabel('Header 1 name', { exact: true })).toHaveValue('X-Workspace-QA');
  await control.screenshot({ path: 'test-results/forth-intercept-workspace.png', fullPage: true });
  await control.getByRole('button', { name: 'Data & migration' }).click();
  const before = await worker.evaluate(async () => (await chrome.storage.local.get('proxyAppState')).proxyAppState);
  const incoming = structuredClone(before);
  incoming.rules = [{ ...incoming.rules[0], id: 'import-preview-qa', name: 'Imported QA', enabled: false }];
  await control.locator('#import-state').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ version: '2.0', state: incoming })) });
  await expect(control.getByRole('region', { name: 'Import preview' })).toContainText('1 added');
  expect(await worker.evaluate(async () => (await chrome.storage.local.get('proxyAppState')).proxyAppState)).toEqual(before);
  await control.getByLabel('Import mode').click();
  await control.getByRole('option', { name: 'Replace configuration' }).click();
  await expect(control.getByRole('region', { name: 'Import preview' })).toContainText(`${before.rules.length} removed`);
  await control.getByLabel('Import mode').click();
  await control.getByRole('option', { name: 'Merge rules' }).click();
  await control.getByRole('button', { name: 'Apply import' }).click();
  await expect(control.getByText(/Import completed/)).toBeVisible();
  const after = await worker.evaluate(async () => chrome.storage.local.get(['proxyAppState', 'preImportBackup']));
  expect(after.proxyAppState.rules).toHaveLength(before.rules.length + 1);
  expect(after.preImportBackup.state).toEqual(before);
  await control.getByRole('button', { name: 'Rules', exact: true }).click();
});

test('keeps editing continuous across toggles, shortcuts, duplication and narrow layouts', async () => {
  await control.reload();
  await control.setViewportSize({ width: 1440, height: 900 });
  await control.getByRole('button', { name: 'Edit Workspace QA', exact: true }).click();
  await control.getByLabel('Name', { exact: true }).fill('Workspace QA edited');
  const other = control.getByRole('switch', { name: 'Toggle Resource picker QA', exact: true });
  const wasEnabled = await other.isChecked();
  await other.click();
  await expect(other).toBeChecked({ checked: !wasEnabled });
  await expect(control.getByRole('dialog')).toHaveCount(0);
  await expect(control.getByLabel('Name', { exact: true })).toHaveValue('Workspace QA edited');
  await other.click();
  await expect(other).toBeChecked({ checked: wasEnabled });
  await control.keyboard.press('ControlOrMeta+k');
  await expect(control.getByLabel('Search rules')).toBeFocused();
  await control.keyboard.press('ControlOrMeta+s');
  await expect(control.getByRole('button', { name: 'Edit Workspace QA edited', exact: true })).toBeVisible();
  await control.getByRole('tab', { name: 'Actions', exact: true }).click();
  await expect(control.getByLabel('Delay in milliseconds')).toHaveValue('125');
  await expect(control.getByRole('tab', { name: 'Actions', exact: true })).toHaveAttribute('aria-selected', 'true');
  await control.mouse.move(0, 0);
  await control.screenshot({ path: 'test-results/workspace-desktop-actions.png', fullPage: true, animations: 'disabled' });
  await control.getByRole('button', { name: 'Duplicate rule', exact: true }).click();
  await expect(control.getByLabel('Name', { exact: true })).toHaveValue('Workspace QA edited copy');
  await expect(control.getByRole('switch', { name: 'Rule enabled', exact: true })).not.toBeChecked();
  await control.getByRole('button', { name: 'Save rule', exact: true }).click();
  await expect(control.getByRole('button', { name: 'Edit Workspace QA edited copy', exact: true })).toBeVisible();
  await control.setViewportSize({ width: 390, height: 844 });
  await expect(control.getByLabel('Search rules')).not.toBeVisible();
  await expect(control.getByLabel('Name', { exact: true })).toBeVisible();
  expect(await control.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await control.screenshot({ path: 'test-results/workspace-narrow-editor.png', fullPage: true, animations: 'disabled' });
  await control.getByRole('button', { name: 'Back to rules' }).click();
  await expect(control.getByLabel('Search rules')).toBeVisible();
  await expect(control.getByRole('region', { name: 'Rule editor', exact: true })).toHaveCount(0);
  await control.setViewportSize({ width: 1440, height: 900 });
  const first = control.getByRole('button', { name: 'Edit Resource picker QA', exact: true });
  await first.focus();
  await control.keyboard.press('End');
  await expect(control.getByRole('button', { name: 'Edit Workspace QA edited copy', exact: true })).toBeFocused();
  await expect(control.getByRole('heading', { name: 'Workspace QA edited copy', exact: true })).toBeVisible();
  await control.keyboard.press('Home');
  await expect(control.locator('[data-rule-select]').first()).toBeFocused();
  expect(await control.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
});

test('controls site rules inline and verifies actual request effects', async () => {
  const target = await context.newPage();
  await target.goto('http://console.localhost:3000/');
  const tabId = await getTabId('http://console.localhost:3000/');
  const panel = await context.newPage();
  const errors: string[] = [];
  panel.on('pageerror', (error) => errors.push(error.message));
  await panel.setViewportSize({ width: 420, height: 820 });
  await panel.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html?tabId=${tabId}`);
  await expect(panel.getByRole('heading', { name: 'Site controls' })).toBeVisible();
  await panel.getByRole('switch', { name: 'Toggle advanced proxy' }).click();
  await expect(panel.getByRole('switch', { name: 'Toggle advanced proxy' })).toBeChecked();
  const fetchHealth = () => target.evaluate(async () => {
    const response = await fetch('/health');
    return { status: response.status, body: await response.json() };
  });
  expect((await fetchHealth()).body.data.status).toBe('healthy');
  await panel.getByRole('button', { name: /GET.*console.localhost:3000\/health/ }).first().click();
  await panel.getByRole('button', { name: 'Mock', exact: true }).click();
  await expect(panel.getByRole('dialog')).toBeVisible();
  await expect(panel.getByLabel('Page origins')).toHaveValue('http://console.localhost:3000');
  await panel.getByLabel('Name', { exact: true }).fill('Console mock QA');
  await panel.getByLabel('HTTP status', { exact: true }).fill('201');
  await panel.getByLabel('Response body', { exact: true }).fill('{"source":"sidepanel"}');
  await panel.getByRole('button', { name: 'Save rule', exact: true }).click();
  await expect(panel.getByRole('switch', { name: 'Enable Console mock QA' })).toBeChecked();
  await expect.poll(fetchHealth).toEqual({ status: 201, body: { source: 'sidepanel' } });
  await panel.getByRole('button', { name: /GET.*console.localhost:3000\/health/ }).first().click();
  await expect(panel.getByText('Local mock', { exact: true })).toBeVisible();
  await expect(panel.getByText(/HTTP 201;.*server not contacted/)).toBeVisible();
  await panel.screenshot({ path: '/tmp/forth-site-controls-mock.png', fullPage: true });
  await panel.getByRole('switch', { name: 'Enable Console mock QA' }).click();
  await expect.poll(async () => (await fetchHealth()).body.data?.status).toBe('healthy');
  await panel.getByRole('button', { name: /GET.*console.localhost:3000\/health/ }).first().click();
  await panel.getByText('Check against current rules', { exact: true }).click();
  await expect(panel.locator('div').filter({ hasText: /^Console mock QARule is disabled$/ })).toBeVisible();
  // Edit within the same side-panel dialog, then verify the next real response.
  await panel.getByRole('button', { name: 'Console mock QA', exact: true }).first().click();
  await expect(panel.getByRole('heading', { name: 'Edit proxy rule' })).toBeVisible();
  await panel.getByLabel('HTTP status', { exact: true }).fill('202');
  await panel.getByLabel('Response body', { exact: true }).fill('{"source":"edited"}');
  await panel.getByRole('button', { name: 'Save rule', exact: true }).click();
  await panel.getByRole('switch', { name: 'Enable Console mock QA' }).click();
  await expect.poll(fetchHealth).toEqual({ status: 202, body: { source: 'edited' } });
  expect(await panel.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await panel.getByRole('switch', { name: 'Enable Console mock QA' }).click();
  await panel.getByRole('switch', { name: 'Toggle advanced proxy' }).click();
  await panel.close();
  await target.close();
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
    payload: { tabId: id, quickControls: { disableCache: false, cors: true, credentials: true, delayMs: 0, failure: false } },
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
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
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
  const delayUrl = 'http://test.localhost:3000/time';
  const failureUrl = 'http://test.localhost:3000/api/error/503';
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

test('popup controls are temporary, tab-scoped, and independent from saved rules', async () => {
  const target = await context.newPage();
  const other = await context.newPage();
  await target.goto('http://popup.localhost:3000/');
  await other.goto('http://popup.localhost:3000/health');
  const tabId = await getTabId('http://popup.localhost:3000/');
  const saved = await control.evaluate(async () => chrome.runtime.sendMessage({
    type: 'saveProxyRule', payload: { rule: {
      name: 'Popup header preset', enabled: false, source: 'user',
      match: { initiatorOrigins: ['http://popup.localhost:3000'], urlPattern: '*://popup.localhost:3000/health*' },
      actions: [{ type: 'setResponseHeaders', headers: { 'X-Popup-Preset': 'enabled' } }],
    } },
  }));
  const before = await worker.evaluate(async () => (await chrome.storage.local.get('proxyAppState')).proxyAppState);
  const popup = await context.newPage();
  const errors: string[] = [];
  popup.on('pageerror', (error) => errors.push(error.message));
  popup.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  const popupUrl = `chrome-extension://${extensionId}/src/popup/index.html?tabId=${tabId}`;
  await popup.goto(popupUrl);
  await popup.setViewportSize({ width: 360, height: 600 });
  await expect(popup).toHaveTitle(/Forth Intercept/);
  await expect(popup.getByText('http://popup.localhost:3000', { exact: true })).toBeVisible();
  await expect(popup.getByRole('button', { name: 'Open Inspector' })).toBeEnabled();
  await popup.getByRole('button', { name: 'Start proxy session' }).click();
  await expect(popup.getByText('Proxy connected', { exact: true })).toBeVisible();
  // Merely connecting must not repair CORS.
  const crossRequest = () => target.evaluate(async () => {
    try {
      await fetch(`http://api.localhost:3000/api/custom-headers?popup=${Date.now()}`, { headers: { 'X-Popup-Test': 'yes' } });
      return true;
    } catch { return false; }
  });
  expect(await crossRequest()).toBe(false);
  await popup.getByRole('switch', { name: 'CORS repair', exact: true }).click();
  await expect(popup.getByRole('switch', { name: 'CORS repair', exact: true })).toBeChecked();
  expect(await crossRequest()).toBe(true);
  await popup.getByLabel('Delay duration').selectOption('500');
  await popup.getByRole('switch', { name: 'Request delay', exact: true }).click();
  await expect(popup.getByRole('switch', { name: 'Request delay', exact: true })).toBeChecked();
  const duration = await target.evaluate(async () => {
    const start = performance.now(); await fetch('/health'); return performance.now() - start;
  });
  expect(duration).toBeGreaterThanOrEqual(450);
  // Reopening the popup reads the same background session, not component state.
  await popup.reload();
  await expect(popup.getByLabel('Delay duration')).toHaveValue('500');
  await popup.getByRole('switch', { name: 'Request delay', exact: true }).click();
  await popup.getByRole('switch', { name: 'Simulate failure', exact: true }).click();
  await expect(popup.getByRole('switch', { name: 'Simulate failure', exact: true })).toBeChecked();
  expect(await target.evaluate(async () => { try { await fetch('/health'); return false; } catch { return true; } })).toBe(true);
  expect(await other.evaluate(async () => (await fetch('/health')).ok)).toBe(true);
  await target.evaluate(() => new Promise<void>((resolve) => {
    const img = new Image(); img.onload = () => resolve(); img.onerror = () => resolve(); img.src = '/health?image-scope';
  }));
  const logs = await control.evaluate(async (id) => chrome.runtime.sendMessage({ type: 'getAdvancedProxyLog', payload: { tabId: id } }), tabId);
  const imageLog = logs.find((entry: any) => entry.url.includes('image-scope'));
  expect(imageLog).toMatchObject({ resourceType: 'Image', outcome: 'continued' });
  expect(imageLog.matchedRuleIds.filter((id: string) => id.startsWith('session:'))).toEqual([]);
  expect(await worker.evaluate(async () => (await chrome.storage.local.get('proxyAppState')).proxyAppState)).toEqual(before);
  await popup.getByRole('button', { name: 'Stop this session' }).click();
  for (const name of ['CORS repair', 'Request delay', 'Simulate failure']) await expect(popup.getByRole('switch', { name, exact: true })).not.toBeChecked();
  expect(await crossRequest()).toBe(false);
  expect(await target.evaluate(async () => (await fetch('/health')).ok)).toBe(true);

  // Pinning is metadata; enabling a saved rule persists across stopping/reopening.
  await popup.getByText('Choose pinned rules', { exact: true }).click();
  await popup.getByRole('button', { name: 'Pin Popup header preset', exact: true }).click();
  await expect(popup.getByRole('switch', { name: 'Popup header preset', exact: true })).toBeVisible();
  await popup.getByRole('switch', { name: 'Popup header preset', exact: true }).click();
  await expect(popup.getByRole('switch', { name: 'Popup header preset', exact: true })).toBeChecked();
  await expect.poll(() => target.evaluate(async () => (await fetch('/health')).headers.get('X-Popup-Preset'))).toBe('enabled');
  await popup.reload();
  await expect(popup.getByRole('switch', { name: 'Popup header preset', exact: true })).toBeChecked();
  await popup.getByRole('switch', { name: 'Request delay', exact: true }).click();
  await expect(popup.getByText('Proxy connected', { exact: true })).toBeVisible();
  await popup.getByRole('button', { name: 'Stop this session' }).click();
  await expect(popup.getByRole('switch', { name: 'Popup header preset', exact: true })).toBeChecked();
  expect(await target.evaluate(async () => (await fetch('/health')).headers.get('X-Popup-Preset'))).toBe('enabled');
  await popup.evaluate(() => window.scrollTo(0, 0));
  await expect(popup.getByRole('switch', { name: 'Request delay', exact: true })).not.toBeChecked();
  await popup.setViewportSize({ width: 360, height: Math.ceil((await popup.locator('main').boundingBox())!.height) });
  await popup.screenshot({ path: '/tmp/forth-intercept-popup-en.png', fullPage: true, animations: 'disabled' });
  await popup.setViewportSize({ width: 360, height: 600 });
  for (const locale of ['en', 'zh-CN', 'ko', 'ja', 'fr', 'es']) {
    await worker.evaluate((uiLanguage) => chrome.storage.local.set({ uiLanguage }), locale);
    await expect(popup.locator('html')).toHaveAttribute('lang', locale);
    expect(await popup.evaluate(() => document.documentElement.scrollWidth <= innerWidth), locale).toBe(true);
    expect(await popup.locator('main').evaluate((element) => element.scrollHeight), `${locale} compact height`).toBeLessThanOrEqual(560);
    await expect(popup.getByRole('switch', { name: messages['Allow credentials'][locale], exact: true })).toBeVisible();
    await expect(popup.getByRole('switch', { name: messages['CORS repair'][locale], exact: true })).toBeVisible();
  }
  await worker.evaluate(() => chrome.storage.local.set({ uiLanguage: 'zh-CN' }));
  await expect(popup.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await popup.setViewportSize({ width: 360, height: Math.ceil((await popup.locator('main').boundingBox())!.height) });
  await popup.screenshot({ path: '/tmp/forth-intercept-popup-zh.png', fullPage: true, animations: 'disabled' });
  await popup.setViewportSize({ width: 360, height: 600 });
  await worker.evaluate(() => chrome.storage.local.set({ uiLanguage: 'en' }));
  await expect(popup.locator('html')).toHaveAttribute('lang', 'en');
  await popup.getByRole('switch', { name: 'Simulate failure', exact: true }).click();
  await expect(popup.getByRole('switch', { name: 'Simulate failure', exact: true })).toBeChecked();
  await target.goto('http://elsewhere.localhost:3000/');
  await expect(popup.getByText('http://elsewhere.localhost:3000', { exact: true })).toBeVisible();
  await expect(popup.getByRole('switch', { name: 'Simulate failure', exact: true })).not.toBeChecked();
  expect(errors).toEqual([]);
  await control.evaluate(async (id) => chrome.runtime.sendMessage({ type: 'deleteProxyRule', payload: { id } }), saved.rule.id);
  await worker.evaluate(() => chrome.storage.local.remove('popupPinnedRuleIds'));
  await popup.close(); await other.close(); await target.close();
});


test('disable cache bypasses real HTTP cache for one tab and restores it on stop', async () => {
  const hits = new Map<string, number>();
  const server = createServer((request, response) => {
    const url = request.url || '/';
    if (url === '/') {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end('<title>Cache test</title><p>Cache fixture</p>');
      return;
    }
    const count = (hits.get(url) || 0) + 1;
    hits.set(url, count);
    response.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'public, max-age=3600' });
    response.end(String(count));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Cache fixture failed.');
  const origin = `http://127.0.0.1:${address.port}`;
  const target = await context.newPage();
  const other = await context.newPage();
  const popup = await context.newPage();
  const read = (page: Page, url: string) => page.evaluate(async (path) => (await fetch(path)).text(), url);
  try {
    await target.goto(origin);
    await other.goto(origin);
    const tabId = await getTabId(origin);
    expect(await read(target, '/asset')).toBe('1');
    expect(await read(target, '/asset')).toBe('1');
    expect(await read(other, '/other')).toBe('1');
    await popup.goto(`chrome-extension://${extensionId}/src/popup/index.html?tabId=${tabId}`);
    await popup.getByRole('switch', { name: 'Disable cache', exact: true }).click();
    await expect(popup.getByRole('switch', { name: 'Disable cache', exact: true })).toBeChecked();
    expect(await read(target, '/asset')).toBe('2');
    expect(await read(target, '/asset')).toBe('3');
    await target.reload();
    expect(await read(target, '/asset')).toBe('4');
    expect(await read(other, '/other')).toBe('1');
    await popup.reload();
    await expect(popup.getByRole('switch', { name: 'Disable cache', exact: true })).toBeChecked();
    await popup.getByRole('switch', { name: 'Disable cache', exact: true }).click();
    await expect(popup.getByRole('switch', { name: 'Disable cache', exact: true })).not.toBeChecked();
    const restored = await read(target, '/restored');
    expect(await read(target, '/restored')).toBe(restored);
    await popup.getByRole('switch', { name: 'Disable cache', exact: true }).click();
    await expect(popup.getByRole('switch', { name: 'Disable cache', exact: true })).toBeChecked();
    await popup.getByRole('button', { name: 'Stop this session' }).click();
    await expect(popup.getByRole('switch', { name: 'Disable cache', exact: true })).not.toBeChecked();
    const stopped = await read(target, '/stopped');
    expect(await read(target, '/stopped')).toBe(stopped);
    // Origin changes detach the session and restore caching as well.
    await popup.getByRole('switch', { name: 'Disable cache', exact: true }).click();
    await expect(popup.getByRole('switch', { name: 'Disable cache', exact: true })).toBeChecked();
    await target.goto('http://localhost:3000/');
    await expect(popup.getByRole('switch', { name: 'Disable cache', exact: true })).not.toBeChecked();
    await target.goto(origin);
    const navigated = await read(target, '/navigated');
    expect(await read(target, '/navigated')).toBe(navigated);
  } finally {
    await popup.close(); await other.close(); await target.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('activity empty states replace rows cleanly after reconnecting and filtering', async () => {
  const target = await context.newPage();
  await target.goto('http://activity.localhost:3000/');
  const tabId = await getTabId('http://activity.localhost:3000/');
  const panel = await context.newPage();
  const errors: string[] = [];
  panel.on('pageerror', (error) => errors.push(error.message));
  await panel.setViewportSize({ width: 360, height: 800 });
  await panel.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html?tabId=${tabId}`);
  const activity = panel.locator('[data-slot="scroll-area"]');
  const empty = activity.getByRole('status');
  await expect(empty).toContainText('No activity recorded yet.');
  expect(await empty.evaluate((element) => getComputedStyle(element).paddingLeft)).toBe('24px');
  const toggle = panel.getByRole('switch', { name: 'Toggle advanced proxy' });
  for (let pass = 0; pass < 2; pass++) {
    await toggle.click();
    await expect(toggle).toBeChecked();
    await target.evaluate(async () => { await fetch('/health'); });
    await expect(panel.getByRole('button', { name: /GET.*activity.localhost:3000\/health/ }).first()).toBeVisible();
    await toggle.click();
    await expect(toggle).not.toBeChecked();
  }
  const logs = await control.evaluate(async (id) => chrome.runtime.sendMessage({ type: 'getAdvancedProxyLog', payload: { tabId: id } }), tabId);
  expect(new Set(logs.map((entry: any) => entry.id)).size).toBe(logs.length);
  await expect(empty).toHaveCount(0);
  const firstRow = panel.getByRole('button', { name: /GET.*activity.localhost:3000\/health/ }).first();
  await firstRow.click();
  await expect(panel.getByText('Check against current rules', { exact: true })).toBeVisible();
  const listBox = (await activity.boundingBox())!;
  const rowBox = (await firstRow.boundingBox())!;
  expect(rowBox.x - listBox.x).toBeGreaterThanOrEqual(8);
  expect(rowBox.y - listBox.y).toBeGreaterThanOrEqual(8);
  await activity.screenshot({ path: '/tmp/intercept-activity-populated.png' });
  await panel.getByPlaceholder('Filter URL, method, status').fill('no-such-request');
  await expect(empty).toContainText('No requests match this filter.');
  await expect(panel.getByText('Check against current rules', { exact: true })).toHaveCount(0);
  await activity.screenshot({ path: '/tmp/intercept-activity-filter.png' });
  await expect(panel.getByRole('button', { name: /GET.*activity.localhost:3000\/health/ })).toHaveCount(0);
  await activity.getByRole('button', { name: 'Clear filter', exact: true }).click();
  await expect(empty).toHaveCount(0);
  await expect(panel.getByRole('button', { name: /GET.*activity.localhost:3000\/health/ })).toHaveCount(2);
  await panel.getByRole('button', { name: 'Clear requests' }).click();
  await expect(empty).toContainText('No activity recorded yet.');
  await expect(activity.getByRole('button')).toHaveCount(0);
  await expect(panel.getByText('Check against current rules', { exact: true })).toHaveCount(0);
  await activity.screenshot({ path: '/tmp/intercept-activity-empty.png' });
  expect(await panel.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await panel.close(); await target.close();
});
