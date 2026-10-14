import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Browser from 'webextension-polyfill';

let browser: typeof Browser;
let theme: typeof import('../../src/common/theme');
let media: { matches: boolean; addEventListener: ReturnType<typeof vi.fn> };
const systemChange = (dark: boolean) => {
  media.matches = dark;
  media.addEventListener.mock.calls[0][1]();
};
beforeEach(async () => {
  vi.resetModules();
  browser = (await import('webextension-polyfill')).default;
  vi.mocked(browser.storage.onChanged.addListener).mockClear();
  vi.mocked(browser.storage.local.get).mockResolvedValue({});
  vi.mocked(browser.storage.local.set).mockResolvedValue();
  media = { matches: false, addEventListener: vi.fn() };
  vi.stubGlobal('matchMedia', vi.fn(() => media));
  theme = await import('../../src/common/theme');
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.classList.remove('dark');
  document.documentElement.style.colorScheme = '';
  delete document.documentElement.dataset.theme;
});

describe('theme preference', () => {
  it('loads an explicit preference and preserves it when the system changes', async () => {
    vi.mocked(browser.storage.local.get).mockResolvedValue({ uiTheme: 'dark' });
    await theme.initializeTheme();
    expect(document.documentElement).toHaveClass('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    systemChange(false);
    expect(document.documentElement).toHaveClass('dark');
    await theme.setTheme('light');
    systemChange(true);
    expect(document.documentElement).not.toHaveClass('dark');
    expect(browser.storage.local.set).toHaveBeenCalledWith({ uiTheme: 'light' });
  });
  it('follows system changes only while automatic mode is selected', async () => {
    await theme.initializeTheme();
    expect(document.documentElement.dataset.theme).toBe('system');
    systemChange(true);
    expect(document.documentElement).toHaveClass('dark');
    systemChange(false);
    expect(document.documentElement.style.colorScheme).toBe('light');
    await theme.setTheme('dark');
    await theme.setTheme('system');
    expect(document.documentElement).not.toHaveClass('dark');
  });
  it('applies changes from other extension pages, including preference removal', async () => {
    await theme.initializeTheme();
    const changed = vi.mocked(browser.storage.onChanged.addListener).mock.calls[0][0];
    changed({ uiTheme: { newValue: 'dark' } }, 'sync');
    expect(document.documentElement).not.toHaveClass('dark');
    changed({ uiTheme: { newValue: 'dark' } }, 'local');
    expect(document.documentElement).toHaveClass('dark');
    changed({ uiTheme: { oldValue: 'dark' } }, 'local');
    expect(document.documentElement.dataset.theme).toBe('system');
    expect(document.documentElement).not.toHaveClass('dark');
  });
  it('keeps the current appearance if saving fails', async () => {
    await theme.initializeTheme();
    vi.mocked(browser.storage.local.set).mockRejectedValueOnce(new Error('Storage unavailable'));
    await expect(theme.setTheme('dark')).rejects.toThrow('Storage unavailable');
    expect(document.documentElement.dataset.theme).toBe('system');
    expect(document.documentElement).not.toHaveClass('dark');
  });
  it('falls back to the system for invalid preferences', async () => {
    media.matches = true;
    vi.mocked(browser.storage.local.get).mockResolvedValue({ uiTheme: 'invalid' });
    await theme.initializeTheme();
    expect(document.documentElement.dataset.theme).toBe('system');
    expect(document.documentElement).toHaveClass('dark');
  });
  it('follows the system even if preferences cannot be read', async () => {
    media.matches = true;
    vi.mocked(browser.storage.local.get).mockRejectedValueOnce(new Error('Storage unavailable'));
    await theme.initializeTheme();
    expect(document.documentElement).toHaveClass('dark');
    expect(document.documentElement.dataset.theme).toBe('system');
  });
});
