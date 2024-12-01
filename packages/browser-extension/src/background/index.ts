import browser from 'webextension-polyfill';
import {
  diffRules,
  reorderRules,
  getDefaultRules,
  listenForRuleIdRequest
} from './rule-utils';
import { batchUpdateRules } from './rule-operator';
/**
 * local storage key for allowed domains
 */
const storageKey = 'allowedOrigins';

listenForRuleIdRequest();

// Initialize rules on browser startup
browser.runtime.onStartup.addListener(() => {
  browser.storage.local.get(storageKey).then((result) => {
    const rules = result[storageKey];
    if (!rules || !rules.length) return;
    const orderedRules = reorderRules(rules);
    // order changed, update storage then trigger event
    if (orderedRules) {
      browser.storage.local.set({ [storageKey]: orderedRules });
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
  browser.storage.local.set({ [storageKey]: getDefaultRules() });
});

// Update rules when storage changes
browser.storage.onChanged.addListener((changes, areaName) => {
  console.log('storage changed', changes, areaName);
  const changed = changes[storageKey];
  if (areaName !== 'local' || !changed) return;
  batchUpdateRules(diffRules(changed.newValue, changed.oldValue));
});
