import browser from 'webextension-polyfill';
import { isProxyRule, type IProxyAction, type IProxyRule } from '@/common/proxy-state';
import { logger } from '@/common/logger';
import { globToRegex, toDnrResourceTypes } from '@/common/request-match';
import { mergeHeaderMaps } from '@/common/validation';
import { mergeHeaders } from '@/common/rules';
import { quickControlRules, type QuickControls } from '@/common/quick-controls';
import { TEMPORARY_CORS_RULE_ID_BASE } from '@/common/session-dnr';

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

type ScopedTab = Pick<browser.Tabs.Tab, 'id' | 'url'>;

function createCondition(rule: IProxyRule, tabs: ScopedTab[]): chrome.declarativeNetRequest.RuleCondition | null {
  const global = rule.match.initiatorOrigins.includes('*');
  const tabIds = tabs.flatMap((tab) => {
    if (typeof tab.id !== 'number' || !tab.url) return [];
    try { return rule.match.initiatorOrigins.includes(new URL(tab.url).origin) ? [tab.id] : []; }
    catch { return []; }
  });
  if (!global && tabIds.length === 0) return null;
  return {
    ...(rule.match.urlPattern === '*' ? { urlFilter: '*' } : { regexFilter: globToRegex(rule.match.urlPattern) }),
    isUrlFilterCaseSensitive: false,
    ...(!global ? { tabIds } : {}),
    requestMethods: rule.match.methods?.length ? rule.match.methods.map((method) => method.toLowerCase()) as chrome.declarativeNetRequest.RequestMethod[] : undefined,
    resourceTypes: toDnrResourceTypes(rule.match.resourceTypes),
  };
}

function headerActions(actions: IProxyAction[], type: 'setRequestHeaders' | 'setResponseHeaders') {
  const maps = actions.flatMap((action) => action.type === type ? [action.headers] : []);
  return Object.entries(mergeHeaderMaps(...maps)).map(([header, value]) => ({
    header, operation: 'set' as chrome.declarativeNetRequest.HeaderOperation, value,
  }));
}

/** Session rules retain the complete top-level origin instead of broadening it to a hostname. */
export function compileProxyRules(rules: IProxyRule[], tabs: ScopedTab[] = []): browser.DeclarativeNetRequest.Rule[] {
  const usedIds = new Set<number>();
  const allocateId = (ruleId: string) => {
    let id = hashId(ruleId);
    while (usedIds.has(id)) id += 1;
    usedIds.add(id);
    return id;
  };
  return rules.flatMap((rule, index) => {
    if (!isProxyRule(rule) || !rule.enabled) return [];
    const condition = createCondition(rule, tabs);
    if (!condition || (rule.match.resourceTypes?.length && !condition.resourceTypes?.length)) return [];
    if (rule.source === 'legacy-cors') {
      const cors = rule.actions.find((action) => action.type === 'cors');
      const origin = rule.match.initiatorOrigins[0];
      if (!cors || origin === '*') return [];
      return [{ id: allocateId(`${rule.id}:cors`), priority: 1, condition,
        action: { type: 'modifyHeaders', responseHeaders: Object.entries({
          'Access-Control-Allow-Origin': cors.allowCredentials ? origin : '*',
          'Access-Control-Allow-Credentials': cors.allowCredentials ? 'true' : 'false',
          'Access-Control-Allow-Methods': cors.allowMethods.join(', '),
          'Access-Control-Allow-Headers': cors.allowCredentials ? mergeHeaders(cors.allowHeaders.join(',')).join(', ') : '*',
        }).map(([header, value]) => ({ header, operation: 'set', value })) },
      } as browser.DeclarativeNetRequest.Rule];
    }
    // Saved order is deterministic: earlier terminal rules win; later header actions win.
    const terminalPriority = rules.length - index + 10_000;
    if (rule.actions.some((action) => action.type === 'block')) return [{
      id: allocateId(`${rule.id}:block`), priority: terminalPriority + 10_000, condition, action: { type: 'block' },
    } as browser.DeclarativeNetRequest.Rule];
    const redirect = rule.actions.find((action) => action.type === 'redirect');
    if (redirect) return [{
      id: allocateId(`${rule.id}:redirect`), priority: terminalPriority, condition,
      action: { type: 'redirect', redirect: { url: redirect.url } },
    } as browser.DeclarativeNetRequest.Rule];
    const requestHeaders = headerActions(rule.actions, 'setRequestHeaders');
    const responseHeaders = headerActions(rule.actions, 'setResponseHeaders');
    if (!requestHeaders.length && !responseHeaders.length) return [];
    return [{ id: allocateId(`${rule.id}:headers`), priority: index + 10, condition,
      action: { type: 'modifyHeaders', ...(requestHeaders.length ? { requestHeaders } : {}),
        ...(responseHeaders.length ? { responseHeaders } : {}) },
    } as browser.DeclarativeNetRequest.Rule];
  });
}

interface FirefoxCorsSession { origin: string; quickControls: QuickControls }
const firefoxCorsSessions = new Map<number, FirefoxCorsSession>();
let installedPersistentRules: IProxyRule[] = [];

/** Firefox MV3 forbids CORS changes in WebRequest; use DNR for connected tabs only. */
export function compileFirefoxSessionCors(rules: IProxyRule[], tabs: ScopedTab[], sessions = firefoxCorsSessions): browser.DeclarativeNetRequest.Rule[] {
  const result: browser.DeclarativeNetRequest.Rule[] = [];
  for (const [tabId, session] of sessions) {
    const tab = tabs.find((item) => item.id === tabId);
    if (!tab?.url) continue;
    try { if (new URL(tab.url).origin !== session.origin) continue; } catch { continue; }
    const candidates = [...quickControlRules(session.origin, session.quickControls), ...rules];
    for (const rule of candidates) {
      if (!rule.enabled || rule.source === 'legacy-cors' || !rule.match.initiatorOrigins.some((origin) => origin === '*' || origin === session.origin)) continue;
      const cors = rule.actions.find((action) => action.type === 'cors');
      if (!cors) continue;
      const condition = createCondition(rule, [tab]);
      if (!condition || (rule.match.resourceTypes?.length && !condition.resourceTypes?.length)) continue;
      result.push({
        id: TEMPORARY_CORS_RULE_ID_BASE + result.length,
        priority: 100_000 - result.length,
        condition: { ...condition, tabIds: [tabId] },
        action: { type: 'modifyHeaders', responseHeaders: Object.entries({
          'Access-Control-Allow-Origin': cors.allowCredentials || cors.allowOrigin === 'initiator' ? session.origin : '*',
          'Access-Control-Allow-Credentials': cors.allowCredentials ? 'true' : 'false',
          'Access-Control-Allow-Methods': cors.allowMethods.join(', '),
          'Access-Control-Allow-Headers': cors.allowCredentials ? mergeHeaders(cors.allowHeaders.join(',')).join(', ') : '*, Authorization',
        }).map(([header, value]) => ({ header, operation: 'set', value })) },
      } as browser.DeclarativeNetRequest.Rule);
    }
  }
  return result;
}

export async function setFirefoxCorsSession(tabId: number, session?: FirefoxCorsSession): Promise<void> {
  const previous = firefoxCorsSessions.get(tabId);
  if (session) firefoxCorsSessions.set(tabId, session); else firefoxCorsSessions.delete(tabId);
  try { await reconcileProxyDnrRules(); }
  catch (error) {
    if (firefoxCorsSessions.get(tabId) === session) {
      if (previous) firefoxCorsSessions.set(tabId, previous); else firefoxCorsSessions.delete(tabId);
    }
    throw error;
  }
}

let reconcileQueue: Promise<unknown> = Promise.resolve();
export function reconcileProxyDnrRules(rules?: IProxyRule[]): Promise<void> {
  const run = reconcileQueue.then(async () => {
    const [dynamic, session, tabs] = await Promise.all([
      browser.declarativeNetRequest.getDynamicRules(), browser.declarativeNetRequest.getSessionRules(), browser.tabs.query({}),
    ]);
    const persistent = rules ?? installedPersistentRules;
    const addRules = [...compileProxyRules(persistent, tabs), ...compileFirefoxSessionCors(persistent, tabs)];
    // Clear persisted v1/v2 dynamic rules as well, including a previously deleted last CORS rule.
    await browser.declarativeNetRequest.updateDynamicRules({ removeRuleIds: dynamic.map((rule) => rule.id) });
    await browser.declarativeNetRequest.updateSessionRules({ removeRuleIds: session.map((rule) => rule.id), addRules });
    installedPersistentRules = persistent;
    logger.info(`Reconciled ${addRules.length} tab-scoped browser rules.`);
  });
  reconcileQueue = run.catch(() => undefined);
  return run;
}
