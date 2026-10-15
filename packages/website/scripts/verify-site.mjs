/**
 * Built-site acceptance and budgets. Browser plugin not available;
 * CI uses the extension workspace's existing Playwright installation.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, existsSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(site, '../..');
const dist = path.join(site, 'dist');
const output = path.join(root, 'artifacts/website-qa');
mkdirSync(path.join(output, 'screenshots'), { recursive: true });
const require = createRequire(path.join(root, 'packages/browser-extension/package.json'));
const { chromium } = require('@playwright/test');
const origin = 'https://wireflip.forth.ink';
const chromeStore = 'https://chromewebstore.google.com/detail/knhlkjdfmgkmelcjfnbbhpphkmjjacng';
const firefoxStore = 'https://addons.mozilla.org/en-US/firefox/addon/cors-unlocker/';
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.xml': 'application/xml', '.txt': 'text/plain' };
const server = createServer((request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let file = path.resolve(dist, '.' + pathname);
    if (!file.startsWith(dist + path.sep) && file !== dist) throw Error('Invalid path');
    if (statSync(file).isDirectory()) file = path.join(file, 'index.html');
    response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    response.end(readFileSync(file));
  } catch { response.statusCode = 404; response.end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
const routes = [...readFileSync(path.join(dist, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => new URL(match[1]).pathname);
assert(routes.length >= 9 && routes.includes('/docs/sdk/') && !routes.includes('/message/'));
assert(readFileSync(path.join(dist, 'robots.txt'), 'utf8').includes(origin + '/sitemap.xml'));
assert(/name="robots"\s+content="noindex"/.test(readFileSync(path.join(dist, 'message/index.html'), 'utf8')));
const results = { pages: [], browsers: [], interactions: [], lighthouse: [], capture: 'Native Playwright built-site screenshots; no extension API mocks' };
let browser;
async function evidence(page, name) {
  const image = await page.screenshot({ path: path.join(output, 'screenshots', name + '.png'), animations: 'disabled', fullPage: false });
  if (process.env.WIREFLIP_INLINE_EVIDENCE === '1') {
    const data = image.toString('base64'), total = Math.ceil(data.length / 8192);
    for (let index = 0; index < total; index++) console.log('WIREFLIP_IMAGE ' + JSON.stringify({ name, index, total, data: data.slice(index * 8192, (index + 1) * 8192) }));
  }
}
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  // This deterministic network response tests the probe UI, not interception.
  await context.route('https://jsonplaceholder.typicode.com/**', route => route.fulfill({ contentType: 'application/json', body: '{"source":"website UI fixture","id":1}' }));
  const page = await context.newPage(), errors = [], internalLinks = new Set();
  page.on('pageerror', error => errors.push(error.message));
  for (const route of routes) {
    assert.equal((await page.goto(base + route)).status(), 200, route);
    await page.locator('h1').first().waitFor();
    assert.equal(new URL(page.url()).pathname, route);
    assert((await page.title()).includes('Wireflip'));
    assert((await page.locator('main').innerText()).trim().length > 100);
    assert.equal(await page.locator('h1').count(), 1, route);
    for (const selector of ['link[rel=canonical]', 'meta[property="og:url"]']) {
      assert.equal(await page.locator(selector).getAttribute(selector.startsWith('link') ? 'href' : 'content'), origin + route);
    }
    assert((await page.locator('meta[name=description]').getAttribute('content')).length >= 30);
    assert.equal(await page.locator('meta[name="twitter:card"]').getAttribute('content'), 'summary_large_image');
    assert(JSON.parse(await page.locator('script[type="application/ld+json"]').textContent())['@type']);
    assert(!/pending review|awaiting.*review|not yet published/i.test(await page.locator('body').innerText()), route);
    assert.equal(await page.locator('vite-error-overlay, nextjs-portal').count(), 0);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Desktop overflow: ' + route);
    if (route === '/playground/') await page.getByRole('heading', { name: 'Extension not connected', exact: true }).waitFor();
    const loaded = await page.evaluate(() => performance.getEntriesByType('resource').map(item => item.name).filter(name => new URL(name).origin === location.origin && new URL(name).pathname.endsWith('.js')));
    const jsBytes = [...new Set(loaded)].reduce((sum, name) => sum + gzipSync(readFileSync(path.join(dist, new URL(name).pathname))).length, 0);
    const budget = route === '/playground/' ? 90 * 1024 : 15 * 1024;
    assert(jsBytes <= budget, 'JS gzip budget exceeded: ' + route + ': ' + jsBytes);
    if (route !== '/playground/') assert(!loaded.some(name => /\/client\.[^/]+\.js$/.test(name)), 'React must stay off static pages');
    results.pages.push({ route, identity: 'passed', content: 'passed', metadata: 'passed', overflow: 'passed', runtimeJsGzipBytes: jsBytes, budget });
    for (const href of await page.locator('a[href]').evaluateAll(elements => elements.map(element => element.getAttribute('href')))) {
      if (href.startsWith('/') || href.startsWith('#')) internalLinks.add(new URL(href, base + route).href);
    }
  }
  for (const link of internalLinks) {
    const url = new URL(link), target = path.join(dist, url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname);
    assert(existsSync(target), 'Broken destination: ' + link);
    if (url.hash) {
      await page.goto(link);
      assert(await page.locator('[id]').evaluateAll((items, id) => items.some(item => item.id === id), decodeURIComponent(url.hash.slice(1))), 'Broken anchor: ' + link);
    }
  }
  await page.goto(base + '/');
  await page.waitForFunction(() => document.querySelector('[data-install-primary]').textContent.includes('Chrome'));
  for (const link of await page.locator('[data-install-primary]').all()) assert.equal(await link.getAttribute('href'), chromeStore);
  await evidence(page, 'home-desktop');
  await page.getByRole('navigation', { name: 'Primary navigation', exact: true }).getByRole('link', { name: 'Docs', exact: true }).click();
  assert.equal(new URL(page.url()).pathname, '/docs/');
  await page.getByRole('navigation', { name: 'Documentation', exact: true }).getByRole('link', { name: 'Extension guide', exact: true }).click();
  await page.getByRole('heading', { name: 'Use Wireflip in your browser' }).waitFor();
  results.interactions.push('Home → Docs → Extension guide');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + '/docs/');
  await page.getByText('Menu', { exact: true }).click();
  const mobileNav = page.getByRole('navigation', { name: 'Mobile navigation', exact: true });
  await mobileNav.getByRole('link', { name: 'Playground', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[data-mobile-navigation]').getAttribute('open'), null);
  assert(await page.locator('summary').first().evaluate(element => element === document.activeElement));
  await page.getByText('Menu', { exact: true }).click();
  await page.locator('h1').click();
  assert.equal(await page.locator('[data-mobile-navigation]').getAttribute('open'), null);
  await page.getByText('Menu', { exact: true }).click();
  await mobileNav.getByRole('link', { name: 'Playground', exact: true }).click();
  await page.getByRole('heading', { name: 'Playground', exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Extension not connected', exact: true }).waitFor();
  assert(await page.getByRole('button', { name: 'Create disabled draft', exact: true }).isDisabled());
  await page.getByText('Advanced: edit rule JSON', { exact: true }).click();
  const editor = page.getByLabel('Action JSON', { exact: true });
  await editor.fill('[{"type":"delay","milliseconds":800}]');
  await page.getByRole('button', { name: 'Format JSON', exact: true }).click();
  assert((await editor.inputValue()).includes('\n'));
  await page.getByRole('button', { name: 'Send request', exact: true }).click();
  await page.getByText(/200 .*ms/).waitFor();
  assert((await page.locator('main').innerText()).includes('website UI fixture'));
  await page.getByRole('button', { name: 'Reconnect', exact: true }).click();
  await page.getByRole('heading', { name: 'Extension not connected', exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Tab session', exact: true }).count(), 1);
  for (const route of routes) {
    await page.goto(base + route);
    await page.locator('h1').waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Narrow overflow: ' + route);
  }
  await page.goto(base + '/docs/');
  await evidence(page, 'docs-mobile');
  results.interactions.push('390px navigation, Escape/outside dismissal; missing extension, optional JSON formatting and probe');
  for (const [name, userAgent, label, href] of [
    ['Firefox', 'Mozilla/5.0 (X11; Linux x86_64; rv:142.0) Gecko/20100101 Firefox/142.0', 'Add to Firefox', firefoxStore],
    ['Unknown', 'WireflipTestBrowser/1.0', 'Choose your browser', '/docs/#install'],
    ['Mobile', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1', 'Get desktop extension', '/docs/#install'],
  ]) {
    const variant = await browser.newContext({ userAgent, viewport: { width: 1280, height: 800 } });
    const target = await variant.newPage();
    await target.goto(base + '/');
    await target.waitForFunction(label => document.querySelector('[data-install-primary]').textContent.trim() === label, label);
    for (const link of await target.locator('[data-install-primary]').all()) assert.equal(await link.getAttribute('href'), href);
    results.browsers.push({ name, label, href, passed: true });
    await variant.close();
  }
  assert.deepEqual(errors, [], 'Page runtime errors');
  results.browsers.push({ name: 'Chrome', label: 'Add to Chrome', href: chromeStore, passed: true });
  await context.close();
  await browser.close();
  browser = undefined;
  if (process.env.WIREFLIP_LIGHTHOUSE === '1') {
    const run = promisify(execFile);
    for (const route of ['/', '/docs/', '/playground/']) {
      const report = path.join(output, 'lighthouse-' + (route.replaceAll('/', '') || 'home') + '.json');
      await run('pnpm', ['dlx', 'lighthouse@12.8.2', base + route, '--chrome-flags=--headless --no-sandbox --disable-dev-shm-usage', '--only-categories=performance,accessibility,best-practices,seo', '--output=json', '--output-path=' + report, '--quiet'], { cwd: root, env: { ...process.env, CHROME_PATH: chromium.executablePath() }, maxBuffer: 12 * 1024 * 1024 });
      const data = JSON.parse(readFileSync(report));
      const scores = Object.fromEntries(Object.entries(data.categories).map(([key, value]) => [key, Math.round(value.score * 100)]));
      results.lighthouse.push({ route, scores, lcp: data.audits['largest-contentful-paint'].numericValue, cls: data.audits['cumulative-layout-shift'].numericValue });
      console.log('WEBSITE_LIGHTHOUSE ' + JSON.stringify(results.lighthouse.at(-1)));
      writeFileSync(path.join(output, 'checks.json'), JSON.stringify(results, null, 2));
      assert(scores.performance >= 90, 'Mobile performance below 90: ' + route);
      assert(scores.seo >= 95, 'SEO below 95: ' + route);
      assert(scores.accessibility >= 90, 'Accessibility below 90: ' + route);
    }
  }
  writeFileSync(path.join(output, 'checks.json'), JSON.stringify(results, null, 2) + '\n');
  console.log('WEBSITE_QA ' + JSON.stringify(results));
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
