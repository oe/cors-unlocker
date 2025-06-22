import { useState, useEffect } from 'react';

interface GeneralSettingsProps {
  config: any;
  onConfigChange: (key: string, value: any) => Promise<void>;
}

export function GeneralSettings({ config, onConfigChange }: GeneralSettingsProps) {
  const [inputValues, setInputValues] = useState({
    maxRules: config.maxRules || 100,
    autoCleanupDays: config.autoCleanupDays || 30
  });

  // Update input values when config changes
  useEffect(() => {
    setInputValues({
      maxRules: config.maxRules || 100,
      autoCleanupDays: config.autoCleanupDays || 30
    });
  }, [config.maxRules, config.autoCleanupDays]);

  const handleInputChange = (key: string, value: number) => {
    setInputValues(prev => ({ ...prev, [key]: value }));
  };

  const handleInputBlur = (key: string, value: number) => {
    if (value !== config[key]) {
      onConfigChange(key, value);
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
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('maxRules', parseInt(e.target.value) || 100)}
            onBlur={(e: React.FocusEvent<HTMLInputElement>) => handleInputBlur('maxRules', parseInt(e.target.value) || 100)}
            className="w-32 px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p className="text-sm text-slate-500 mt-2">
            Limits the number of CORS rules to prevent performance issues. Browser extensions have storage and performance constraints, so keeping the rule count reasonable ensures optimal performance.
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
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange('autoCleanupDays', parseInt(e.target.value) || 30)}
            onBlur={(e: React.FocusEvent<HTMLInputElement>) => handleInputBlur('autoCleanupDays', parseInt(e.target.value) || 30)}
            className="w-32 px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p className="text-sm text-slate-500 mt-2">
            Auto-delete disabled rules after this many days (0 to disable)
          </p>
        </div>
      </div>
    </section>
  );
}
