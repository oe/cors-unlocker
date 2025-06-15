import browser from 'webextension-polyfill';
import { logger } from './logger';

const configKey = 'extConfig';

export interface IExtConfig {
  /**
   * whether enable credentials by default
   */
  dftEnableCredentials: boolean;
  /**
   * Enable debug logging
   */
  debugMode: boolean;
  /**
   * Maximum number of rules allowed
   */
  maxRules: number;
  /**
   * Auto-cleanup disabled rules older than X days
   */
  autoCleanupDays: number;
}

const defaultConfig: IExtConfig = {
  dftEnableCredentials: false,
  debugMode: false,
  maxRules: 100,
  autoCleanupDays: 30,
};

let config: IExtConfig = { ...defaultConfig };

export const extConfig = {
  get(): IExtConfig {
    return { ...config };
  },

  async init(): Promise<void> {
    try {
      const result = await browser.storage.local.get(configKey);
      const storedConfig = result[configKey];
      
      if (storedConfig) {
        // Merge with defaults to handle new config properties
        config = { ...defaultConfig, ...storedConfig };
        
        // Migrate old config if needed
        if (this.needsMigration(storedConfig)) {
          await this.save(config);
          logger.info('Config migrated to new version');
        }
      } else {
        // First time setup
        await this.save(config);
        logger.info('Config initialized with defaults');
      }
      
      logger.debug('Config loaded:', config);
    } catch (error) {
      logger.error('Failed to load config, using defaults:', error);
      config = { ...defaultConfig };
    }
  },

  async save(newConfig: Partial<IExtConfig>): Promise<void> {
    try {
      // Validate config values
      const validatedConfig = this.validateConfig({ ...config, ...newConfig });
      
      config = validatedConfig;
      await browser.storage.local.set({
        [configKey]: config,
      });
      
      logger.debug('Config saved:', config);
    } catch (error) {
      logger.error('Failed to save config:', error);
      throw error;
    }
  },

  async reset(): Promise<void> {
    config = { ...defaultConfig };
    await this.save(config);
    logger.info('Config reset to defaults');
  },

  validateConfig(cfg: Partial<IExtConfig>): IExtConfig {
    const validated: IExtConfig = { ...defaultConfig };
    
    // Validate each property
    if (typeof cfg.dftEnableCredentials === 'boolean') {
      validated.dftEnableCredentials = cfg.dftEnableCredentials;
    }
    
    if (typeof cfg.debugMode === 'boolean') {
      validated.debugMode = cfg.debugMode;
    }
    
    if (typeof cfg.maxRules === 'number' && cfg.maxRules > 0 && cfg.maxRules <= 1000) {
      validated.maxRules = cfg.maxRules;
    }
    
    if (typeof cfg.autoCleanupDays === 'number' && cfg.autoCleanupDays >= 0 && cfg.autoCleanupDays <= 365) {
      validated.autoCleanupDays = cfg.autoCleanupDays;
    }
    
    return validated;
  },

  needsMigration(storedConfig: any): boolean {
    // Check if all required properties exist
    const requiredProps = Object.keys(defaultConfig);
    return !requiredProps.every(prop => prop in storedConfig);
  }
};

/**
 * sync ext config changes
 */
browser.storage.onChanged.addListener(async (changes, areaName) => {
  logger.debug(`Storage changed - ${configKey}:`, changes, areaName);
  const changed = changes[configKey];
  if (areaName !== 'local' || !changed) return;
  
  try {
    // Update local config
    config = extConfig.validateConfig(changed.newValue || {});
    logger.debug('Config updated from storage:', config);
  } catch (error) {
    logger.error('Error handling config change:', error);
  }
});

// Initialize config on module load
extConfig.init();
