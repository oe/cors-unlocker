import browser from 'webextension-polyfill';
import { getCurrentTabRule, removeCurrentTabRule } from '@/common/storage';

/**
 * listen message from web pages
 * * ping: reply pong
 */
export function onExternalMessage(
  message: any,
  sender: browser.Runtime.MessageSender
) {
  console.log('onExternalMessage', message, sender);
  if (message.type === 'ping') {
    return Promise.resolve('pong');
  }
  return Promise.reject(new Error('unknown message type'));
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
  if (message.type === 'getCurrentTabRule') {
    return getCurrentTabRule(message.windowId);
  }
}

/**
 * clear cached currentTabRule
 * @param windowId 
 */
export function onWindowClose(windowId: number) {
  removeCurrentTabRule(windowId);
}