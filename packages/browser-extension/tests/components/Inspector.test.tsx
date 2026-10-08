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
      case 'enableAdvancedProxy': connected = true; return { phase: 'connected' };
      case 'getProxyState': return { rules };
      case 'getAdvancedProxyLog': return entries;
      case 'getAdvancedProxyStatus': return { phase: connected ? 'connected' : 'disabled' };
      case 'saveProxyRule': {
        const rule = { ...message.payload.rule, id: message.payload.rule.id || 'saved', createdAt: Date.now(), updatedAt: Date.now() };
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
    expect(request.compareDocumentPosition(screen.getByRole('region', { name: 'Rules for this site' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
    expect(screen.getByRole('status')).toHaveTextContent('Needs advanced proxy');
  });
  it('starts an empty session without implicitly enabling CORS and guides the next action', async () => {
    const user = userEvent.setup();
    entries = []; connected = false;
    render(<Inspector />);
    await user.click(await screen.findByRole('button', { name: 'Start proxy session' }));
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'enableAdvancedProxy', payload: { tabId: 7 } });
    expect(screen.getByText('Trigger a request on the page to see it here.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start proxy session' })).not.toBeInTheDocument();
    entries = [entry('first')];
    await sync();
    expect(screen.queryByText('No activity recorded yet.')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /GET.*orders/ }));
    expect(screen.getByRole('button', { name: 'Network failure', exact: true })).toBeInTheDocument();
  });

});
