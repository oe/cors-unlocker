import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import browser from 'webextension-polyfill';
import { UpgradeNotice } from '../../src/components/upgrade-notice';
import { migrateLegacyState } from '../../src/common/proxy-state';
import { LEGACY_UPGRADE_KEY, UPGRADE_SEEN_KEY } from '../../src/common/upgrade-notice-state';

let stored: Record<string, unknown>;
const props = { onViewRules: vi.fn(), onViewRecovery: vi.fn() };
beforeEach(() => {
  vi.stubGlobal('__TARGET__', 'chrome');
  vi.clearAllMocks(); stored = { [LEGACY_UPGRADE_KEY]: true, proxyAppState: migrateLegacyState([], { maxRules: 100 }) };
  vi.mocked(browser.storage.local.get).mockImplementation(async () => ({ ...stored }));
  vi.mocked(browser.storage.local.set).mockImplementation(async (values) => { Object.assign(stored, values); });
});

describe('upgrade explanation', () => {
  it('uses Firefox-specific limits rather than a Chrome debugger disclosure', async () => {
    vi.stubGlobal('__TARGET__', 'firefox');
    render(<UpgradeNotice {...props} expanded />);
    expect(await screen.findByText(/Firefox still contacts the server/)).toBeVisible();
    expect(screen.queryByText(/Chrome may show its debugging indicator/)).not.toBeInTheDocument();
  });
  it('shows the old/new logos, browser disclosure and saved-rule entry point without changing rules or starting a session', async () => {
    const before = structuredClone(stored.proxyAppState);
    render(<UpgradeNotice {...props} expanded />);
    expect(await screen.findByRole('region', { name: 'About your Wireflip upgrade' })).toBeVisible();
    expect(screen.getByRole('img', { name: 'CORS Unlocker' })).toHaveAttribute('src', '/icon/legacy-128.png');
    expect(screen.getByText(/Chrome may show its debugging indicator/)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'View saved rules' }));
    expect(props.onViewRules).toHaveBeenCalledOnce();
    expect(browser.runtime.sendMessage).not.toHaveBeenCalled();
    expect(stored.proxyAppState).toEqual(before);
  });
  it('synchronizes acknowledgment across surfaces and keeps it after reopening', async () => {
    const first = render(<UpgradeNotice {...props} />);
    const second = render(<UpgradeNotice {...props} />);
    await screen.findAllByRole('button', { name: 'Got it' });
    await userEvent.click(screen.getAllByRole('button', { name: 'Got it' })[0]);
    expect(stored[UPGRADE_SEEN_KEY]).toBe('2.0');
    await act(async () => {
      for (const [listener] of vi.mocked(browser.storage.onChanged.addListener).mock.calls) listener({ [UPGRADE_SEEN_KEY]: { newValue: '2.0' } }, 'local');
    });
    await waitFor(() => expect(screen.queryByRole('region', { name: 'About your Wireflip upgrade' })).not.toBeInTheDocument());
    first.unmount(); second.unmount();
    render(<UpgradeNotice {...props} />);
    await waitFor(() => expect(browser.storage.local.get).toHaveBeenCalled());
    expect(screen.queryByText('CORS Unlocker is now Wireflip')).not.toBeInTheDocument();
  });
  it('shows recovery rather than a preservation claim when migration fails', async () => {
    stored.proxyAppState = { schemaVersion: 99, rules: ['untouched'] };
    render(<UpgradeNotice {...props} />);
    expect(await screen.findByText(/Your configuration needs attention/)).toBeVisible();
    expect(screen.queryByText(/Your local rules and settings are preserved/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Open Data & recovery' }));
    expect(props.onViewRecovery).toHaveBeenCalledOnce();
    expect(stored.proxyAppState).toEqual({ schemaVersion: 99, rules: ['untouched'] });
  });
  it('keeps the notice and retry action if acknowledging cannot be saved', async () => {
    vi.mocked(browser.storage.local.set).mockRejectedValueOnce(new Error('Storage unavailable'));
    render(<UpgradeNotice {...props} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Got it' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Storage unavailable');
    expect(screen.getByRole('button', { name: 'Got it' })).toBeEnabled();
    expect(stored[UPGRADE_SEEN_KEY]).toBeUndefined();
  });
});
