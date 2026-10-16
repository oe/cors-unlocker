"""Built Playground + the unmodified signed AMO add-on in real Firefox.

The probe endpoint is an actual HTTP server, not a Playwright route or fetch mock.
All activation uses the shipped workspace/Popup UI. State reads only verify it.
"""
import base64
import functools
import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading
import unittest
import extension_test as native

SITE = native.ROOT.parents[1] / 'packages/website/dist'


class SiteHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        if self.path.split('?')[0] == '/probe/mock':
            body = b'{"source":"server"}'
            self.send_response(418)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Cache-Control', 'public, max-age=3600')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            super().do_GET()


class PlaygroundTests(native.FirefoxTests):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.site = ThreadingHTTPServer(('127.0.0.1', 0),
            functools.partial(SiteHandler, directory=str(SITE)))
        cls.site.daemon_threads = True
        threading.Thread(target=cls.site.serve_forever, daemon=True).start()
        cls.addClassCleanup(cls.site.server_close)
        cls.addClassCleanup(cls.site.shutdown)
        cls.site_origin = f'http://127.0.0.1:{cls.site.server_port}'

    def text(self):
        return self.js("""return document.querySelector("main").textContent;""")

    def click(self, label):
        self.wait(lambda: self.js("""return Array.from(document.querySelectorAll("button")).some(b=>b.textContent.trim()===arguments[0] && !b.disabled);""", label))
        self.js("""Array.from(document.querySelectorAll("button")).find(b=>b.textContent.trim()===arguments[0]).click();""", label)

    def fill(self, selector, value):
        self.js("""const el=document.querySelector(arguments[0]);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(el,arguments[1]);el.dispatchEvent(new Event("input",{bubbles:true}));""", selector, value)

    def capture(self, name):
        self.js("""document.querySelector('button[aria-label="Test mock"]').scrollIntoView({block:"center"});""")
        data = self.command('GET', '/screenshot')
        (native.ARTIFACTS / (name + '.png')).write_bytes(base64.b64decode(data))
        if name == 'playground-public-recipe-verified':
            total = (len(data) + 8191) // 8192
            for index in range(total):
                print('WIREFLIP_IMAGE ' + json.dumps(dict(name=name, index=index, total=total, data=data[index*8192:(index+1)*8192])), flush=True)

    def test_public_mock_recipe(self):
        # Keep the public recipe URL and actions exactly as a visitor receives them.
        self.switch(self.target)
        self.navigate(self.site_origin + '/playground/')
        self.wait(lambda: self.text(), lambda text: 'Extension connected · firefox' in text)
        self.click('Add rule in Wireflip')
        self.wait(lambda: self.message('getProxyState'), lambda state: len(state['rules']) == 1)
        self.switch(self.control)
        self.wait(lambda: self.js("""return !!document.querySelector('[role="switch"][aria-label="Toggle Playground · Mock response"]');"""))
        self.js("""document.querySelector('[role="switch"][aria-label="Toggle Playground · Mock response"]').click();""")
        self.wait(lambda: self.message('getProxyState')['rules'][0]['enabled'])
        tab_id = self.extension_js('return (await browser.tabs.query({})).find(t=>t.url===arguments[0]).id;', self.site_origin + '/playground/')
        popup = self.new_page(native.EXTENSION + f'/src/popup/index.html?tabId={tab_id}')
        try:
            self.click('Start tab session')
            self.switch(self.target)
            self.wait(lambda: self.js("""return !document.querySelector('button[aria-label="Test mock"]').disabled;"""))
            self.click('Test mock')
            self.wait(lambda: self.text(), lambda text: 'Mock verified · 200' in text, timeout=25)
            self.capture('playground-public-recipe-verified')
        finally:
            self.message('disableAdvancedProxy', tabId=tab_id)
            self.switch(popup)
            self.command('DELETE', '/window')
            self.switch(self.target)

    def test_mock_journey(self):
        self.switch(self.target)
        self.navigate(self.site_origin + '/playground/')
        self.wait(lambda: self.text(), lambda text: 'Extension connected · firefox' in text)
        self.assertTrue(self.js("""return document.querySelector('button[aria-label="Test mock"]').disabled;"""))
        self.assertIn('First add and enable', self.text())
        # Keep the exact recipe body; use a deterministic real upstream that returns 418.
        upstream = self.site_origin + '/probe/mock'
        self.fill('input[value="https://jsonplaceholder.typicode.com/todos/1"]:not([aria-label])', upstream)
        self.fill('input[aria-label="Probe URL"]', upstream)
        self.click('Add rule in Wireflip')
        state = self.wait(lambda: self.message('getProxyState'), lambda state: len(state['rules']) == 1)
        rule = state['rules'][0]
        self.assertFalse(rule['enabled'])
        self.assertEqual(rule['match']['initiatorOrigins'], [self.site_origin])
        self.assertEqual(rule['actions'][0]['body'], '{\n  "source": "Wireflip",\n  "mocked": true\n}')
        # The shipped workspace switch is the user's explicit rule enable action.
        self.switch(self.control)
        self.wait(lambda: self.js("""return !!document.querySelector('[role="switch"][aria-label="Toggle Playground · Mock response"]');"""))
        self.js("""document.querySelector('[role="switch"][aria-label="Toggle Playground · Mock response"]').click();""")
        self.wait(lambda: self.message('getProxyState')['rules'][0]['enabled'])
        self.switch(self.target)
        self.wait(lambda: self.text(), lambda text: 'Start a session for this Playground tab' in text)
        self.assertTrue(self.js("""return document.querySelector('button[aria-label="Test mock"]').disabled;"""))
        # Reproduce the reported failure: an enabled rule with no tab session
        # still returns the actual server body. This is not a broken mock filter.
        raw = self.fetch(upstream)
        self.assertEqual(json.loads(raw['body'])['source'], 'server')
        self.switch(self.target)
        tab_id = self.extension_js('return (await browser.tabs.query({})).find(t=>t.url===arguments[0]).id;', self.site_origin + '/playground/')
        popup = self.new_page(native.EXTENSION + f'/src/popup/index.html?tabId={tab_id}')
        self.click('Start tab session')
        self.wait(lambda: self.text(), lambda text: 'Tab session active' in text)
        self.switch(self.target)
        self.wait(lambda: self.js("""return !document.querySelector('button[aria-label="Test mock"]').disabled;"""))
        self.click('Test mock')
        self.wait(lambda: self.text(), lambda text: 'Mock verified · 418' in text)
        self.capture('playground-mock-verified')
        logs = self.message('getAdvancedProxyLog', tabId=tab_id)
        self.assertTrue(any(rule['id'] in entry['matchedRuleIds'] and entry['outcome'] == 'mocked' for entry in logs), logs)
        # Reopening the workspace must not create duplicate drafts.
        self.switch(self.target)
        self.click('Open rule in Wireflip')
        self.assertEqual(len(self.message('getProxyState')['rules']), 1)
        self.switch(self.control)
        self.js("""document.querySelector('[role="switch"][aria-label="Toggle Playground · Mock response"]').click();""")
        self.wait(lambda: self.message('getProxyState')['rules'][0]['enabled'], lambda enabled: not enabled)
        self.switch(self.target)
        self.click('Test mock')
        self.wait(lambda: self.text(), lambda text: 'Mock did not match · 418' in text)
        self.assertNotIn('Mock verified', self.text())
        self.capture('playground-disabled-rule-mismatch')
        self.switch(popup)
        self.click('Stop tab session')
        self.switch(self.target)
        self.wait(lambda: self.js("""return document.querySelector('button[aria-label="Test mock"]').disabled;"""))
        self.capture('playground-session-stopped')
        self.message('disableAdvancedProxy', tabId=tab_id)
        self.switch(popup)
        self.command('DELETE', '/window')
        self.switch(self.target)


if __name__ == '__main__':
    result = unittest.TextTestRunner(verbosity=2).run(
        unittest.TestSuite([PlaygroundTests('test_mock_journey'), PlaygroundTests('test_public_mock_recipe')]))
    raise SystemExit(not result.wasSuccessful())
