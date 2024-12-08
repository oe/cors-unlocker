import browser from 'webextension-polyfill';
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { useEffect, useState, useCallback } from 'react';
import type { IRuleItem } from '@/types';
import "./style.scss";

function App() {
  const [rule, setRule] = useState<IRuleItem | null>(null)
  const updateRule = useCallback(() => {
    browser.windows.getCurrent().then((win) => {
      browser.runtime.sendMessage({
        type: 'getCurrentTabRule',
        windowId: win.id,
      }).then(setRule)
    })
  }, []);
  useEffect(() => {
    updateRule();
    // listen to rule change and get the latest rule
    const onRuntimeMessage = (message: any, sender: browser.Runtime.MessageSender) => {
      if (!message || message.type !== 'activeTabRuleChange') return
      updateRule();
    }
    browser.runtime.onMessage.addListener(onRuntimeMessage);

    return () => {
      browser.runtime.onMessage.removeListener(onRuntimeMessage);
    }
  }, []);

  return (
    <div>
      <img src="/icon-with-shadow.svg" />
      <h1>vite-plugin-web-extension</h1>
      <div className='text-slate-300 break-all'>{JSON.stringify(rule)}</div>
      <p>
        Template: <code>react-ts</code>
      </p>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
