import { useState, useEffect } from 'react';
import { extConfig } from '@/common/ext-config';
import { logger } from '@/common/logger';

interface SettingsState {
  config: any;
  isLoading: boolean;
  isSaving: boolean;
  message: { type: 'success' | 'error'; text: string } | null;
}

export function useSettings() {
  const [state, setState] = useState<SettingsState>({
    config: {},
    isLoading: true,
    isSaving: false,
    message: null
  });

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true }));
      const config = extConfig.get();
      setState(prev => ({ ...prev, config, isLoading: false }));
    } catch (error) {
      logger.error('Failed to load config:', error);
      showMessage('error', 'Failed to load settings');
      setState(prev => ({ ...prev, isLoading: false }));
    }
  };

  const saveConfig = async () => {
    try {
      setState(prev => ({ ...prev, isSaving: true }));
      await extConfig.save(state.config);
      showMessage('success', 'Settings saved successfully');
    } catch (error) {
      logger.error('Failed to save config:', error);
      showMessage('error', 'Failed to save settings');
    } finally {
      setState(prev => ({ ...prev, isSaving: false }));
    }
  };

  const resetConfig = async () => {
    if (!confirm('Are you sure you want to reset all settings to defaults?')) {
      return;
    }
    
    try {
      await extConfig.reset();
      await loadConfig();
      showMessage('success', 'Settings reset to defaults');
    } catch (error) {
      logger.error('Failed to reset config:', error);
      showMessage('error', 'Failed to reset settings');
    }
  };

  const showMessage = (type: 'success' | 'error', text: string, duration = 5000) => {
    setState(prev => ({ ...prev, message: { type, text } }));
    setTimeout(() => {
      setState(prev => ({ ...prev, message: null }));
    }, duration);
  };

  const updateConfig = async (key: string, value: any) => {
    try {
      const newConfig = { ...state.config, [key]: value };
      setState(prev => ({
        ...prev,
        config: newConfig
      }));
      
      // Auto-save the config immediately (no loading state for local operations)
      await extConfig.save(newConfig);
      
      // Show success message for all config changes
      showMessage('success', 'Saved', 2000);
    } catch (error) {
      logger.error('Failed to auto-save config:', error);
      showMessage('error', 'Failed to save settings');
    }
  };

  return {
    ...state,
    saveConfig,
    resetConfig,
    updateConfig,
    showMessage
  };
}
