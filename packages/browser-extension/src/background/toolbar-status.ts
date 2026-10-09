import browser from 'webextension-polyfill';
import { LANGUAGES, LANGUAGE_KEY, resolveLocale, type Locale } from '@/common/locale';
import { logger } from '@/common/logger';
import type { IAdvancedProxyStatus } from './advanced-proxy';
import { countTabBrowserRules, TOOLBAR_COLORS, toolbarIcon, toolbarPresentation, type ToolbarPresentation } from './toolbar-state';

let statusReader: ((tabId: number) => IAdvancedProxyStatus) | undefined;
let queue: Promise<void> = Promise.resolve();
const rendered = new Map<number, string>();
const removedTabs = new Set<number>();

function enqueue(work: () => Promise<void>): Promise<void> {
  const run = queue.then(work);
  // Toolbar failures must never block interception, saving, or later refreshes.
  queue = run.catch((error) => { logger.debug('Unable to refresh toolbar status:', error); });
  return queue;
}

async function paint(presentation: ToolbarPresentation, tabId?: number): Promise<void> {
  const signature = JSON.stringify(presentation);
  if (tabId !== undefined && (removedTabs.has(tabId) || rendered.get(tabId) === signature)) return;
  const scope = tabId === undefined ? {} : { tabId };
  await Promise.all([
    browser.action.setIcon({ ...scope, imageData: toolbarIcon(presentation.state) }),
    browser.action.setBadgeText({ ...scope, text: presentation.badge }),
    browser.action.setBadgeBackgroundColor({ ...scope, color: TOOLBAR_COLORS[presentation.state] }),
    browser.action.setTitle({ ...scope, title: presentation.title }),
  ]);
  if (tabId !== undefined && !removedTabs.has(tabId)) rendered.set(tabId, signature);
}

async function snapshot() {
  const [stored, rules] = await Promise.all([
    browser.storage.local.get(LANGUAGE_KEY), browser.declarativeNetRequest.getSessionRules(),
  ]);
  const preference = stored[LANGUAGE_KEY];
  const locale: Locale = typeof preference === 'string' && Object.hasOwn(LANGUAGES, preference)
    ? preference as Locale : resolveLocale(browser.i18n.getUILanguage());
  return { locale, rules };
}

export function initializeToolbarStatus(reader: (tabId: number) => IAdvancedProxyStatus) {
  statusReader = reader;
  void enqueue(async () => {
    const { locale } = await snapshot();
    await paint(toolbarPresentation(undefined, { tabId: -1, phase: 'disabled' }, 0, locale));
  });
}

export function refreshToolbarTab(tabId: number): Promise<void> {
  if (!statusReader) return Promise.resolve();
  return enqueue(async () => {
    if (removedTabs.has(tabId)) return;
    const [tab, { rules, locale }] = await Promise.all([browser.tabs.get(tabId), snapshot()]);
    if (!removedTabs.has(tabId)) await paint(toolbarPresentation(tab.url, statusReader!(tabId), countTabBrowserRules(rules, tabId), locale), tabId);
  });
}

export function refreshAllToolbar(): Promise<void> {
  if (!statusReader) return Promise.resolve();
  return enqueue(async () => {
    const [tabs, { rules, locale }] = await Promise.all([browser.tabs.query({}), snapshot()]);
    await Promise.all(tabs.map(async (tab) => {
      if (typeof tab.id !== 'number' || removedTabs.has(tab.id)) return;
      await paint(toolbarPresentation(tab.url, statusReader!(tab.id), countTabBrowserRules(rules, tab.id), locale), tab.id)
        .catch((error) => logger.debug('Unable to refresh tab toolbar:', error));
    }));
  });
}

export function forgetToolbarTab(tabId: number) {
  rendered.delete(tabId);
  removedTabs.add(tabId);
  // Keep a tombstone only until already-queued lookups finish.
  void queue.then(() => removedTabs.delete(tabId));
}
