import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';
import { AppearanceSettings } from '../../src/components/appearance-settings';
import { initializeTheme, setTheme } from '../../src/common/theme';

beforeEach(async () => {
  Element.prototype.getAnimations = () => [];
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn() })));
  vi.mocked(browser.storage.local.set).mockResolvedValue();
  await initializeTheme();
  await setTheme('system');
  vi.mocked(browser.storage.local.set).mockClear();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); document.documentElement.classList.remove('dark'); });

describe('appearance settings', () => {
  it('opens from settings and saves the chosen theme without dismissing the panel', async () => {
    const user = userEvent.setup();
    render(<AppearanceSettings />);
    await user.click(screen.getByRole('button', { name: 'Settings', exact: true }));
    expect(screen.getByRole('combobox', { name: 'Language', exact: true })).toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: 'Theme', exact: true }));
    await user.click(screen.getByRole('option', { name: 'Dark', exact: true }));
    expect(browser.storage.local.set).toHaveBeenCalledWith({ uiTheme: 'dark' });
    expect(document.documentElement).toHaveClass('dark');
    expect(screen.getByRole('combobox', { name: 'Theme', exact: true })).toHaveTextContent('Dark');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('combobox', { name: 'Theme', exact: true })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Settings', exact: true })).toHaveFocus();
  });
  it('reports a failed write and keeps the previous theme selected', async () => {
    const user = userEvent.setup();
    render(<AppearanceSettings />);
    await user.click(screen.getByRole('button', { name: 'Settings', exact: true }));
    vi.mocked(browser.storage.local.set).mockRejectedValueOnce(new Error('Storage unavailable'));
    await user.click(screen.getByRole('combobox', { name: 'Theme', exact: true }));
    await user.click(screen.getByRole('option', { name: 'Dark', exact: true }));
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to save theme.');
    expect(screen.getByRole('combobox', { name: 'Theme', exact: true })).toHaveTextContent('Follow system');
    expect(document.documentElement).not.toHaveClass('dark');
  });
});
