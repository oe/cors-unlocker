import browser from 'webextension-polyfill';
import {
  diffRules,
  reorderRules,
  getDefaultRules,
} from './user-rule';
import { dataStorage } from '@/common/storage';
import { onTabActiveChange } from './on-tab-change';
import { batchUpdateRules } from './declarative-rules';
import { onExternalMessage } from './external-message';

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
});

browser.tabs.onActivated.addListener((activeInfo) => {
  browser.tabs.get(activeInfo.tabId).then(tab => {
    onTabActiveChange(tab);
  });
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  onTabActiveChange(tab);
});


browser.runtime.onMessageExternal.addListener(onExternalMessage);