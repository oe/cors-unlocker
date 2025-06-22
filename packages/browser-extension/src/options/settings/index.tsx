import { useSettings } from './hooks/use-settings';
import { GeneralSettings } from './components/general-settings';
import { DataManagement } from './components/data-management';
import { SettingsActions } from './components/settings-actions';
import { Message } from './components/message';

export function Settings() {
  const { 
    config, 
    isLoading, 
    message, 
    resetConfig, 
    updateConfig 
  } = useSettings();

  if (isLoading) {
    return (
      <div className="p-4 flex items-center justify-center min-h-[400px]">
        <div className="text-slate-600">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <div className="mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Settings</h1>
          <p className="text-slate-600">Configure your CORS Unlocker preferences</p>
        </div>
      </div>
      
      <Message message={message} />

      <div className="space-y-6">
        <GeneralSettings 
          config={config} 
          onConfigChange={updateConfig} 
        />
        
        <DataManagement />
        
        <SettingsActions 
          onReset={resetConfig}
        />
      </div>
    </div>
  );
}