import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { createServer } from 'node:http';
import { messages } from '../../src/common/locales';

test.describe.configure({ mode: 'serial' });
test.setTimeout(90_000);

let context: BrowserContext;
const extensionId = 'knhlkjdfmgkmelcjfnbbhpphkmjjacng';
let control: Page;
let extensionPath: string;
const userDataDir = mkdtempSync(path.join(tmpdir(), 'wireflip-e2e-'));

async function currentWorker() {
  const workers = context.serviceWorkers();
  return workers[workers.length - 1] || context.waitForEvent('serviceworker');
}

async function getTabId(urlPrefix: string): Promise<number> {
  return control.evaluate(async (prefix) => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find((item) => item.url?.startsWith(prefix));
    if (typeof tab?.id !== 'number') throw new Error(`Tab not found: ${prefix}`);
    return tab.id;
  }, urlPrefix);
}

async function captureUX(page: Page, name: string) {
  const data = (await page.screenshot({ path: 'test-results/' + name + '.png', animations: 'disabled' })).toString('base64');
  if (process.env.WIREFLIP_INLINE_EVIDENCE !== '1') return;
  const total = Math.ceil(data.length / 8192);
  for (let index = 0; index < total; index++) console.log('WIREFLIP_IMAGE ' + JSON.stringify({ name, index, total, data: data.slice(index * 8192, (index + 1) * 8192) }));
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
  context.setDefaultTimeout(15_000);
  context.setDefaultNavigationTimeout(20_000);
  control = await context.newPage();
  // Intentional test reloads discard the native beforeunload prompt, not the app's draft dialog.
  control.on('dialog', (dialog) => void (dialog.type() === 'beforeunload' ? dialog.accept() : dialog.dismiss()));
  await control.goto(`chrome-extension://${extensionId}/src/options/index.html`);
  await currentWorker();
}

test.afterAll(async () => {
  await context?.close();
  rmSync(userDataDir, { recursive: true, force: true });
});

test('opens upgrade explanation only for a real v1 update and preserves acknowledgment across restart', async () => {
  // The normal test profile is a fresh install: no upgrade tab or notice.
  expect(context.pages().some((page) => page.url().includes('/src/upgrade/'))).toBe(false);
  await expect(control.getByRole('region', { name: 'About your Wireflip upgrade' })).toHaveCount(0);
  const fixture = mkdtempSync(path.join(tmpdir(), 'wireflip-v1-upgrade-'));
  const profile = mkdtempSync(path.join(tmpdir(), 'wireflip-upgrade-profile-'));
  const manifest = JSON.parse(readFileSync(path.join(extensionPath, 'manifest.json'), 'utf8'));
  writeFileSync(path.join(fixture, 'manifest.json'), JSON.stringify({
    manifest_version: 3, name: 'Legacy upgrade fixture', version: '1.1.0', key: manifest.key,
    permissions: ['storage'], background: { service_worker: 'legacy.js' }, options_page: 'legacy.html',
  }));
  writeFileSync(path.join(fixture, 'legacy.js'), 'chrome.runtime.onInstalled.addListener(()=>{});');
  writeFileSync(path.join(fixture, 'legacy.html'), '<title>Legacy upgrade fixture</title>');
  const launch = () => chromium.launchPersistentContext(profile, {
    headless: false,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
    args: [`--disable-extensions-except=${fixture}`, `--load-extension=${fixture}`],
  });
  let updating = await launch();
  try {
    const legacy = await updating.newPage();
    await legacy.goto(`chrome-extension://${extensionId}/legacy.html`);
    await legacy.evaluate(async () => chrome.storage.local.set({ allowedOrigins: [{
      id: 42, origin: 'https://upgrade.example', domain: 'upgrade.example', disabled: false,
      credentials: true, extraHeaders: '', createdAt: 1, updatedAt: 1,
    }], extConfig: { maxRules: 250 }, uiLanguage: 'en', uiTheme: 'light' }));
    const manager = await updating.newPage();
    await manager.goto('chrome://extensions');
    if (await manager.locator('#devMode').getAttribute('aria-pressed') !== 'true') await manager.locator('#devMode').click();
    cpSync(extensionPath, fixture, { recursive: true });
    await manager.locator('extensions-item').locator('#dev-reload-button').click();
    await expect.poll(() => updating.pages().filter((page) => page.url().includes('/src/upgrade/index.html')).length).toBe(1);
    const upgrade = updating.pages().find((page) => page.url().includes('/src/upgrade/index.html'))!;
    const errors: string[] = [];
    upgrade.on('pageerror', (error) => errors.push(error.message));
    await expect(upgrade.getByRole('region', { name: 'About your Wireflip upgrade' })).toBeVisible();
    expect(await upgrade.evaluate(async () => {
      const values = await chrome.storage.local.get(['proxyAppState', 'legacyBackupV1', 'wireflipV2NoticeOpened']);
      return { id: values.proxyAppState.rules[0].id, backup: values.legacyBackupV1.allowedOrigins[0].id, opened: values.wireflipV2NoticeOpened, max: values.proxyAppState.settings.maxRules };
    })).toEqual({ id: 'legacy-cors-42', backup: 42, opened: '2.0', max: 250 });
    let workspace = await updating.newPage();
    await workspace.goto(`chrome-extension://${extensionId}/src/options/index.html`);
    await workspace.setViewportSize({ width: 1280, height: 800 });
    const compactNotice = workspace.getByRole('region', { name: 'About your Wireflip upgrade' });
    await expect(compactNotice).toBeVisible();
    expect((await compactNotice.boundingBox())!.height).toBeLessThan(70);
    await expect(compactNotice.getByRole('button', { name: 'View saved rules' })).not.toBeVisible();
    await compactNotice.locator('summary').click();
    await expect(compactNotice.getByRole('button', { name: 'View saved rules' })).toBeVisible();
    await compactNotice.locator('summary').click();
    await captureUX(workspace, 'candidate-upgraded-workspace');
    let popup = await updating.newPage();
    await popup.goto(`chrome-extension://${extensionId}/src/popup/index.html`);
    await expect(popup.getByRole('region', { name: 'About your Wireflip upgrade' })).toBeVisible();
    for (const locale of ['en', 'zh-CN', 'ko', 'ja', 'fr', 'es']) {
      await upgrade.evaluate((locale) => chrome.storage.local.set({ uiLanguage: locale }), locale);
      await expect(upgrade.locator('html')).toHaveAttribute('lang', locale);
      await expect(upgrade.getByText(messages['CORS Unlocker is now Wireflip'][locale], { exact: true })).toBeVisible();
      await upgrade.setViewportSize({ width: locale === 'en' ? 960 : 360, height: 800 });
      if (locale === 'en' || locale === 'zh-CN') await upgrade.screenshot({ path: `/tmp/wireflip-upgrade-${locale}.png`, fullPage: true });
      expect(await upgrade.evaluate(() => Array.from(document.querySelectorAll('main, main *')).filter((element) => element.getBoundingClientRect().right > innerWidth + 1).map((element) => ({ tag: element.tagName, class: element.className, width: element.getBoundingClientRect().width }))), locale).toEqual([]);
    }
    await upgrade.evaluate(() => chrome.storage.local.set({ uiLanguage: 'en', uiTheme: 'dark' }));
    await expect(upgrade.locator('html')).toHaveClass(/dark/);
    await upgrade.setViewportSize({ width: 960, height: 800 });
    await upgrade.screenshot({ path: '/tmp/wireflip-upgrade-dark.png', fullPage: true });
    await upgrade.close();
    await manager.locator('extensions-item').locator('#dev-reload-button').click();
    workspace = await updating.newPage();
    await expect(async () => {
      await workspace.goto(`chrome-extension://${extensionId}/src/options/index.html`);
      await expect(workspace.getByRole('region', { name: 'About your Wireflip upgrade' })).toBeVisible();
    }).toPass({ timeout: 10_000 });
    await expect(workspace.getByRole('region', { name: 'About your Wireflip upgrade' })).toBeVisible();
    expect(updating.pages().some((page) => page.url().includes('/src/upgrade/'))).toBe(false);
    popup = await updating.newPage();
    await popup.goto(`chrome-extension://${extensionId}/src/popup/index.html`);
    await popup.getByRole('button', { name: 'Got it', exact: true }).click();
    await expect(workspace.getByRole('region', { name: 'About your Wireflip upgrade' })).toHaveCount(0);
    expect(errors).toEqual([]);
    await updating.close(); updating = await launch();
    const reopened = await updating.newPage();
    await reopened.goto(`chrome-extension://${extensionId}/src/options/index.html`);
    await expect(reopened.getByRole('region', { name: 'About your Wireflip upgrade' })).toHaveCount(0);
    expect(updating.pages().some((page) => page.url().includes('/src/upgrade/'))).toBe(false);
    expect(await reopened.evaluate(async () => (await chrome.storage.local.get('proxyAppState')).proxyAppState.rules[0].id)).toBe('legacy-cors-42');
  } finally { await updating.close(); rmSync(profile, { recursive: true, force: true }); rmSync(fixture, { recursive: true, force: true }); }
});

test('keeps native toolbar colors, badges and tooltips in sync with each tab', async () => {
  const worker = await currentWorker();
  const ids: string[] = [];
  await worker.evaluate(() => {
    const native = chrome.action.setIcon.bind(chrome.action);
    (self as any).__restoreToolbarIcon = () => { chrome.action.setIcon = native; };
    (self as any).__toolbarPixels = {};
    (self as any).__toolbarMarkPixels = {};
    chrome.action.setIcon = ((...args: any[]) => {
      const details = args[0];
      const bitmap = details.imageData?.[32];
      if (bitmap && details.tabId !== undefined) {
        const index = (16 * 32 + 2) * 4;
        (self as any).__toolbarPixels[details.tabId] = Array.from(bitmap.data.slice(index, index + 4));
        (self as any).__toolbarMarkPixels[details.tabId] = [[10, 10], [23, 23], [18, 13]].map(([x, y]) => {
          const offset = (y * 32 + x) * 4;
          return Array.from(bitmap.data.slice(offset, offset + 4));
        });
      }
      return (native as any)(...args);
    }) as typeof chrome.action.setIcon;
  });
  const target = await context.newPage();
  await target.goto('http://toolbar.localhost:3000/');
  const tabId = await getTabId('http://toolbar.localhost:3000/');
  const badge = () => control.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId);
  const color = () => control.evaluate((id) => chrome.action.getBadgeBackgroundColor({ tabId: id }), tabId);
  const title = () => control.evaluate((id) => chrome.action.getTitle({ tabId: id }), tabId);
  const expectState = async (text: string, rgb: number[], heading: string) => {
    await expect.poll(badge).toBe(text);
    await expect.poll(color).toEqual([...rgb, 255]);
    await expect.poll(title).toContain(heading);
    await expect.poll(() => worker.evaluate((id) => (self as any).__toolbarPixels[id], tabId)).toEqual([...rgb, 255]);
    // Both lobes are visible, with the curved route exposing the status background.
    await expect.poll(() => worker.evaluate((id) => (self as any).__toolbarMarkPixels[id], tabId))
      .toEqual([[255, 255, 255, 255], [255, 255, 255, 255], [...rgb, 255]]);
  };
  try {
    await expectState('', [100, 116, 139], 'Tab session stopped');
    const saved = await control.evaluate(async () => chrome.runtime.sendMessage({ type: 'saveProxyRule', payload: { rule: {
      name: 'Toolbar persistent header', enabled: true,
      match: { initiatorOrigins: ['http://toolbar.localhost:3000'], urlPattern: '*' },
      actions: [{ type: 'setRequestHeaders', headers: { 'X-Toolbar': 'yes' } }],
    } } }));
    ids.push(saved.rule.id);
    await expectState('1', [37, 99, 235], '1 persistent rules enabled');
    // Hold a real attach briefly so the connecting indicator can be observed.
    await worker.evaluate(() => {
      const native = chrome.debugger.attach.bind(chrome.debugger);
      chrome.debugger.attach = (async (...args: any[]) => {
        chrome.debugger.attach = native;
        await new Promise((resolve) => setTimeout(resolve, 1500));
        return (native as any)(...args);
      }) as typeof chrome.debugger.attach;
    });
    const starting = control.evaluate((id) => chrome.runtime.sendMessage({ type: 'enableAdvancedProxy', payload: { tabId: id } }), tabId);
    await expectState('…', [180, 83, 9], 'Connecting…');
    expect((await starting).phase).toBe('connected');
    await expectState('ON', [21, 128, 61], 'Tab session active');
    const update = (delayMs: number, enabled = true) => control.evaluate(({ tabId, delayMs, enabled }) => chrome.runtime.sendMessage({
      type: 'updateQuickControls', payload: { tabId, quickControls: {
        cors: enabled, credentials: enabled, disableCache: enabled, delayMs, failure: enabled,
      } },
    }), { tabId, delayMs, enabled });
    await update(500);
    await expect.poll(title).toContain('• CORS repair · Allow credentials');
    await expect.poll(title).toContain('• Disable cache');
    await expect.poll(title).toContain('• Request delay: 500 ms');
    await expect.poll(title).toContain('• Simulate failure');
    await update(3000);
    await expect.poll(title).toContain('• Request delay: 3 s');
    expect(await title()).not.toContain('500 ms');
    // Explicitly started sessions keep recording when the last quick control is cleared.
    await update(0, false);
    await expect.poll(title).toBe('Wireflip\nTab session active\nRecording requests\n1 persistent rules enabled\nClick for session controls and group switches');
    await expectState('ON', [21, 128, 61], 'Recording requests');
    await control.evaluate((id) => chrome.runtime.sendMessage({ type: 'disableAdvancedProxy', payload: { tabId: id } }), tabId);
    await expectState('1', [37, 99, 235], 'Tab session stopped');
    // A second attach fails through the native API, exercising the red error state.
    await control.evaluate((id) => chrome.debugger.attach({ tabId: id }, '1.3'), tabId);
    const failed = await control.evaluate((id) => chrome.runtime.sendMessage({ type: 'enableAdvancedProxy', payload: { tabId: id } }), tabId);
    expect(failed.phase).toBe('error');
    await expectState('!', [220, 38, 38], 'Tab session error');
    await target.goto('http://other-toolbar.localhost:3000/');
    await expectState('', [100, 116, 139], '0 persistent rules enabled');
    const mock = await control.evaluate(async () => chrome.runtime.sendMessage({ type: 'saveProxyRule', payload: { rule: {
      name: 'Toolbar parked mock', enabled: true,
      match: { initiatorOrigins: ['http://other-toolbar.localhost:3000'], urlPattern: '*' },
      actions: [{ type: 'mockResponse', status: 200, headers: {}, body: '{}' }],
    } } }));
    ids.push(mock.rule.id);
    await expectState('', [100, 116, 139], 'Tab session stopped');
    await target.goto('http://toolbar.localhost:3000/');
    await expectState('1', [37, 99, 235], 'Tab session stopped');
    await control.evaluate(() => chrome.storage.local.set({ uiLanguage: 'zh-CN' }));
    await expect.poll(title).toContain('本页调试已停止');
    await expect.poll(title).toContain('1 条持久规则已启用');
    for (const id of ids) await control.evaluate((id) => chrome.runtime.sendMessage({ type: 'deleteProxyRule', payload: { id } }), id);
    ids.length = 0;
    await expect.poll(badge).toBe('');
  } finally {
    await worker.evaluate(() => (self as any).__restoreToolbarIcon());
    await control.evaluate((id) => chrome.runtime.sendMessage({ type: 'disableAdvancedProxy', payload: { tabId: id } }), tabId);
    for (const id of ids) await control.evaluate((id) => chrome.runtime.sendMessage({ type: 'deleteProxyRule', payload: { id } }), id);
    await control.evaluate(() => chrome.storage.local.set({ uiLanguage: 'en' }));
    await target.close();
  }
});

test('localizes all surfaces and preserves drafts and settings across language changes', async () => {
  const testInfo = test.info();
  await control.evaluate(() => chrome.storage.local.set({ uiLanguage: 'en' }));
  await control.reload();
  await control.setViewportSize({ width: 1440, height: 900 });
  const original = await control.evaluate(async () => (await chrome.storage.local.get('proxyAppState')).proxyAppState);
  await control.getByRole('button', { name: 'New rule', exact: true }).click();
  const draftName = '用户 $& / custom draft';
  await control.getByRole('textbox', { name: 'Name', exact: true }).fill(draftName);
  await control.getByRole('button', { name: 'Settings', exact: true }).click();
  await control.getByRole('combobox', { name: 'Language', exact: true }).click();
  await control.getByRole('option', { name: '简体中文', exact: true }).click();
  await expect(control.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await control.keyboard.press('Escape');
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/src/popup/index.html`);
  await popup.setViewportSize({ width: 360, height: 800 });
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`);
  await panel.setViewportSize({ width: 420, height: 900 });
  try {
    for (const locale of ['en', 'zh-CN', 'ko', 'ja', 'fr', 'es']) {
      await control.evaluate((uiLanguage) => chrome.storage.local.set({ uiLanguage }), locale);
      for (const page of [control, popup, panel]) await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(control.getByRole('textbox', { name: messages.Name[locale], exact: true })).toHaveValue(draftName);
      await expect(popup.getByText(messages['Temporary changes'][locale], { exact: true })).toBeVisible();
      await expect(panel.getByText(messages['Tab session stopped'][locale], { exact: true })).toBeVisible();
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
    expect(await control.evaluate(async () => (await chrome.storage.local.get('proxyAppState')).proxyAppState)).toEqual(original);
    await control.reload();
    await expect(control.locator('html')).toHaveAttribute('lang', 'es');
    await control.getByRole('button', { name: messages.Settings.es, exact: true }).click();
    await expect(control.getByRole('combobox', { name: messages.Language.es, exact: true })).toContainText('Español');
  } finally {
    await control.evaluate(() => chrome.storage.local.set({ uiLanguage: 'en' }));
    await popup.close(); await panel.close();
    await control.setViewportSize({ width: 1440, height: 900 });
    await control.reload();
  }
});

test('migrates v1 storage once and keeps a recovery snapshot', async () => {
  expect(extensionId).toBe('knhlkjdfmgkmelcjfnbbhpphkmjjacng');
  await expect.poll(async () => control.evaluate(async () => {
    const values = await chrome.storage.local.get('proxyAppState');
    return values.proxyAppState?.schemaVersion;
  })).toBe(2);
  await control.evaluate(async () => {
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
    // Publish legacy input before removing v2: open UI listeners may immediately request migration.
    await chrome.storage.local.remove(['proxyAppState', 'legacyBackupV1']);
  });
  await context.close();
  await launchContext();
  await expect.poll(async () => control.evaluate(async () => {
    const values = await chrome.storage.local.get(['proxyAppState', 'legacyBackupV1']);
    return {
      schema: values.proxyAppState?.schemaVersion,
      ruleId: values.proxyAppState?.rules?.[0]?.id,
      maxRules: values.proxyAppState?.settings?.maxRules,
      backupRuleId: values.legacyBackupV1?.allowedOrigins?.[0]?.id,
    };
  })).toEqual({ schema: 2, ruleId: 'legacy-cors-9', maxRules: 250, backupRuleId: 9 });

  await control.evaluate(async () => {
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
  await expect.poll(async () => control.evaluate(async () => {
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
  await expect(control.getByRole('heading', { name: 'Wireflip' })).toBeVisible();
  await expect(control.getByRole('button', { name: 'Rules', exact: true })).toBeVisible();
  await control.getByRole('button', { name: 'New rule' }).click();
  await expect(control.getByLabel('Page origins')).toHaveValue('');
  await expect(control.getByLabel('URL pattern')).toHaveValue('');
  await control.getByLabel('Name', { exact: true }).fill('Resource picker QA');
  await control.getByLabel('Page origins').fill('http://test.localhost:3000');
  await control.getByLabel('URL pattern').fill('*://test.localhost:3000/*');
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
  await control.screenshot({ path: 'test-results/wireflip-options.png', fullPage: true });

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
  await expect(popup.getByRole('heading', { name: 'Wireflip' })).toBeVisible();
  await popup.screenshot({ path: 'test-results/wireflip-popup.png', fullPage: true });
  await popup.close();

  const inspector = await context.newPage();
  await inspector.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html?tabId=${inspectedTabId}`);
  await expect(inspector.getByRole('heading', { name: 'Inspector' })).toBeVisible();
  await expect(inspector.getByText('http://test.localhost:3000', { exact: true })).toBeVisible();
  const inspectorToggle = inspector.getByRole('button', { name: /^(Start|Stop) tab session$/ });
  await expect(inspectorToggle).toBeEnabled();
  await inspectorToggle.click();
  await expect(inspectorToggle).toHaveText('Stop tab session');
  await inspectorToggle.click();
  await expect(inspectorToggle).toHaveText('Start tab session');
  await inspector.setViewportSize({ width: 420, height: 820 });
  await inspector.screenshot({ path: 'test-results/wireflip-inspector.png', fullPage: true });
  await inspector.close();
  await inspectedTab.close();
});

test('keeps compact workspace actions accessible on desktop and narrow windows', async () => {
  const testInfo = test.info();
  await control.reload();
  const errors: string[] = [];
  const onError = (error: Error) => errors.push(error.message);
  control.on('pageerror', onError);
  try {
    await control.setViewportSize({ width: 1280, height: 800 });
    // Scope by stable landmarks: their accessible labels change with the language.
    const navigation = control.getByRole('navigation');
    const list = control.getByRole('complementary');
    await expect(navigation).toHaveAttribute('aria-label', 'Workspace navigation');
    await expect(list).toHaveAttribute('aria-label', 'Rule list');
    await expect(navigation.getByRole('heading', { name: 'Wireflip' })).toBeVisible();
    await expect(list.getByRole('button', { name: 'New rule', exact: true })).toBeVisible();
    const header = control.locator('[data-workspace-header]');
    await expect(header.getByRole('heading', { name: 'Rules', exact: true })).toBeVisible();
    expect((await header.boundingBox())!.height).toBe(44);
    expect((await list.boundingBox())!.y).toBe(44);
    expect((await list.boundingBox())!.height).toBe(756);
    const settings = navigation.getByRole('button', { name: 'Settings', exact: true });
    expect((await settings.boundingBox())!.y).toBeGreaterThan(740);
    await list.getByRole('button', { name: 'New rule', exact: true }).click();
    await control.getByLabel('Name', { exact: true }).fill('Compact workspace draft');
    await expect(header.getByRole('heading', { name: 'Compact workspace draft', exact: true })).toBeVisible();
    await expect(header.getByText('Unsaved', { exact: true })).toBeVisible();
    await expect(header.getByRole('button', { name: 'Save rule', exact: true })).toBeVisible();
    await expect(control.getByRole('region', { name: 'Rule editor' }).getByRole('button', { name: 'Save rule', exact: true })).toHaveCount(0);
    const nameBox = (await control.getByLabel('Name', { exact: true }).boundingBox())!;
    const groupBox = (await control.getByLabel('Group', { exact: true }).boundingBox())!;
    expect(groupBox.y).toBe(nameBox.y);
    expect(groupBox.x).toBeGreaterThan(nameBox.x + nameBox.width);
    await list.getByRole('button', { name: 'New rule', exact: true }).click();
    await expect(control.getByRole('dialog', { name: 'Discard unsaved changes?' })).toBeVisible();
    await control.getByRole('button', { name: 'Keep editing' }).click();
    await expect(control.getByLabel('Name', { exact: true })).toHaveValue('Compact workspace draft');
    await control.screenshot({ path: testInfo.outputPath('workspace-desktop.png') });
    for (const width of [900, 390]) {
      await control.setViewportSize({ width, height: 844 });
      await expect(control.getByRole('button', { name: 'Save rule', exact: true })).toBeVisible();
      await navigation.getByRole('button', { name: 'Data & migration' }).click();
      await control.getByRole('button', { name: 'Keep editing' }).click();
      await expect(control.getByLabel('Name', { exact: true })).toHaveValue('Compact workspace draft');
      await control.keyboard.press('Control+k');
      if (width < 768) {
        await control.getByRole('button', { name: 'Keep editing' }).click();
        await expect(control.getByLabel('Name', { exact: true })).toHaveValue('Compact workspace draft');
      } else await expect(control.getByLabel('Search rules')).toBeFocused();
      expect(await control.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await control.screenshot({ path: testInfo.outputPath(`workspace-editor-${width}.png`) });
    }
    for (const locale of ['en', 'zh-CN', 'ko', 'ja', 'fr', 'es']) {
      await control.evaluate((uiLanguage) => chrome.storage.local.set({ uiLanguage }), locale);
      await expect(control.locator('html')).toHaveAttribute('lang', locale);
      await expect(header.getByRole('button', { name: messages['Save rule'][locale], exact: true })).toBeVisible();
      await expect(header.getByRole('heading', { name: 'Compact workspace draft', exact: true })).toBeVisible();
      await expect(navigation.getByText(messages.Data[locale], { exact: true })).toBeVisible();
      expect(await control.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${locale} editor`).toBe(true);
    }
    await control.evaluate(() => chrome.storage.local.set({ uiLanguage: 'en' }));
    await expect(control.locator('html')).toHaveAttribute('lang', 'en');
    await control.getByRole('button', { name: 'Back to rules' }).click();
    await control.getByRole('button', { name: 'Discard changes', exact: true }).click();
    await expect(list.getByRole('button', { name: 'New rule', exact: true })).toBeVisible();
    await expect(header.getByRole('heading', { name: 'Rules', exact: true })).toBeVisible();
    await expect(header.getByRole('button', { name: 'Save rule', exact: true })).toHaveCount(0);
    // Preferences remain reachable from the settings icon in narrow windows.
    await settings.click();
    const language = control.getByRole('combobox', { name: 'Language', exact: true });
    await language.click();
    await control.getByRole('option', { name: 'Español', exact: true }).click();
    await expect(control.locator('html')).toHaveAttribute('lang', 'es');
    await expect(control.getByRole('combobox', { name: messages.Language.es, exact: true })).toContainText('Español');
    await control.keyboard.press('Escape');
    await control.screenshot({ path: testInfo.outputPath('workspace-list-narrow-es.png') });
    for (const locale of ['en', 'zh-CN', 'ko', 'ja', 'fr', 'es']) {
      await control.evaluate((uiLanguage) => chrome.storage.local.set({ uiLanguage }), locale);
      await expect(control.locator('html')).toHaveAttribute('lang', locale);
      await expect(list.getByRole('button', { name: messages['New rule'][locale], exact: true })).toBeVisible();
      expect(await control.evaluate(() => document.documentElement.scrollWidth <= innerWidth), locale).toBe(true);
    }
    await control.evaluate(() => chrome.storage.local.set({ uiLanguage: 'en' }));
    await expect(control.locator('html')).toHaveAttribute('lang', 'en');
    await navigation.getByRole('button', { name: 'Data & migration' }).click();
    await expect(control.getByRole('region', { name: 'Data management' })).toBeVisible();
    await expect(header.getByRole('heading', { name: 'Data & recovery' })).toBeVisible();
    await expect(header.getByRole('button', { name: 'Save rule', exact: true })).toHaveCount(0);
    await navigation.getByRole('button', { name: 'Rules', exact: true }).click();
    await list.getByRole('button', { name: 'New rule', exact: true }).click();
    await expect(control.getByLabel('Name', { exact: true })).toHaveValue('New proxy rule');
    await control.getByRole('button', { name: 'Back to rules' }).click();
    expect(errors).toEqual([]);
  } finally {
    control.off('pageerror', onError);
    await control.evaluate(() => chrome.storage.local.set({ uiLanguage: 'en' }));
    await control.setViewportSize({ width: 1280, height: 720 });
  }
});

test('persists appearance settings, follows the system and syncs every extension surface', async () => {
  const testInfo = test.info();
  await control.reload();
  const original = await control.evaluate(async () => (await chrome.storage.local.get('uiTheme')).uiTheme);
  const rules = await control.evaluate(async () => (await chrome.storage.local.get('proxyAppState')).proxyAppState);
  const popup = await context.newPage();
  const panel = await context.newPage();
  const pages = [control, popup, panel];
  const errors: string[] = [];
  const onError = (error: Error) => errors.push(error.message);
  pages.forEach((page) => page.on('pageerror', onError));
  try {
    await popup.goto(`chrome-extension://${extensionId}/src/popup/index.html`);
    await panel.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`);
    await control.setViewportSize({ width: 390, height: 844 });
    await control.getByRole('button', { name: 'New rule', exact: true }).click();
    await control.getByLabel('Name', { exact: true }).fill('Preferences preserve this draft');
    const settings = control.getByRole('button', { name: 'Settings', exact: true });
    await settings.click();
    const menu = control.locator('[data-slot=popover-content]');
    const choose = async (label: string) => {
      await menu.getByRole('combobox', { name: 'Theme', exact: true }).click();
      await control.getByRole('option', { name: label, exact: true }).click();
    };
    const check = async (dark: boolean) => {
      for (const page of pages) await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(dark);
      await expect(control.getByLabel('Name', { exact: true })).toHaveValue('Preferences preserve this draft');
    };
    await choose('Dark');
    await check(true);
    expect(await control.evaluate(() => document.documentElement.style.colorScheme)).toBe('dark');
    expect(await control.evaluate(async () => (await chrome.storage.local.get('uiTheme')).uiTheme)).toBe('dark');
    await control.screenshot({ path: testInfo.outputPath('settings-dark-narrow.png') });
    for (const page of pages) await page.emulateMedia({ colorScheme: 'dark' });
    await choose('Light');
    await check(false);
    await choose('Follow system');
    await check(true);
    for (const page of pages) await page.emulateMedia({ colorScheme: 'light' });
    await check(false);
    await choose('Dark');
    for (const locale of ['en', 'zh-CN', 'ko', 'ja', 'fr', 'es']) {
      await control.evaluate((uiLanguage) => chrome.storage.local.set({ uiLanguage }), locale);
      await expect(control.locator('html')).toHaveAttribute('lang', locale);
      await expect(menu.getByRole('combobox', { name: messages.Language[locale], exact: true })).toBeVisible();
      await expect(menu.getByRole('combobox', { name: messages.Theme[locale], exact: true })).toContainText(messages.Dark[locale]);
      const bounds = (await menu.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(844);
      expect(await control.evaluate(() => document.documentElement.scrollWidth <= innerWidth), locale).toBe(true);
    }
    await control.evaluate(() => chrome.storage.local.set({ uiLanguage: 'en' }));
    await expect(control.locator('html')).toHaveAttribute('lang', 'en');
    await control.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(settings).toBeFocused();
    await settings.click();
    await expect(menu.getByRole('combobox', { name: 'Theme', exact: true })).toContainText('Dark');
    await control.getByLabel('Name', { exact: true }).click();
    await expect(menu).toHaveCount(0);
    await control.getByRole('button', { name: 'Back to rules' }).click();
    await control.getByRole('button', { name: 'Discard changes', exact: true }).click();
    await control.reload();
    await expect(control.locator('html')).toHaveAttribute('data-theme', 'dark');
    await settings.click();
    await expect(menu.getByRole('combobox', { name: 'Theme', exact: true })).toContainText('Dark');
    expect(await control.evaluate(async () => (await chrome.storage.local.get('proxyAppState')).proxyAppState)).toEqual(rules);
    expect(errors).toEqual([]);
  } finally {
    pages.forEach((page) => page.off('pageerror', onError));
    await popup.close(); await panel.close();
    await control.emulateMedia({ colorScheme: null });
    await control.evaluate(async (uiTheme) => {
      await chrome.storage.local.set({ uiLanguage: 'en' });
      if (uiTheme === undefined) await chrome.storage.local.remove('uiTheme');
      else await chrome.storage.local.set({ uiTheme });
    }, original);
    await control.setViewportSize({ width: 1280, height: 720 });
    await control.reload();
  }
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
  await control.screenshot({ path: 'test-results/wireflip-workspace.png', fullPage: true });
  await control.getByRole('button', { name: 'Data & migration' }).click();
  const before = await control.evaluate(async () => (await chrome.storage.local.get('proxyAppState')).proxyAppState);
  const incoming = structuredClone(before);
  incoming.rules = [{ ...incoming.rules[0], id: 'import-preview-qa', source: 'user', legacyRuleId: undefined, name: 'Imported QA', enabled: false }];
  incoming.profiles = []; // The synthetic backup contains one ungrouped rule, not the original memberships.
  await control.locator('#import-state').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ version: '2.0', state: incoming })) });
  await expect(control.getByRole('region', { name: 'Import preview' })).toContainText('1 added');
  expect(await control.evaluate(async () => (await chrome.storage.local.get('proxyAppState')).proxyAppState)).toEqual(before);
  await control.getByLabel('Import mode').click();
  await control.getByRole('option', { name: 'Replace configuration' }).click();
  await expect(control.getByRole('region', { name: 'Import preview' })).toContainText(`${before.rules.length} removed`);
  await control.getByLabel('Import mode').click();
  await control.getByRole('option', { name: 'Merge rules' }).click();
  await control.getByRole('button', { name: 'Apply import' }).click();
  await expect(control.getByText(/Import completed/)).toBeVisible();
  const after = await control.evaluate(async () => chrome.storage.local.get(['proxyAppState', 'preImportBackup']));
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
  const actions = control.locator('[data-workspace-header]').getByRole('button', { name: 'More actions', exact: true });
  await expect(control.getByRole('menuitem', { name: 'Duplicate rule', exact: true })).toHaveCount(0);
  await captureUX(control, 'candidate-workspace-desktop');
  await actions.focus();
  await control.keyboard.press('ArrowDown');
  await expect(control.getByRole('menuitem', { name: 'Duplicate rule', exact: true })).toBeFocused();
  await captureUX(control, 'candidate-rule-actions');
  await control.keyboard.press('Escape');
  await expect(actions).toBeFocused();
  await actions.click();
  await control.getByRole('menuitem', { name: 'Duplicate rule', exact: true }).click();
  await expect(control.getByLabel('Name', { exact: true })).toHaveValue('Workspace QA edited copy');
  await expect(control.getByRole('switch', { name: 'Rule enabled', exact: true })).not.toBeChecked();
  await control.getByRole('button', { name: 'Save rule', exact: true }).click();
  await expect(control.getByRole('button', { name: 'Edit Workspace QA edited copy', exact: true })).toBeVisible();
  await control.setViewportSize({ width: 390, height: 844 });
  await expect(control.getByLabel('Search rules')).not.toBeVisible();
  await expect(control.getByLabel('Name', { exact: true })).toBeVisible();
  expect(await control.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await control.screenshot({ path: 'test-results/workspace-narrow-editor.png', fullPage: true, animations: 'disabled' });
  await captureUX(control, 'candidate-workspace-mobile');
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
  await expect(panel.getByRole('heading', { name: 'Inspector' })).toBeVisible();
  await panel.getByRole('button', { name: /^(Start|Stop) tab session$/ }).click();
  await expect(panel.getByRole('button', { name: /^(Start|Stop) tab session$/ })).toHaveText('Stop tab session');
  const fetchHealth = () => target.evaluate(async () => {
    const response = await fetch('/health');
    return { status: response.status, body: await response.json() };
  });
  expect((await fetchHealth()).body.data.status).toBe('healthy');
  await panel.getByRole('button', { name: /GET.*console.localhost:3000\/health/ }).first().click();
  await panel.getByRole('button', { name: 'Mock', exact: true }).click();
  await expect(panel.getByRole('dialog')).toBeVisible();
  await panel.setViewportSize({ width: 390, height: 650 });
  await expect.poll(async () => {
    const bounds = await panel.getByRole('button', { name: 'Save rule', exact: true }).boundingBox();
    return !!bounds && bounds.y >= 0 && bounds.y + bounds.height <= 650;
  }).toBe(true);
  await panel.getByText('Request matching', { exact: true }).click();
  await expect(panel.getByLabel('Page origins')).toHaveValue('http://console.localhost:3000');
  await panel.getByLabel('Name', { exact: true }).fill('Console mock QA');
  await panel.getByLabel('HTTP status', { exact: true }).fill('201');
  await panel.getByLabel('Response body', { exact: true }).fill('{"source":"sidepanel"}');
  const bodyEditor = panel.getByLabel('Response body', { exact: true });
  await panel.getByRole('button', { name: 'Format JSON', exact: true }).click();
  await expect(bodyEditor).toHaveValue('{\n  "source": "sidepanel"\n}');
  // Native editing commands preserve undo even though syntax colors are overlaid.
  await bodyEditor.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  await expect(bodyEditor).toHaveValue('{"source":"sidepanel"}');
  await bodyEditor.press('Alt+Shift+f');
  await expect(bodyEditor).toHaveValue('{\n  "source": "sidepanel"\n}');
  await panel.getByRole('button', { name: 'Save rule', exact: true }).click();
  await panel.setViewportSize({ width: 420, height: 820 });
  await panel.getByRole('tab', { name: /^Rules \(/ }).click();
  await expect(panel.getByRole('switch', { name: 'Enable Console mock QA' })).toBeChecked();
  await panel.getByRole('tab', { name: /^Requests \(/ }).click();
  await expect(panel.getByText('Saved. Trigger the request again on the page to verify it.', { exact: true })).toBeVisible();
  await expect.poll(fetchHealth).toEqual({ status: 201, body: { source: 'sidepanel' } });
  await panel.getByRole('button', { name: 'View request', exact: true }).click();
  await panel.getByRole('button', { name: /GET.*console.localhost:3000\/health/ }).first().click();
  await expect(panel.getByText('Local mock', { exact: true })).toBeVisible();
  await expect(panel.getByText(/HTTP 201;.*server not contacted/)).toBeVisible();
  await panel.screenshot({ path: '/tmp/wireflip-site-controls-mock.png', fullPage: true });
  await panel.getByRole('tab', { name: /^Rules \(/ }).click();
  await panel.getByRole('switch', { name: 'Enable Console mock QA' }).click();
  await panel.getByRole('tab', { name: /^Requests \(/ }).click();
  await expect.poll(async () => (await fetchHealth()).body.data?.status).toBe('healthy');
  await panel.getByRole('button', { name: /GET.*console.localhost:3000\/health/ }).first().click();
  await panel.getByText('Check against current rules', { exact: true }).click();
  await expect(panel.locator('div').filter({ hasText: /^Console mock QARule is disabled$/ })).toBeVisible();
  // Edit within the same side-panel dialog, then verify the next real response.
  await panel.getByRole('tab', { name: /^Rules \(/ }).click();
  await panel.getByRole('button', { name: 'Console mock QA', exact: true }).first().click();
  await expect(panel.getByRole('heading', { name: 'Edit proxy rule' })).toBeVisible();
  await panel.getByLabel('HTTP status', { exact: true }).fill('202');
  await panel.getByLabel('Response body', { exact: true }).fill('{"source":"edited"}');
  await panel.getByRole('button', { name: 'Save rule', exact: true }).click();
  await panel.getByRole('tab', { name: /^Rules \(/ }).click();
  await panel.getByRole('switch', { name: 'Enable Console mock QA' }).click();
  await panel.getByRole('tab', { name: /^Requests \(/ }).click();
  await expect.poll(fetchHealth).toEqual({ status: 202, body: { source: 'edited' } });
  expect(await panel.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await panel.getByRole('tab', { name: /^Rules \(/ }).click();
  await panel.getByRole('switch', { name: 'Enable Console mock QA' }).click();
  await panel.getByRole('tab', { name: /^Requests \(/ }).click();
  await panel.getByRole('button', { name: /^(Start|Stop) tab session$/ }).click();
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
      if (event.data?.type !== 'wireflip:sdk-response'
        || event.data.clientId !== clientId
        || event.data.id !== id) return;
      clearTimeout(timer);
      window.removeEventListener('message', listener);
      resolve(event.data);
    };
    window.addEventListener('message', listener);
    window.postMessage({
      type: 'wireflip:sdk-request',
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
      product: 'Wireflip',
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
  expect(enabled.error).toBeUndefined();
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
  // Keep migrated site rules and previous preflight caches out of this baseline.
  const origin = `http://preflight-${test.info().workerIndex}-${test.info().retry}.localhost:3000`;
  await target.goto(`${origin}/`);
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

  const tabId = await getTabId(`${origin}/`);
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
          body: '{"source":"wireflip"}',
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
  expect(result).toEqual({ status: 202, body: { source: 'wireflip' } });

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

test('cancels a pending attachment when its tab navigates to another origin', async () => {
  const target = await context.newPage();
  await target.goto('http://attach-race.localhost:3000/');
  const tabId = await getTabId('http://attach-race.localhost:3000/');
  const worker = await currentWorker();
  const saved = await control.evaluate(async () => chrome.runtime.sendMessage({ type: 'saveProxyRule', payload: { rule: {
    name: 'Pending origin regression', enabled: true,
    match: { initiatorOrigins: ['http://attach-race.localhost:3000'], urlPattern: '*' },
    actions: [{ type: 'mockResponse', status: 200, headers: {}, body: '{"wrongOrigin":true}' }],
  } } }));
  await worker.evaluate(() => {
    const native = chrome.debugger.attach.bind(chrome.debugger);
    (self as any).__restoreRaceAttach = () => { chrome.debugger.attach = native; };
    chrome.debugger.attach = (async (...args: any[]) => {
      chrome.debugger.attach = native;
      await new Promise<void>((resolve) => { (self as any).__releaseRaceAttach = resolve; });
      return (native as any)(...args);
    }) as typeof chrome.debugger.attach;
  });
  const starting = control.evaluate(async (id) => chrome.runtime.sendMessage({ type: 'enableAdvancedProxy', payload: { tabId: id } }), tabId);
  try {
    await expect.poll(() => worker.evaluate(() => typeof (self as any).__releaseRaceAttach)).toBe('function');
    await target.goto('http://other-attach.localhost:3000/');
    await worker.evaluate(() => (self as any).__releaseRaceAttach());
    expect((await starting).phase).toBe('disabled');
    await expect.poll(() => control.evaluate(async (id) => chrome.runtime.sendMessage({ type: 'getAdvancedProxyStatus', payload: { tabId: id } }), tabId))
      .toMatchObject({ phase: 'disabled' });
    expect(await target.evaluate(async () => (await fetch('/api/headers-echo')).json())).not.toHaveProperty('wrongOrigin');
  } finally {
    await worker.evaluate(() => {
      (self as any).__restoreRaceAttach?.(); (self as any).__releaseRaceAttach?.();
      delete (self as any).__restoreRaceAttach; delete (self as any).__releaseRaceAttach;
    });
    await starting.catch(() => undefined);
    await control.evaluate(async (id) => chrome.runtime.sendMessage({ type: 'deleteProxyRule', payload: { id } }), saved.rule.id);
    await target.close();
  }
});

test('executes redirect and headers together without changing direct destination requests', async () => {
  const target = await context.newPage();
  await target.goto('http://combo.localhost:3000/');
  const tabId = await getTabId('http://combo.localhost:3000/');
  const saved = await control.evaluate(async () => chrome.runtime.sendMessage({ type: 'saveProxyRule', payload: { rule: {
    name: 'Redirect with headers', enabled: true,
    match: { initiatorOrigins: ['http://combo.localhost:3000'], urlPattern: 'http://combo.localhost:3000/api/users/1' },
    actions: [{ type: 'redirect', url: 'http://combo.localhost:3000/api/headers-echo' },
      { type: 'setRequestHeaders', headers: { 'X-Wireflip-Combo': 'staging' } },
      { type: 'setResponseHeaders', headers: { 'X-Wireflip-Result': 'patched' } }],
  } } }));
  const fetchResult = (url: string) => target.evaluate(async (url) => {
    const response = await fetch(url);
    return { body: await response.json(), header: response.headers.get('X-Wireflip-Result') };
  }, url);
  try {
    expect((await fetchResult('/api/users/1')).body.data).not.toHaveProperty('headers');
    expect((await control.evaluate(async (id) => chrome.runtime.sendMessage({ type: 'enableAdvancedProxy', payload: { tabId: id } }), tabId)).phase).toBe('connected');
    const redirected = await fetchResult('/api/users/1');
    expect(redirected.body.data.headers['x-wireflip-combo']).toBe('staging');
    expect(redirected.header).toBe('patched');
    const direct = await fetchResult('/api/headers-echo');
    expect(direct.body.data.headers['x-wireflip-combo']).toBeUndefined();
    expect(direct.header).toBeNull();
    await control.evaluate(async (id) => chrome.runtime.sendMessage({ type: 'disableAdvancedProxy', payload: { tabId: id } }), tabId);
    expect((await fetchResult('/api/users/1')).body.data).not.toHaveProperty('headers');
  } finally {
    await control.evaluate(async (id) => chrome.runtime.sendMessage({ type: 'deleteProxyRule', payload: { id } }), saved.rule.id);
    await target.close();
  }
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
  const before = await control.evaluate(async () => (await chrome.storage.local.get('proxyAppState')).proxyAppState);
  const popup = await context.newPage();
  const errors: string[] = [];
  popup.on('pageerror', (error) => errors.push(error.message));
  popup.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  const popupUrl = `chrome-extension://${extensionId}/src/popup/index.html?tabId=${tabId}`;
  await popup.goto(popupUrl);
  await popup.setViewportSize({ width: 360, height: 600 });
  await expect(popup).toHaveTitle(/Wireflip/);
  await expect(popup.getByText('http://popup.localhost:3000', { exact: true })).toBeVisible();
  await expect(popup.getByRole('button', { name: 'Open Inspector' })).toBeEnabled();
  await popup.getByRole('button', { name: 'Start tab session' }).click();
  await expect(popup.getByText('Tab session active', { exact: true })).toBeVisible();
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
  expect(await control.evaluate(async () => (await chrome.storage.local.get('proxyAppState')).proxyAppState)).toEqual(before);
  await popup.getByRole('button', { name: 'Stop tab session' }).click();
  for (const name of ['CORS repair', 'Request delay', 'Simulate failure']) await expect(popup.getByRole('switch', { name, exact: true })).not.toBeChecked();
  expect(await crossRequest()).toBe(false);
  expect(await target.evaluate(async () => (await fetch('/health')).ok)).toBe(true);

  await popup.getByRole('button', { name: 'Start tab session', exact: true }).click();
  await popup.getByRole('switch', { name: 'Request delay', exact: true }).click();
  await popup.getByRole('button', { name: 'Reset temporary changes', exact: true }).click();
  await expect(popup.getByRole('switch', { name: 'Request delay', exact: true })).not.toBeChecked();
  await expect(popup.getByText('Tab session active', { exact: true })).toBeVisible();
  expect(await control.evaluate(async () => (await chrome.storage.local.get('proxyAppState')).proxyAppState)).toEqual(before);
  await popup.getByRole('button', { name: 'Stop tab session' }).click();

  // Pinning is metadata; enabling a saved rule persists across stopping/reopening.
  await popup.getByText('Choose pinned rules', { exact: true }).click();
  await popup.getByRole('button', { name: 'Pin Popup header preset', exact: true }).click();
  await expect(popup.locator('details').filter({ has: popup.getByText('Choose pinned rules', { exact: true }) })).not.toHaveAttribute('open');
  await expect(popup.getByRole('switch', { name: 'Popup header preset', exact: true })).toBeVisible();
  await popup.getByRole('switch', { name: 'Popup header preset', exact: true }).click();
  await expect(popup.getByRole('switch', { name: 'Popup header preset', exact: true })).toBeChecked();
  await expect.poll(() => target.evaluate(async () => (await fetch('/health')).headers.get('X-Popup-Preset'))).toBe('enabled');
  await popup.reload();
  await expect(popup.getByRole('switch', { name: 'Popup header preset', exact: true })).toBeChecked();
  await popup.getByRole('switch', { name: 'Request delay', exact: true }).click();
  await expect(popup.getByText('Tab session active', { exact: true })).toBeVisible();
  await popup.getByRole('button', { name: 'Stop tab session' }).click();
  await expect(popup.getByRole('switch', { name: 'Popup header preset', exact: true })).toBeChecked();
  await expect(popup.getByText('1 persistent rules stay on after stopping', { exact: true })).toBeVisible();
  expect(await target.evaluate(async () => (await fetch('/health')).headers.get('X-Popup-Preset'))).toBe('enabled');
  await popup.evaluate(() => window.scrollTo(0, 0));
  await expect(popup.getByRole('switch', { name: 'Request delay', exact: true })).not.toBeChecked();
  await popup.setViewportSize({ width: 360, height: Math.ceil((await popup.locator('main').boundingBox())!.height) });
  await popup.screenshot({ path: '/tmp/wireflip-popup-en.png', fullPage: true, animations: 'disabled' });
  await popup.setViewportSize({ width: 360, height: 600 });
  for (const locale of ['en', 'zh-CN', 'ko', 'ja', 'fr', 'es']) {
    await control.evaluate((uiLanguage) => chrome.storage.local.set({ uiLanguage }), locale);
    await expect(popup.locator('html')).toHaveAttribute('lang', locale);
    expect(await popup.evaluate(() => document.documentElement.scrollWidth <= innerWidth), locale).toBe(true);
    expect(await popup.locator('main').evaluate((element) => element.scrollHeight), `${locale} compact height`).toBeLessThanOrEqual(560);
    await expect(popup.getByRole('switch', { name: messages['Allow credentials'][locale], exact: true })).toBeVisible();
    await expect(popup.getByRole('switch', { name: messages['CORS repair'][locale], exact: true })).toBeVisible();
  }
  await control.evaluate(() => chrome.storage.local.set({ uiLanguage: 'zh-CN' }));
  await expect(popup.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await popup.setViewportSize({ width: 360, height: Math.ceil((await popup.locator('main').boundingBox())!.height) });
  await popup.screenshot({ path: '/tmp/wireflip-popup-zh.png', fullPage: true, animations: 'disabled' });
  await popup.setViewportSize({ width: 360, height: 600 });
  await control.evaluate(() => chrome.storage.local.set({ uiLanguage: 'en' }));
  await expect(popup.locator('html')).toHaveAttribute('lang', 'en');
  await popup.getByRole('switch', { name: 'Simulate failure', exact: true }).click();
  await expect(popup.getByRole('switch', { name: 'Simulate failure', exact: true })).toBeChecked();
  await target.goto('http://elsewhere.localhost:3000/');
  await expect(popup.getByText('http://elsewhere.localhost:3000', { exact: true })).toBeVisible();
  await expect(popup.getByRole('switch', { name: 'Simulate failure', exact: true })).not.toBeChecked();
  expect(errors).toEqual([]);
  await control.evaluate(async (id) => chrome.runtime.sendMessage({ type: 'deleteProxyRule', payload: { id } }), saved.rule.id);
  await control.evaluate(() => chrome.storage.local.remove('popupPinnedRuleIds'));
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
  const read = (page: Page, url: string) => test.step(`Read cache fixture ${url}`, () => page.evaluate(async (path) => (await fetch(path, { signal: AbortSignal.timeout(10_000) })).text(), url), { timeout: 15_000 });
  try {
    await target.goto(`${origin}/#target`);
    await other.goto(`${origin}/#other`);
    const tabId = await getTabId(`${origin}/#target`);
    const toolbarTitle = () => control.evaluate((id) => chrome.action.getTitle({ tabId: id }), tabId);
    const toolbarBadge = () => control.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId);
    expect(await read(target, '/asset')).toBe('1');
    expect(await read(target, '/asset')).toBe('1');
    expect(await read(other, '/other')).toBe('1');
    await popup.goto(`chrome-extension://${extensionId}/src/popup/index.html?tabId=${tabId}`);
    await popup.getByRole('switch', { name: 'Disable cache', exact: true }).click();
    await expect(popup.getByRole('switch', { name: 'Disable cache', exact: true })).toBeChecked();
    await expect.poll(toolbarBadge).toBe('ON');
    await expect.poll(toolbarTitle).toBe('Wireflip\nTab session active\nNot recording requests\nThis tab · temporary\n• Disable cache\n0 persistent rules enabled\nClick for session controls and group switches');
    await control.evaluate(() => chrome.storage.local.set({ uiLanguage: 'zh-CN' }));
    await expect.poll(toolbarTitle).toContain('未开启请求记录\n当前页 · 临时\n• 禁用缓存');
    await control.evaluate(() => chrome.storage.local.set({ uiLanguage: 'en' }));
    await expect(popup.locator('html')).toHaveAttribute('lang', 'en');
    expect(await read(target, '/asset')).toBe('2');
    expect(await read(target, '/asset')).toBe('3');
    await target.reload();
    expect(await read(target, '/asset')).toBe('4');
    expect(await read(other, '/other')).toBe('1');
    await popup.reload();
    await expect(popup.getByRole('switch', { name: 'Disable cache', exact: true })).toBeChecked();
    await popup.getByRole('switch', { name: 'Disable cache', exact: true }).click();
    await expect(popup.getByRole('switch', { name: 'Disable cache', exact: true })).not.toBeChecked();
    await expect(popup.getByText('Tab session stopped', { exact: true })).toBeVisible();
    await expect.poll(toolbarBadge).toBe('');
    await expect.poll(toolbarTitle).toBe('Wireflip\nTab session stopped\n0 persistent rules enabled\nClick for session controls and group switches');
    // getTargets().attached also sees Playwright's own connection. Verify this extension's access.
    await expect.poll(() => control.evaluate(async (id) => {
      try {
        await chrome.debugger.sendCommand({ tabId: id }, 'Runtime.getIsolateId');
        return 'extension-still-attached';
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    }, tabId)).toMatch(/not attached/i);
    const restored = await read(target, '/restored');
    expect(await read(target, '/restored')).toBe(restored);
    await popup.getByRole('switch', { name: 'Disable cache', exact: true }).click();
    await expect(popup.getByRole('switch', { name: 'Disable cache', exact: true })).toBeChecked();
    await popup.getByRole('button', { name: 'Stop tab session' }).click();
    await expect(popup.getByRole('switch', { name: 'Disable cache', exact: true })).not.toBeChecked();
    const stopped = await read(target, '/stopped');
    expect(await read(target, '/stopped')).toBe(stopped);
    // Origin changes detach the session and restore caching as well.
    await popup.getByRole('switch', { name: 'Disable cache', exact: true }).click();
    await expect(popup.getByRole('switch', { name: 'Disable cache', exact: true })).toBeChecked();
    await target.goto('http://localhost:3000/');
    await expect(popup.getByRole('switch', { name: 'Disable cache', exact: true })).not.toBeChecked();
    await expect.poll(toolbarTitle).not.toContain('Disable cache');
    await target.goto(origin);
    const navigated = await read(target, '/navigated');
    expect(await read(target, '/navigated')).toBe(navigated);
  } finally {
    // Close fixture sockets before browser cleanup, including pending or keep-alive requests.
    const closed = new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    server.closeAllConnections();
    await Promise.allSettled([popup.close(), other.close(), target.close()]);
    await closed;
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
  const toggle = panel.getByRole('button', { name: /^(Start|Stop) tab session$/ });
  for (let pass = 0; pass < 2; pass++) {
    await toggle.click();
    await expect(toggle).toHaveText('Stop tab session');
    await target.evaluate(async () => { await fetch('/health'); });
    await expect(panel.getByRole('button', { name: /GET.*activity.localhost:3000\/health/ }).first()).toBeVisible();
    await toggle.click();
    await expect(toggle).toHaveText('Start tab session');
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
  await expect(activity.locator('button[aria-pressed]')).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Start tab session', exact: true })).toBeEnabled();
  await expect(panel.getByText('Check against current rules', { exact: true })).toHaveCount(0);
  await activity.screenshot({ path: '/tmp/intercept-activity-empty.png' });
  expect(await panel.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await panel.close(); await target.close();
});

test('reloading from the extensions manager releases active proxy sessions', async () => {
  const target = await context.newPage();
  await target.goto('http://reload.localhost:3000/');
  const tabId = await getTabId('http://reload.localhost:3000/');
  const original = await control.evaluate(async () => (await chrome.storage.local.get('proxyAppState')).proxyAppState);
  const manager = await context.newPage();
  await manager.goto('chrome://extensions');
  if (await manager.locator('#devMode').getAttribute('aria-pressed') !== 'true') {
    await manager.locator('#devMode').click();
  }
  for (const mode of ['observe', 'cache', 'pending', 'cors']) {
    const status = await control.evaluate(async ({ tabId, mode }) => chrome.runtime.sendMessage({
      type: 'enableAdvancedProxy', payload: { tabId, quickControls: {
        cors: mode === 'cors', credentials: false, delayMs: mode === 'pending' ? 3000 : 0,
        failure: false, disableCache: mode === 'cache',
      } },
    }), { tabId, mode });
    expect(status.phase).toBe('connected');
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/src/popup/index.html?tabId=${tabId}`);
    await popup.getByRole('button', { name: 'Open Inspector' }).click();
    await target.bringToFront();
    await target.evaluate(() => { void fetch('/health').catch(() => undefined); });
    if (status.captureEnabled) {
      await expect.poll(() => control.evaluate(async (id) => {
        const log = await chrome.runtime.sendMessage({ type: 'getAdvancedProxyLog', payload: { tabId: id } });
        return log.some((entry: any) => entry.url.endsWith('/health'));
      }, tabId)).toBe(true);
    } else {
      expect(await target.evaluate(async () => (await fetch('/health')).ok)).toBe(true);
    }
    await manager.bringToFront();
    await manager.locator('extensions-item').locator('#dev-reload-button').click();
    await expect.poll(() => target.evaluate(async () => (await fetch('/health')).ok).catch(() => false)).toBe(true);
    await control.close();
    control = await context.newPage();
    await expect(async () => {
      await control.goto(`chrome-extension://${extensionId}/src/options/index.html`);
      await expect(control.getByRole('button', { name: 'New rule', exact: true })).toBeVisible();
    }).toPass({ timeout: 10_000 });
    await currentWorker();
    const state = await control.evaluate(async (id) => chrome.runtime.sendMessage({ type: 'getAdvancedProxyStatus', payload: { tabId: id } }), tabId);
    expect(state.phase).toBe('disabled');
    expect(await control.evaluate(async () => (await chrome.storage.local.get('proxyAppState')).proxyAppState)).toEqual(original);
  }
  await manager.close(); await target.close();
});

test('keeps DNR scopes isolated by origin and matches complete URLs', async () => {
  const servers: ReturnType<typeof createServer>[] = [];
  const pages: Page[] = [];
  const original = await control.evaluate(async () => (await chrome.storage.local.get('proxyAppState')).proxyAppState);
  const serve = async () => {
    const server = createServer((request, response) => {
      response.setHeader('Content-Type', 'application/json');
      response.setHeader('Cache-Control', 'no-store');
      response.end(JSON.stringify({ header: request.headers['x-origin-test'] || null }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    servers.push(server);
    return `http://localhost:${(server.address() as { port: number }).port}`;
  };
  try {
    const a = await serve(); const b = await serve();
    const pageA = await context.newPage(); const pageB = await context.newPage();
    pages.push(pageA, pageB);
    await pageA.goto(a); await pageB.goto(b);
    const result = await control.evaluate(async ({ a }) => chrome.runtime.sendMessage({ type: 'saveProxyRule', payload: { rule: {
      name: 'Exact origin regression', source: 'user', enabled: true,
      match: { initiatorOrigins: [a], urlPattern: `${a}/api` },
      actions: [{ type: 'setRequestHeaders', headers: { 'X-Origin-Test': 'active' } }],
    } } }), { a });
    expect(result.success).toBe(true);
    const header = (page: Page, path = '/api') => page.evaluate(async (url) => (await (await fetch(url, { cache: 'no-store' })).json()).header, path);
    expect(await header(pageA)).toBe('active');
    expect(await header(pageA, '/api-extra')).toBeNull();
    expect(await header(pageB)).toBeNull();
    await pageA.goto(b);
    await expect.poll(() => header(pageA)).toBeNull();
    const anotherA = await context.newPage(); pages.push(anotherA); await anotherA.goto(a);
    await expect.poll(() => header(anotherA)).toBe('active');
    const invalid = await control.evaluate(async () => chrome.runtime.sendMessage({ type: 'saveProxyRule', payload: { rule: {
      name: 'Invalid scope', source: 'user', enabled: true, match: { initiatorOrigins: ['localhost'], urlPattern: '*' }, actions: [{ type: 'block' }],
    } } }));
    expect(invalid.success).not.toBe(true);
  } finally {
    await control.evaluate((state) => chrome.storage.local.set({ proxyAppState: state }), original);
    await Promise.all(pages.map((page) => page.close()));
    await Promise.all(servers.map((server) => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    })));
  }
});

test('removes the final CORS rule and stale persisted rules from real browser enforcement', async () => {
  const original = await control.evaluate(async () => (await chrome.storage.local.get('proxyAppState')).proxyAppState);
  const server = createServer((_request, response) => { response.setHeader('Cache-Control', 'no-store'); response.end('server'); });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const origin = `http://localhost:${port}`;
  const api = `http://127.0.0.1:${port}/api`;
  const page = await context.newPage();
  try {
    await page.goto(origin);
    await control.evaluate(async (state) => chrome.runtime.sendMessage({ type: 'proxyStateOperation', payload: {
      kind: 'import', state: { ...state, rules: [], profiles: [] }, merge: false,
    } }), original);
    const cors = await control.evaluate(async (origin) => chrome.runtime.sendMessage({ type: 'toggleRuleViaAction', payload: { origin, disabled: false, credentials: false } }), origin);
    expect(cors.success).toBe(true);
    expect(await page.evaluate(async (url) => (await fetch(url, { cache: 'no-store' })).text(), api)).toBe('server');
    // Reproduce an orphan left by a pre-upgrade build.
    await control.evaluate(async () => chrome.declarativeNetRequest.updateDynamicRules({ addRules: [{
      id: 7, priority: 1, action: { type: 'modifyHeaders', responseHeaders: [{ header: 'Access-Control-Allow-Origin', operation: 'set', value: '*' }] },
      condition: { urlFilter: '*', resourceTypes: ['xmlhttprequest'] },
    }] }));
    const removed = await control.evaluate(async () => {
      const { proxyAppState } = await chrome.storage.local.get('proxyAppState');
      return chrome.runtime.sendMessage({ type: 'deleteProxyRule', payload: { id: proxyAppState.rules[0].id } });
    });
    expect(removed.success).toBe(true);
    expect(await control.evaluate(() => chrome.declarativeNetRequest.getDynamicRules())).toEqual([]);
    expect(await control.evaluate(() => chrome.declarativeNetRequest.getSessionRules())).toEqual([]);
    expect(await page.evaluate(async (url) => { try { await fetch(url, { cache: 'no-store' }); return false; } catch { return true; } }, api)).toBe(true);
  } finally {
    await control.evaluate((state) => chrome.storage.local.set({ proxyAppState: state }), original);
    await page.close();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    });
  }
});

test('preserves simultaneous background writes and recovers damaged data through the workspace', async () => {
  const original = await control.evaluate(async () => (await chrome.storage.local.get('proxyAppState')).proxyAppState);
  try {
    const results = await control.evaluate(async () => Promise.all(['one', 'two', 'three'].map((name) => chrome.runtime.sendMessage({
      type: 'saveProxyRule', payload: { rule: { name: `Concurrent ${name}`, source: 'user', enabled: false,
        match: { initiatorOrigins: ['*'], urlPattern: '*' }, actions: [{ type: 'block' }] } },
    }))));
    expect(results.every((result) => result.success)).toBe(true);
    const ids = results.map((result) => result.rule.id);
    expect(await control.evaluate(async (ids) => (await chrome.storage.local.get('proxyAppState')).proxyAppState.rules.filter((rule: any) => ids.includes(rule.id)).length, ids)).toBe(3);
    const damaged = { schemaVersion: 99, rules: ['preserve original'] };
    await control.evaluate((state) => chrome.storage.local.set({ proxyAppState: state }), damaged);
    await expect(control.getByRole('region', { name: 'Data & recovery' })).toBeVisible();
    expect(await control.evaluate(async () => (await chrome.storage.local.get('proxyAppState')).proxyAppState)).toEqual(damaged);
    await control.getByLabel('Import', { exact: true }).setInputFiles({ name: 'recovery.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ version: '2.0', state: original })) });
    await expect(control.getByRole('region', { name: 'Import preview' })).toBeVisible();
    expect(await control.evaluate(async () => (await chrome.storage.local.get('proxyAppState')).proxyAppState)).toEqual(damaged);
    await control.getByRole('button', { name: 'Apply import' }).click();
    await expect(control.getByRole('region', { name: 'Data & recovery' })).not.toBeVisible();
    expect(await control.evaluate(async () => (await chrome.storage.local.get('proxyAppState')).proxyAppState)).toEqual(original);
    expect(await control.evaluate(async () => (await chrome.storage.local.get('preRecoveryBackup')).preRecoveryBackup.state)).toEqual(damaged);
  } finally {
    await control.evaluate((state) => chrome.storage.local.set({ proxyAppState: state }), original);
  }
});

test('manages familiar rule groups and applies their switches to browser traffic', async () => {
  const target = await context.newPage();
  const popup = await context.newPage();
  const ids: string[] = [];
  let groupId: string | undefined;
  const errors: string[] = [];
  const onError = (error: Error) => errors.push(error.message);
  control.on('pageerror', onError);
  const origin = 'http://groups.localhost:3000';
  await target.goto(origin + '/');
  const tabId = await getTabId(origin + '/');
  const send = (type: string, payload: any) => control.evaluate(({ type, payload }) => chrome.runtime.sendMessage({ type, payload }), { type, payload });
  const headers = () => target.evaluate(async () => (await (await fetch('/api/headers-echo')).json()).data.headers);
  const mockBody = () => target.evaluate(async () => (await fetch('/api/users/1')).text());
  try {
    await control.goto(`chrome-extension://${extensionId}/src/options/index.html`);
    await control.getByRole('button', { name: 'New group', exact: true }).click();
    await control.getByLabel('Group name', { exact: true }).fill('Staging');
    await control.getByRole('button', { name: 'Create group', exact: true }).click();
    await expect(control.getByRole('switch', { name: 'Enable group Staging', exact: true })).toBeChecked();
    groupId = (await send('getProxyState', undefined)).profiles.find((profile: any) => profile.name === 'Staging').id;
    const save = async (name: string, actions: any[], enabled = true, group = groupId, pattern = '*') => {
      const result = await send('saveProxyRule', { groupId: group || null, rule: { name, enabled, source: 'user', match: { initiatorOrigins: [origin], urlPattern: pattern }, actions } });
      expect(result.success, result.error).toBe(true); ids.push(result.rule.id); return result.rule.id;
    };
    const headerId = await save('Staging header', [{ type: 'setRequestHeaders', headers: { 'X-Group': 'staging' } }]);
    await save('Kept off', [{ type: 'setRequestHeaders', headers: { 'X-Group-Off': 'unexpected' } }], false);
    await save('Staging mock', [{ type: 'mockResponse', status: 200, headers: {}, body: 'group-body' }], true, groupId, origin + '/api/users/1');
    await save('Independent header', [{ type: 'setRequestHeaders', headers: { 'X-Independent': 'yes' } }], true, '', '*');
    await expect(control.getByRole('button', { name: 'Edit Staging header', exact: true })).toBeVisible();
    expect((await headers())['x-group']).toBe('staging');
    expect((await headers())['x-group-off']).toBeUndefined();
    // Turning a group on does not start interception.
    expect((await send('getAdvancedProxyStatus', { tabId })).phase).toBe('disabled');
    expect(await mockBody()).not.toBe('group-body');
    await send('enableAdvancedProxy', { tabId });
    expect(await mockBody()).toBe('group-body');
    await popup.goto(`chrome-extension://${extensionId}/src/popup/index.html?tabId=${tabId}`);
    await popup.getByRole('switch', { name: 'Enable group Staging', exact: true }).click();
    await expect(control.getByRole('switch', { name: 'Enable group Staging', exact: true })).not.toBeChecked();
    await expect(control.getByRole('switch', { name: 'Toggle Staging header', exact: true })).toBeDisabled();
    const paused = await headers();
    expect(paused['x-group']).toBeUndefined(); expect(paused['x-independent']).toBe('yes');
    expect(await mockBody()).not.toBe('group-body');
    expect((await send('getProxyState', undefined)).rules.find((rule: any) => rule.id === headerId).enabled).toBe(true);
    await popup.getByRole('switch', { name: 'Enable group Staging', exact: true }).click();
    expect((await headers())['x-group']).toBe('staging'); expect((await headers())['x-group-off']).toBeUndefined();
    expect(await mockBody()).toBe('group-body');
    // Collapsed groups do not conceal search results or break keyboard navigation.
    const group = control.getByRole('region', { name: 'Staging', exact: true });
    await group.locator('button[aria-expanded]').click();
    await expect(control.getByRole('button', { name: 'Edit Staging header', exact: true })).toBeHidden();
    await control.getByRole('textbox', { name: 'Search rules', exact: true }).fill('Staging header');
    await control.getByRole('button', { name: 'Edit Staging header', exact: true }).click();
    await expect(control.getByLabel('Group', { exact: true })).toHaveValue(groupId!);
    await control.getByRole('textbox', { name: 'Search rules', exact: true }).fill('');
    await group.locator('button[aria-expanded]').click();
    await control.getByRole('button', { name: 'Rename group Staging', exact: true }).click();
    await control.getByLabel('Group name', { exact: true }).fill('Preview');
    await control.getByRole('button', { name: 'Save name', exact: true }).click();
    await expect(control.getByRole('switch', { name: 'Enable group Preview', exact: true })).toBeVisible();
    await control.screenshot({ path: '/tmp/wireflip-groups-desktop.png', fullPage: false });
    await control.setViewportSize({ width: 390, height: 844 });
    await control.getByRole('button', { name: 'Back to rules', exact: true }).click();
    await expect(control.getByRole('button', { name: 'Rename group Preview', exact: true })).toBeVisible();
    await control.screenshot({ path: '/tmp/wireflip-groups-mobile.png', fullPage: false });
    expect(await control.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await control.setViewportSize({ width: 1280, height: 720 });
    await control.getByRole('switch', { name: 'Enable group Preview', exact: true }).click();
    await control.getByRole('button', { name: 'Delete group Preview', exact: true }).click();
    await expect(control.getByRole('dialog')).toContainText('Enabled rules in a paused group will resume');
    await control.getByRole('button', { name: 'Delete group', exact: true }).click();
    await expect(control.getByRole('switch', { name: 'Enable group Preview', exact: true })).toHaveCount(0);
    expect((await headers())['x-group']).toBe('staging');
    expect((await headers())['x-group-off']).toBeUndefined();
    expect((await send('getProxyState', undefined)).rules.filter((rule: any) => ids.includes(rule.id))).toHaveLength(4);
    expect(errors).toEqual([]);
  } finally {
    control.off('pageerror', onError);
    await control.setViewportSize({ width: 1280, height: 720 });
    await send('disableAdvancedProxy', { tabId });
    for (const id of ids) await send('deleteProxyRule', { id });
    if (groupId && (await send('getProxyState', undefined)).profiles.some((profile: any) => profile.id === groupId)) await send('proxyStateOperation', { kind: 'removeGroup', id: groupId });
    await popup.close(); await target.close();
  }
});

test('saves and moves a grouped rule without losing membership on subsequent edits', async () => {
  const send = (type: string, payload: any) => control.evaluate(({ type, payload }) => chrome.runtime.sendMessage({ type, payload }), { type, payload });
  const profile = (await send('proxyStateOperation', { kind: 'createGroup', name: 'Editor group' })).state.profiles.at(-1);
  let id: string | undefined;
  try {
    await control.goto(`chrome-extension://${extensionId}/src/options/index.html`);
    await control.getByRole('button', { name: 'Create rule in Editor group', exact: true }).click();
    await control.getByLabel('Name', { exact: true }).fill('Grouped editor rule');
    await control.getByLabel('Page origins', { exact: true }).fill('https://group.example');
    await control.getByLabel('Request URL pattern', { exact: true }).fill('*');
    await control.getByRole('button', { name: 'Save rule', exact: true }).click();
    await expect(control.getByRole('button', { name: 'Save rule', exact: true })).toBeEnabled();
    await expect(control.getByLabel('Group', { exact: true })).toHaveValue(profile.id);
    id = (await send('getProxyState', undefined)).rules.find((rule: any) => rule.name === 'Grouped editor rule').id;
    await control.getByLabel('Name', { exact: true }).fill('Edited twice');
    await control.getByRole('button', { name: 'Save rule', exact: true }).click();
    await expect(control.getByRole('button', { name: 'Save rule', exact: true })).toBeEnabled();
    expect((await send('getProxyState', undefined)).profiles.find((item: any) => item.id === profile.id).ruleIds).toContain(id);
    await control.getByLabel('Group', { exact: true }).selectOption('');
    await control.getByRole('button', { name: 'Save rule', exact: true }).click();
    await expect(control.getByRole('button', { name: 'Save rule', exact: true })).toBeEnabled();
    await expect.poll(async () => (await send('getProxyState', undefined)).profiles.find((item: any) => item.id === profile.id).ruleIds).not.toContain(id);
  } finally {
    if (id) await send('deleteProxyRule', { id });
    await send('proxyStateOperation', { kind: 'removeGroup', id: profile.id });
  }
});

test('keeps toolbar group hints and popup recovery actions in sync', async () => {
  const target = await context.newPage();
  const popup = await context.newPage();
  const ids: string[] = [];
  let groupId: string | undefined;
  const origin = 'http://toolbar-groups.localhost:3000';
  await target.goto(origin + '/');
  const tabId = await getTabId(origin + '/');
  const worker = await currentWorker();
  const send = (type: string, payload: any) => control.evaluate(({ type, payload }) => chrome.runtime.sendMessage({ type, payload }), { type, payload });
  const badge = () => control.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId);
  const title = () => control.evaluate((id) => chrome.action.getTitle({ tabId: id }), tabId);
  const color = () => control.evaluate((id) => chrome.action.getBadgeBackgroundColor({ tabId: id }), tabId);
  try {
    groupId = (await send('proxyStateOperation', { kind: 'createGroup', name: 'Toolbar staging' })).state.profiles.at(-1).id;
    for (const actions of [[{ type: 'setRequestHeaders', headers: { 'X-Toolbar-Group': 'yes' } }], [{ type: 'mockResponse', status: 200, headers: {}, body: 'toolbar mock' }]]) {
      const result = await send('saveProxyRule', { groupId, rule: { name: 'Toolbar grouped rule', enabled: true, match: { initiatorOrigins: [origin], urlPattern: origin + '/api/users/1' }, actions } });
      expect(result.success).toBe(true); ids.push(result.rule.id);
    }
    await popup.goto(`chrome-extension://${extensionId}/src/popup/index.html?tabId=${tabId}`);
    await popup.setViewportSize({ width: 360, height: 800 });
    await expect.poll(badge).toBe('1');
    await expect(popup.getByText('Rules waiting for a tab session: 1', { exact: true })).toBeVisible();
    const groups = popup.getByRole('region', { name: 'Rule groups', exact: true });
    expect((await groups.boundingBox())!.y).toBeLessThan((await popup.getByRole('heading', { name: 'Temporary changes', exact: true }).boundingBox())!.y);
    await popup.getByRole('switch', { name: 'Enable group Toolbar staging', exact: true }).click();
    await expect.poll(badge).toBe('OFF');
    await expect.poll(color).toEqual([100, 116, 139, 255]);
    await expect.poll(title).toContain('• Toolbar staging');
    await expect(popup.getByText('Saved rules paused', { exact: true })).toBeVisible();
    await expect(popup.getByText('0 persistent rules stay on after stopping', { exact: true })).toBeVisible();
    await expect(popup.getByText('Rules waiting for a tab session: 1', { exact: true })).toHaveCount(0);
    await popup.screenshot({ path: 'test-results/toolbar-groups-paused.png', fullPage: true });
    await popup.getByRole('switch', { name: 'Enable group Toolbar staging', exact: true }).click();
    await expect.poll(badge).toBe('1');
    await expect(popup.getByText('1 persistent rules stay on after stopping', { exact: true })).toBeVisible();
    // A persisted session error must be visible when the popup is opened, with a working retry.
    await worker.evaluate(() => {
      const native = chrome.debugger.attach.bind(chrome.debugger);
      chrome.debugger.attach = (async (..._args: any[]) => {
        chrome.debugger.attach = native;
        throw new Error('Connection fixture failure');
      }) as typeof chrome.debugger.attach;
    });
    await popup.getByRole('button', { name: 'Start tab session', exact: true }).click();
    await expect.poll(badge).toBe('!');
    await popup.reload();
    await expect(popup.getByRole('alert')).toContainText('Connection fixture failure');
    await expect(popup.getByRole('button', { name: 'Retry connection', exact: true })).toBeVisible();
    await popup.getByRole('button', { name: 'Retry connection', exact: true }).click();
    await expect.poll(badge).toBe('ON');
    await expect(popup.getByRole('alert')).toHaveCount(0);
    await popup.getByRole('switch', { name: 'Enable group Toolbar staging', exact: true }).click();
    await expect.poll(badge).toBe('ON');
    await expect.poll(title).toContain('Paused groups: 1');
    await popup.getByRole('switch', { name: 'Disable cache', exact: true }).click();
    await expect.poll(title).toContain('• Disable cache');
    await popup.getByRole('button', { name: 'Stop tab session', exact: true }).click();
    await expect.poll(badge).toBe('OFF');
    await expect(popup.getByText('Saved rules paused', { exact: true })).toBeVisible();
    await popup.getByRole('switch', { name: 'Enable group Toolbar staging', exact: true }).click();
    await expect.poll(badge).toBe('1');
    // Cancel stays usable while the original attach is waiting.
    await worker.evaluate(() => {
      const native = chrome.debugger.attach.bind(chrome.debugger);
      (self as any).__toolbarCancelGate = {};
      chrome.debugger.attach = (async (...args: any[]) => {
        chrome.debugger.attach = native;
        await new Promise<void>((resolve) => { (self as any).__toolbarCancelGate.release = resolve; });
        return (native as any)(...args);
      }) as typeof chrome.debugger.attach;
    });
    await popup.getByRole('button', { name: 'Start tab session', exact: true }).click();
    await expect(popup.getByRole('button', { name: 'Cancel connection', exact: true })).toBeEnabled();
    await expect.poll(() => worker.evaluate(() => typeof (self as any).__toolbarCancelGate.release)).toBe('function');
    await popup.getByRole('button', { name: 'Cancel connection', exact: true }).click();
    await worker.evaluate(() => { (self as any).__toolbarCancelGate.release(); });
    await expect.poll(badge).toBe('1');
    await expect(popup.getByRole('button', { name: 'Start tab session', exact: true })).toBeEnabled();
    expect((await send('getAdvancedProxyStatus', { tabId })).phase).toBe('disabled');
    await expect(popup.getByRole('alert')).toHaveCount(0);
  } finally {
    await worker.evaluate(() => { (self as any).__toolbarCancelGate?.release?.(); });
    await send('disableAdvancedProxy', { tabId });
    for (const id of ids) await send('deleteProxyRule', { id });
    if (groupId) await send('proxyStateOperation', { kind: 'removeGroup', id: groupId });
    await popup.close(); await target.close();
  }
});


test('runs exact new and legacy SDK archives through production HTTPS bridges', async () => {
  const repo = path.resolve(extensionPath, '../../../..');
  const packages = path.join(repo, 'artifacts/sdk-preflight');
  const site = path.join(repo, 'packages/website/dist');
  const app = 'https://app.wireflip.test';
  const otherOrigin = 'https://other.wireflip.test';
  const bridgeRequests: string[] = [];
  const target = await context.newPage();
  const other = await context.newPage();
  const send = (type: string, payload: any = {}) => control.evaluate(({ type, payload }) => chrome.runtime.sendMessage({ type, payload }), { type, payload });
  const fixtureRoute = async (route: import('@playwright/test').Route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'cors.forth.ink') {
      bridgeRequests.push(url.pathname);
      const name = url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname;
      await route.fulfill({ body: readFileSync(path.join(site, name)), contentType: name.endsWith('.js') ? 'text/javascript' : 'text/html' });
    } else if (url.pathname.startsWith('/sdk/')) {
      await route.fulfill({ body: readFileSync(path.join(packages, url.pathname.slice(5))), contentType: 'text/javascript' });
    } else {
      await route.fulfill({ body: '<title>Wireflip packaged SDK acceptance</title><p>Isolated HTTPS SDK fixture</p>', contentType: 'text/html' });
    }
  };
  await context.route(/^https:\/\/(cors\.forth\.ink|app\.wireflip\.test|other\.wireflip\.test)\//, fixtureRoute);
  const load = (page: Page, label: string, entry: string) => page.evaluate(async ({ label, entry }) => {
    (window as any).sdk = await import(`/sdk/${label}/package/dist/${entry}`);
  }, { label, entry });
  const call = (page: Page, expression: string) => page.evaluate(async (expression) => await (0, eval)(expression), expression);
  const openWorkspace = async (expression: string) => {
    await target.bringToFront();
    await call(target, expression);
    await expect.poll(() => control.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.url)).toBe(`chrome-extension://${extensionId}/src/options/index.html`);
    await expect(control.locator('main')).toBeVisible();
  };
  try {
    for (const label of ['legacy-0.1.0', 'legacy-0.1.1']) {
      await target.goto(app + '/');
      await other.goto(otherOrigin + '/');
      await load(target, label, 'index.es.js');
      expect(await call(target, 'sdk.default.isExtInstalled()')).toBe(true);
      expect(await call(target, 'sdk.default.isEnabled()')).toEqual({ enabled: false, credentials: false });
      target.once('dialog', dialog => dialog.dismiss());
      expect(await call(target, 'sdk.default.enable({credentials:false}).catch(e=>({error:e.type}))')).toEqual({ error: 'user-cancel' });
      expect((await call(target, 'sdk.default.isEnabled()')).enabled).toBe(false);
      target.once('dialog', dialog => dialog.accept());
      expect((await call(target, 'sdk.default.enable({credentials:true})')).enabled).toBe(true);
      expect(await call(target, 'sdk.default.isEnabled()')).toEqual({ enabled: true, credentials: true });
      await load(other, label, 'index.es.js');
      expect((await call(other, 'sdk.default.isEnabled()')).enabled).toBe(false);
      await call(target, 'sdk.default.disable()');
      expect((await call(target, 'sdk.default.isEnabled()')).enabled).toBe(false);
      await openWorkspace('sdk.default.openExtOptions()');
      const frame = target.frames().find(frame => frame.url().startsWith('https://cors.forth.ink/message/index.html?'));
      expect(frame).toBeTruthy();
      expect(await frame!.evaluate(() => location.origin)).toBe('https://cors.forth.ink');
    }
    expect(bridgeRequests).toContain('/message/index.html');
    await target.goto(app + '/');
    await load(target, 'new', 'index.mjs');
    const connected = await call(target, '(async()=>{window.session=await sdk.intercept.connect();return {origin:session.origin,capabilities:session.capabilities,status:await session.getStatus()};})()');
    expect(connected).toMatchObject({ origin: app, capabilities: { browser: 'chrome', interception: { responseMock: 'synthetic' } }, status: { advancedMode: 'disabled' } });
    target.once('dialog', dialog => dialog.dismiss());
    expect(await call(target, 'session.requestCors().catch(e=>({error:e.type}))')).toEqual({ error: 'user-cancel' });
    target.once('dialog', dialog => dialog.accept());
    expect((await call(target, 'session.requestCors({credentials:false})')).cors.enabled).toBe(true);
    expect((await call(target, 'session.disableCors()')).cors.enabled).toBe(false);
    const draft = await call(target, 'session.createRuleDraft({name:"Exact archive",urlPattern:"https://api.example.com/*",actions:[{type:"delay",milliseconds:800}]},{openWorkspace:false})');
    expect(draft.enabled).toBe(false);
    const stored = (await send('getProxyState')).rules.find((rule: any) => rule.id === draft.id);
    expect(stored).toMatchObject({ enabled: false, match: { initiatorOrigins: [app] } });
    await openWorkspace('session.openWorkspace()');
    await other.goto(otherOrigin + '/');
    await load(other, 'new', 'index.mjs');
    expect(await call(other, '(async()=>{const s=await sdk.intercept.connect();return (await s.getStatus()).cors.enabled;})()')).toBe(false);
    const withoutExtension = await context.browser()!.newContext();
    try {
      await withoutExtension.route(/^https:\/\/app\.wireflip\.test\//, fixtureRoute);
      const absent = await withoutExtension.newPage();
      await absent.goto(app + '/');
      await load(absent, 'new', 'index.mjs');
      expect(await call(absent, 'sdk.intercept.isAvailable()')).toBe(false);
      expect(await call(absent, 'sdk.intercept.connect().catch(e=>({type:e.type}))')).toEqual({ type: 'not-installed' });
    } finally { await withoutExtension.close(); }

  } finally {
    const state = await send('getProxyState');
    for (const rule of state.rules) if (rule.match.initiatorOrigins.some((origin: string) => [app, otherOrigin].includes(origin))) await send('deleteProxyRule', { id: rule.id });
    await target.close(); await other.close();
    await context.unroute(/^https:\/\/(cors\.forth\.ink|app\.wireflip\.test|other\.wireflip\.test)\//, fixtureRoute);
  }
});
