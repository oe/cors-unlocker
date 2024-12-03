import { IRuleItem } from '@/types';
import browser from 'webextension-polyfill';
/**
 * local storage key for allowed domains
 */
const storageKey = 'allowedOrigins';

export const dataStorage = {
  getRules(): Promise<IRuleItem[] | void> {
    return browser.storage.local.get(storageKey).then(res => res[storageKey]);
  },
  saveRules(rules: IRuleItem[]) {
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