import { useState, useEffect, useCallback } from 'react';
import { Download, Upload, Trash2, CheckCircle, AlertCircle } from 'lucide-react';
import { dataStorage } from '@/common/storage';
import { logger } from '@/common/logger';

interface DataManagementState {
  rulesCount: number;
  isLoading: boolean;
  message: { type: 'success' | 'error'; text: string } | null;
}

export function DataManagement() {
  const [state, setState] = useState<DataManagementState>({
    rulesCount: 0,
    isLoading: true,
    message: null
  });

  useEffect(() => {
    loadRulesCount();
  }, []);

  const loadRulesCount = async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true }));
      const rules = await dataStorage.getRules();
      setState(prev => ({ ...prev, rulesCount: rules.length, isLoading: false }));
    } catch (error) {
      logger.error('Failed to load rules count:', error);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setState(prev => ({ ...prev, message: { type, text } }));
    setTimeout(() => {
      setState(prev => ({ ...prev, message: null }));
    }, 5000);
  };

  // Export rules to file
  const exportRules = useCallback(async () => {
    try {
      const exportData = await dataStorage.exportRules();
      const blob = new Blob([exportData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
      const filename = `cors-unlocker-rules-${timestamp}.json`;
      
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      showMessage('success', 'Rules exported successfully');
    } catch (error) {
      logger.error('Failed to export rules:', error);
      showMessage('error', 'Failed to export rules');
    }
  }, []);

  // Import rules from file
  const importRules = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const confirmed = confirm(
        'This will replace all existing rules. Are you sure you want to continue?\n\n' +
        'Click "Cancel" to merge with existing rules instead.'
      );
      
      const success = await dataStorage.importRules(text, !confirmed);
      
      if (success) {
        showMessage('success', confirmed ? 'Rules imported successfully!' : 'Rules merged successfully!');
        await loadRulesCount(); // Update rules count
      } else {
        throw new Error('Import failed');
      }
    } catch (error) {
      logger.error('Failed to import rules:', error);
      showMessage('error', `Failed to import rules: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      // Clear the input so the same file can be imported again
      event.target.value = '';
    }
  }, []);

  // Clear all rules
  const clearAllRules = useCallback(async () => {
    if (!confirm(`Are you sure you want to delete all ${state.rulesCount} rules? This action cannot be undone.`)) {
      return;
    }
    
    try {
      await dataStorage.saveRules([]);
      showMessage('success', 'All rules have been cleared');
      await loadRulesCount(); // Update rules count
    } catch (error) {
      logger.error('Failed to clear rules:', error);
      showMessage('error', 'Failed to clear rules');
    }
  }, [state.rulesCount]);

  if (state.isLoading) {
    return (
      <section className="bg-white rounded-lg p-4 border border-slate-200">
        <h2 className="text-lg font-semibold mb-4 text-slate-900">Data Management</h2>
        <div className="text-center py-4">
          <div className="text-slate-600">Loading...</div>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-white rounded-lg p-4 border border-slate-200">
      <h2 className="text-lg font-semibold mb-4 text-slate-900">Data Management</h2>
      
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
      
      <div className="space-y-4">
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div>
            <h3 className="font-medium text-slate-800">Rules Database</h3>
            <p className="text-sm text-slate-500">
              {state.rulesCount} rules configured
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={exportRules}
              disabled={state.rulesCount === 0}
              className={`flex items-center gap-2 px-3 py-1.5 rounded transition-colors text-sm ${
                state.rulesCount === 0
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-500 text-white hover:bg-blue-600'
              }`}
              title={state.rulesCount === 0 ? "No rules to export" : "Export all rules to a JSON file"}
            >
              <Download className="w-4 h-4" />
              Export
            </button>
            <label className="flex items-center gap-2 px-3 py-1.5 bg-green-500 text-white rounded hover:bg-green-600 transition-colors text-sm cursor-pointer"
                   title="Import rules from a JSON file">
              <Upload className="w-4 h-4" />
              Import
              <input
                type="file"
                accept=".json"
                onChange={importRules}
                className="hidden"
              />
            </label>
            {state.rulesCount > 0 && (
              <button
                onClick={clearAllRules}
                className="flex items-center gap-2 px-3 py-1.5 bg-red-500 text-white rounded hover:bg-red-600 transition-colors text-sm"
                title="Delete all rules"
              >
                <Trash2 className="w-4 h-4" />
                Clear All
              </button>
            )}
          </div>
        </div>
        
        <div className="text-sm text-slate-600 space-y-1">
          <p>• <strong>Export:</strong> Download all rules as a backup file</p>
          <p>• <strong>Import:</strong> Restore rules from a backup file (choose replace or merge)</p>
          <p>• <strong>Clear All:</strong> Remove all configured rules (cannot be undone)</p>
        </div>
      </div>
    </section>
  );
}
