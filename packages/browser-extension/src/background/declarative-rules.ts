import browser from 'webextension-polyfill';
import type { IRuleItem } from '../types';

const resourceTypes = [
  'main_frame',
  'sub_frame',
  'stylesheet',
  'script',
  'image',
  'font',
  'object',
  'xmlhttprequest',
  'ping',
  'csp_report',
  'media',
  'websocket',
  'other'
] as chrome.declarativeNetRequest.ResourceType[];

export function clearAllRules() {
  browser.declarativeNetRequest.getDynamicRules().then((existingRules) => {
    if (!existingRules.length) return;
    const existingRuleIds = existingRules.map((rule) => rule.id);
    browser.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existingRuleIds
    });
  });
}

export function batchUpdateRules(rules: IRuleItem[]) {
  if (!rules || !rules.length) {
    return;
  }
  // remove all changed rules, including removed updated, and added
  //  make sure the rules can be updated
  const removedRuleIds = rules.map((rule) => rule.id);
  const updatedRules = rules
    .filter((rule) => !rule.disabled)
    // latest updated rule first
    .sort((a, b) => b.updatedAt - a.updatedAt)
    // remove the rules with the same domain, except the first one
    .filter((rule, index, self) => self.findIndex((r) => r.domain === rule.domain) === index)
    .map(createRule);
  console.log('batchUpdateRules', removedRuleIds, updatedRules);
  browser.declarativeNetRequest.getDynamicRules().then((existingRules) => {
    // only remove rules that are in the existing rules
    const existingRuleIds = existingRules
      .filter((rule) => removedRuleIds.includes(rule.id))
      .map((rule) => rule.id);

    browser.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existingRuleIds,
      addRules: updatedRules
    });
  });
}

function createRule(rule: IRuleItem) {
  return {
    id: rule.id,
    priority: 1,
    action: {
      type: 'modifyHeaders' as chrome.declarativeNetRequest.RuleActionType,
      responseHeaders: [
        {
          header: 'Access-Control-Allow-Origin',
          operation: 'set' as chrome.declarativeNetRequest.HeaderOperation,
          value: rule.credentials ? rule.origin : '*'
        }
      ]
    },
    condition: {
      urlFilter: '*',
      initiatorDomains: [rule.domain],
      resourceTypes
    }
  };
}

export function toggleRule(activeRule: IRuleItem, sameDomainRules: IRuleItem[]) {
  const removedRuleIds = sameDomainRules.map((rule) => rule.id)
    .filter((id) => id !== activeRule.id);
  
  browser.declarativeNetRequest.getDynamicRules().then((existingRules) => {
    // active rules that need to be disabled
    const existingRuleIds = existingRules
      .filter((rule) => removedRuleIds.includes(rule.id))
      .map((rule) => rule.id);

    const isRuleEnabled = existingRules.some(
      (rule) => rule.id === activeRule.id
    );
    // no need to update if the rule is already enabled
    if (!existingRuleIds.length && isRuleEnabled) return;
    const updatedRules = isRuleEnabled ? [] : [createRule(activeRule)];

    browser.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existingRuleIds,
      addRules: updatedRules
    });
  });

}
