"""Small deterministic checks for native DOM reacquisition; no browser required."""
import unittest
from unittest.mock import patch
import extension_test as native


class HarnessTests(unittest.TestCase):
    def test_reacquires_replaced_input_without_repeating_a_save(self):
        lookups = []
        calls = []

        def command(method, path, data):
            calls.append(path)
            if path == '/element':
                node = 'old' if not lookups else 'new'
                lookups.append(node)
                return {'element-6066-11e4-a52e-4f735466cecf': node}
            if path == '/element/old/clear':
                raise native.WebDriverError({'value': {'error': 'stale element reference'}})
        with patch.object(native.FirefoxTests, 'command', side_effect=command), patch.object(native.FirefoxTests, 'js', return_value=True):
            native.FirefoxTests.fill('#rule-name', 'New name')
        self.assertEqual(lookups, ['old', 'new'])
        self.assertEqual(calls[-2:], ['/element/new/clear', '/element/new/value'])

    def test_other_webdriver_errors_fail_immediately(self):
        error = native.WebDriverError({'value': {'error': 'invalid session id'}})
        with patch.object(native.FirefoxTests, 'command', side_effect=error) as command, patch.object(native.FirefoxTests, 'js', return_value=True):
            with self.assertRaises(native.WebDriverError):
                native.FirefoxTests.fill('#rule-name', 'New name')
        self.assertEqual(command.call_count, 1)

    def test_waits_for_input_to_be_ready_before_locating_it(self):
        # Hidden/disabled, then visible, then the typed value matches.
        with patch.object(native.FirefoxTests, 'command', return_value={'element-6066-11e4-a52e-4f735466cecf': 'ready'}) as command, patch.object(native.FirefoxTests, 'js', side_effect=[False, True, True]):
            native.FirefoxTests.fill('#rule-name', 'New name')
        self.assertEqual(command.call_count, 3)


if __name__ == '__main__':
    unittest.main(verbosity=2)
