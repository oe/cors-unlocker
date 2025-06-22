import { useSettings } from './hooks/use-settings';
import { GeneralSettings } from './components/general-settings';
import { DataManagement } from './components/data-management';
import { SettingsActions } from './components/settings-actions';
import { Message } from './components/message';

export function Settings() {
  const { 
    config, 
    isLoading, 
    isSaving, 
    message, 
    saveConfig, 
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
      <h1 className="text-2xl font-bold mb-6 text-slate-900">Settings</h1>
      
      <Message message={message} />

      <div className="space-y-6">
        <GeneralSettings 
          config={config} 
          onConfigChange={updateConfig} 
        />
        
        <DataManagement />
        
        <SettingsActions 
          isSaving={isSaving}
          onSave={saveConfig}
          onReset={resetConfig}
        />
      </div>
    </div>
  );
}