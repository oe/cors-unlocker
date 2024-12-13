import { IRuleItem } from '@/types';
import { type ICreateRuleOptions, createRule } from './rules';
import { isSameRule } from './utils';
import browser from 'webextension-polyfill';
/**
 * local storage key for allowed domains
 */
const storageKey = 'allowedOrigins';

let lastRules: IRuleItem[];

let maxId = 0;

export const dataStorage = {
  updateCachedRules(rules: IRuleItem[]) {
    updateMaxId(rules);
    lastRules = rules;
  },
  async getRules(): Promise<IRuleItem[] | void> {
    if (!lastRules) {
      lastRules = await browser.storage.local
        .get(storageKey)
        .then((res) => res[storageKey]);
      lastRules = lastRules || [];
      updateMaxId(lastRules);
    }
    return lastRules;
  },
  saveRules(rules: IRuleItem[]) {
    lastRules = rules;
    console.log('saveRules', rules);
    return browser.storage.local.set({
      [storageKey]: rules
    });
  },

  addRule(options: ICreateRuleOptions) {
    const newRule = createRule(options);
    if (newRule) {
      const newRules = lastRules.concat([newRule]);
      dataStorage.saveRules(newRules);
    }
    return !!newRule
  },

  removeRule(id: number) {
    const newRules = lastRules.filter((r) => r.id !== id);
    dataStorage.saveRules(newRules);
  },
  updateRule(newRule: Partial<IRuleItem>) {
    const newRules = lastRules.map((item) => {
      if (isSameRule(item, newRule)) {
        return Object.assign({}, item, newRule, { updatedAt: Date.now() });
      }
      return item;
    });
    dataStorage.saveRules(newRules);
  },
  onRulesChange(
    callback: (newRules?: IRuleItem[], oldRules?: IRuleItem[]) => void
  ) {
    browser.storage.onChanged.addListener((changes, areaName) => {
      console.log('onRuleChange', changes)
      const changed = changes[storageKey];
      if (areaName !== 'local' || !changed) return;
      callback(changed.newValue, changed.oldValue);
    });
  }
};

function updateMaxId(rules: IRuleItem[]) {
  maxId = rules.length ? Math.max(...rules.map((rule) => rule.id)) : 0;
}

export function genRuleId() {
  return ++maxId;
}

const currentTabRule: Record<number, IRuleItem | null > = {};

export function setCurrentTabRule(winId: number | undefined, rule?: IRuleItem | null) {
  const newRule = rule || null;
  const targetWinId = winId || 0;
  if (currentTabRule[targetWinId] === newRule) return;
  console.warn('setCurrentTabRule', rule);
  currentTabRule[targetWinId] = newRule;
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

export async function toggleRuleViaOrigin(rule: Partial<IRuleItem>) {
  const rules = await dataStorage.getRules();
  if (!rules) return;
  const existRule = rules.find((r) => r.origin === rule.origin);
  if (existRule) {
    dataStorage.updateRule(Object.assign({}, existRule, rule));
  } else {
    dataStorage.addRule(rule as ICreateRuleOptions);
  }
}