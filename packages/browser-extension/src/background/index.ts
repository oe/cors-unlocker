import './state-writer';
import browser from 'webextension-polyfill';
import { dataStorage, autoCleanupDisabledRules } from '@/common/storage';
import { onTabActiveChange } from './on-tab-change';
import {
  onExternalMessage,
  onRuntimeMessage,
  onWindowClose,
} from './messaging';
import { logger } from '@/common/logger';
import { ensureProxyAppState, initializeProxyStateWriter, isProxyAppState } from '@/common/proxy-state';
import '@/background/advanced-proxy';
import { reconcileProxyDnrRules } from './proxy-dnr';
import { createFirefoxMessageRouter } from './message-routing';

initializeProxyStateWriter((state) => reconcileProxyDnrRules(state.rules));

// Simple delay utility function
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function bootstrap() {
  try {
    const state = await ensureProxyAppState();
    await reconcileProxyDnrRules(state.rules);
  } catch (error) {
    logger.error('Extension bootstrap failed:', error);
    await reconcileProxyDnrRules([]).catch(() => undefined);
  }
}

void bootstrap();

// Global error handler for unhandled promise rejections
self.addEventListener('unhandledrejection', (event) => {
  logger.error('Unhandled promise rejection in background script:', event.reason);
});

// Initialize rules on browser startup
browser.runtime.onStartup.addListener(async () => {
  try {
    // Wait a bit to avoid resource conflicts during browser startup
    await delay(2000);
    
    logger.info('Browser startup detected, initializing extension...');
    
    // Auto-cleanup old disabled rules
    const cleanedCount = await autoCleanupDisabledRules();
    if (cleanedCount > 0) {
      logger.info(`Auto-cleanup: removed ${cleanedCount} old disabled rules`);
    }
    
    const state = await ensureProxyAppState();
    await reconcileProxyDnrRules(state.rules);
  } catch (error) {
    logger.error('Error during startup rule initialization:', error);
  }
});


// Update rules when storage changes
dataStorage.onRulesChange(async (newRules) => {
  try {
    dataStorage.updateCachedRules(newRules || []);
    // update current active tab, in case of rule for current tab changed
    setTimeout(async () => {
      try {
        const tabs = await browser.tabs.query({ active: true });
        tabs.forEach((tab) => {
          onTabActiveChange(tab).catch(error => {
            logger.error('Error updating tab rule:', error);
          });
        });
      } catch (error) {
        logger.error('Error querying active tabs:', error);
      }
    }, 100);
  } catch (error) {
    logger.error('Error handling rules change:', error);
  }
});

browser.storage.onChanged.addListener((changes, areaName) => {
  const state = changes.proxyAppState?.newValue;
  if (areaName !== 'local' || !changes.proxyAppState) return;
  if (state !== undefined && !isProxyAppState(state)) {
    void reconcileProxyDnrRules([]).catch((error) => logger.error('Unable to clear invalid rules:', error));
    return;
  }
  void reconcileProxyDnrRules(state?.rules || []).catch((error) => {
    logger.error('Unable to reconcile proxy DNR rules:', error);
  });
});

browser.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await browser.tabs.get(activeInfo.tabId);
    await onTabActiveChange(tab);
  } catch (error) {
    logger.error('Error handling tab activation:', error);
  }
});

browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  try {
    await onTabActiveChange(tab);
    if (changeInfo.url) await refreshTabRules();
  } catch (error) {
    logger.error('Error handling tab update:', error);
  }
});

if (__TARGET__ === 'chrome') {
  // Chrome: separate handlers for external and internal messages
  browser.runtime.onMessageExternal.addListener(onExternalMessage);
  browser.runtime.onMessage.addListener(onRuntimeMessage);
} else {
  browser.runtime.onMessage.addListener(createFirefoxMessageRouter(
    onRuntimeMessage, onExternalMessage, browser.runtime.getURL(''),
  ));
}
// clear cached currentTabRule after window closed
browser.windows.onRemoved.addListener(onWindowClose);

async function refreshTabRules() {
  const state = await ensureProxyAppState();
  await reconcileProxyDnrRules(state.rules);
}
browser.tabs.onRemoved.addListener(() => { void refreshTabRules().catch((error) => logger.error('Unable to refresh tab rules:', error)); });
