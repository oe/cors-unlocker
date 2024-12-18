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

/**
 * listen message from web pages
 * * ping: reply pong
 */
export async function onExternalMessage(
  message: any,
  sender: browser.Runtime.MessageSender
) {
  console.log('onExternalMessage', message, sender);
  const { method, payload } = message;
  if (method === 'openOptions') {
    browser.runtime.openOptionsPage();
    return true
  }
  if (!sender.url) {
    throw new Error('unknown sender');
  }
  const url = new URL(sender.url);
  if (!isSupportedProtocol(url.protocol)) {
    throw new Error(`unsupported protocol ${url.protocol}`);
  }
  const origin = url.origin;
  if (method === 'getRule') {
    const rules = await dataStorage.getRules();
    if (!rules) return {
      origin,
    }
    const rule = rules.find((rule) => rule.origin === origin);
    return rule || { origin };
  }
  if (method === 'isEnabled') {
    return isOriginEnabled(origin);
  }
  if (method === 'enable' || method === 'disable') {
    const params: Partial<IRuleItem> = { origin, disabled: method === 'disable' };
    if (payload && typeof payload.credentials === 'boolean') {
      params.credentials = payload.credentials;
    }
    await toggleRuleViaOrigin(params);
    return true;
  }

  throw new Error(`unknown message method ${method}`);
}

async function isOriginEnabled(origin: string) {
  const rules = await dataStorage.getRules();
  if (!rules) return false;
  const rule = rules.find((rule) => rule.origin === origin);
  if (!rule || rule.disabled) return false;
  return {
    enabled: !rule.disabled,
    credentials: !!rule.credentials,
  }
}

/**
 * listen message from options and popup
 * * getCurrentTabRule: get current tab using rule by its windowId
 */
export async function onRuntimeMessage(
  message: any,
  sender: browser.Runtime.MessageSender
) {
  if (!message) return
  console.log('onRuntimeMessage', message)
  if (message.type === 'getCurrentTabRule') {
    return getCurrentTabRule(message.windowId);
  }
  if (message.type === 'toggleRuleViaAction') {
    toggleRuleViaOrigin(message.payload)
  }
}

/**
 * clear cached currentTabRule
 * @param windowId 
 */
export function onWindowClose(windowId: number) {
  removeCurrentTabRule(windowId);
}

/**
 * port map to origin
 */
const portMap = new Map<browser.Runtime.Port, string>();
/**
 * on external connect from web pages
 */
export function onExternalConnect(port: browser.Runtime.Port) {
  console.log('port connected', port);
  const url = port.sender?.url;
  if (!url) return;
  const origin = new URL(url).origin;
  portMap.set(port, origin);
  port.onDisconnect.addListener(() => {
    console.log('port disconnected', origin);
    portMap.delete(port);
  });
}

/**
 * notify pages when rules changed via ports
 */
dataStorage.onRulesChange((newRules, oldRules) => {
  if (!portMap.size) return;
  const updatedRules = diffRules(newRules, oldRules);
  if (!updatedRules.length) return;
  portMap.forEach((origin, port) => {
    const rule = updatedRules.find((rule) => rule.origin === origin);
    if (!rule) return;
    port.postMessage({
      credentials: rule.credentials,
      enabled: !rule.disabled,
    });
  });
});
