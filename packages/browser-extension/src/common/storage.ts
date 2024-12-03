import { IRuleItem } from '@/types';
import browser from 'webextension-polyfill';
/**
 * local storage key for allowed domains
 */
const storageKey = 'allowedOrigins';

let lastRules: IRuleItem[]

export const dataStorage = {
  async getRules(): Promise<IRuleItem[] | void> {
    if (!lastRules) {
      lastRules = await browser.storage.local.get(storageKey).then(res => res[storageKey]);
    }
    return lastRules;
  },
  saveRules(rules: IRuleItem[]) {
    lastRules = rules;
    return browser.storage.local.set({
      [storageKey]: rules
    });
  },
  onRulesChange(callback: (newRules?: IRuleItem[], oldRules?: IRuleItem[]) => void) {
    browser.storage.onChanged.addListener((changes, areaName) => {
      const changed = changes[storageKey];
      if (areaName !== 'local' || !changed) return;
      callback(changed.newValue, changed.oldValue);
    });
  }
};