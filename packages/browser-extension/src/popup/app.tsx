import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { useViewModel } from './view-model';
import { SiteAuthInput } from '@/common/shard';
import { PowerSwitch } from './power-switch';
import "./style.scss";

function App() {
  const { rule, toggleRule, isSupported } = useViewModel();
  return (
    <>
    { !isSupported && (
      <div className='fixed inset-0 flex items-center justify-center text-center text-slate-200 z-10'>
        Only http/https website are supported
      </div>) }
    <div className={'relative p-2 ' + (!isSupported ? 'blur-sm' : '')}>
      <div className='relative w-full py-4 flex justify-center'>
        <PowerSwitch value={!rule ? false : !rule?.disabled} onChange={(enabled) => {
          toggleRule({ disabled: !enabled })
        }} />
      </div>
      <div className='text-slate-300 break-all'>
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
