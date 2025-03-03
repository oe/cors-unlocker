import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { useViewModel } from './view-model';
import { AuthHelp } from '@/common/shard';
import { SiteAuthSwitch, PowerSwitch } from './power-switch';
import { Settings } from 'lucide-react';
import "./style.scss";

function App() {
  const { rule, ruleEnabled, toggleRule, isSupported, gotoOptionsPage } = useViewModel();
  const containerExtraClass = (isSupported ? '' : 'blur-sm') + ' ' + ((!ruleEnabled) ? 'is-disabled' : '');
  return (
    <>
    { !isSupported && (
      <div className='fixed inset-0 flex items-center justify-center text-center text-slate-200 z-10'>
        Only http/https websites are supported
      </div>) }
    <Settings className='w-4 h-4 fixed top-2 right-2 cursor-pointer dark:text-slate-200 z-10' onClick={gotoOptionsPage} />
    <div className={'relative p-4 divide-slate-400 ' + containerExtraClass}>
      <div className='text-center text-slate-900 dark:text-slate-50 text-sm font-medium'>
        CORS Unlocker
      </div>
      <div className='divide-y'>
        <div className='relative w-full py-4 flex justify-center'>
          <PowerSwitch value={ruleEnabled} onChange={(enabled) => {
            toggleRule({ disabled: !enabled })
          }} />
        </div>
        <div className='text-slate-800 dark:text-slate-300 mt-2 flex flex-col items-center gap-2 pt-4'>
          <div>
            <AuthHelp />
          </div>
          <SiteAuthSwitch
            value={!!rule?.credentials}
            onChange={(v) => toggleRule({credentials: v})}
          />
        </div>
      </div>
    </div>
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
