import browser from 'webextension-polyfill';
import { useEffect, useState, useCallback, useRef } from 'react';
import { isSupportedProtocol } from '@/common/utils';
import { logger } from '@/common/logger';
import { extConfig } from '@/common/ext-config';
import { inspectorPathForTab } from '@/common/inspector-target';
import type { IRuleItem } from '@/types';
import type { IAdvancedProxyStatus } from '@/background/advanced-proxy';

interface ViewModelState {
  rule: IRuleItem | null;
  isSupported: boolean;
  error: string | null;
  errorType: 'recoverable' | 'fatal' | null;
  advancedProxy: IAdvancedProxyStatus | null;
  advancedProxyPending: boolean;
}

export function useViewModel() {
  const [state, setState] = useState<ViewModelState>({
    rule: null,
    isSupported: false,
    error: null,
    errorType: null,
    advancedProxy: null,
    advancedProxyPending: false,
  });
  
  const tabOrigin = useRef('');
  const tabId = useRef<number | null>(null);
  const mounted = useRef(true);

  const syncRule = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, error: null, errorType: null }));
      
      const win = await browser.windows.getCurrent();
      const [result, advancedProxy] = await Promise.all([
        browser.runtime.sendMessage({
          type: 'getCurrentTabRule',
          windowId: win.id
        }),
        typeof tabId.current === 'number'
          ? browser.runtime.sendMessage({
            type: 'getAdvancedProxyStatus',
            payload: { tabId: tabId.current },
          })
          : Promise.resolve(null),
      ]);
      
      if (mounted.current) {
        setState(prev => ({ 
          ...prev, 
          rule: result,
          advancedProxy,
        }));
      }
    } catch (error) {
      logger.error('Failed to sync rule:', error);
      if (mounted.current) {
        setState(prev => ({ 
          ...prev,
          error: 'Failed to load rule data',
          errorType: 'recoverable'
        }));
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    
    const onRuntimeMessage = (
      message: any,
      _: browser.Runtime.MessageSender
    ) => {
      if (!message) return;
      if (message.type === 'activeTabRuleChange') {
        logger.debug('Active tab rule changed, syncing...');
        void syncRule();
      }
      if (
        message.type === 'advancedProxyStatusChange'
        && message.payload?.tabId === tabId.current
      ) {
        setState((previous) => ({
          ...previous,
          advancedProxy: message.payload,
          advancedProxyPending: false,
        }));
      }
    };

    // Initialize
    const initialize = async () => {
      try {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        
        if (!mounted.current) return;
        
        if (!tabs.length || !tabs[0].url) {
          setState(prev => ({ 
            ...prev, 
            isSupported: false,
            error: 'No active tab found or tab URL is unavailable',
            errorType: 'fatal'
          }));
          return;
        }

        const url = tabs[0].url;
        tabId.current = tabs[0].id ?? null;
        
        // Better URL validation and error handling
        try {
          const uu = new URL(url);
          tabOrigin.current = uu.origin;
          const isOriginSupported = isSupportedProtocol(uu.protocol);
          
          setState(prev => ({ 
            ...prev, 
            isSupported: isOriginSupported 
          }));

          if (isOriginSupported) {
            browser.runtime.onMessage.addListener(onRuntimeMessage);
            await syncRule();
          } else {
            setState(prev => ({ 
              ...prev,
              error: `${uu.protocol} protocol is not supported. Only http:// and https:// are supported.`,
              errorType: 'fatal'
            }));
          }
        } catch (urlError) {
          logger.error('Failed to parse tab URL:', urlError);
          setState(prev => ({ 
            ...prev,
            isSupported: false,
            error: 'Invalid or malformed URL in active tab',
            errorType: 'fatal'
          }));
          return;
        }
      } catch (error) {
        logger.error('Failed to initialize popup:', error);
        if (mounted.current) {
          setState(prev => ({ 
            ...prev,
            error: 'Failed to initialize',
            errorType: 'fatal'
          }));
        }
      }
    };

    initialize();

    return () => {
      mounted.current = false;
      browser.runtime.onMessage.removeListener(onRuntimeMessage);
    };
  }, [syncRule]);

  const toggleRule = useCallback(
    async (payload: { disabled?: boolean; credentials?: boolean }) => {
      if (!tabOrigin.current) {
        logger.warn('No tab origin available for toggle');
        return;
      }

      try {
        setState(prev => ({ ...prev, error: null }));
        
        // If enabling CORS (disabled: false) and no explicit credentials setting,
        // apply default credentials configuration
        const finalPayload = { ...payload };
        if (payload.disabled === false && typeof payload.credentials === 'undefined') {
          const config = extConfig.get();
          finalPayload.credentials = config.dftEnableCredentials;
        }
        
        const result = await browser.runtime.sendMessage({
          type: 'toggleRuleViaAction',
          payload: {
            origin: tabOrigin.current,
            ...finalPayload,
          }
        });

        if (!result?.success) {
          throw new Error(result?.error || 'Failed to toggle rule');
        }
        
        logger.debug('Rule toggled successfully');
      } catch (error) {
        logger.error('Failed to toggle rule:', error);
        setState(prev => ({ 
          ...prev, 
          error: error instanceof Error ? error.message : 'Failed to update rule',
          errorType: 'recoverable'
        }));
      }
    },
    []
  );

  const gotoOptionsPage = useCallback(async () => {
    try {
      await browser.runtime.openOptionsPage();
      
      // In Firefox, popup doesn't close automatically when opening options page
      // We need to close it manually
      if (__TARGET__ === 'firefox') {
        window.close();
      }
    } catch (error) {
      logger.error('Failed to open options page:', error);
      setState(prev => ({ 
        ...prev, 
        error: 'Failed to open options page' 
      }));
    }
  }, []);

  const openInspector = useCallback(async () => {
    if (typeof tabId.current !== 'number') return;
    try {
      if (__TARGET__ === 'chrome') {
        await chrome.sidePanel.setOptions({
          tabId: tabId.current,
          path: inspectorPathForTab(tabId.current),
          enabled: true,
        });
        // Keep sidePanel.open in the popup click handler so Chrome retains the
        // user gesture required to reveal the panel.
        await chrome.sidePanel.open({ tabId: tabId.current });
      } else {
        await browser.runtime.sendMessage({
          type: 'openSidePanel',
          payload: { tabId: tabId.current },
        });
      }
      window.close();
    } catch (error) {
      logger.error('Failed to open traffic inspector:', error);
      setState((previous) => ({
        ...previous,
        error: error instanceof Error ? error.message : 'Unable to open traffic inspector',
        errorType: 'recoverable',
      }));
    }
  }, []);

  /**
   * Navigate to options page and open edit dialog for specific rule
   */
  const gotoEditRule = useCallback(async (ruleId: number) => {
    try {
      // Create URL with hash for rule editing
      const optionsUrl = browser.runtime.getURL('src/options/index.html') + `#rules?edit=${ruleId}`;
      
      // Open in new tab for better user experience
      await browser.tabs.create({ url: optionsUrl });
      
      // Close popup
      window.close();
    } catch (error) {
      logger.error('Failed to open rule edit page:', error);
      setState(prev => ({ 
        ...prev, 
        error: 'Failed to open rule edit page'
      }));
    }
  }, []);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  const toggleAdvancedProxy = useCallback(async (enabled: boolean) => {
    if (typeof tabId.current !== 'number') return;
    setState((previous) => ({ ...previous, advancedProxyPending: true, error: null }));
    try {
      const advancedProxy = await browser.runtime.sendMessage({
        type: enabled ? 'enableAdvancedProxy' : 'disableAdvancedProxy',
        payload: {
          tabId: tabId.current,
          credentials: !!state.rule?.credentials,
          extraHeaders: state.rule?.extraHeaders,
        },
      }) as IAdvancedProxyStatus;
      setState((previous) => ({
        ...previous,
        advancedProxy,
        advancedProxyPending: false,
        error: advancedProxy.phase === 'error'
          ? advancedProxy.error || 'Unable to start advanced proxy'
          : null,
        errorType: advancedProxy.phase === 'error' ? 'recoverable' : null,
      }));
    } catch (error) {
      setState((previous) => ({
        ...previous,
        advancedProxyPending: false,
        error: error instanceof Error ? error.message : 'Unable to update advanced proxy',
        errorType: 'recoverable',
      }));
    }
  }, [state.rule?.credentials, state.rule?.extraHeaders]);

  // rule is enabled when it's not disabled and has an id
  const ruleEnabled = !!state.rule && !state.rule.disabled && !!state.rule.id;

  return {
    ...state,
    ruleEnabled,
    toggleRule,
    gotoOptionsPage,
    openInspector,
    gotoEditRule,
    clearError,
    toggleAdvancedProxy,
    retry: syncRule,
  };
}
