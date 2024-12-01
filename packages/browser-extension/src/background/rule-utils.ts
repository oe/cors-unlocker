import browser from 'webextension-polyfill';
import type { IRuleItem } from '../types';

let maxRuleId = 0;

const DEFAULT_ORIGINS = ['https://cors.forth.ink', 'https://www.google.com'];

export function genRuleId(): number {
  return ++maxRuleId;
}

/**
 * diff new rules with old rules
 * @param newRules new rules
 * @param oldRules old rules
 * @returns rules that need to be updated
 */
export function diffRules(newRules: IRuleItem[], oldRules?: IRuleItem[]) {
  if (!oldRules || !oldRules.length || !newRules || !newRules.length)
    return newRules || [];

  const updatedRules = newRules.filter((newRule) => {
    const rule = oldRules.find((oldRule) => newRule.id === oldRule.id);
    return !rule || !isRuleEqual(newRule, rule);
  });

  const removedRules = oldRules
    .filter((oldRule) => {
      return !newRules.some((newRule) => newRule.id === oldRule.id);
    })
    .map((rule) => ({ ...rule, disabled: true }));

  return updatedRules.concat(removedRules);
}

function isRuleEqual(newRule: IRuleItem, oldRule: IRuleItem) {
  return (
    newRule.origin === oldRule.origin && newRule.disabled === oldRule.disabled
  );
}

/**
 * reorder rules by its index, to cleanup the id, make it in an ascend order
 */
export function reorderRules(rules: IRuleItem[]) {
  const newRules = rules.map((rule, index) => ({ ...rule, id: index + 1 }));
  maxRuleId = newRules.length + 1;
  const updatedRules = diffRules(newRules, rules);
  return updatedRules.length ? newRules : null;
}

export function listenForRuleIdRequest() {
  browser.runtime.onMessage.addListener(async (message) => {
    if (message.action === 'getNewRuleId') {
      return { ruleId: genRuleId() };
    }
  });
}

export function getDefaultRules(): IRuleItem[] {
  const now = Date.now();
  return DEFAULT_ORIGINS.map((origin) => createDefaultRule(origin, now));
}

function createDefaultRule(origin: string, createdAt: number): IRuleItem {
  return {
    id: genRuleId(),
    createdAt,
    origin,
    updatedAt: createdAt
  };
}
