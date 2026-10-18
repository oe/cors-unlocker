import { reconcileSavedRuleRuntime, retrySavedRuleTab } from './saved-rule-runtime';
import { needsProxy } from '@/common/quick-controls';
import { normalizeSdkRule, ownedSdkRule, applySdkRule, sdkRuleResult } from './rule-approval';
import { approveSdkOperation, sdkApprovalInfo, resolveSdkApproval, type SdkApprovalInfo } from './sdk-approval';
import { getSiteAccess, updateSiteAccess, ownsSdkRule } from '@/common/sdk-access';
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
  updateQuickControls,
} from '@/background/advanced-proxy';
import { PRODUCT_CAPABILITIES } from '@/common/capabilities';
import { inspectorPathForTab } from '@/common/inspector-target';
import {
  addProxyRule,
  ensureProxyAppState,
  removeProxyRule,
  updateProxyRule,
  performProxyStateOperation,
  isRuleEnabled,
} from '@/common/proxy-state';

// Allowed external origins for security
const ALLOWED_EXTERNAL_ORIGINS = [
  'https://cors.forth.ink',
  'https://wireflip.forth.ink',
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
  return sender.url.startsWith(browser.runtime.getURL(''));
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
        return { success: true, timestamp: Date.now(), capabilities: PRODUCT_CAPABILITIES };
      
      case 'getRule':
        return await handleGetRule(origin);
      
      case 'isEnabled':
        return await isOriginEnabled(origin);
      
      case 'getExtConfig':
        return await handleGetExtConfig();
      
      case 'enable':
      case 'disable': {
        if (typeof sender.tab?.id !== 'number') throw new Error('Missing requesting tab.');
        // The retained hosted bridge never inherits a target site's trusted status.
        const requestingTab = await browser.tabs.get(sender.tab.id);
        if (!requestingTab.url) throw new Error('Missing requesting page.');
        if (new URL(requestingTab.url).origin !== origin) throw new Error('Legacy website requests can only change their own top-level origin.');
        const result = await approveSdkOperation({ tabId: sender.tab.id, requesterOrigin: new URL(requestingTab.url).origin,
          userActivated: true, forceConfirmation: true,
          info: { origin, title: method === 'enable' ? 'Enable CORS?' : 'Disable CORS?', button: 'Allow change',
            name: `Legacy website request via ${senderOrigin}`, actions: [], reason: 'This changes the saved CORS setting for the target site.' } },
          () => handleToggleRule(origin, method, payload));
        if (result && typeof result === 'object' && 'error' in result) throw new Error(JSON.stringify(result.error));
        return result;
      }
      
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
  if (JSON.stringify(data ?? null).length > 65_536) throw new Error('SDK request exceeds the 64 KB limit.');
  const authorize = (info: Omit<SdkApprovalInfo, 'origin'>, execute: () => Promise<unknown>, sensitive = false) =>
    approveSdkOperation({ tabId: sender.tab!.id!, requesterOrigin: origin,
      userActivated: message.payload?.userActivated === true, info: { ...info, origin }, sensitive }, execute);
  const corsRule = async () => {
    const rule = (await ensureProxyAppState()).rules.find(rule => rule.source === 'legacy-cors' && rule.match.initiatorOrigins[0] === origin);
    if (rule && !ownsSdkRule(rule, origin)) throw new Error('This CORS rule is managed in Wireflip. Change it in the extension.');
    return rule;
  };
  const corsStatus = async () => ({ origin, cors: await isOriginEnabled(origin), advancedMode: getAdvancedProxyStatus(sender.tab!.id!).phase });
  const sensitiveRule = (actions: ReturnType<typeof normalizeSdkRule>['actions']) => actions.some(action =>
    action.type === 'cors' && action.allowCredentials || action.type === 'setRequestHeaders'
      && Object.keys(action.headers).some(name => /^(authorization|cookie)$/i.test(name))
      || action.type === 'setResponseHeaders' && Object.entries(action.headers).some(([name, value]) => /^access-control-allow-credentials$/i.test(name) && value.trim().toLowerCase() === 'true'));

  switch (method) {
    case 'connect':
      return {
        origin,
        capabilities: PRODUCT_CAPABILITIES,
      };
    case 'getStatus': {
      const execution = getAdvancedProxyStatus(sender.tab.id);
      const state = data?.ruleId ? await ensureProxyAppState() : undefined;
      const rule = state?.rules.find(rule => rule.id === data.ruleId && ownsSdkRule(rule, origin));
      const enabled = rule && state ? isRuleEnabled(rule, state.profiles) : false;
      return {
        origin,
        cors: await isOriginEnabled(origin),
        advancedMode: execution.phase,
        ...(data?.ruleId ? { rule: rule ? { id: rule.id, enabled, ready: enabled && (!needsProxy(rule) || execution.phase === 'connected' && execution.origin === origin && execution.captureEnabled !== false), error: execution.error } : null } : {}),
      };
    }
    case 'requestCors': {
      await corsRule();
      const credentials = data?.credentials === true;
      return authorize({ title: 'Enable CORS?', button: 'Allow change', name: 'CORS repair', actions: [],
        reason: (credentials ? 'Credentialed requests will be allowed. ' : 'Credentials will not be enabled. ')
          + (typeof data?.reason === 'string' ? data.reason.trim().slice(0, 160) : '') }, async () => {
        await corsRule();
        const state = await performProxyStateOperation({ kind: 'legacyPatch', intent: 'upsert', sdkOrigin: origin,
          rule: { origin, disabled: false, credentials } });
        await reconcileSavedRuleRuntime(state);
        return corsStatus();
      }, credentials);
    }
    case 'disableCors': {
      await corsRule();
      return authorize({ title: 'Disable CORS?', button: 'Allow change', name: 'CORS repair', actions: [] }, async () => {
        await corsRule();
        const state = await performProxyStateOperation({ kind: 'legacyPatch', intent: 'upsert', sdkOrigin: origin,
          rule: { origin, disabled: true } });
        await reconcileSavedRuleRuntime(state);
        return corsStatus();
      });
    }
    case 'requestRule':
    case 'createRuleDraft': {
      const rule = normalizeSdkRule(data, origin);
      if (data?.id !== undefined) await ownedSdkRule(data.id, origin);
      const draft = method === 'createRuleDraft';
      if (draft && data?.id !== undefined) throw new Error('A rule draft cannot update an existing rule.');
      return authorize({ title: draft ? 'Create this rule draft?' : 'Enable this rule?',
        button: draft ? 'Create draft' : 'Enable rule', name: rule.name, pattern: rule.match.urlPattern, actions: rule.actions }, async () => {
        const result = await applySdkRule(data, sender.tab!.id!, origin, !draft);
        if (!draft) return result;
        const workspaceOpened = data?.openWorkspace !== false;
        if (workspaceOpened) await browser.runtime.openOptionsPage();
        return { ...result, enabled: false, workspaceOpened };
      }, !draft && sensitiveRule(rule.actions));
    }
    case 'enableRule':
    case 'disableRule':
    case 'deleteRule': {
      const rule = await ownedSdkRule(data?.id, origin);
      const enabled = method === 'enableRule';
      return authorize({ title: enabled ? 'Enable this rule?' : method === 'deleteRule' ? 'Delete this rule?' : 'Disable this rule?',
        button: 'Allow change', name: rule.name, pattern: rule.match.urlPattern, actions: rule.actions }, async () => {
        const current = await ownedSdkRule(data?.id, origin);
        // Do not apply an approval to a rule that changed while its details were displayed.
        if (JSON.stringify(current) !== JSON.stringify(rule)) throw new Error('The rule changed. Request approval again.');
        if (method === 'deleteRule') {
          await performProxyStateOperation({ kind: 'remove', id: current.id, sdkOrigin: origin, expectedRule: rule });
          await reconcileSavedRuleRuntime(await ensureProxyAppState());
          return { id: current.id, deleted: true };
        }
        const state = await performProxyStateOperation({ kind: 'update', id: current.id, update: { enabled }, sdkOrigin: origin, expectedRule: rule });
        const saved = state.rules.find(rule => rule.id === current.id)!;
        return sdkRuleResult(saved, sender.tab!.id!, origin);
      }, enabled && sensitiveRule(rule.actions));
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
    if (message.type !== 'sdkRequest' && !isValidExtensionSender(sender)) {
      logger.warn('Unauthorized internal message sender:', sender);
      return;
    }

    switch (message.type) {
      case 'sdkRequest':
        return await handleSdkRequest(message, sender);

      case 'setSdkSiteTrust': {
        if (sender.url?.split('?')[0] !== browser.runtime.getURL('src/popup/index.html')) throw new Error('Site trust can only be changed in the Wireflip popup.');
        const { tabId, origin, trusted } = message.payload || {};
        if (!Number.isInteger(tabId) || typeof trusted !== 'boolean') throw new Error('Invalid trust request.');
        const tab = await browser.tabs.get(tabId);
        if (!tab.url || new URL(tab.url).origin !== origin) throw new Error('The active site changed. Reopen the popup.');
        await updateSiteAccess(origin, { trusted });
        return getSiteAccess(origin);
      }
      case 'getRuleApproval':
        return sdkApprovalInfo(message.payload?.id);
      case 'resolveRuleApproval':
        await resolveSdkApproval(message.payload?.id, message.payload?.accepted === true);
        return { success: true };

      case 'proxyStateOperation':
        if (!isValidExtensionSender(sender)) throw new Error('State changes require an extension page.');
        { const state = await performProxyStateOperation(message.payload); await reconcileSavedRuleRuntime(state); return { state }; }

      case 'updateQuickControls': {
        if (!isValidExtensionSender(sender)) throw new Error('Quick controls require an extension page.');
        const tabId = message.payload?.tabId;
        if (!Number.isInteger(tabId) || tabId < 0) throw new Error('Missing tab ID.');
        return updateQuickControls(tabId, message.payload?.quickControls);
      }

      case 'retryRuleExecution': {
        const tabId = message.payload?.tabId;
        if (!Number.isInteger(tabId) || tabId < 0) throw new Error('Missing tab ID.');
        await retrySavedRuleTab(tabId);
        return getAdvancedProxyStatus(tabId);
      }

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
          ? await updateProxyRule(rule.id, rule, message.payload?.groupId)
          : await addProxyRule({ ...rule, source: 'user' }, message.payload?.groupId);
        await reconcileSavedRuleRuntime(await ensureProxyAppState());
        return { success: true, rule: saved };
      }

      case 'deleteProxyRule': {
        const id = message.payload?.id;
        if (typeof id !== 'string') return { success: false, error: 'Missing proxy rule ID.' };
        await removeProxyRule(id);
        await reconcileSavedRuleRuntime(await ensureProxyAppState());
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
        const inspectorPath = inspectorPathForTab(tabId);
        if (__TARGET__ === 'firefox') {
          try {
            await browser.sidebarAction.open();
          } catch {
            await browser.tabs.create({
              url: browser.runtime.getURL(inspectorPath),
            });
          }
          return { success: true };
        }
        await chrome.sidePanel.setOptions({
          tabId,
          path: inspectorPath,
          enabled: true,
        });
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
    const messageText = error instanceof Error ? error.message : 'Unknown error';
    return message?.type === 'sdkRequest' ? { error: { type: 'invalid-request', message: messageText } } : { error: messageText };
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
