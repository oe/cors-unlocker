import { IRuleItem } from '@/types';
import { type ICreateRuleOptions } from './rules';
import browser from 'webextension-polyfill';
import { logger } from './logger';

import { extConfig } from './ext-config';
import { parseImport } from './import-preview';
import {
  APP_STATE_KEY,
  ensureProxyAppState,
  getCorsCompatibilityRules,
  performProxyStateOperation,
} from './proxy-state';

let lastRules: IRuleItem[] | undefined;
let maxId = 0;

// Debounce saves to avoid too frequent storage writes
let saveTimeout: NodeJS.Timeout | null = null;
const SAVE_DEBOUNCE_MS = 500;
let pendingSaves: Array<{ resolve: () => void; reject: (error: unknown) => void }> = [];

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
    if (debounce) {
      return new Promise((resolve, reject) => {
        if (saveTimeout) {
          clearTimeout(saveTimeout);
        }
        
        pendingSaves.push({ resolve, reject });
        saveTimeout = setTimeout(async () => {
          saveTimeout = null;
          const pending = pendingSaves; pendingSaves = [];
          try {
            await this._saveRulesImmediate(rules);
            pending.forEach((save) => save.resolve());
          } catch (error) {
            pending.forEach((save) => save.reject(error));
          }
        }, SAVE_DEBOUNCE_MS);
      });
    }
    
    return this._saveRulesImmediate(rules);
  },

  async _saveRulesImmediate(rules: IRuleItem[]): Promise<void> {
    try {
      const state = await performProxyStateOperation({ kind: 'legacyRules', rules });
      this.updateCachedRules(getCorsCompatibilityRules(state));
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
    const state = await performProxyStateOperation({ kind: 'legacyPatch', intent: 'add', rule: options });
    this.updateCachedRules(getCorsCompatibilityRules(state));
    return true;
  },

  async removeRule(id: number): Promise<boolean> {
    const state = await performProxyStateOperation({ kind: 'legacyPatch', intent: 'remove', rule: { id } });
    this.updateCachedRules(getCorsCompatibilityRules(state));
    return true;
  },

  async updateRule(rule: Partial<IRuleItem>): Promise<boolean> {
    const state = await performProxyStateOperation({ kind: 'legacyPatch', intent: 'update', rule });
    this.updateCachedRules(getCorsCompatibilityRules(state));
    return true;
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

  async importRules(data: string, merge: boolean = false, expectedState?: import('./proxy-state').IProxyAppState): Promise<boolean> {
    const state = await performProxyStateOperation({ kind: 'import', state: parseImport(data), merge, expectedState });
    this.updateCachedRules(getCorsCompatibilityRules(state));
    return true;
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
  const state = await performProxyStateOperation({ kind: 'legacyPatch', intent: 'upsert', rule });
  dataStorage.updateCachedRules(getCorsCompatibilityRules(state));
  return true;
}

/**
 * Auto-cleanup disabled rules older than specified days
 */
export async function autoCleanupDisabledRules(): Promise<number> {
  const before = await dataStorage.getRules();
  const state = await performProxyStateOperation({ kind: 'cleanup' });
  const rules = getCorsCompatibilityRules(state);
  dataStorage.updateCachedRules(rules);
  return before.length - rules.length;
}
