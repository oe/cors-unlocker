import { IRuleItem } from '@/types';
import { type ICreateRuleOptions, createRule } from './rules';
import { isSameRule } from './utils';
import browser from 'webextension-polyfill';
import { logger } from './logger';

import { extConfig } from './ext-config';

/**
 * local storage key for allowed domains
 */
const storageKey = 'allowedOrigins';

let lastRules: IRuleItem[];
let maxId = 0;

// Debounce saves to avoid too frequent storage writes
let saveTimeout: NodeJS.Timeout | null = null;
const SAVE_DEBOUNCE_MS = 500;

export const dataStorage = {
  updateCachedRules(rules: IRuleItem[]) {
    updateMaxId(rules); 
    lastRules = rules;
  },
  
  async getRules(): Promise<IRuleItem[]> {
    if (!lastRules) {
      try {
        const result = await browser.storage.local.get(storageKey);
        lastRules = result[storageKey] || [];
        updateMaxId(lastRules);
        logger.debug('Loaded rules from storage:', lastRules.length);
      } catch (error) {
        logger.error('Failed to load rules from storage:', error);
        lastRules = [];
      }
    }
    return lastRules;
  },
  
  saveRules(rules: IRuleItem[], debounce: boolean = false): Promise<void> {
    lastRules = rules;
    
    if (debounce) {
      return new Promise((resolve, reject) => {
        if (saveTimeout) {
          clearTimeout(saveTimeout);
        }
        
        saveTimeout = setTimeout(async () => {
          try {
            await this._saveRulesImmediate(rules);
            resolve();
          } catch (error) {
            reject(error);
          }
        }, SAVE_DEBOUNCE_MS);
      });
    }
    
    return this._saveRulesImmediate(rules);
  },

  async _saveRulesImmediate(rules: IRuleItem[]): Promise<void> {
    try {
      await browser.storage.local.set({
        [storageKey]: rules
      });
      logger.debug('Saved rules to storage:', rules.length);
    } catch (error) {
      logger.error('Failed to save rules to storage:', error);
      throw error;
    }
  },

  async addRule(options: ICreateRuleOptions): Promise<boolean> {
    try {
      const newRule = createRule(options);
      if (newRule) {
        // Check for duplicate origin using cached rules
        const existingRule = lastRules.find(r => r.origin === newRule.origin);
        if (existingRule) {
          logger.warn('Rule with origin already exists:', newRule.origin);
          return false;
        }
        
        const newRules = [...lastRules, newRule];
        await this.saveRules(newRules);
        logger.info('Added new rule:', newRule.origin);
        return true;
      }
      return false;
    } catch (error) {
      logger.error('Failed to add rule:', error);
      return false;
    }
  },

  async removeRule(id: number): Promise<boolean> {
    try {
      const newRules = lastRules.filter((r) => r.id !== id);
      if (newRules.length === lastRules.length) {
        logger.warn('Rule not found for removal:', id);
        return false;
      }
      await this.saveRules(newRules);
      logger.info('Removed rule:', id);
      return true;
    } catch (error) {
      logger.error('Failed to remove rule:', error);
      return false;
    }
  },
  
  async updateRule(newRule: Partial<IRuleItem>): Promise<boolean> {
    try {
      let updated = false;
      const newRules = lastRules.map((item) => {
        if (isSameRule(item, newRule)) {
          updated = true;
          return { ...item, ...newRule, updatedAt: Date.now() };
        }
        return item;
      });
      
      if (!updated) {
        logger.warn('Rule not found for update:', newRule.id);
        return false;
      }
      
      await this.saveRules(newRules);
      logger.info('Updated rule:', newRule.id);
      return true;
    } catch (error) {
      logger.error('Failed to update rule:', error);
      return false;
    }
  },
  
  onRulesChange(
    callback: (newRules?: IRuleItem[], oldRules?: IRuleItem[]) => void
  ) {
    browser.storage.onChanged.addListener((changes, areaName) => {
      logger.debug('Storage changed:', changes, areaName);
      const changed = changes[storageKey];
      if (areaName !== 'local' || !changed) return;
      
      try {
        callback(changed.newValue, changed.oldValue);
      } catch (error) {
        logger.error('Error in rules change callback:', error);
      }
    });
  },

  // Export/Import functionality
  async exportRules(): Promise<string> {
    try {
      const rules = await this.getRules();
      return JSON.stringify({
        version: '1.0',
        timestamp: Date.now(),
        rules: rules
      }, null, 2);
    } catch (error) {
      logger.error('Failed to export rules:', error);
      throw error;
    }
  },

  async importRules(data: string, merge: boolean = false): Promise<boolean> {
    try {
      const parsed = JSON.parse(data);
      if (!parsed.rules || !Array.isArray(parsed.rules)) {
        throw new Error('Invalid export format');
      }

      const importedRules = parsed.rules as IRuleItem[];
      let finalRules: IRuleItem[];

      if (merge) {
        const existingRules = await this.getRules();
        const mergedRules = [...existingRules];
        
        for (const importedRule of importedRules) {
          const existingIndex = mergedRules.findIndex(r => r.origin === importedRule.origin);
          if (existingIndex >= 0) {
            // Update existing rule
            mergedRules[existingIndex] = { ...importedRule, id: mergedRules[existingIndex].id };
          } else {
            // Add new rule with new ID
            mergedRules.push({ ...importedRule, id: genRuleId() });
          }
        }
        finalRules = mergedRules;
      } else {
        // Replace all rules, reassign IDs
        finalRules = importedRules.map((rule, index) => ({ ...rule, id: index + 1 }));
        maxId = finalRules.length;
      }

      await this.saveRules(finalRules);
      logger.info('Imported rules successfully:', finalRules.length);
      return true;
    } catch (error) {
      logger.error('Failed to import rules:', error);
      return false;
    }
  }
};

function updateMaxId(rules: IRuleItem[]) {
  maxId = rules.length ? Math.max(...rules.map((rule) => rule.id)) : 0;
}

export function genRuleId(): number {
  return ++maxId;
}

const currentTabRule: Record<number, IRuleItem | undefined> = {};

export function setCurrentTabRule(winId: number | undefined, rule?: IRuleItem | null) {
  const newRule = rule || undefined;
  const targetWinId = winId || 0;
  if (currentTabRule[targetWinId] === newRule) return;
  
  currentTabRule[targetWinId] = newRule;
  
  // Notify UI about the change
  browser.runtime.sendMessage({ type: 'activeTabRuleChange' }).catch((_error) => {
    // ignore error, it's ok if no options page is open
    logger.debug('No listeners for activeTabRuleChange message');
  });
}

/**
 * get current active tab rule
 * @param winId window id
 */
export function getCurrentTabRule(winId: number) {
  return currentTabRule[winId] || { 
    credentials: extConfig.get().dftEnableCredentials || false 
  };
}

export function removeCurrentTabRule(winId: number) {
  delete currentTabRule[winId];
}

export async function toggleRuleViaOrigin(rule: Partial<IRuleItem>): Promise<boolean> {
  try {
    // Use cached rules instead of reloading
    const existRule = lastRules.find((r) => r.origin === rule.origin);
    
    if (existRule) {
      return await dataStorage.updateRule({ ...existRule, ...rule });
    } else {
      return await dataStorage.addRule(rule as ICreateRuleOptions);
    }
  } catch (error) {
    logger.error('Failed to toggle rule via origin:', error);
    return false;
  }
}