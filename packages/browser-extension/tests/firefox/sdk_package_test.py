"""Exact SDK archives + production bridge over isolated HTTPS origins; no API mocks."""
import json
import mimetypes
from pathlib import Path
import ssl
import subprocess
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit
import extension_test as native

REPO = native.ROOT.parents[1]
PACKAGES = REPO / 'artifacts/sdk-preflight'
SITE = REPO / 'packages/website/dist'
APP = 'https://app.wireflip.test'
OTHER = 'https://other.wireflip.test'
BRIDGE = 'https://cors.forth.ink'


class HttpsFixture(BaseHTTPRequestHandler):
    """Local CONNECT proxy: TLS remains in the browser, with test certificates only."""
    def log_message(self, *args):
        pass

    def do_CONNECT(self):
        if self.path.split(':')[0] not in ('cors.forth.ink', 'app.wireflip.test', 'other.wireflip.test'):
            self.send_error(403)
            return
        self.send_response(200)
        self.end_headers()
        self.connection = self.server.tls.wrap_socket(self.connection, server_side=True)
        self.rfile = self.connection.makefile('rb')
        self.wfile = self.connection.makefile('wb')
        self.close_connection = True
        self.handle_one_request()

    def do_GET(self):
        request_path = urlsplit(self.path).path
        host = self.headers.get('Host', '').split(':')[0]
        if host == 'cors.forth.ink':
            file = SITE / request_path.lstrip('/')
            if request_path.endswith('/'):
                file /= 'index.html'
            self.server.bridge_requests.append(request_path)
            content_type = mimetypes.guess_type(str(file))[0] or 'application/octet-stream'
        elif request_path.startswith('/sdk/'):
            relative = Path(request_path.removeprefix('/sdk/'))
            file = PACKAGES / relative
            content_type = 'text/javascript'
        else:
            self.reply(b'<title>Wireflip packaged SDK acceptance</title><p>Isolated HTTPS SDK fixture</p>', 'text/html')
            return
        base = SITE if host == 'cors.forth.ink' else PACKAGES
        if not file.resolve().is_relative_to(base.resolve()) or not file.is_file():
            self.send_error(404)
            return
        self.reply(file.read_bytes(), content_type)

    def reply(self, body, kind):
        self.send_response(200)
        self.send_header('Content-Type', kind)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Connection', 'close')
        self.end_headers()
        self.wfile.write(body)


class SdkPackageTests(native.FirefoxTests):
    @classmethod
    def setUpClass(cls):
        cls.fixture_temp = tempfile.TemporaryDirectory(prefix='wireflip-sdk-https-')
        cls.addClassCleanup(cls.fixture_temp.cleanup)
        certificate = Path(cls.fixture_temp.name) / 'certificate.pem'
        key = Path(cls.fixture_temp.name) / 'key.pem'
        subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
                        '-keyout', str(key), '-out', str(certificate), '-subj', '/CN=Wireflip isolated SDK test',
                        '-addext', 'subjectAltName=DNS:cors.forth.ink,DNS:app.wireflip.test,DNS:other.wireflip.test'],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        cls.https = ThreadingHTTPServer(('127.0.0.1', 0), HttpsFixture)
        cls.https.daemon_threads = True
        cls.https.tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        cls.https.tls.load_cert_chain(certificate, key)
        cls.https.bridge_requests = []
        def close_fixture():
            cls.https.shutdown()
            cls.https.server_close()
        cls.addClassCleanup(close_fixture)
        threading.Thread(target=cls.https.serve_forever, daemon=True).start()
        cls.accept_insecure_certs = True
        cls.test_preferences = {
            'network.proxy.type': 1, 'network.proxy.ssl': '127.0.0.1',
            'network.proxy.ssl_port': cls.https.server_port,
            'network.proxy.no_proxies_on': 'localhost,127.0.0.1',
        }
        super().setUpClass()

    def setUp(self):
        super().setUp()
        self.switch(self.target)
        self.navigate(APP + '/')
        self.switch(self.other)
        self.navigate(OTHER + '/')
        self.switch(self.target)

    def tearDown(self):
        # Uninstall deliberately closes privileged tabs during the missing-extension check.
        if not getattr(self, 'addon_removed', False):
            super().tearDown()

    def load(self, label, entry):
        result = self.async_js('window.sdk=await import(arguments[0]);return Object.keys(window.sdk);', f'/sdk/{label}/package/dist/{entry}')
        self.assertIn('default', result, result)

    def call(self, expression):
        return self.async_js('return ' + expression + ';')

    def consent(self, expression, accept):
        # Keep the real modal and respond with native WebDriver alert commands.
        self.js('window.sdkResult=null;(' + expression + ').then(data=>window.sdkResult={data:data??null},error=>window.sdkResult={error:{type:error.type,message:error.message}});')
        def alert():
            try:
                return self.command('GET', '/alert/text')
            except AssertionError:
                return None
        self.wait(alert)
        self.command('POST', '/alert/accept' if accept else '/alert/dismiss', {})
        return self.wait(lambda: self.js('return window.sdkResult;'))

    def open_workspace(self, expression):
        self.assertIsNone(self.call(expression))
        # Browsers focus an already-open options tab instead of creating a duplicate.
        self.command('POST', '/moz/context', {'context': 'chrome'})
        try:
            self.wait(lambda: self.js('return gBrowser.selectedBrowser.currentURI.spec;'),
                      lambda url: url.endswith('/src/options/index.html'))
        finally:
            self.command('POST', '/moz/context', {'context': 'content'})
        self.switch(self.control)
        self.assertTrue(self.js('return !!document.querySelector("main");'))
        self.switch(self.target)

    def verify_legacy(self, label):
        self.load(label, 'index.es.js')
        self.assertTrue(self.call('sdk.default.isExtInstalled()'))
        self.assertEqual(self.call('sdk.default.isEnabled()'), {'enabled': False, 'credentials': False})
        self.assertEqual(self.consent('sdk.default.enable({credentials:false})', False)['error']['type'], 'user-cancel')
        self.assertFalse(self.call('sdk.default.isEnabled()')['enabled'])
        self.assertTrue(self.consent('sdk.default.enable({credentials:true})', True)['data']['enabled'])
        self.assertEqual(self.call('sdk.default.isEnabled()'), {'enabled': True, 'credentials': True})
        self.switch(self.other)
        self.load(label, 'index.es.js')
        self.assertFalse(self.call('sdk.default.isEnabled()')['enabled'])
        self.switch(self.target)
        self.assertIsNone(self.call('sdk.default.disable()'))
        self.assertFalse(self.call('sdk.default.isEnabled()')['enabled'])
        self.open_workspace('sdk.default.openExtOptions()')
        frame = self.js('return document.querySelector("iframe.cors-unlocker-frame").src;')
        self.assertTrue(frame.startswith(BRIDGE + '/message/index.html?'), frame)
        self.assertIn('/message/index.html', self.https.bridge_requests)
        self.command('POST', '/frame', {'id': self.command('POST', '/element', {'using': 'css selector', 'value': 'iframe.cors-unlocker-frame'})})
        self.assertEqual(self.js('return location.origin;'), BRIDGE)
        self.command('POST', '/frame', {'id': None})

    def test_published_legacy_archive(self):
        self.verify_legacy('legacy-0.1.0')

    def test_documentation_patch_archive(self):
        self.verify_legacy('legacy-0.1.1')

    def test_new_archive(self):
        self.load('new', 'index.mjs')
        status = self.call('(async()=>{window.session=await sdk.intercept.connect();return {origin:session.origin,capabilities:session.capabilities,status:await session.getStatus()};})()')
        self.assertEqual(status['origin'], APP)
        self.assertEqual(status['capabilities']['browser'], 'firefox')
        self.assertEqual(status['capabilities']['interception']['responseMock'], 'body-replacement')
        self.assertEqual(status['status']['advancedMode'], 'disabled')
        self.assertEqual(self.consent('session.requestCors({reason:"Archive acceptance"})', False)['error']['type'], 'user-cancel')
        self.assertFalse(self.call('session.getStatus()')['cors']['enabled'])
        self.assertTrue(self.consent('session.requestCors({credentials:false})', True)['data']['cors']['enabled'])
        self.assertFalse(self.call('session.disableCors()')['cors']['enabled'])
        draft = self.call('session.createRuleDraft({name:"Exact archive",urlPattern:"https://api.example.com/*",actions:[{type:"delay",milliseconds:800}]},{openWorkspace:false})')
        self.assertFalse(draft['enabled'])
        state = self.message('getProxyState')
        stored = next(rule for rule in state['rules'] if rule['id'] == draft['id'])
        self.assertEqual(stored['match']['initiatorOrigins'], [APP])
        self.switch(self.target)
        self.open_workspace('session.openWorkspace()')
        self.switch(self.other)
        self.load('new', 'index.mjs')
        self.assertFalse(self.call('(async()=>{const s=await sdk.intercept.connect();return (await s.getStatus()).cors.enabled;})()'))
        self.assertEqual(self.message('getAdvancedProxyStatus', tabId=self.tab_id)['phase'], 'disabled')
        self.command('POST', '/moz/addon/uninstall', {'id': native.ADDON_ID})
        self.addon_removed = True
        self.switch(self.target)
        self.navigate(APP + '/')
        self.load('new', 'index.mjs')
        self.assertFalse(self.call('sdk.intercept.isAvailable()'))
        self.assertEqual(self.call('sdk.intercept.connect().catch(e=>({type:e.type}))'), {'type': 'not-installed'})


if __name__ == '__main__':
    tests = ['test_published_legacy_archive', 'test_documentation_patch_archive', 'test_new_archive']
    result = unittest.TextTestRunner(verbosity=2).run(unittest.TestSuite(SdkPackageTests(name) for name in tests))
    if result.wasSuccessful():
        (PACKAGES / 'firefox-results.json').write_text(json.dumps({
            'tests': tests, 'passed': result.testsRun,
            'browser': json.loads((native.ARTIFACTS / 'browser.json').read_text())['browserVersion'],
            'transport': 'isolated HTTPS CONNECT fixture; original SDK URLs and production APIs',
        }, indent=2) + '\n')
    raise SystemExit(not result.wasSuccessful())
