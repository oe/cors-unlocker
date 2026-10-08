import { IRuleItem } from '@/types';
import { type ICreateRuleOptions, createRule } from './rules';
import { isSameRule } from './utils';
import browser from 'webextension-polyfill';
import { logger } from './logger';

import { extConfig } from './ext-config';
import {
  APP_STATE_KEY,
  ensureProxyAppState,
  getCorsCompatibilityRules,
  isProxyAppState,
  saveProxyAppState,
  withLegacyRules,
} from './proxy-state';

let lastRules: IRuleItem[] | undefined;
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
        const state = await ensureProxyAppState();
        lastRules = getCorsCompatibilityRules(state);
        updateMaxId(lastRules);
        logger.debug('Loaded rules from storage:', lastRules.length);
      } catch (error) {
        logger.error('Failed to load rules from storage:', error);
        
        // Provide specific error messages for common storage issues
        if (error instanceof Error) {
          if (error.message.includes('STORAGE_UNAVAILABLE')) {
            throw new Error('Browser storage is unavailable. Please check your browser settings.');
          }
          if (error.message.includes('CORRUPTION')) {
            throw new Error('Storage data is corrupted. Extension settings may need to be reset.');
          }
        }
        
        // Fallback to empty array for initialization errors, but throw for access errors
        lastRules = [];
      }
    }
    return lastRules || [];
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
      const state = await ensureProxyAppState();
      await browser.storage.local.set({
        [APP_STATE_KEY]: withLegacyRules(state, rules),
      });
      logger.debug('Saved rules to storage:', rules.length);
    } catch (error) {
      logger.error('Failed to save rules to storage:', error);
      
      // Provide specific error messages for common storage issues
      if (error instanceof Error) {
        if (error.message.includes('QUOTA_EXCEEDED') || error.message.includes('QuotaExceededError')) {
          throw new Error('Storage quota exceeded. Please remove some rules and try again.');
        }
        if (error.message.includes('STORAGE_UNAVAILABLE')) {
          throw new Error('Browser storage is unavailable. Please try again later.');
        }
      }
      
      throw new Error('Failed to save data to browser storage. Please try again.');
    }
  },

  async addRule(options: ICreateRuleOptions): Promise<boolean> {
    try {
      const rules = await this.getRules();
      const config = extConfig.get();
      
      // Check maxRules limit
      if (rules.length >= config.maxRules) {
        logger.warn(`Cannot add rule: maximum limit of ${config.maxRules} rules reached`);
        throw new Error(`Maximum limit of ${config.maxRules} rules reached`);
      }
      
      const newRule = createRule(options);
      
      // Check for duplicate origin using cached rules
      const existingRule = rules.find(r => r.origin === newRule.origin);
      if (existingRule) {
        logger.warn('Rule with origin already exists:', newRule.origin);
        throw new Error(`Rule for origin "${newRule.origin}" already exists`);
      }
      
      const newRules = [...rules, newRule];
      await this.saveRules(newRules);
      logger.info('Added new rule:', newRule.origin);
      return true;
    } catch (error) {
      logger.error('Failed to add rule:', error);
      throw error;
    }
  },

  async removeRule(id: number): Promise<boolean> {
    try {
      const rules = await this.getRules(); // Always get fresh rules
      const newRules = rules.filter((r) => r.id !== id);
      if (newRules.length === rules.length) {
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
      const rules = await this.getRules(); // Always get fresh rules
      let updated = false;
      const newRules = rules.map((item) => {
        if (isSameRule(item, newRule)) {
          updated = true;
          return { ...item, ...newRule, updatedAt: Date.now() };
        }
        return item;
      });
      
      if (!updated) {
        logger.warn('Rule not found for update:', newRule.id);
        throw new Error(`Rule with ID "${newRule.id}" not found`);
      }
      
      await this.saveRules(newRules);
      logger.info('Updated rule:', newRule.id);
      return true;
    } catch (error) {
      logger.error('Failed to update rule:', error);
      throw error;
    }
  },
  
  onRulesChange(
    callback: (newRules?: IRuleItem[], oldRules?: IRuleItem[]) => void
  ) {
    browser.storage.onChanged.addListener((changes, areaName) => {
      logger.debug('Storage changed:', changes, areaName);
      const changed = changes[APP_STATE_KEY];
      if (areaName !== 'local' || !changed) return;
      
      try {
        // Update cached rules when storage changes
        const newRules = changed.newValue
          ? getCorsCompatibilityRules(changed.newValue)
          : [];
        const oldRules = changed.oldValue
          ? getCorsCompatibilityRules(changed.oldValue)
          : [];
        this.updateCachedRules(newRules);
        callback(newRules, oldRules);
      } catch (error) {
        logger.error('Error in rules change callback:', error);
      }
    });
  },

  // Export/Import functionality
  async exportRules(): Promise<string> {
    try {
      const state = await ensureProxyAppState();
      return JSON.stringify({
        version: '2.0',
        timestamp: Date.now(),
        state,
      }, null, 2);
    } catch (error) {
      logger.error('Failed to export rules:', error);
      throw error;
    }
  },

  async importRules(data: string, merge: boolean = false): Promise<boolean> {
    try {
      const parsed = JSON.parse(data);
      if (parsed.version === '2.0' && isProxyAppState(parsed.state)) {
        if (merge) {
          const current = await ensureProxyAppState();
          const rulesById = new Map(current.rules.map((rule) => [rule.id, rule]));
          for (const rule of parsed.state.rules) rulesById.set(rule.id, rule);
          await saveProxyAppState({
            ...current,
            rules: [...rulesById.values()],
          });
        } else {
          await saveProxyAppState(parsed.state);
        }
        lastRules = undefined;
        logger.info('Imported v2 proxy state successfully');
        return true;
      }
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
  // Always get fresh rules instead of using cached ones
  const rules = await dataStorage.getRules();
  const existRule = rules.find((r) => r.origin === rule.origin);
  
  if (existRule) {
    await dataStorage.updateRule({ ...existRule, ...rule });
    return true;
  } else {
    await dataStorage.addRule(rule as ICreateRuleOptions);
    return true;
  }
}

/**
 * Auto-cleanup disabled rules older than specified days
 */
export async function autoCleanupDisabledRules(): Promise<number> {
  try {
    const config = extConfig.get();
    
    // Skip cleanup if disabled (0 days) or no cleanup period set
    if (!config.autoCleanupDays || config.autoCleanupDays <= 0) {
      logger.debug('Auto-cleanup disabled');
      return 0;
    }

    const rules = await dataStorage.getRules();
    const cutoffTime = Date.now() - (config.autoCleanupDays * 24 * 60 * 60 * 1000);
    
    // Find disabled rules older than cutoff time
    const rulesToCleanup = rules.filter(rule => 
      rule.disabled && 
      (rule.updatedAt || rule.createdAt) < cutoffTime
    );
    
    if (rulesToCleanup.length === 0) {
      logger.debug('No rules to cleanup');
      return 0;
    }

    // Remove old disabled rules
    const remainingRules = rules.filter(rule => 
      !rule.disabled || 
      (rule.updatedAt || rule.createdAt) >= cutoffTime
    );
    
    await dataStorage.saveRules(remainingRules);
    
    logger.info(`Auto-cleanup: removed ${rulesToCleanup.length} disabled rules older than ${config.autoCleanupDays} days`);
    return rulesToCleanup.length;
  } catch (error) {
    logger.error('Failed to auto-cleanup disabled rules:', error);
    return 0;
  }
}
