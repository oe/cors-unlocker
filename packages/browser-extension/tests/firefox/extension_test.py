"""Real Firefox + temporary production add-on; stdlib WebDriver, no mocked APIs."""
import base64
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import zipfile

ROOT = Path(__file__).resolve().parents[2]
ADDON_ID = 'cors-unlocker@forth.ink'
UUID = '1f531245-f000-4ff9-9aba-f11111111111'
EXTENSION = f'moz-extension://{UUID}'
EMPTY = dict(cors=False, credentials=False, disableCache=False, delayMs=0, failure=False)
ARTIFACTS = Path(os.environ.get('FIREFOX_TEST_ARTIFACTS', ROOT / 'test-results/firefox'))


class Fixture(BaseHTTPRequestHandler):
    hits = {}

    def log_message(self, *args):
        pass

    def do_OPTIONS(self):
        self.send_response(403)
        self.end_headers()

    def do_GET(self):
        path = self.path.split('?')[0]
        self.hits[path] = self.hits.get(path, 0) + 1
        if path == '/':
            body = b'<title>Firefox request fixture</title><p>Real browser fixture</p>'
            kind = 'text/html'
        else:
            body = json.dumps({'path': path, 'headers': dict(self.headers), 'source': 'server'}).encode()
            kind = 'application/json'
        self.send_response(418 if path == '/mock' else 200)
        self.send_header('Content-Type', kind)
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class FirefoxTests(unittest.TestCase):
    @classmethod
    def request(cls, method, path, data=None):
        payload = None if data is None else json.dumps(data).encode()
        request = urllib.request.Request(cls.base + path, data=payload, method=method,
                                         headers={'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(request, timeout=35) as response:
                value = json.load(response)['value']
        except urllib.error.HTTPError as error:
            raise AssertionError(error.read().decode()) from error
        return value

    @classmethod
    def command(cls, method, path, data=None):
        return cls.request(method, f'/session/{cls.session}{path}', data)

    @classmethod
    def js(cls, source, *args):
        return cls.command('POST', '/execute/sync', {'script': source, 'args': list(args)})

    @classmethod
    def async_js(cls, source, *args):
        return cls.command('POST', '/execute/async', {
            'script': 'const done=arguments[arguments.length-1];Promise.resolve().then(async()=>{' + source + '}).then(done,e=>done({error:String(e)}));',
            'args': list(args),
        })

    @classmethod
    def wait(cls, read, predicate=lambda x: bool(x), timeout=10):
        end = time.monotonic() + timeout
        last = None
        while time.monotonic() < end:
            last = read()
            if predicate(last):
                return last
            time.sleep(0.05)
        raise AssertionError(f'Condition timed out: {last!r}')

    @classmethod
    def switch(cls, handle):
        cls.command('POST', '/window', {'handle': handle})

    @classmethod
    def navigate(cls, url):
        if url.startswith('moz-extension:'):
            # Firefox restricts privileged URL navigation to the native browser context.
            previous_url = cls.js('return location.href;')
            cls.command('POST', '/moz/context', {'context': 'chrome'})
            try:
                cls.js('''const target=gBrowser.browsers.find(b=>b.currentURI.spec===arguments[1]);
                if(!target) throw Error("WebDriver tab was not found in the native browser");
                gBrowser.selectedTab=gBrowser.getTabForBrowser(target);
                target.loadURI(Services.io.newURI(arguments[0]),{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});''', url, previous_url)
            finally:
                cls.command('POST', '/moz/context', {'context': 'content'})
            cls.wait(lambda: cls.js('return location.href === arguments[0] && document.readyState === "complete";', url))
        else:
            cls.command('POST', '/url', {'url': url})

    @classmethod
    def new_page(cls, url):
        handle = cls.command('POST', '/window/new', {'type': 'tab'})['handle']
        cls.switch(handle)
        cls.navigate(url)
        return handle

    @classmethod
    def extension_js(cls, source, *args):
        cls.switch(cls.control)
        return cls.async_js(source, *args)

    @classmethod
    def message(cls, kind, **payload):
        return cls.extension_js('return browser.runtime.sendMessage(arguments[0]);', {'type': kind, 'payload': payload})

    @classmethod
    def fetch(cls, path, handle=None, **options):
        cls.switch(handle or cls.target)
        return cls.async_js('''const started=performance.now();try {const r=await fetch(arguments[0],{...arguments[1],signal:AbortSignal.timeout(10000)});return {status:r.status,body:await r.text(),headers:Object.fromEntries(r.headers),duration:performance.now()-started};}catch(e){return {failed:true,error:String(e),duration:performance.now()-started};}''', path, options)

    @classmethod
    def setUpClass(cls):
        ARTIFACTS.mkdir(parents=True, exist_ok=True)
        firefox = os.environ.get('FIREFOX_BINARY', 'firefox')
        gecko = os.environ.get('GECKODRIVER', 'geckodriver')
        cls.temp = tempfile.TemporaryDirectory(prefix='forth-firefox-')
        cls.addClassCleanup(cls.cleanup)
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        cls.base = f'http://127.0.0.1:{port}'
        cls.driver_log = (ARTIFACTS / 'geckodriver.log').open('w')
        cls.driver = subprocess.Popen([gecko, '--host', '127.0.0.1', '--port', str(port), '--allow-system-access', '--log', 'warn'], stdout=cls.driver_log, stderr=subprocess.STDOUT)
        def ready():
            try:
                return cls.request('GET', '/status')
            except (OSError, AssertionError):
                return False
        cls.wait(ready)
        result = cls.request('POST', '/session', {'capabilities': {'alwaysMatch': {
            'browserName': 'firefox', 'moz:firefoxOptions': {'binary': firefox, 'args': ['-headless'], 'prefs': {
                'extensions.webextensions.uuids': json.dumps({ADDON_ID: UUID}),
                'datareporting.policy.dataSubmissionEnabled': False,
            }}}}})
        cls.session = result['sessionId']
        (ARTIFACTS / 'browser.json').write_text(json.dumps(result['capabilities'], indent=2))
        print(f"\nReal Firefox {result['capabilities']['browserVersion']}", flush=True)
        cls.command('POST', '/timeouts', {'script': 15000, 'pageLoad': 20000})
        archive = Path(cls.temp.name) / 'extension.xpi'
        with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
            for path in (ROOT / 'dist/firefox').rglob('*'):
                if path.is_file():
                    z.write(path, path.relative_to(ROOT / 'dist/firefox'))
        assert cls.command('POST', '/moz/addon/install', {'path': str(archive), 'temporary': True}) == ADDON_ID
        cls.control = cls.command('GET', '/window')
        cls.navigate(EXTENSION + '/src/options/index.html')
        cls.wait(lambda: cls.js('return typeof browser !== "undefined" && !!document.querySelector("main");'))
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), Fixture)
        cls.server.daemon_threads = True
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.origin = f'http://127.0.0.1:{cls.server.server_port}'
        cls.other_origin = f'http://localhost:{cls.server.server_port}'
        cls.target = cls.new_page(cls.origin + '/')
        cls.other = cls.new_page(cls.other_origin + '/')
        cls.tab_id = cls.extension_js('return (await browser.tabs.query({})).find(t=>t.url===arguments[0]).id;', cls.origin + '/')

    @classmethod
    def cleanup(cls):
        try:
            if hasattr(cls, 'session'):
                cls.command('DELETE', '')
        finally:
            if hasattr(cls, 'server'):
                cls.server.shutdown()
                cls.server.server_close()
            if hasattr(cls, 'driver'):
                cls.driver.terminate()
                cls.driver.wait(timeout=10)
            if hasattr(cls, 'driver_log'):
                cls.driver_log.close()
            cls.temp.cleanup()

    def setUp(self):
        self.message('disableAdvancedProxy', tabId=self.tab_id)
        state = self.message('getProxyState')
        for rule in state['rules']:
            self.message('deleteProxyRule', id=rule['id'])
        self.extension_js('await browser.storage.local.set({uiLanguage:"en"});')
        self.switch(self.target)
        self.navigate(self.origin + '/')
        self.switch(self.other)
        self.navigate(self.other_origin + '/')
        self.message('clearAdvancedProxyLog', tabId=self.tab_id)

    def tearDown(self):
        self.switch(self.control)
        screenshot = self.command('GET', '/screenshot')
        (ARTIFACTS / f'{self._testMethodName}.png').write_bytes(base64.b64decode(screenshot))

    def save(self, actions, path='*', **match):
        response = self.message('saveProxyRule', rule={'name': self._testMethodName, 'enabled': True,
            'match': {'initiatorOrigins': [self.origin], 'urlPattern': self.origin + path if path != '*' else '*', **match}, 'actions': actions})
        self.assertTrue(response.get('success'), response)
        return response['rule']

    def start(self, **controls):
        payload = {'tabId': self.tab_id}
        if controls:
            payload['quickControls'] = {**EMPTY, **controls}
        self.assertEqual(self.message('enableAdvancedProxy', **payload)['phase'], 'connected')

    def update(self, **controls):
        return self.message('updateQuickControls', tabId=self.tab_id, quickControls={**EMPTY, **controls})

    def browser_errors(self):
        self.command('POST', '/moz/context', {'context': 'chrome'})
        try:
            return self.js('return Services.console.getMessageArray().map(m=>m.errorMessage || m.message).filter(m=>m && /cors|origin|cross|header/i.test(m));')
        finally:
            self.command('POST', '/moz/context', {'context': 'content'})

    def toolbar(self):
        return self.extension_js('return {title:await browser.action.getTitle({tabId:arguments[0]}),badge:await browser.action.getBadgeText({tabId:arguments[0]}),color:await browser.action.getBadgeBackgroundColor({tabId:arguments[0]})};', self.tab_id)

    def test_persistent_headers_redirect_block_and_origin_scope(self):
        self.save([{'type': 'setRequestHeaders', 'headers': {'X-Forth-Test': 'native-firefox'}}, {'type': 'setResponseHeaders', 'headers': {'X-Forth-Response': 'patched'}}], '/echo')
        self.save([{'type': 'redirect', 'url': self.origin + '/destination'}], '/redirect')
        self.save([{'type': 'block'}], '/blocked')
        self.wait(self.toolbar, lambda t: t['badge'] == '3')
        result = self.fetch('/echo')
        self.assertEqual(json.loads(result['body'])['headers'].get('X-Forth-Test'), 'native-firefox', result)
        self.assertEqual(result['headers'].get('x-forth-response'), 'patched')
        self.assertEqual(json.loads(self.fetch('/redirect')['body'])['path'], '/destination')
        before = Fixture.hits.get('/blocked', 0)
        self.assertTrue(self.fetch('/blocked').get('failed'))
        self.assertEqual(Fixture.hits.get('/blocked', 0), before)
        other = self.fetch('/echo', handle=self.other)
        self.assertNotIn('X-Forth-Test', json.loads(other['body'])['headers'])

    def test_body_mock_contacts_server_preserves_status_and_stops(self):
        body = '{"source":"本地 Firefox mock"}'
        self.save([{'type': 'mockResponse', 'status': 202, 'headers': {'Content-Type': 'application/json'}, 'body': body}], '/mock', resourceTypes=['Fetch'])
        self.start()
        before = Fixture.hits.get('/mock', 0)
        result = self.fetch('/mock')
        self.assertEqual(result['body'], body, result)
        self.assertEqual(result['status'], 418)
        self.assertEqual(Fixture.hits['/mock'], before + 1)
        logs = self.wait(lambda: self.message('getAdvancedProxyLog', tabId=self.tab_id), lambda entries: any(e['outcome'] == 'mocked' for e in entries))
        self.assertTrue(any(e['status'] == 418 and e['matchedRuleIds'] for e in logs))
        self.message('disableAdvancedProxy', tabId=self.tab_id)
        self.assertEqual(json.loads(self.fetch('/mock')['body'])['source'], 'server')

    def test_cors_header_repair_credentials_and_preflight_limit(self):
        self.assertTrue(self.fetch(self.other_origin + '/cors').get('failed'))
        self.start(cors=True)
        result = self.fetch(self.other_origin + '/cors')
        self.assertEqual(result.get('status'), 200, {'fetch': result, 'logs': self.message('getAdvancedProxyLog', tabId=self.tab_id), 'console': self.browser_errors()})
        self.assertFalse(any('Disallowed change restricted response header' in error for error in self.browser_errors()))
        self.update(cors=True, credentials=True)
        self.assertEqual(self.fetch(self.other_origin + '/cors', credentials='include')['status'], 200)
        # Firefox patches response headers; it cannot synthesize a successful failed preflight.
        self.assertTrue(self.fetch(self.other_origin + '/cors', headers={'X-Needs-Preflight': 'yes'}).get('failed'))
        self.message('disableAdvancedProxy', tabId=self.tab_id)
        self.assertTrue(self.fetch(self.other_origin + '/cors').get('failed'))

    def test_delay_failure_tooltip_and_recovery(self):
        self.start(delayMs=500)
        self.wait(self.toolbar, lambda t: 'Request delay: 500 ms' in t['title'])
        self.assertEqual(self.toolbar()['color'], [21, 128, 61, 255])
        result = self.fetch('/delay')
        self.assertGreaterEqual(result['duration'], 450, result)
        self.assertLess(result['duration'], 5000)
        self.assertNotIn('X-Forth-Test', json.loads(self.fetch('/delay', handle=self.other)['body'])['headers'])
        self.update(failure=True)
        self.wait(self.toolbar, lambda t: 'Simulate failure' in t['title'] and 'Request delay' not in t['title'])
        before = Fixture.hits.get('/failure', 0)
        self.assertTrue(self.fetch('/failure').get('failed'))
        self.assertEqual(Fixture.hits.get('/failure', 0), before)
        self.message('disableAdvancedProxy', tabId=self.tab_id)
        self.wait(self.toolbar, lambda t: t['badge'] == '' and 'temporary' not in t['title'])
        self.assertEqual(self.fetch('/failure')['status'], 200)

    def test_navigation_clears_controls_but_persistent_rules_remain(self):
        self.save([{'type': 'setResponseHeaders', 'headers': {'X-Persist': 'yes'}}], '/echo')
        self.start(failure=True)
        self.switch(self.target)
        self.navigate(self.other_origin + '/')
        self.wait(lambda: self.message('getAdvancedProxyStatus', tabId=self.tab_id), lambda s: s['phase'] == 'disabled')
        self.wait(self.toolbar, lambda t: t['badge'] == '' and 'Simulate failure' not in t['title'])
        self.switch(self.target)
        self.navigate(self.origin + '/')
        self.wait(self.toolbar, lambda t: t['badge'] == '1')
        self.assertEqual(self.fetch('/echo')['headers'].get('x-persist'), 'yes')

    def test_saved_cors_edits_apply_only_while_the_session_is_connected(self):
        rule = self.save([{'type': 'cors', 'allowOrigin': '*', 'allowCredentials': False,
                          'allowMethods': ['GET'], 'allowHeaders': []}], '*', resourceTypes=['Fetch'])
        self.assertTrue(self.fetch(self.other_origin + '/cors').get('failed'))
        self.start()
        self.assertEqual(self.fetch(self.other_origin + '/cors')['status'], 200)
        self.wait(self.toolbar, lambda t: t['badge'] == 'ON' and '0 persistent rules' in t['title'])
        rule['enabled'] = False
        self.assertTrue(self.message('saveProxyRule', rule=rule)['success'])
        self.assertTrue(self.fetch(self.other_origin + '/cors').get('failed'))
        rule['enabled'] = True
        self.assertTrue(self.message('saveProxyRule', rule=rule)['success'])
        self.assertEqual(self.fetch(self.other_origin + '/cors')['status'], 200)
        self.message('disableAdvancedProxy', tabId=self.tab_id)
        self.assertTrue(self.fetch(self.other_origin + '/cors').get('failed'))
        self.wait(self.toolbar, lambda t: t['badge'] == '')

    def test_quick_cors_does_not_leak_to_another_tab_on_the_same_origin(self):
        peer = self.new_page(self.origin + '/#peer')
        try:
            self.start(cors=True)
            self.assertEqual(self.fetch(self.other_origin + '/cors')['status'], 200)
            self.assertTrue(self.fetch(self.other_origin + '/cors', handle=peer).get('failed'))
        finally:
            self.switch(peer)
            self.command('DELETE', '/window')
            self.switch(self.control)

    def test_closing_a_tab_removes_its_session_cors_rules(self):
        closing = self.new_page(self.origin + '/#closing')
        tab_id = self.extension_js('return (await browser.tabs.query({})).find(t=>t.url===arguments[0]).id;', self.origin + '/#closing')
        self.assertEqual(self.message('enableAdvancedProxy', tabId=tab_id, quickControls={**EMPTY, 'cors': True})['phase'], 'connected')
        self.switch(closing)
        self.command('DELETE', '/window')
        self.switch(self.control)
        self.wait(lambda: self.extension_js('return browser.declarativeNetRequest.getSessionRules();'),
                  lambda rules: not any(tab_id in r['condition'].get('tabIds', []) for r in rules))
        self.assertEqual(self.message('getAdvancedProxyStatus', tabId=tab_id)['phase'], 'disabled')

    def test_sensitive_headers_are_redacted_in_real_logs(self):
        self.start()
        self.fetch('/secret', headers={'Authorization': 'Bearer firefox-test-secret'})
        logs = self.wait(lambda: self.message('getAdvancedProxyLog', tabId=self.tab_id), lambda entries: any(e['url'].endswith('/secret') and e['requestHeaders'] for e in entries))
        entry = next(e for e in logs if e['url'].endswith('/secret'))
        self.assertNotIn('firefox-test-secret', json.dumps(entry))
        self.assertIn('••••••••', entry['requestHeaders'].values())

    def test_sdk_connect_and_disabled_origin_scoped_draft(self):
        self.switch(self.target)
        def sdk(method, payload=None):
            return self.async_js('''return new Promise((resolve,reject)=>{const id=crypto.randomUUID();const clientId="firefox-native-test";const timer=setTimeout(()=>{window.removeEventListener("message",receive);reject(Error("SDK timeout"));},5000);function receive(event){if(event.source===window && event.data?.type==="forth-intercept:sdk-response" && event.data.id===id){clearTimeout(timer);window.removeEventListener("message",receive);resolve(event.data);}}window.addEventListener("message",receive);window.postMessage({type:"forth-intercept:sdk-request",clientId,id,method:arguments[0],payload:arguments[1]},location.origin);});''', method, payload)
        connected = sdk('connect')
        self.assertIn('data', connected, connected)
        self.assertIn('capabilities', connected['data'])
        draft = sdk('createRuleDraft', {'rule': {'name': 'Native Firefox SDK', 'enabled': True, 'initiatorOrigins': [self.other_origin], 'urlPattern': '*', 'actions': [{'type': 'delay', 'milliseconds': 100}]}})
        self.assertIn('data', draft, draft)
        state = self.message('getProxyState')
        self.assertEqual(len(state['rules']), 1)
        self.assertFalse(state['rules'][0]['enabled'])
        self.assertEqual(state['rules'][0]['match']['initiatorOrigins'], [self.origin])
        self.assertEqual(self.message('getAdvancedProxyStatus', tabId=self.tab_id)['phase'], 'disabled')

    def test_popup_and_inspector_render_in_six_languages(self):
        popup = self.new_page(EXTENSION + f'/src/popup/index.html?tabId={self.tab_id}')
        try:
            self.wait(lambda: self.js('return [...document.querySelectorAll("[role=switch]")].some(e=>e.getAttribute("aria-label")==="CORS repair" && !e.disabled);'))
            switch = self.command('POST', '/element', {'using': 'css selector', 'value': '[role=switch][aria-label="CORS repair"]'})
            self.command('POST', '/element/' + switch['element-6066-11e4-a52e-4f735466cecf'] + '/click', {})
            self.wait(self.toolbar, lambda t: t['badge'] == 'ON' and 'CORS repair' in t['title'])
            self.assertEqual(self.fetch(self.other_origin + '/cors')['status'], 200)
            self.switch(popup)
            stop = self.command('POST', '/element', {'using': 'xpath', 'value': '//button[normalize-space(.)="Stop tab session"]'})
            self.command('POST', '/element/' + stop['element-6066-11e4-a52e-4f735466cecf'] + '/click', {})
            self.wait(self.toolbar, lambda t: t['badge'] == '')
            self.switch(popup)
            chrome_width = self.js('return outerWidth - innerWidth;')
            self.command('POST', '/window/rect', {'width': 390 + chrome_width, 'height': 844})
            for locale in ['en', 'zh-CN', 'ko', 'ja', 'fr', 'es']:
                self.extension_js('await browser.storage.local.set({uiLanguage:arguments[0]});', locale)
                self.switch(popup)
                self.wait(lambda: self.js('return document.documentElement.lang;'), lambda lang: lang == locale)
                self.assertTrue(self.js('return document.documentElement.scrollWidth <= innerWidth;'), self.js('return {url:location.href,inner:innerWidth,scroll:document.documentElement.scrollWidth,body:document.body.innerText,overflow:[...document.querySelectorAll("*")].filter(e=>e.getBoundingClientRect().right>innerWidth).slice(0,8).map(e=>({tag:e.tagName,cls:e.className,width:e.getBoundingClientRect().width}))};'))
                self.assertEqual(self.js('return document.querySelectorAll("[role=switch]").length;'), 4)
                if locale in ['zh-CN', 'ja', 'ko']:
                    self.assertIn('Noto Sans CJK', self.js('return getComputedStyle(document.body).fontFamily;'))
                self.assertNotIn('Disable cache', self.js('return document.body.innerText;'))
                (ARTIFACTS / f'popup-{locale}.png').write_bytes(base64.b64decode(self.command('GET', '/screenshot')))
            self.extension_js('await browser.storage.local.set({uiLanguage:"en"});')
            self.switch(popup)
            self.navigate(EXTENSION + f'/src/sidepanel/index.html?tabId={self.tab_id}')
            self.wait(lambda: self.js('return document.body.innerText;'), lambda text: 'Tab session stopped' in text)
            self.assertTrue(self.js('return document.documentElement.scrollWidth <= innerWidth;'))
            (ARTIFACTS / 'inspector.png').write_bytes(base64.b64decode(self.command('GET', '/screenshot')))
        finally:
            self.switch(popup)
            self.command('DELETE', '/window')
            self.switch(self.control)


if __name__ == '__main__':
    unittest.main(verbosity=2)
