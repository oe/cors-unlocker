import browser from 'webextension-polyfill';
import { useEffect, useState, useCallback, useRef } from 'react';
import { isSupportedProtocol } from '@/common/utils';
import type { IRuleItem } from '@/types';

export function useViewModel() {
  const [rule, setRule] = useState<IRuleItem | null>(null);
  const [isSupported, setIsSupported] = useState(false);
  const tabOrigin = useRef('')
  const syncRule = useCallback(() => {
    browser.windows.getCurrent().then((win) => {
      browser.runtime
        .sendMessage({
          type: 'getCurrentTabRule',
          windowId: win.id
        })
        .then(setRule);
    });
  }, []);
  useEffect(() => {
    // listen to rule change and get the latest rule
    const onRuntimeMessage = (
      message: any,
      sender: browser.Runtime.MessageSender
    ) => {
      if (!message || message.type !== 'activeTabRuleChange') return;
      syncRule();
    };

    browser.runtime.onMessage.addListener(onRuntimeMessage);

    browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      if (!tabs.length) return
      const url = tabs[0].url || '';
      if (!url) return
      const uu = new URL(url);
      tabOrigin.current = uu.origin;
      const isOriginSupported = isSupportedProtocol(uu.protocol);
      setIsSupported(isOriginSupported);
      if (isOriginSupported) {
        syncRule();
      }
    });

    return () => {
      browser.runtime.onMessage.removeListener(onRuntimeMessage);
    };
  }, []);

  const toggleRule = useCallback(
    (payload: { disabled?: boolean; credentials?: boolean }) => {
      if (!tabOrigin.current) return;
      console.log('toggleRule', payload, tabOrigin)
      browser.runtime.sendMessage({
        type: 'toggleRuleViaAction',
        payload: {
          origin: tabOrigin.current,
          ...payload,
        }
      });
    },
    []
  );

  return {
    rule,
    isSupported,
    toggleRule,
  };
}
