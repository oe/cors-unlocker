import { IRuleItem } from '@/types';
import browser from 'webextension-polyfill';
/**
 * local storage key for allowed domains
 */
const storageKey = 'allowedOrigins';

let lastRules: IRuleItem[]

export const dataStorage = {
  updateCachedRules(rules: IRuleItem[]) {
    lastRules = rules;
  },
  async getRules(): Promise<IRuleItem[] | void> {
    if (!lastRules) {
      lastRules = await browser.storage.local.get(storageKey).then(res => res[storageKey]);
    }
    console.log('getRules', lastRules);
    return lastRules;
  },
  saveRules(rules: IRuleItem[]) {
    lastRules = rules;
    console.log('saveRules', rules);
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

const currentTabRule: Record<number, IRuleItem | null > = {};

export function setCurrentTabRule(winId: number | undefined, rule?: IRuleItem | null) {
  console.log('setCurrentTabRule', rule);
  currentTabRule[winId || 0] = rule || null;
  browser.runtime.sendMessage({ type: 'activeTabRuleChange' }).catch((error) => {
    console.warn('sendMessage "activeTabRuleChange" error', error);
  });
}

export function getCurrentTabRule(winId: number) {
  return currentTabRule[winId];
}

export function removeCurrentTabRule(winId: number) {
  delete currentTabRule[winId];
}
