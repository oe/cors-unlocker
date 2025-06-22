import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { useViewModel } from './view-model';
import { AuthHelp } from '@/common/shard';
import { SiteAuthSwitch, PowerSwitch } from './power-switch';
import { Settings, AlertCircle } from 'lucide-react';
import '@/common/tailwind.css';
import './style.scss';

function App() {
  const { 
    rule, 
    ruleEnabled, 
    toggleRule, 
    isSupported,
    error,
    errorType,
    gotoOptionsPage,
    clearError
  } = useViewModel();

  const containerExtraClass = (isSupported ? '' : 'blur-sm') + ' ' + ((!ruleEnabled) ? 'is-disabled' : '');

  return (
    <>
      {/* Error overlay for fatal errors only */}
      {error && errorType === 'fatal' && (
        <div className='fixed inset-0 bg-black/50 flex items-center justify-center text-center z-20'>
          <div className="bg-white dark:bg-slate-800 rounded-lg p-4 mx-4 max-w-sm">
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400 mb-2">
              <AlertCircle className="w-4 h-4" />
              <span className="font-medium">Error</span>
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-300">{error}</p>
          </div>
        </div>
      )}

      {/* Settings button */}
      <Settings 
        className='w-4 h-4 fixed top-2 right-2 cursor-pointer dark:text-slate-200 z-30 hover:text-blue-500 dark:hover:text-blue-400' 
        onClick={gotoOptionsPage} 
      />

      {/* Recoverable error banner - positioned to avoid settings button */}
      {error && errorType === 'recoverable' && (
        <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-400 mx-2 mt-2 mr-8 rounded-r-md p-3 text-sm text-red-700 dark:text-red-400">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="break-words">{error}</p>
            </div>
            <button 
              onClick={clearError}
              className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 flex-shrink-0 ml-1"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Unsupported protocol overlay */}
      {!isSupported && (
        <div className='fixed inset-0 flex items-center justify-center text-center text-slate-200 z-10'>
          <div className="flex flex-col items-center gap-2">
            <AlertCircle className="w-8 h-8 text-yellow-500" />
            <span>Only http/https websites are supported</span>
          </div>
        </div>
      )}

      <div className={'relative p-4 divide-slate-400 ' + containerExtraClass}>
        <div className='flex items-center justify-center py-2'>
          <PowerSwitch 
            value={ruleEnabled}
            onChange={(value) => toggleRule({ 
              disabled: !value 
            })}
            disabled={!isSupported}
          />
        </div>
        
        <div className='border-t border-slate-200 dark:border-slate-600 my-2'></div>
        
        <div className='flex items-center justify-center py-2 dark:text-white'>
          <SiteAuthSwitch 
            value={!!rule?.credentials}
            onChange={(value) => toggleRule({ 
              credentials: value 
            })}
            disabled={!isSupported || !ruleEnabled}
          />
        </div>
        <div className='dark:text-white'>
          <AuthHelp />
        </div>
      </div>
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
