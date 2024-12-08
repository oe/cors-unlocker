import type { IRuleItem } from '@/types';
import { createRule } from '@/common/rules';

const DEFAULT_ORIGINS = ['https://cors.forth.ink', 'https://www.google.com'];

/**
 * diff new rules with old rules
 * @param newRules new rules
 * @param oldRules old rules
 * @returns rules that need to be updated
 */
export function diffRules(newRules?: IRuleItem[], oldRules?: IRuleItem[]) {
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
  const updatedRules = diffRules(newRules, rules);
  return updatedRules.length ? newRules : null;
}


export function getDefaultRules(): IRuleItem[] {
  return DEFAULT_ORIGINS.map((origin, index) =>
    createRule({ origin, id: index + 1 })
  ).filter(Boolean) as IRuleItem[];
}
