import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';
import { Inspector } from '../../src/sidepanel/inspector';
import type { IRequestLogEntry } from '../../src/background/advanced-proxy';
import type { IProxyRule } from '../../src/common/proxy-state';

const url = 'https://api.example.test/orders?page=1';
let rules: IProxyRule[];
let entries: IRequestLogEntry[];
let connected: boolean;
const entry = (id: string, overrides: Partial<IRequestLogEntry> = {}): IRequestLogEntry => ({
  id, tabId: 7, url, method: 'GET', resourceType: 'Fetch', startedAt: 1,
  requestHeaders: {}, matchedRuleIds: [], diagnostics: [], outcome: 'continued', status: 200,
  ...overrides,
});
async function sync() {
  await act(async () => {
    const calls = vi.mocked(browser.runtime.onMessage.addListener).mock.calls;
    const listener = calls[calls.length - 1][0];
    listener({ type: 'advancedProxyLogChange', payload: { tabId: 7 } }, {});
  });
}
beforeEach(() => {
  vi.stubGlobal('__TARGET__', 'chrome');
  // happy-dom does not implement the Web Animations API used by ScrollArea.
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.getAnimations = () => [];
  window.history.replaceState({}, '', '/?tabId=7');
  rules = []; entries = [entry('original')]; connected = true;
  vi.mocked(browser.tabs.get).mockResolvedValue({ id: 7, url: 'https://app.example.test/' } as browser.Tabs.Tab);
  vi.mocked(browser.runtime.sendMessage).mockImplementation(async (message: any) => {
    switch (message.type) {
      case 'enableAdvancedProxy': connected = true; return { phase: 'connected', captureEnabled: true };
      case 'disableAdvancedProxy': connected = false; return { phase: 'disabled', captureEnabled: false };
      case 'getProxyState': return { rules };
      case 'getAdvancedProxyLog': return entries;
      case 'getAdvancedProxyStatus': return { phase: connected ? 'connected' : 'disabled', captureEnabled: connected };
      case 'saveProxyRule': {
        const rule = { ...rules.find((rule) => rule.id === message.payload.rule.id), ...message.payload.rule, id: message.payload.rule.id || 'saved', createdAt: Date.now(), updatedAt: Date.now() };
        rules = [rule]; return { success: true, rule };
      }
      case 'clearAdvancedProxyLog': entries = []; return undefined;
      default: return undefined;
    }
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('request-first inspector', () => {
  it('creates a scoped mock, waits for fresh evidence, and opens the matching request', async () => {
    const user = userEvent.setup();
    render(<Inspector />);
    const request = await screen.findByRole('button', { name: /GET.*orders/ });
    expect(screen.getByRole('heading', { name: 'Inspector' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Requests (1)' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('region', { name: 'Rules for this site' })).not.toBeInTheDocument();
    await user.click(request);
    await user.click(screen.getByRole('button', { name: 'Mock', exact: true }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Response body')).toBeVisible();
    expect(within(dialog).getByText('Request matching').closest('details')).not.toHaveAttribute('open');
    await user.clear(within(dialog).getByLabelText('Response body'));
    await user.paste('[]');
    await user.click(within(dialog).getByRole('button', { name: 'Save rule', exact: true }));
    await screen.findByText('Saved. Trigger the request again on the page to verify it.');
    expect(rules[0].match).toEqual({ initiatorOrigins: ['https://app.example.test'], urlPattern: url, methods: ['GET'], resourceTypes: ['Fetch'] });
    expect(rules[0].actions[0]).toMatchObject({ type: 'mockResponse', body: '[]', status: 200 });
    expect(rules[0]).not.toHaveProperty('capturedRequest');
    // Old records and new unrelated traffic do not verify the saved rule.
    entries = [entry('old-match', { matchedRuleIds: ['saved'] }), entry('unrelated', { startedAt: Date.now() + 1 })];
    const stateReads = vi.mocked(browser.runtime.sendMessage).mock.calls.filter(([message]) => (message as any).type === 'getProxyState').length;
    await sync();
    expect(vi.mocked(browser.runtime.sendMessage).mock.calls.filter(([message]) => (message as any).type === 'getProxyState')).toHaveLength(stateReads);
    expect(screen.queryByRole('button', { name: 'View request' })).not.toBeInTheDocument();
    expect(screen.getByText('Requests recorded, but none matched this rule. Repeat the target request or edit its conditions.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit proxy rule' })).toBeInTheDocument();
    entries = [entry('fresh-match', { startedAt: Date.now() + 1, matchedRuleIds: ['saved'], outcome: 'mocked', changes: [{ label: 'Local mock', after: 'HTTP 200; server not contacted' }] }), ...entries];
    await sync();
    await user.type(screen.getByRole('textbox', { name: 'Filter URL, method, status' }), 'no-results');
    await user.click(screen.getByRole('button', { name: 'View request' }));
    expect(screen.getByRole('textbox', { name: 'Filter URL, method, status' })).toHaveValue('');
    expect(screen.getByText(/HTTP 200; server not contacted/)).toBeInTheDocument();
  });

  it('preserves drafts on close and reports a disconnected session after saving', async () => {
    const user = userEvent.setup();
    render(<Inspector />);
    await user.click(await screen.findByRole('button', { name: /GET.*orders/ }));
    await user.click(screen.getByRole('button', { name: 'Mock', exact: true }));
    await user.click(screen.getByText('Request matching'));
    await user.clear(screen.getByLabelText('Name', { exact: true }));
    await user.type(screen.getByLabelText('Name', { exact: true }), 'Orders empty state');
    await user.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
    await screen.findByRole('heading', { name: 'Discard unsaved changes?' });
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByLabelText('Name', { exact: true })).toHaveValue('Orders empty state');
    connected = false;
    await user.click(screen.getByRole('button', { name: 'Save rule', exact: true }));
    await screen.findByText('Orders empty state', { selector: '[data-slot="alert-title"]' });
    expect(screen.getByText('Start a tab session to apply')).toBeInTheDocument();
  });
  it('starts an empty session without implicitly enabling CORS and guides the next action', async () => {
    const user = userEvent.setup();
    entries = []; connected = false;
    render(<Inspector />);
    await user.click(await screen.findByRole('button', { name: 'Start tab session' }));
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'enableAdvancedProxy', payload: { tabId: 7 } });
    expect(screen.getByText('Trigger a request on the page to see it here.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start tab session' })).not.toBeInTheDocument();
    entries = [entry('first')];
    await sync();
    expect(screen.queryByText('No activity recorded yet.')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /GET.*orders/ }));
    expect(screen.getByRole('button', { name: 'Network failure', exact: true })).toBeInTheDocument();
  });

  it('distinguishes matching, pending results and warnings, and lets users undo the rule', async () => {
    const user = userEvent.setup();
    render(<Inspector />);
    await user.click(await screen.findByRole('button', { name: /GET.*orders/ }));
    await user.click(screen.getByRole('button', { name: 'Mock', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Save rule', exact: true }));
    await screen.findByText('Saved. Trigger the request again on the page to verify it.');
    entries = [entry('match', { startedAt: Date.now() + 1, matchedRuleIds: ['saved'] })];
    await sync();
    expect(screen.getByText('Request matched, but no changes were recorded. Check the request details.')).toBeInTheDocument();
    entries = [{ ...entries[0], outcome: 'pending' }]; await sync();
    expect(screen.getByText('Request in progress. Waiting for the result.')).toBeInTheDocument();
    entries = [{ ...entries[0], outcome: 'continued', diagnostics: ['Another rule took precedence.'] }]; await sync();
    expect(screen.getByText('Request matched with warnings. Review the result.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Disable this rule' }));
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'saveProxyRule', payload: { rule: { id: 'saved', enabled: false } } });
    expect(rules[0].actions[0].type).toBe('mockResponse');
    expect(screen.getByText('Rule disabled. Requests use their original behavior unless other rules apply.')).toBeInTheDocument();
  });

  it('shows persistent rules while stopped and preserves request selection between tabs', async () => {
    const user = userEvent.setup();
    connected = false;
    rules = [{ id: 'header', name: 'Staging header', enabled: true, source: 'user', match: { initiatorOrigins: ['https://app.example.test'], urlPattern: '*' }, actions: [{ type: 'setResponseHeaders', headers: { 'X-Debug': 'true' } }, { type: 'delay', milliseconds: 1000 }], createdAt: 1, updatedAt: 1 }];
    render(<Inspector />);
    await user.click(await screen.findByRole('button', { name: /GET.*orders/ }));
    expect(screen.getByText('Tab session stopped')).toBeInTheDocument();
    expect(screen.getByText('1 persistent rules enabled')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Rules (1)' }));
    expect(screen.getByRole('switch', { name: 'Enable Staging header' })).toBeChecked();
    expect(screen.getByText('Persistent · across tabs')).toBeInTheDocument();
    expect(screen.getByText('Start a tab session to apply')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Requests (1)' }));
    expect(screen.getByRole('button', { name: 'Mock', exact: true })).toBeInTheDocument();
  });

  it('offers Firefox body replacement without an HTTP status control that cannot take effect', async () => {
    vi.stubGlobal('__TARGET__', 'firefox');
    const user = userEvent.setup();
    render(<Inspector />);
    await user.click(await screen.findByRole('button', { name: /GET.*orders/ }));
    await user.click(screen.getByRole('button', { name: 'Replace body', exact: true }));
    expect(screen.getByLabelText('Response body')).toBeVisible();
    expect(screen.queryByLabelText('HTTP status')).not.toBeInTheDocument();
    expect(screen.getByText('Firefox contacts the server and preserves its status; only the response body is replaced.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Save rule', exact: true }));
    await screen.findByText('Saved. Trigger the request again on the page to verify it.');
    expect(rules[0].actions[0]).toMatchObject({ type: 'mockResponse', status: 200 });
  });

  it('recovers invalid action JSON without losing raw response bodies', async () => {
    const user = userEvent.setup();
    render(<Inspector />);
    await user.click(await screen.findByRole('button', { name: /GET.*orders/ }));
    await user.click(screen.getByRole('button', { name: 'Mock', exact: true }));
    await user.clear(screen.getByLabelText('Response body'));
    await user.paste('<html>test response</html>');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Response body format' }), 'text');
    await user.click(screen.getByText('Advanced JSON'));
    const config = screen.getByLabelText('Action configuration (JSON)');
    const valid = (config as HTMLTextAreaElement).value;
    await user.clear(config); await user.paste('[');
    await user.click(screen.getByText('Advanced JSON'));
    await user.click(screen.getByRole('button', { name: 'Save rule', exact: true }));
    expect(rules).toEqual([]);
    expect(config.closest('details')).toHaveAttribute('open');
    expect(config).toHaveValue('[');
    expect(screen.getByText('Invalid action JSON. Fix the syntax in Advanced JSON.', { selector: '[data-slot="alert-description"]' })).toBeInTheDocument();
    await user.clear(config); await user.paste(valid);
    await user.click(screen.getByRole('button', { name: 'Save rule', exact: true }));
    await screen.findByText('Saved. Trigger the request again on the page to verify it.');
    expect(rules[0].actions[0]).toMatchObject({ body: '<html>test response</html>' });
  });

});
