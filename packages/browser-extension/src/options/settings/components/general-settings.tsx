interface GeneralSettingsProps {
  config: any;
  onConfigChange: (key: string, value: any) => void;
}

export function GeneralSettings({ config, onConfigChange }: GeneralSettingsProps) {
  return (
    <section className="bg-white rounded-lg p-4 border border-slate-200">
      <h2 className="text-lg font-semibold mb-4 text-slate-900">General Settings</h2>
      
      <div className="space-y-4">
        <div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={config.dftEnableCredentials || false}
              onChange={(e) => onConfigChange('dftEnableCredentials', e.target.checked)}
              className="rounded"
            />
            <span className="text-slate-800">Enable credentials by default</span>
          </label>
          <p className="text-sm text-slate-500 mt-1">
            New rules will include credentials support by default
          </p>
        </div>

        {import.meta.env.DEV && (
          <div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.debugMode || false}
                onChange={(e) => onConfigChange('debugMode', e.target.checked)}
                className="rounded"
              />
              <span className="text-slate-800">Debug mode</span>
            </label>
            <p className="text-sm text-slate-500 mt-1">
              Enable detailed logging for troubleshooting
            </p>
          </div>
        )}

        <div>
          <label className="block text-slate-800 mb-1">
            Maximum rules limit
          </label>
          <input
            type="number"
            min="1"
            max="1000"
            value={config.maxRules || 100}
            onChange={(e) => onConfigChange('maxRules', parseInt(e.target.value) || 100)}
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
            value={config.autoCleanupDays || 30}
            onChange={(e) => onConfigChange('autoCleanupDays', parseInt(e.target.value) || 30)}
            className="w-24 px-2 py-1 border border-slate-300 rounded bg-white"
          />
          <p className="text-sm text-slate-500 mt-1">
            Auto-delete disabled rules after this many days (0 to disable)
          </p>
        </div>
      </div>
    </section>
  );
}
