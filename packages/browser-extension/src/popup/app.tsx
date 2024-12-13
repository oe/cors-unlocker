import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { useViewModel } from './view-model';
import { SiteAuthInput } from '@/common/shard';
import { PowerSwitch } from './power-switch';
import { Settings } from 'lucide-react';
import "./style.scss";

function App() {
  const { rule, toggleRule, isSupported, gotoOptionsPage } = useViewModel();
  return (
    <>
    { !isSupported && (
      <div className='fixed inset-0 flex items-center justify-center text-center text-slate-200 z-20'>
        Only http/https website are supported
      </div>) }
    <Settings className='w-4 h-4 fixed top-2 right-2 cursor-pointer text-slate-200 z-10' onClick={gotoOptionsPage} />
    <div className={'relative p-4 ' + (!isSupported ? 'blur-sm' : '')}>
      <div className='relative w-full py-4 flex justify-center'>
        <PowerSwitch value={!rule ? false : !rule?.disabled} onChange={(enabled) => {
          toggleRule({ disabled: !enabled })
        }} />
      </div>
      <div className='text-slate-300 mt-2'>
        <SiteAuthInput
          compact
          value={!!rule?.credentials}
          onChange={(v) => toggleRule({credentials: v})}
        />
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
