/**
 * Official Google Chrome, native Web Store policy installation, no unpacked load.
 * Browser plugin has no callable runtime in this environment. This acceptance
 * task explicitly verifies the public package in isolated CI instead.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = process.cwd();
const output = path.join(root, 'artifacts/public-chrome');
mkdirSync(output, { recursive: true });
const require = createRequire(path.join(root, 'packages/browser-extension/package.json'));
const { chromium } = require('@playwright/test');
const id = 'knhlkjdfmgkmelcjfnbbhpphkmjjacng';
const expectedVersion = '2.0.0';
const candidateSha = '59b7f60717ecdbd8eb77af34253f7e3519f6f8051e605099af50934306ef72e6';
const chromePath = process.env.CHROME_BINARY || '/usr/bin/google-chrome';
const browserVersion = execFileSync(chromePath, ['--product-version'], { encoding: 'utf8' }).trim();
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const candidate = process.env.CHROME_RELEASE_ARCHIVE;
assert(candidate && existsSync(candidate), 'Provide the exact submitted release ZIP');
assert.equal(sha(readFileSync(candidate)), candidateSha, 'Submitted ZIP integrity');
const publicDir = path.join(output, 'public-package');
const candidateDir = path.join(output, 'submitted-package');
mkdirSync(publicDir, { recursive: true });
mkdirSync(candidateDir, { recursive: true });
const update = new URL('https://clients2.google.com/service/update2/crx');
update.search = new URLSearchParams({ response: 'redirect', prodversion: browserVersion, acceptformat: 'crx3', x: 'id=' + id + '&installsource=ondemand&uc' });
const download = await fetch(update, { signal: AbortSignal.timeout(60_000) });
assert.equal(download.status, 200, 'Public Chrome update service must return a CRX');
const crx = Buffer.from(await download.arrayBuffer());
assert.equal(crx.subarray(0, 4).toString(), 'Cr24');
assert.equal(crx.readUInt32LE(4), 3);
const zipOffset = 12 + crx.readUInt32LE(8);
assert(zipOffset < crx.length && crx.readUInt32LE(zipOffset) === 0x04034b50);
writeFileSync(path.join(output, 'public.crx'), crx);
writeFileSync(path.join(output, 'public.zip'), crx.subarray(zipOffset));
execFileSync('unzip', ['-q', path.join(output, 'public.zip'), '-d', publicDir]);
execFileSync('unzip', ['-q', candidate, '-d', candidateDir]);
const publicManifest = JSON.parse(readFileSync(path.join(publicDir, 'manifest.json')));
assert.equal(publicManifest.version, expectedVersion);
const nameKey = /^__MSG_(.+)__$/.exec(publicManifest.name)?.[1];
const publicName = nameKey ? JSON.parse(readFileSync(path.join(publicDir, '_locales', publicManifest.default_locale, 'messages.json')))[nameKey].message : publicManifest.name;
assert.equal(publicName, 'Wireflip');
const files = (directory, prefix = '') => readdirSync(path.join(directory, prefix)).flatMap(name => {
  const relative = path.join(prefix, name);
  return statSync(path.join(directory, relative)).isDirectory() ? files(directory, relative) : [relative];
});
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const normalizedManifest = source => {
  const result = JSON.parse(source);
  for (const key of ['key', 'update_url', 'differential_fingerprint']) delete result[key];
  return canonical(result);
};
const candidateFiles = files(candidateDir);
for (const file of candidateFiles) {
  assert(existsSync(path.join(publicDir, file)), 'Missing store file: ' + file);
  const actual = readFileSync(path.join(publicDir, file)), submitted = readFileSync(path.join(candidateDir, file));
  if (file === 'manifest.json') assert.deepEqual(normalizedManifest(actual), normalizedManifest(submitted));
  else assert.equal(sha(actual), sha(submitted), 'Runtime differs from submitted ZIP: ' + file);
}
const extras = files(publicDir).filter(file => !candidateFiles.includes(file));
assert(extras.every(file => file.startsWith('_metadata/')), 'Unexpected store payload files: ' + extras);
const results = {
  checkedAt: new Date().toISOString(), extensionId: id, version: publicManifest.version,
  browserVersion, installation: 'Native Chrome policy install from the public Web Store update service',
  crxSha256: sha(crx), submittedZipSha256: candidateSha,
  matchingRuntimeFiles: candidateFiles.filter(file => file !== 'manifest.json').length,
  manifest: 'Identical except store-managed key/update metadata', checks: [],
};
console.log('PUBLIC_CHROME_PACKAGE ' + JSON.stringify(results));
const profile = mkdtempSync(path.join(tmpdir(), 'wireflip-public-chrome-'));
let context, activePage;
async function screenshot(page, name) {
  const bytes = await page.screenshot({ path: path.join(output, name + '.png'), fullPage: false, animations: 'disabled' });
  if (name === 'playground-verified') {
    const data = bytes.toString('base64'), total = Math.ceil(data.length / 8192);
    for (let index = 0; index < total; index++) console.log('WIREFLIP_IMAGE ' + JSON.stringify({ name, index, total, data: data.slice(index * 8192, (index + 1) * 8192) }));
  }
}
try {
  context = await chromium.launchPersistentContext(profile, {
    executablePath: chromePath, headless: false, viewport: { width: 1280, height: 900 },
    ignoreDefaultArgs: ['--disable-extensions', '--disable-background-networking', '--disable-component-update'],
    args: ['--no-sandbox'],
  });
  context.setDefaultTimeout(20_000);
  const wait = async (read, predicate, timeout = 120_000) => {
    const end = Date.now() + timeout; let last;
    while (Date.now() < end) {
      last = await read();
      if (predicate(last)) return last;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    throw Error('Condition timed out: ' + JSON.stringify(last));
  };
  await wait(() => context.serviceWorkers().map(worker => worker.url()), urls => urls.some(url => url.startsWith('chrome-extension://' + id + '/')));
  const control = await context.newPage();
  await control.goto('chrome-extension://' + id + '/src/options/index.html');
  const installed = await control.evaluate(() => chrome.runtime.getManifest());
  assert.equal(installed.version, expectedVersion);
  assert.equal(installed.name, 'Wireflip');
  const installedDirs = readdirSync(path.join(profile, 'Default/Extensions', id));
  const installedDir = path.join(profile, 'Default/Extensions', id, installedDirs.find(name => name.startsWith(expectedVersion + '_')));
  for (const file of candidateFiles.filter(file => file !== 'manifest.json')) {
    assert.equal(sha(readFileSync(path.join(installedDir, file))), sha(readFileSync(path.join(publicDir, file))), 'Installed public runtime differs: ' + file);
  }
  await control.evaluate(() => chrome.storage.local.set({ uiLanguage: 'en' }));
  assert.equal(context.pages().filter(page => page.url().includes('/src/upgrade/')).length, 0, 'Fresh install must not open upgrade notice');
  await control.getByRole('main').waitFor();
  assert.equal(await control.getByRole('region', { name: 'About your Wireflip upgrade' }).count(), 0);
  results.checks.push('Native signed store installation, same ID/version/runtime; no fresh-install upgrade notice');

  const store = await context.newPage();
  await store.goto('https://chromewebstore.google.com/detail/' + id + '?hl=en');
  await store.getByRole('heading', { level: 1 }).filter({ hasText: 'Wireflip' }).waitFor();
  assert((await store.locator('body').innerText()).includes(expectedVersion));
  writeFileSync(path.join(output, 'store-visible.txt'), await store.locator('body').innerText());
  await screenshot(store, 'chrome-web-store');
  results.checks.push('Public store listing shows Wireflip 2.0.0');

  const page = await context.newPage();
  activePage = page;
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('https://wireflip.forth.ink/playground/');
  assert.equal(new URL(page.url()).pathname, '/playground/');
  assert((await page.title()).includes('Wireflip'));
  await page.getByRole('heading', { name: 'Extension connected · chrome', exact: true }).waitFor();
  assert(await page.getByRole('button', { name: 'Test mock', exact: true }).isDisabled());
  await page.getByRole('button', { name: 'Add rule in Wireflip', exact: true }).click();
  const state = () => control.evaluate(() => chrome.runtime.sendMessage({ type: 'getProxyState' }));
  let rule = (await wait(state, state => state.rules.length === 1)).rules[0];
  assert.equal(rule.enabled, false);
  assert.deepEqual(rule.match.initiatorOrigins, ['https://wireflip.forth.ink']);
  await control.getByRole('switch', { name: 'Toggle Playground · Mock response', exact: true }).click();
  await wait(state, state => state.rules[0].enabled);
  assert(await page.getByRole('button', { name: 'Test mock', exact: true }).isDisabled());
  const tabId = await control.evaluate(async url => (await chrome.tabs.query({})).find(tab => tab.url === url).id, page.url());
  const popup = await context.newPage();
  await popup.goto('chrome-extension://' + id + '/src/popup/index.html?tabId=' + tabId);
  await popup.getByRole('button', { name: 'Start tab session', exact: true }).click();
  // Extension debugger attachment must be native; Playwright does not stub it.
  await page.bringToFront();
  await page.getByRole('button', { name: 'Test mock', exact: true }).waitFor();
  await wait(() => page.getByRole('button', { name: 'Test mock', exact: true }).isEnabled(), Boolean, 30_000);
  await page.getByRole('button', { name: 'Test mock', exact: true }).click();
  await page.getByText(/Mock verified · 200/).waitFor();
  await page.getByText(/Mock verified · 200/).scrollIntoViewIfNeeded();
  await screenshot(page, 'playground-verified');
  const badge = () => control.evaluate(tabId => chrome.action.getBadgeText({ tabId }), tabId);
  assert.equal(await badge(), 'ON');
  results.checks.push('Production HTTPS Playground: disabled draft → workspace enable → native Popup session → public recipe Mock verified; toolbar ON');

  await control.getByRole('switch', { name: 'Toggle Playground · Mock response', exact: true }).click();
  await wait(state, state => !state.rules[0].enabled);
  await page.getByRole('button', { name: 'Test mock', exact: true }).click();
  await page.getByText(/Mock did not match · 200/).waitFor();
  await screenshot(page, 'playground-disabled-rule');
  await popup.getByRole('button', { name: 'Stop tab session', exact: true }).click();
  await wait(() => page.getByRole('button', { name: 'Test mock', exact: true }).isDisabled(), Boolean, 15_000);
  assert.equal(await badge(), '');
  await page.reload();
  await page.getByRole('button', { name: 'Open rule in Wireflip', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Open rule in Wireflip', exact: true }).click();
  assert.equal((await state()).rules.length, 1);
  assert.deepEqual(errors, []);
  results.checks.push('Disabled rule reports mismatch; stopped session gates testing and clears ON; reload preserves recipe without duplicate');
  writeFileSync(path.join(output, 'verification.json'), JSON.stringify(results, null, 2) + '\n');
  console.log('PUBLIC_CHROME_VERIFIED ' + JSON.stringify(results));
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await screenshot(activePage, 'failure-state');
    console.error('PUBLIC_CHROME_FAILURE_DOM ' + await activePage.locator('body').innerText());
  }
  throw error;
} finally {
  await context?.close();
  rmSync(profile, { recursive: true, force: true });
}
