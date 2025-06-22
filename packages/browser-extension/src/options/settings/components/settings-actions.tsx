import { RotateCcw, Save } from 'lucide-react';

interface SettingsActionsProps {
  isSaving: boolean;
  onSave: () => void;
  onReset: () => void;
}

export function SettingsActions({ isSaving, onSave, onReset }: SettingsActionsProps) {
  return (
    <section className="bg-white rounded-lg p-4 border border-slate-200">
      <h2 className="text-lg font-semibold mb-4 text-slate-900">Actions</h2>
      
      <div className="flex gap-2">
        <button
          onClick={onSave}
          disabled={isSaving}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 transition-colors"
        >
          <Save className="w-4 h-4" />
          {isSaving ? 'Saving...' : 'Save Settings'}
        </button>
        
        <button
          onClick={onReset}
          className="flex items-center gap-2 px-4 py-2 bg-slate-500 text-white rounded hover:bg-slate-600 transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          Reset to Defaults
        </button>
      </div>
    </section>
  );
}
