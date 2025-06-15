import browser from 'webextension-polyfill';
import type { IRuleItem } from '@/types';
import {
  getCurrentTabRule,
  removeCurrentTabRule,
  toggleRuleViaOrigin,
  dataStorage,
} from '@/common/storage';
import { diffRules } from './user-rule';
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

async function handleGetRule(origin: string): Promise<IRuleItem | null> {
  const rules = await dataStorage.getRules();
  const rule = rules.find((rule) => rule.origin === origin);
  return rule || null;
}

async function handleToggleRule(
  origin: string, 
  method: 'enable' | 'disable', 
  payload: any
): Promise<void> {
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
    if (!sender.tab && !sender.url?.startsWith('chrome-extension://')) {
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

/**
 * port map to origin
 */
const portMap = new Map<browser.Runtime.Port, string>();

/**
 * on external connect from web pages
 */
export function onExternalConnect(port: browser.Runtime.Port) {
  try {
    logger.debug('External port connected:', port.name, port.sender?.url);
    
    const url = port.sender?.url;
    if (!url) {
      logger.warn('Port connection without URL');
      port.disconnect();
      return;
    }
    
    const origin = new URL(url).origin;
    
    // Validate external origin
    if (!validateExternalOrigin(origin)) {
      logger.warn('Port connection from unauthorized origin:', origin);
      port.disconnect();
      return;
    }
    
    portMap.set(port, origin);
    
    port.onDisconnect.addListener(() => {
      logger.debug('External port disconnected:', origin);
      portMap.delete(port);
    });
    
  } catch (error) {
    logger.error('Error handling external connection:', error);
    port.disconnect();
  }
}

/**
 * notify pages when rules changed via ports
 */
dataStorage.onRulesChange((newRules, oldRules) => {
  try {
    if (!portMap.size) return;
    
    const updatedRules = diffRules(newRules, oldRules);
    if (!updatedRules.length) return;
    
    logger.debug('Notifying connected ports about rule changes:', updatedRules.length);
    
    portMap.forEach((origin, port) => {
      try {
        const rule = updatedRules.find((rule) => rule.origin === origin);
        if (!rule) return;
        
        port.postMessage({
          enabled: !rule.disabled,
          credentials: !!rule.credentials,
        });
      } catch (error) {
        logger.error('Error sending message to port:', error);
        // Remove broken port
        portMap.delete(port);
      }
    });
  } catch (error) {
    logger.error('Error notifying ports about rule changes:', error);
  }
});
