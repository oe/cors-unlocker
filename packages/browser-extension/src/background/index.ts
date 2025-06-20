import browser from 'webextension-polyfill';
import {
  diffRules,
  reorderRules,
  getDefaultRules,
} from './user-rule';
import { dataStorage } from '@/common/storage';
import { onTabActiveChange } from './on-tab-change';
import { batchUpdateRules } from './declarative-rules';
import {
  onExternalMessage,
  onRuntimeMessage,
  onWindowClose,
} from './messaging';
import { logger } from '@/common/logger';

// Global error handler for unhandled promise rejections
self.addEventListener('unhandledrejection', (event) => {
  logger.error('Unhandled promise rejection in background script:', event.reason);
});

// Initialize rules on browser startup
browser.runtime.onStartup.addListener(async () => {
  try {
    const rules = await dataStorage.getRules();
    if (!rules || !rules.length) return;
    const orderedRules = reorderRules(rules);
    // order changed, update storage then trigger event
    if (orderedRules) {
      await dataStorage.saveRules(orderedRules);
    } else {
      await batchUpdateRules(rules);
    }
  } catch (error) {
    logger.error('Error during startup rule initialization:', error);
  }
});

// Initialize default rules on installation
browser.runtime.onInstalled.addListener(async (e) => {
  try {
    // only run on install
    if (e.reason !== 'install') return;
    // will trigger events to update rules
    await dataStorage.saveRules(getDefaultRules());
  } catch (error) {
    logger.error('Error during installation:', error);
  }
});

// Update rules when storage changes
dataStorage.onRulesChange(async (newRules, oldRules) => {
  try {
    await batchUpdateRules(diffRules(newRules, oldRules));
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
  } catch (error) {
    logger.error('Error handling tab update:', error);
  }
});

if (__TARGET__ === 'chrome') {
  // external message listener from web pages
  browser.runtime.onMessageExternal.addListener(onExternalMessage);
  // internal message listener from options and popup pages
  browser.runtime.onMessage.addListener(onRuntimeMessage);
} else {
  browser.runtime.onMessage.addListener((message, sender) => {
    // Handle internal messages only
    if (sender.id === browser.runtime.id) {
      return onRuntimeMessage(message, sender);
    }
    // Ignore external messages
    logger.warn('Ignoring external message:', message, sender);
    return onExternalMessage(message, sender);
  });
}
// clear cached currentTabRule after window closed
browser.windows.onRemoved.addListener(onWindowClose);
