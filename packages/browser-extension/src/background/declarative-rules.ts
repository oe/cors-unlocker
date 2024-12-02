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
  const removedRuleIds = rules.map((rule) => rule.id);
  const updatedRules = rules.filter((rule) => !rule.disabled).map(createRule);
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
          value: rule.origin
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
