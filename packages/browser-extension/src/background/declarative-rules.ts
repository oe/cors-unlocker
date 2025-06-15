import browser from 'webextension-polyfill';
import type { IRuleItem } from '../types';
import { logger } from '@/common/logger';

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

// Maximum number of dynamic rules allowed by Chrome
const MAX_DYNAMIC_RULES = 5000;

export async function batchUpdateRules(rules: IRuleItem[]) {
  if (!rules || !rules.length) {
    return;
  }

  try {
    // remove all changed rules, including removed updated, and added
    //  make sure the rules can be updated
    const removedRuleIds = rules.map((rule) => rule.id);
    const updatedRules = rules
      .filter((rule) => !rule.disabled)
      // latest updated rule first
      .sort((a, b) => b.updatedAt - a.updatedAt)
      // remove the rules with the same domain, except the first one
      .filter((rule, index, self) => self.findIndex((r) => r.domain === rule.domain) === index)
      .slice(0, MAX_DYNAMIC_RULES) // Ensure we don't exceed the limit
      .map(createRule);

    const existingRules = await browser.declarativeNetRequest.getDynamicRules();
    
    // only remove rules that are in the existing rules
    const existingRuleIds = existingRules
      .filter((rule) => removedRuleIds.includes(rule.id))
      .map((rule) => rule.id);

    await browser.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existingRuleIds,
      addRules: updatedRules
    });

    logger.info(`Updated ${updatedRules.length} rules, removed ${existingRuleIds.length} rules`);
  } catch (error) {
    logger.error('Error updating dynamic rules:', error);
    // Fallback: try to update rules one by one
    await updateRulesIndividually(rules);
  }
}

async function updateRulesIndividually(rules: IRuleItem[]) {
  logger.info('Falling back to individual rule updates');
  
  for (const rule of rules) {
    try {
      if (rule.disabled) {
        await browser.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: [rule.id]
        });
      } else {
        await browser.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: [rule.id],
          addRules: [createRule(rule)]
        });
      }
    } catch (error) {
      logger.error(`Failed to update rule ${rule.id}:`, error);
    }
  }
}

function createRule(rule: IRuleItem) {
  return {
    id: rule.id,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      responseHeaders: [
        {
          header: 'Access-Control-Allow-Origin',
          operation: 'set',
          value: rule.credentials ? rule.origin : '*'
        },
        {
          header: 'Access-Control-Allow-Credentials',
          operation: 'set',
          value: rule.credentials ? 'true' : 'false'
        },
        {
          header: 'Access-Control-Allow-Methods',
          operation: 'set',
          value: 'GET, POST, PUT, DELETE, OPTIONS, PATCH'
        },
        {
          header: 'Access-Control-Allow-Headers',
          operation: 'set',
          value: 'Content-Type, Authorization, X-Requested-With, Accept, Origin'
        }
      ]
    },
    condition: {
      urlFilter: '*',
      initiatorDomains: [rule.domain],
      resourceTypes
    }
  } as browser.DeclarativeNetRequest.Rule;
}

export async function toggleRule(activeRule: IRuleItem, sameDomainRules: IRuleItem[]) {
  try {
    const removedRuleIds = sameDomainRules.map((rule) => rule.id)
      .filter((id) => id !== activeRule.id);
    
    const existingRules = await browser.declarativeNetRequest.getDynamicRules();
    
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

    await browser.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existingRuleIds,
      addRules: updatedRules
    });
  } catch (error) {
    logger.error('Error toggling rule:', error);
  }
}
