import { useState, useEffect } from 'react';
import { RotateCcw, Save, AlertCircle, CheckCircle } from 'lucide-react';
import { extConfig } from '@/common/ext-config';
import { logger } from '@/common/logger';

interface SettingsState {
  config: any;
  isLoading: boolean;
  isSaving: boolean;
  message: { type: 'success' | 'error'; text: string } | null;
}

export function Settings() {
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

  const showMessage = (type: 'success' | 'error', text: string) => {
    setState(prev => ({ ...prev, message: { type, text } }));
    setTimeout(() => {
      setState(prev => ({ ...prev, message: null }));
    }, 5000);
  };

  const updateConfig = (key: string, value: any) => {
    setState(prev => ({
      ...prev,
      config: { ...prev.config, [key]: value }
    }));
  };

  if (state.isLoading) {
    return (
      <div className="p-4 flex items-center justify-center min-h-[400px]">
        <div className="text-slate-600">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6 text-slate-900">Settings</h1>
      
      {/* Message */}
      {state.message && (
        <div className={`mb-4 p-3 rounded-lg flex items-center gap-2 ${
          state.message.type === 'success' 
            ? 'bg-green-100 text-green-800'
            : 'bg-red-100 text-red-800'
        }`}>
          {state.message.type === 'success' ? (
            <CheckCircle className="w-4 h-4" />
          ) : (
            <AlertCircle className="w-4 h-4" />
          )}
          {state.message.text}
        </div>
      )}

      {/* Configuration */}
      <div className="space-y-6">
        <section className="bg-white rounded-lg p-4 border border-slate-200">
          <h2 className="text-lg font-semibold mb-4 text-slate-900">General Settings</h2>
          
          <div className="space-y-4">
            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={state.config.dftEnableCredentials || false}
                  onChange={(e) => updateConfig('dftEnableCredentials', e.target.checked)}
                  className="rounded"
                />
                <span className="text-slate-800">Enable credentials by default</span>
              </label>
              <p className="text-sm text-slate-500 mt-1">
                New rules will include credentials support by default
              </p>
            </div>

            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={state.config.debugMode || false}
                  onChange={(e) => updateConfig('debugMode', e.target.checked)}
                  className="rounded"
                />
                <span className="text-slate-800">Debug mode</span>
              </label>
              <p className="text-sm text-slate-500 mt-1">
                Enable detailed logging for troubleshooting
              </p>
            </div>

            <div>
              <label className="block text-slate-800 mb-1">
                Maximum rules limit
              </label>
              <input
                type="number"
                min="1"
                max="1000"
                value={state.config.maxRules || 100}
                onChange={(e) => updateConfig('maxRules', parseInt(e.target.value) || 100)}
                className="w-24 px-2 py-1 border border-slate-300 rounded bg-white"
              />
              <p className="text-sm text-slate-500 mt-1">
                Maximum number of rules allowed (1-1000)
              </p>
            </div>

            <div>
              <label className="block text-slate-800 mb-1">
                Auto-cleanup days
              </label>
              <input
                type="number"
                min="0"
                max="365"
                value={state.config.autoCleanupDays || 30}
                onChange={(e) => updateConfig('autoCleanupDays', parseInt(e.target.value) || 30)}
                className="w-24 px-2 py-1 border border-slate-300 rounded bg-white"
              />
              <p className="text-sm text-slate-500 mt-1">
                Auto-delete disabled rules after this many days (0 to disable)
              </p>
            </div>
          </div>

          <div className="flex gap-2 mt-6">
            <button
              onClick={saveConfig}
              disabled={state.isSaving}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {state.isSaving ? 'Saving...' : 'Save Settings'}
            </button>
            
            <button
              onClick={resetConfig}
              className="flex items-center gap-2 px-4 py-2 bg-slate-500 text-white rounded hover:bg-slate-600"
            >
              <RotateCcw className="w-4 h-4" />
              Reset to Defaults
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}