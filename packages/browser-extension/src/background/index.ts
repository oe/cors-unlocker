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
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get(storageKey, (result) => {
    const rules = result[storageKey];
    if (!rules || !rules.length) return;
    const orderedRules = reorderRules(rules);
    // order changed, update storage then trigger event
    if (orderedRules) {
      chrome.storage.local.set({ [storageKey]: orderedRules });
    } else {
      batchUpdateRules(rules);
    }
  });
});

// Initialize default rules on installation
chrome.runtime.onInstalled.addListener((e) => {
  // only run on install
  if (e.reason !== 'install') return;
  // will trigger events to update rules
  chrome.storage.local.set({ [storageKey]: getDefaultRules() });
});

// Update rules when storage changes
chrome.storage.onChanged.addListener((changes, areaName) => {
  console.log('storage changed', changes, areaName);
  const changed = changes[storageKey];
  if (areaName !== 'local' || !changed) return;
  batchUpdateRules(diffRules(changed.newValue, changed.oldValue));
});
