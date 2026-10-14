import browser from 'webextension-polyfill';
import { ensureProxyAppState, isProxyAppState } from './proxy-state';

export const UPGRADE_SEEN_KEY = 'wireflipV2NoticeSeen';
export const LEGACY_UPGRADE_KEY = 'wireflipUpgradedFromV1';
export const UPGRADE_OPENED_KEY = 'wireflipV2NoticeOpened';
export const UPGRADE_PAGE = 'src/upgrade/index.html';

let opening: Promise<void> | undefined;

export function openPendingUpgradeNotice(): Promise<void> {
  if (opening) return opening;
  const operation = (async () => {
    const stored = await browser.storage.local.get([LEGACY_UPGRADE_KEY, UPGRADE_OPENED_KEY, UPGRADE_SEEN_KEY]);
    if (stored[LEGACY_UPGRADE_KEY] !== true || stored[UPGRADE_OPENED_KEY] === '2.0' || stored[UPGRADE_SEEN_KEY] === '2.0') return;
    // A failed migration must still explain the rename and point to recovery.
    await ensureProxyAppState().catch(() => undefined);
    await browser.tabs.create({ url: browser.runtime.getURL(UPGRADE_PAGE) });
    await browser.storage.local.set({ [UPGRADE_OPENED_KEY]: '2.0' });
  })();
  opening = operation;
  void operation.finally(() => { if (opening === operation) opening = undefined; }).catch(() => undefined);
  return operation;
}

export async function recordLegacyUpgrade(details: { reason: string; previousVersion?: string }) {
  if (details.reason === 'update' && /^1\./.test(details.previousVersion || '')) {
    await browser.storage.local.set({ [LEGACY_UPGRADE_KEY]: true });
    await openPendingUpgradeNotice();
  }
}

export function upgradeNoticeStatus(state: unknown, seen: unknown, upgraded: unknown) {
  const valid = isProxyAppState(state);
  const eligible = upgraded === true;
  return { visible: eligible && seen !== '2.0', recovered: valid };
}
