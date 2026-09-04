import browser from 'webextension-polyfill';
import type { IRuleItem } from '@/types';
import {
  getCurrentTabRule,
  removeCurrentTabRule,
  toggleRuleViaOrigin,
  dataStorage,
} from '@/common/storage';
import { extConfig } from '@/common/ext-config';
import { isSupportedProtocol } from '@/common/utils';
import { logger } from '@/common/logger';
import {
  clearRequestLog,
  disableAdvancedProxy,
  enableAdvancedProxy,
  getAdvancedProxyStatus,
  getRequestLog,
} from '@/background/advanced-proxy';
import { PRODUCT_CAPABILITIES } from '@/common/capabilities';
import {
  addProxyRule,
  ensureProxyAppState,
  removeProxyRule,
  updateProxyRule,
} from '@/common/proxy-state';

// Allowed external origins for security
const ALLOWED_EXTERNAL_ORIGINS = [
  'https://cors.forth.ink',
  'https://intercept.forth.ink',
];

// Rate limiting for external messages
const messageRateLimit = new Map<string, { count: number; lastReset: number }>();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 100; // max requests per window

function checkRateLimit(origin: string): boolean {
  const now = Date.now();
  const limitData = messageRateLimit.get(origin);
  
  if (!limitData || now - limitData.lastReset > RATE_LIMIT_WINDOW) {
    messageRateLimit.set(origin, { count: 1, lastReset: now });
    return true;
  }
  
  if (limitData.count >= RATE_LIMIT_MAX) {
    logger.warn('Rate limit exceeded for origin:', origin);
    return false;
  }
  
  limitData.count++;
  return true;
}

function validateExternalOrigin(origin: string): boolean {
  // Check if origin is in allowed list
  if (ALLOWED_EXTERNAL_ORIGINS.includes(origin)) {
    return true;
  }
  
  // In development environment, allow localhost
  if (import.meta.env.MODE === 'development') {
    return (
      origin.startsWith('http://localhost:') ||
      origin.startsWith('http://127.0.0.1:')
    );
  }
  
  return false;
}

/**
 * Check if sender is a valid extension context (popup, options, etc.)
 */
function isValidExtensionSender(sender: browser.Runtime.MessageSender): boolean {
  if (!sender.url) return false;
  
  // Chrome extension URLs
  if (sender.url.startsWith('chrome-extension://')) {
    return true;
  }
  
  // Firefox extension URLs (moz-extension://)
  if (sender.url.startsWith('moz-extension://')) {
    return true;
  }
  
  // Safari extension URLs (safari-web-extension://)
  if (sender.url.startsWith('safari-web-extension://')) {
    return true;
  }
  
  // Edge extension URLs (ms-browser-extension://)
  if (sender.url.startsWith('ms-browser-extension://')) {
    return true;
  }
  
  return false;
}

/**
 * listen message from web pages
 */
export async function onExternalMessage(
  message: any,
  sender: browser.Runtime.MessageSender
): Promise<any> {
  try {
    logger.debug('External message received:', message, sender);
    
    // Validate sender
    if (!sender.url) {
      throw new Error(JSON.stringify({
        message: 'Invalid sender - missing URL',
        type: 'invalid-sender',
      }));
    }

    const senderOrigin = new URL(sender.url).origin;

    // Check if external origin is allowed
    if (!validateExternalOrigin(senderOrigin)) {
      throw new Error(JSON.stringify({
        message: `External origin not allowed: ${senderOrigin}`,
        type: 'forbidden-origin',
      }));
    }

    // Rate limiting
    if (!checkRateLimit(senderOrigin)) {
      throw new Error(JSON.stringify({
        message: 'Rate limit exceeded',
        type: 'rate-limit',
      }));
    }

    const { method, payload } = message;
    
    if (!method) {
      throw new Error(JSON.stringify({
        message: 'Missing method in message',
        type: 'missing-method',
      }));
    }

    if (method === 'openOptions') {
      await browser.runtime.openOptionsPage();
      return;
    }

    if (!payload?.origin) {
      logger.debug('Missing origin in payload:', method, payload,sender.url);
      throw new Error(JSON.stringify({
        message: 'Missing origin in payload',
        type: 'missing-origin',
      }));
    }

    const url = new URL(payload.origin);
    if (!isSupportedProtocol(url.protocol)) {
      throw new Error(JSON.stringify({
        message: `Unsupported protocol "${url.protocol}"`,
        type: 'unsupported-origin',
      }));
    }

    const origin = url.origin;

    switch (method) {
      case 'ping':
        // Simple ping response to detect if extension is installed and available
        return { success: true, timestamp: Date.now() };
      
      case 'getRule':
        return await handleGetRule(origin);
      
      case 'isEnabled':
        return await isOriginEnabled(origin);
      
      case 'getExtConfig':
        return await handleGetExtConfig();
      
      case 'enable':
      case 'disable':
        return await handleToggleRule(origin, method, payload);
      
      default:
        throw new Error(JSON.stringify({
          message: `Unknown method: ${method}`,
          type: 'unsupported-method'
        }));
    }
  } catch (error) {
    logger.error('Error handling external message:', error);
    throw error;
  }
}

async function handleGetExtConfig() {
  const config = extConfig.get();
  return config;
}

async function handleGetRule(origin: string): Promise<IRuleItem | null> {
  const rules = await dataStorage.getRules();
  const rule = rules.find((rule) => rule.origin === origin);
  return rule || null;
}

async function handleToggleRule(
  origin: string, 
  method: 'enable' | 'disable', 
  payload: any
): Promise<{ enabled: boolean; credentials: boolean }> {
  const params: Partial<IRuleItem> = { 
    origin, 
    disabled: method === 'disable' 
  };
  
  if (payload && typeof payload.credentials === 'boolean') {
    params.credentials = payload.credentials;
  }
  
  const success = await toggleRuleViaOrigin(params);
  if (!success) {
    throw new Error(JSON.stringify({
      message: `Failed to ${method} CORS for origin: ${origin}`,
      type: 'inner-error',
    }));
  }
  
  // Return current status after the operation
  return await isOriginEnabled(origin);
}

async function isOriginEnabled(origin: string) {
  const rules = await dataStorage.getRules();
  const rule = rules.find((rule) => rule.origin === origin);
  
  if (!rule || rule.disabled) {
    return { enabled: false, credentials: false };
  }
  
  return {
    enabled: true,
    credentials: !!rule.credentials,
  };
}

async function handleSdkRequest(
  message: any,
  sender: browser.Runtime.MessageSender,
): Promise<any> {
  if (typeof sender.tab?.id !== 'number' || !sender.url || sender.frameId !== 0) {
    throw new Error('The SDK is only available from a top-level browser tab.');
  }
  const pageUrl = new URL(sender.url);
  if (!isSupportedProtocol(pageUrl.protocol)) {
    throw new Error('The SDK only supports HTTP and HTTPS pages.');
  }
  const origin = pageUrl.origin;
  if (!checkRateLimit(`sdk:${sender.tab.id}:${origin}`)) {
    throw new Error('SDK rate limit exceeded.');
  }
  const method = message.payload?.method;
  const data = message.payload?.data;

  switch (method) {
    case 'connect':
      return {
        origin,
        capabilities: PRODUCT_CAPABILITIES,
      };
    case 'getStatus':
      return {
        origin,
        cors: await isOriginEnabled(origin),
        advancedMode: getAdvancedProxyStatus(sender.tab.id).phase,
      };
    case 'requestCors': {
      await toggleRuleViaOrigin({
        origin,
        disabled: false,
        credentials: data?.credentials === true,
      });
      return {
        origin,
        cors: await isOriginEnabled(origin),
        advancedMode: getAdvancedProxyStatus(sender.tab.id).phase,
      };
    }
    case 'disableCors':
      await toggleRuleViaOrigin({ origin, disabled: true });
      return {
        origin,
        cors: await isOriginEnabled(origin),
        advancedMode: getAdvancedProxyStatus(sender.tab.id).phase,
      };
    case 'createRuleDraft': {
      const draft = data?.rule;
      if (!draft || typeof draft !== 'object') throw new Error('Missing rule draft.');
      const serialized = JSON.stringify(draft);
      if (serialized.length > 65_536) throw new Error('Rule draft exceeds the 64 KB limit.');
      const rule = await addProxyRule({
        name: typeof draft.name === 'string' ? draft.name.trim().slice(0, 120) : '',
        enabled: false,
        source: 'user',
        match: {
          initiatorOrigins: [origin],
          urlPattern: typeof draft.urlPattern === 'string'
            ? draft.urlPattern.trim().slice(0, 2_048)
            : '',
          methods: Array.isArray(draft.methods)
            ? draft.methods.slice(0, 16).map((value: unknown) => String(value).toUpperCase())
            : undefined,
          resourceTypes: Array.isArray(draft.resourceTypes)
            ? draft.resourceTypes.slice(0, 16).map(String)
            : undefined,
        },
        actions: Array.isArray(draft.actions) ? draft.actions : [],
      });
      const workspaceOpened = data?.openWorkspace !== false;
      if (workspaceOpened) await browser.runtime.openOptionsPage();
      return { id: rule.id, enabled: false, workspaceOpened };
    }
    case 'openWorkspace':
      await browser.runtime.openOptionsPage();
      return undefined;
    default:
      throw new Error(`Unsupported SDK method: ${String(method)}`);
  }
}

/**
 * listen message from options and popup
 */
export async function onRuntimeMessage(
  message: any,
  sender: browser.Runtime.MessageSender
): Promise<any> {
  try {
    if (!message) return;
    
    logger.debug('Runtime message received:', message, sender);

    // Validate internal message sender
    if (!sender.tab && !isValidExtensionSender(sender)) {
      logger.warn('Unauthorized internal message sender:', sender);
      return;
    }

    switch (message.type) {
      case 'sdkRequest':
        return handleSdkRequest(message, sender);

      case 'getAdvancedProxyStatus': {
        const tabId = message.payload?.tabId;
        return typeof tabId === 'number'
          ? getAdvancedProxyStatus(tabId)
          : { phase: 'error', error: 'Invalid request: missing tab ID' };
      }

      case 'enableAdvancedProxy': {
        const tabId = message.payload?.tabId;
        return typeof tabId === 'number'
          ? enableAdvancedProxy(tabId, message.payload)
          : { phase: 'error', error: 'Invalid request: missing tab ID' };
      }

      case 'disableAdvancedProxy': {
        const tabId = message.payload?.tabId;
        return typeof tabId === 'number'
          ? disableAdvancedProxy(tabId)
          : { phase: 'error', error: 'Invalid request: missing tab ID' };
      }

      case 'getAdvancedProxyLog': {
        const tabId = message.payload?.tabId;
        return typeof tabId === 'number' ? getRequestLog(tabId) : [];
      }

      case 'clearAdvancedProxyLog': {
        const tabId = message.payload?.tabId;
        if (typeof tabId === 'number') clearRequestLog(tabId);
        return { success: typeof tabId === 'number' };
      }

      case 'getProxyState':
        return ensureProxyAppState();

      case 'saveProxyRule': {
        const rule = message.payload?.rule;
        if (!rule) return { success: false, error: 'Missing proxy rule.' };
        const saved = rule.id
          ? await updateProxyRule(rule.id, rule)
          : await addProxyRule({ ...rule, source: 'user' });
        return { success: true, rule: saved };
      }

      case 'deleteProxyRule': {
        const id = message.payload?.id;
        if (typeof id !== 'string') return { success: false, error: 'Missing proxy rule ID.' };
        await removeProxyRule(id);
        return { success: true };
      }

      case 'createRuleFromRequest': {
        const request = message.payload?.request;
        const initiatorOrigin = message.payload?.initiatorOrigin;
        if (!request?.url || !request?.method || !initiatorOrigin) {
          return { success: false, error: 'Request details are incomplete.' };
        }
        const saved = await addProxyRule({
          name: `${request.method} ${new URL(request.url).hostname}`,
          enabled: false,
          source: 'user',
          match: {
            initiatorOrigins: [initiatorOrigin],
            urlPattern: request.url,
            methods: [request.method.toUpperCase()],
            resourceTypes: request.resourceType ? [request.resourceType] : undefined,
          },
          actions: [{ type: 'setResponseHeaders', headers: {} }],
        });
        return { success: true, rule: saved };
      }

      case 'openSidePanel': {
        const tabId = message.payload?.tabId;
        if (typeof tabId !== 'number') return { success: false, error: 'Missing tab ID.' };
        if (__TARGET__ === 'firefox') {
          try {
            await browser.sidebarAction.open();
          } catch {
            await browser.tabs.create({
              url: browser.runtime.getURL(`src/sidepanel/index.html?tabId=${tabId}`),
            });
          }
          return { success: true };
        }
        await chrome.sidePanel.open({ tabId });
        return { success: true };
      }

      case 'getCurrentTabRule':
        if (typeof message.windowId !== 'number') {
          logger.warn('Invalid windowId in getCurrentTabRule:', message.windowId);
          return null;
        }
        return getCurrentTabRule(message.windowId);
      
      case 'toggleRuleViaAction': {
        if (!message.payload || !message.payload.origin) {
          logger.warn('Invalid payload in toggleRuleViaAction:', message.payload);
          return { success: false, error: 'Invalid request: missing origin' };
        }
        try {
          await toggleRuleViaOrigin(message.payload);
          return { success: true };
        } catch (error) {
          logger.error('Error in toggleRuleViaAction:', error);
          return { 
            success: false, 
            error: error instanceof Error ? error.message : 'Unknown error occurred' 
          };
        }
      }
      
      default:
        logger.warn('Unknown runtime message type:', message.type);
        return;
    }
  } catch (error) {
    logger.error('Error handling runtime message:', error);
    return { error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * clear cached currentTabRule
 */
export function onWindowClose(windowId: number) {
  try {
    removeCurrentTabRule(windowId);
    logger.debug('Cleared cached rule for window:', windowId);
  } catch (error) {
    logger.error('Error clearing cached rule:', error);
  }
}
