import { RotateCcw } from 'lucide-react';

interface SettingsActionsProps {
  onReset: () => void;
}

export function SettingsActions({ onReset }: SettingsActionsProps) {
  return (
    <section className="bg-white rounded-lg p-6 border border-slate-200 shadow-sm">
      <h2 className="text-lg font-semibold mb-4 text-slate-900">Actions</h2>
      
      <div className="flex flex-wrap gap-3">
        <button
          onClick={onReset}
          className="flex items-center gap-2 px-6 py-3 bg-slate-500 text-white rounded-lg hover:bg-slate-600 transition-all duration-200 font-medium hover:shadow-md active:scale-95"
        >
          <RotateCcw className="w-4 h-4" />
          Reset to Defaults
        </button>
      </div>
      
      <div className="mt-4 text-sm text-slate-500">
        <p>Settings are automatically saved when changed. Use &ldquo;Reset to Defaults&rdquo; to restore original settings.</p>
      </div>
    </section>
  );
}
