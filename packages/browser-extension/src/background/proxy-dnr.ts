import browser from 'webextension-polyfill';
import type { IProxyAction, IProxyRule } from '@/common/proxy-state';
import { logger } from '@/common/logger';

const RULE_ID_BASE = 1_000_000;
const RULE_ID_RANGE = 1_000_000_000;

function hashId(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return RULE_ID_BASE + (hash >>> 0) % RULE_ID_RANGE;
}

function asDomains(origins: string[]): string[] | undefined {
  const domains = origins.flatMap((origin) => {
    if (origin === '*') return [];
    try { return [new URL(origin).hostname]; } catch { return []; }
  });
  return domains.length > 0 ? [...new Set(domains)] : undefined;
}

function asResourceTypes(types?: string[]): chrome.declarativeNetRequest.ResourceType[] | undefined {
  if (!types?.length) return undefined;
  const known = new Set([
    'main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font', 'object',
    'xmlhttprequest', 'ping', 'csp_report', 'media', 'websocket', 'other',
  ]);
  const normalized = types.map((type) => {
    const lower = type.toLowerCase();
    if (lower === 'xhr' || lower === 'fetch') return 'xmlhttprequest';
    return lower;
  }).filter((type) => known.has(type));
  return normalized.length > 0
    ? [...new Set(normalized)] as chrome.declarativeNetRequest.ResourceType[]
    : undefined;
}

function createCondition(rule: IProxyRule): chrome.declarativeNetRequest.RuleCondition {
  return {
    urlFilter: rule.match.urlPattern || '*',
    initiatorDomains: asDomains(rule.match.initiatorOrigins),
    requestMethods: rule.match.methods?.map((method) => method.toLowerCase()) as chrome.declarativeNetRequest.RequestMethod[] | undefined,
    resourceTypes: asResourceTypes(rule.match.resourceTypes),
  };
}

function headerActions(
  actions: IProxyAction[],
  type: 'setRequestHeaders' | 'setResponseHeaders',
): chrome.declarativeNetRequest.ModifyHeaderInfo[] {
  return actions
    .filter((action): action is Extract<IProxyAction, { type: typeof type }> => action.type === type)
    .flatMap((action) => Object.entries(action.headers).map(([header, value]) => ({
      header,
      operation: 'set' as chrome.declarativeNetRequest.HeaderOperation,
      value,
    })));
}

export function compileProxyRules(rules: IProxyRule[]): browser.DeclarativeNetRequest.Rule[] {
  const usedIds = new Set<number>();
  const allocateId = (ruleId: string) => {
    let id = hashId(ruleId);
    while (usedIds.has(id)) id += 1;
    usedIds.add(id);
    return id;
  };

  return rules.flatMap((rule) => {
    if (!rule.enabled || rule.source === 'legacy-cors') return [];
    const condition = createCondition(rule);
    const block = rule.actions.find((action) => action.type === 'block');
    if (block) return [{
      id: allocateId(`${rule.id}:block`),
      priority: 100,
      condition,
      action: { type: 'block' },
    } as browser.DeclarativeNetRequest.Rule];

    const redirect = rule.actions.find(
      (action): action is Extract<IProxyAction, { type: 'redirect' }> => action.type === 'redirect',
    );
    if (redirect) return [{
      id: allocateId(`${rule.id}:redirect`),
      priority: 100,
      condition,
      action: { type: 'redirect', redirect: { url: redirect.url } },
    } as browser.DeclarativeNetRequest.Rule];

    const requestHeaders = headerActions(rule.actions, 'setRequestHeaders');
    const responseHeaders = headerActions(rule.actions, 'setResponseHeaders');
    if (requestHeaders.length === 0 && responseHeaders.length === 0) return [];
    return [{
      id: allocateId(`${rule.id}:headers`),
      priority: 10,
      condition,
      action: {
        type: 'modifyHeaders',
        ...(requestHeaders.length > 0 ? { requestHeaders } : {}),
        ...(responseHeaders.length > 0 ? { responseHeaders } : {}),
      },
    } as browser.DeclarativeNetRequest.Rule];
  });
}

export async function reconcileProxyDnrRules(rules: IProxyRule[]): Promise<void> {
  if (__TARGET__ !== 'chrome') return;
  const existing = await browser.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing
    .filter((rule) => rule.id >= RULE_ID_BASE)
    .map((rule) => rule.id);
  const addRules = compileProxyRules(rules);
  await browser.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
  logger.info(`Reconciled ${addRules.length} proxy DNR rules.`);
}
