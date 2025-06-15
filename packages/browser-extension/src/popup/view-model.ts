import browser from 'webextension-polyfill';
import { useEffect, useState, useCallback, useRef } from 'react';
import { isSupportedProtocol } from '@/common/utils';
import { logger } from '@/common/logger';
import { extConfig } from '@/common/ext-config';
import type { IRuleItem } from '@/types';

interface ViewModelState {
  rule: IRuleItem | null;
  isSupported: boolean;
  error: string | null;
  errorType: 'recoverable' | 'fatal' | null;
}

export function useViewModel() {
  const [state, setState] = useState<ViewModelState>({
    rule: null,
    isSupported: false,
    error: null,
    errorType: null
  });
  
  const tabOrigin = useRef('');
  const mounted = useRef(true);

  const syncRule = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, error: null, errorType: null }));
      
      const win = await browser.windows.getCurrent();
      const result = await browser.runtime.sendMessage({
        type: 'getCurrentTabRule',
        windowId: win.id
      });
      
      if (mounted.current) {
        setState(prev => ({ 
          ...prev, 
          rule: result
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
      if (!message || message.type !== 'activeTabRuleChange') return;
      logger.debug('Active tab rule changed, syncing...');
      syncRule();
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
            error: 'No active tab found',
            errorType: 'fatal'
          }));
          return;
        }

        const url = tabs[0].url;
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
            error: 'This protocol is not supported',
            errorType: 'fatal'
          }));
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
          throw new Error('Failed to toggle rule');
        }
        
        logger.debug('Rule toggled successfully');
      } catch (error) {
        logger.error('Failed to toggle rule:', error);
        setState(prev => ({ 
          ...prev, 
          error: 'Failed to update rule' 
        }));
      }
    },
    []
  );

  const gotoOptionsPage = useCallback(async () => {
    try {
      await browser.runtime.openOptionsPage();
    } catch (error) {
      logger.error('Failed to open options page:', error);
      setState(prev => ({ 
        ...prev, 
        error: 'Failed to open options page' 
      }));
    }
  }, []);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  // rule is enabled when it's not disabled and has an id
  const ruleEnabled = !!state.rule && !state.rule.disabled && !!state.rule.id;

  return {
    ...state,
    ruleEnabled,
    toggleRule,
    gotoOptionsPage,
    clearError,
    retry: syncRule,
  };
}
