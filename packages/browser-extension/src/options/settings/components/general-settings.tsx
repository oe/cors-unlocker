import { useState, useEffect } from 'react';

interface GeneralSettingsProps {
  config: any;
  onConfigChange: (key: string, value: any) => Promise<void>;
}

export function GeneralSettings({ config, onConfigChange }: GeneralSettingsProps) {
  const [inputValues, setInputValues] = useState({
    maxRules: String(config.maxRules ?? 100),
    autoCleanupDays: String(config.autoCleanupDays ?? 30)
  });
  
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Update input values when config changes
  useEffect(() => {
    setInputValues({
      maxRules: String(config.maxRules ?? 100),
      autoCleanupDays: String(config.autoCleanupDays ?? 30)
    });
    // Clear validation errors when config is updated from external source
    setValidationErrors({});
  }, [config.maxRules, config.autoCleanupDays]);

  const validateMaxRules = (value: string): { isValid: boolean; error?: string; validValue?: number } => {
    const num = parseInt(value);
    if (isNaN(num)) {
      return { isValid: false, error: 'Must be a valid number' };
    }
    if (num < 1) {
      return { isValid: false, error: 'Must be at least 1' };
    }
    if (num > 1000) {
      return { isValid: false, error: 'Cannot exceed 1000' };
    }
    return { isValid: true, validValue: num };
  };

  const validateAutoCleanupDays = (value: string): { isValid: boolean; error?: string; validValue?: number } => {
    const num = parseInt(value);
    if (isNaN(num)) {
      return { isValid: false, error: 'Must be a valid number' };
    }
    if (num < 0) {
      return { isValid: false, error: 'Cannot be negative' };
    }
    if (num > 365) {
      return { isValid: false, error: 'Cannot exceed 365 days' };
    }
    return { isValid: true, validValue: num };
  };

  const handleInputChange = (key: string, value: string) => {
    // Simply update the display value without any validation or modification
    setInputValues(prev => ({ 
      ...prev, 
      [key]: value
    }));
    
    // Clear previous validation error when user starts typing
    if (validationErrors[key]) {
      setValidationErrors(prev => ({ ...prev, [key]: '' }));
    }
  };

  const handleInputBlur = async (key: string, value: string) => {
    let validation: { isValid: boolean; error?: string; validValue?: number };
    
    if (key === 'maxRules') {
      validation = validateMaxRules(value);
    } else if (key === 'autoCleanupDays') {
      validation = validateAutoCleanupDays(value);
    } else {
      return;
    }

    if (!validation.isValid) {
      // Show validation error
      setValidationErrors(prev => ({ ...prev, [key]: validation.error || 'Invalid value' }));
      // Reset to previous valid value (as string)
      setInputValues(prev => ({ ...prev, [key]: String(config[key]) }));
      return;
    }

    // Clear validation error
    setValidationErrors(prev => ({ ...prev, [key]: '' }));
    
    // Save only if value changed and is valid
    if (validation.validValue !== config[key]) {
      try {
        await onConfigChange(key, validation.validValue);
      } catch (err) {
        console.error('Failed to save setting:', err);
        // On save error, reset to previous value (as string)
        setInputValues(prev => ({ ...prev, [key]: String(config[key]) }));
        setValidationErrors(prev => ({ ...prev, [key]: 'Failed to save setting' }));
      }
    }
  };

  return (
    <section className="bg-white rounded-lg p-6 border border-slate-200 shadow-sm">
      <h2 className="text-lg font-semibold mb-4 text-slate-900">General Settings</h2>
      
      <div className="space-y-6">
        <div>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={config.dftEnableCredentials || false}
              onChange={(e) => onConfigChange('dftEnableCredentials', e.target.checked)}
              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
            />
            <span className="text-slate-800 font-medium">Enable credentials by default</span>
          </label>
          <p className="text-sm text-slate-500 mt-2 ml-7">
            New rules will include credentials support by default
          </p>
        </div>

        {import.meta.env.DEV && (
          <div>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={config.debugMode || false}
                onChange={(e) => onConfigChange('debugMode', e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
              />
              <span className="text-slate-800 font-medium">Debug mode</span>
            </label>
            <p className="text-sm text-slate-500 mt-2 ml-7">
              Enable detailed logging for troubleshooting
            </p>
          </div>
        )}

        <div>
          <label className="block text-slate-800 font-medium mb-2">
            Maximum rules limit
          </label>
          <input
            type="number"
            min="1"
            max="1000"
            value={inputValues.maxRules}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('maxRules', e.target.value)}
            onBlur={(e: React.FocusEvent<HTMLInputElement>) => handleInputBlur('maxRules', e.target.value)}
            className={`w-32 px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
              validationErrors.maxRules ? 'border-red-500' : 'border-slate-300'
            }`}
          />
          {validationErrors.maxRules && (
            <p className="text-sm text-red-600 mt-1">{validationErrors.maxRules}</p>
          )}
          <p className="text-sm text-slate-500 mt-2">
            Range: 1-1000 rules. Limits the number of CORS rules to prevent performance issues. Browser extensions have storage and performance constraints, so keeping the rule count reasonable ensures optimal performance.
          </p>
        </div>

        <div>
          <label className="block text-slate-800 font-medium mb-2">
            Auto-cleanup days
          </label>
          <input
            type="number"
            min="0"
            max="365"
            value={inputValues.autoCleanupDays}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('autoCleanupDays', e.target.value)}
            onBlur={(e: React.FocusEvent<HTMLInputElement>) => handleInputBlur('autoCleanupDays', e.target.value)}
            className={`w-32 px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
              validationErrors.autoCleanupDays ? 'border-red-500' : 'border-slate-300'
            }`}
          />
          {validationErrors.autoCleanupDays && (
            <p className="text-sm text-red-600 mt-1">{validationErrors.autoCleanupDays}</p>
          )}
          <p className="text-sm text-slate-500 mt-2">
            Range: 0-365 days. Auto-delete disabled rules after this many days (set to 0 to disable auto-cleanup)
          </p>
        </div>
      </div>
    </section>
  );
}
