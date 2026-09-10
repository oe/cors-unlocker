import browser from 'webextension-polyfill';
import { toggleRule } from './declarative-rules';
import { isSupportedProtocol } from '@/common/utils';
import { dataStorage, setCurrentTabRule } from '@/common/storage';

export async function onTabActiveChange(tab: browser.Tabs.Tab) {
  if (!tab.url) {
    setCurrentTabRule(tab.windowId, null);
    return;
  }
  const url = new URL(tab.url);
  const rules = isSupportedProtocol(url.protocol) && await dataStorage.getRules()
  if (!rules || !rules.length) {
    setCurrentTabRule(tab.windowId, null);
    return;
  }
  const origin = url.origin;
  const rule = rules.find((rule) => rule.origin === origin);
  if (!rule || rule.disabled) {
    setCurrentTabRule(tab.windowId, rule);
    return;
  }
  const domain = url.hostname;
  const rulesForDomain = rules.filter((rule) => rule.domain === domain);
  // more than one rule with the same domain(different protocols, ports, etc)
  //  disable other rules except current one
  if (rulesForDomain.length > 1) {
    toggleRule(rule, rulesForDomain);
  }
  setCurrentTabRule(tab.windowId, rule);
}
