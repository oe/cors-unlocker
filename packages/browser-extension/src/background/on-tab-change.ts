import browser from 'webextension-polyfill';
import { toggleRule } from './declarative-rules';
import { dataStorage } from '@/common/storage';

export async function onTabActiveChange(tab: browser.Tabs.Tab) {
  if (!tab.url) {
    toggleIconStatus(false);
    return;
  }
  const url = new URL(tab.url);
  const rules = await dataStorage.getRules()
  if (!rules || !rules.length) {
    toggleIconStatus(false);
    return;
  }
  const origin = url.origin;
  const rule = rules.find((rule) => rule.origin === origin);
  if (!rule || rule.disabled) {
    toggleIconStatus(false);
    return;
  }
  const domain = url.hostname;
  const rulesForDomain = rules.filter((rule) => rule.domain === domain);
  // more than one rule with the same domain(different protocols, ports, etc)
  //  disable other rules except current one
  if (rulesForDomain.length > 1) {
    toggleRule(rule, rulesForDomain);
  }
  toggleIconStatus(true);
}

let lastActiveStatus = false;

function toggleIconStatus(active: boolean) {
  console.log('toggleIconStatus', active);
  if (lastActiveStatus === active) return;
  lastActiveStatus = active;
  browser.action.setBadgeText({
    text: active ? 'ON' : 'OFF',
  });
}