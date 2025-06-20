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

// Allowed external origins for security
const ALLOWED_EXTERNAL_ORIGINS = [
  'https://cors.forth.ink',
  'https://www.forth.ink',
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
      case 'getCurrentTabRule':
        if (typeof message.windowId !== 'number') {
          logger.warn('Invalid windowId in getCurrentTabRule:', message.windowId);
          return null;
        }
        return getCurrentTabRule(message.windowId);
      
      case 'toggleRuleViaAction': {
        if (!message.payload || !message.payload.origin) {
          logger.warn('Invalid payload in toggleRuleViaAction:', message.payload);
          return { success: false };
        }
        const success = await toggleRuleViaOrigin(message.payload);
        return { success };
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

