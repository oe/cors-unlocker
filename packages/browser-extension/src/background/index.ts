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
  onExternalConnect,
} from './messaging';

// Initialize rules on browser startup
browser.runtime.onStartup.addListener(() => {
  dataStorage.getRules().then((rules) => {
    if (!rules || !rules.length) return;
    const orderedRules = reorderRules(rules);
    // order changed, update storage then trigger event
    if (orderedRules) {
      dataStorage.saveRules(orderedRules);
    } else {
      batchUpdateRules(rules);
    }
  });
});

// Initialize default rules on installation
browser.runtime.onInstalled.addListener((e) => {
  // only run on install
  if (e.reason !== 'install') return;
  // will trigger events to update rules
  dataStorage.saveRules(getDefaultRules());
});

// Update rules when storage changes
dataStorage.onRulesChange((newRules, oldRules) => {
  batchUpdateRules(diffRules(newRules, oldRules));
  dataStorage.updateCachedRules(newRules || []);
  // update current active tab, in case of rule for current tab changed
  setTimeout(() => {
    browser.tabs.query({ active: true }).then((tabs) => {
      tabs.forEach((tab) => {
        onTabActiveChange(tab)
      })
    });
  }, 100);
});

browser.tabs.onActivated.addListener((activeInfo) => {
  browser.tabs.get(activeInfo.tabId).then(tab => {
    onTabActiveChange(tab);
  });
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  onTabActiveChange(tab);
});

// external message listener from web pages
browser.runtime.onMessageExternal.addListener(onExternalMessage);
// internal message listener from options and popup pages
browser.runtime.onMessage.addListener(onRuntimeMessage);
// clear cached currentTabRule after window closed
browser.windows.onRemoved.addListener(onWindowClose);
// external connect listener from web pages
browser.runtime.onConnectExternal.addListener(onExternalConnect);
