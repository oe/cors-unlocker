import { beforeEach, describe, expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';
import { migrateLegacyState } from '../../src/common/proxy-state';
import { LEGACY_UPGRADE_KEY, UPGRADE_OPENED_KEY, UPGRADE_SEEN_KEY, UPGRADE_PAGE, openPendingUpgradeNotice, recordLegacyUpgrade, upgradeNoticeStatus } from '../../src/common/upgrade-notice-state';

vi.mock('../../src/common/proxy-state', async (original) => ({
  ...await original<typeof import('../../src/common/proxy-state')>(),
  ensureProxyAppState: vi.fn(async () => undefined),
}));
let stored: Record<string, unknown>;
beforeEach(() => {
  vi.clearAllMocks(); stored = {};
  vi.mocked(browser.storage.local.get).mockImplementation(async () => ({ ...stored }));
  vi.mocked(browser.storage.local.set).mockImplementation(async (values) => { Object.assign(stored, values); });
  vi.mocked(browser.tabs.create).mockResolvedValue({ id: 7, index: 0, highlighted: true, active: true, pinned: false, incognito: false });
});

describe('v1 upgrade delivery', () => {
  it('does not show or open an upgrade notice for a fresh install, imported legacy backup, browser update or 2.x update', async () => {
    for (const details of [{ reason: 'install' }, { reason: 'update', previousVersion: '2.0.0' }, { reason: 'browser_update', previousVersion: '1.1.0' }]) await recordLegacyUpgrade(details);
    expect(browser.storage.local.set).not.toHaveBeenCalled();
    await openPendingUpgradeNotice();
    expect(browser.tabs.create).not.toHaveBeenCalled();
    expect(upgradeNoticeStatus(migrateLegacyState([], { maxRules: 100 }), undefined, undefined).visible).toBe(false);
  });
  it('opens one local explanation tab for an actual v1 update, even with no old rules, and never on subsequent worker starts', async () => {
    await recordLegacyUpgrade({ reason: 'update', previousVersion: '1.1.0' });
    expect(browser.tabs.create).toHaveBeenCalledWith({ url: browser.runtime.getURL(UPGRADE_PAGE) });
    expect(stored).toMatchObject({ [LEGACY_UPGRADE_KEY]: true, [UPGRADE_OPENED_KEY]: '2.0' });
    await openPendingUpgradeNotice();
    await recordLegacyUpgrade({ reason: 'update', previousVersion: '1.1.0' });
    expect(browser.tabs.create).toHaveBeenCalledOnce();
    expect(upgradeNoticeStatus(migrateLegacyState([], {}), undefined, true)).toEqual({ visible: true, recovered: true });
  });
  it('deduplicates simultaneous delivery and retries a failed tab creation without marking it delivered', async () => {
    stored[LEGACY_UPGRADE_KEY] = true;
    vi.mocked(browser.tabs.create).mockRejectedValueOnce(new Error('No browser window'));
    await expect(openPendingUpgradeNotice()).rejects.toThrow('No browser window');
    expect(stored[UPGRADE_OPENED_KEY]).toBeUndefined();
    await Promise.all([openPendingUpgradeNotice(), openPendingUpgradeNotice()]);
    expect(browser.tabs.create).toHaveBeenCalledTimes(2);
    expect(stored[UPGRADE_OPENED_KEY]).toBe('2.0');
  });
  it('keeps acknowledgment outside exported configuration and does not reopen it', async () => {
    stored[LEGACY_UPGRADE_KEY] = true; stored[UPGRADE_SEEN_KEY] = '2.0';
    await openPendingUpgradeNotice();
    expect(browser.tabs.create).not.toHaveBeenCalled();
    expect(upgradeNoticeStatus(migrateLegacyState([], {}), '2.0', true).visible).toBe(false);
  });
  it('does not claim migration succeeded when stored configuration is damaged', () => {
    expect(upgradeNoticeStatus({ schemaVersion: 99 }, undefined, true)).toEqual({ visible: true, recovered: false });
  });
});
