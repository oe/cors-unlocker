import browser from 'webextension-polyfill';
import { APP_STATE_KEY, LEGACY_BACKUP_KEY, ensureProxyAppState, isProxyAppState } from './proxy-state';

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
  if (details.reason !== 'update') return;
  let legacy = /^1\./.test(details.previousVersion || '');
  if (details.previousVersion === '2.0.0') {
    // AMO already distributed the first 2.0.0 before this notice was added.
    // Only catch up an original v1 migration, not a new install/imported backup.
    const stored = await browser.storage.local.get([APP_STATE_KEY, LEGACY_BACKUP_KEY]);
    const state = stored[APP_STATE_KEY];
    const backup = stored[LEGACY_BACKUP_KEY] as { schemaVersion?: unknown; capturedAt?: unknown; allowedOrigins?: unknown } | undefined;
    legacy = isProxyAppState(state) && state.migration.source === 'cors-unlocker-v1'
      && backup?.schemaVersion === 1 && backup.capturedAt === state.migration.migratedAt
      && Array.isArray(backup.allowedOrigins) && backup.allowedOrigins.length > 0;
  }
  if (legacy) {
    await browser.storage.local.set({ [LEGACY_UPGRADE_KEY]: true });
    // Bootstrap may have read the old, ineligible snapshot before this write.
    // Finish that check, then read the recorded update rather than losing it.
    if (opening) await opening.catch(() => undefined);
    await openPendingUpgradeNotice();
  }
}

export function upgradeNoticeStatus(state: unknown, seen: unknown, upgraded: unknown) {
  const valid = isProxyAppState(state);
  const eligible = upgraded === true;
  return { visible: eligible && seen !== '2.0', recovered: valid };
}
