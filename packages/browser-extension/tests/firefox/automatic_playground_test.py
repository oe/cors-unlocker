"""Candidate extension + built website, one real approval and multiple tabs."""
import base64
import json
import unittest
import extension_test as native
import playground_test as playground

class AutomaticPlaygroundTests(playground.PlaygroundTests):
    def click(self, label):
        self.wait(lambda: self.js("""return Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()===arguments[0] && !b.disabled);""", label))
        element = self.command('POST', '/element', {'using': 'xpath', 'value': '//button[normalize-space(.)=' + json.dumps(label) + ']'})
        try:
            self.command('POST', '/element/' + element['element-6066-11e4-a52e-4f735466cecf'] + '/click', {})
        except AssertionError as error:
            if label != 'Enable rule' or not any(value in str(error) for value in ['no such window', 'Browsing context has been discarded']):
                raise

    def test_one_approval_and_automatic_matching_tabs(self):
        self.switch(self.target)
        url = self.site_origin + '/playground/'
        self.navigate(url)
        self.wait(lambda: self.text(), lambda text: 'Extension connected · firefox' in text)
        self.js("""Array.from(document.querySelectorAll('summary')).find(s=>s.textContent.trim()==='Advanced options').click();""")
        probe = self.site_origin + '/probe/mock'
        self.fill('input[value="https://jsonplaceholder.typicode.com/todos/2"]:not([aria-label])', probe)
        self.fill('input[aria-label="Probe URL"]', probe)
        before = set(self.command('GET', '/window/handles'))
        self.click('Enable example')
        approval = self.wait(lambda: set(self.command('GET', '/window/handles')) - before)
        self.switch(next(iter(approval)))
        self.wait(lambda: self.js('return document.body.innerText;'), lambda text: 'Enable this rule?' in (text or ''))
        self.assertIn(self.site_origin, self.js('return document.body.innerText;'))
        self.click('Enable rule')
        self.switch(self.target)
        self.wait(lambda: self.js("""return !document.querySelector('button[aria-label="Test mock"]').disabled;"""))
        self.click('Test mock')
        self.wait(lambda: self.text(), lambda text: 'Mock verified · 418' in text)
        state = self.message('getProxyState')
        rule = state['rules'][0]
        self.assertTrue(rule['enabled'])
        self.assertEqual(rule['match']['initiatorOrigins'], [self.site_origin])
        peer = self.new_page(self.site_origin + '/')
        try:
            self.assertEqual(json.loads(self.fetch(probe, handle=peer)['body']), {'source': 'Wireflip', 'mocked': True})
            tab_id = self.extension_js('return (await browser.tabs.query({})).find(t=>t.url===arguments[0]).id;', url)
            popup = self.new_page(native.EXTENSION + f'/src/popup/index.html?tabId={tab_id}')
            try:
                self.click('Start recording')
                self.click('Stop recording')
                self.assertEqual(json.loads(self.fetch(probe, handle=self.target)['body']), {'source': 'Wireflip', 'mocked': True})
            finally:
                self.switch(popup)
                self.command('DELETE', '/window')
            self.switch(self.target)
            self.navigate(url)
            self.wait(lambda: self.js("""return !document.querySelector('button[aria-label="Test mock"]').disabled;"""))
            self.click('Test mock')
            self.wait(lambda: self.text(), lambda text: 'Mock verified · 418' in text)
            print('CANDIDATE_NEXT_ACTION ' + self.js("""return Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Open rule in Wireflip').className;"""), flush=True)
            data = self.command('GET', '/screenshot')
            (native.ARTIFACTS / 'candidate-playground-one-approval.png').write_bytes(base64.b64decode(data))
            total = (len(data) + 8191) // 8192
            for index in range(total):
                print('WIREFLIP_IMAGE ' + json.dumps(dict(name='candidate-firefox-playground', index=index, total=total, data=data[index*8192:(index+1)*8192])), flush=True)
            self.assertEqual(len(self.message('getProxyState')['rules']), 1)
            self.message('saveProxyRule', rule={'id': rule['id'], 'enabled': False})
            self.switch(self.target)
            self.wait(lambda: self.js("""return document.querySelector('button[aria-label="Test mock"]').disabled;"""))
            self.assertEqual(json.loads(self.fetch(probe, handle=peer)['body']), {'source': 'server'})
        finally:
            self.switch(peer)
            self.command('DELETE', '/window')
            self.switch(self.control)

if __name__ == '__main__':
    result = unittest.TextTestRunner(verbosity=2).run(unittest.TestSuite([
        AutomaticPlaygroundTests('test_one_approval_and_automatic_matching_tabs')]))
    raise SystemExit(not result.wasSuccessful())
