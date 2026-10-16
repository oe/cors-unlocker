import type { IProxyRule } from './proxy-state';

/** Session-only state. Never written to the persistent rule store. */
export interface QuickControls {
  cors: boolean;
  credentials: boolean;
  delayMs: number;
  failure: boolean;
  disableCache: boolean;
}

export const EMPTY_QUICK_CONTROLS: QuickControls = {
  cors: false,
  credentials: false,
  delayMs: 0,
  failure: false,
  disableCache: false,
};

export const PINNED_RULES_KEY = 'popupPinnedRuleIds';

export function parseQuickControls(value: unknown): QuickControls {
  const input = value as Partial<QuickControls> | null;
  if (!input || typeof input.cors !== 'boolean' || typeof input.credentials !== 'boolean'
    || (input.disableCache !== undefined && typeof input.disableCache !== 'boolean')
    || typeof input.failure !== 'boolean' || ![0, 500, 1000, 3000].includes(input.delayMs as number)) {
    throw new Error('Invalid quick controls.');
  }
  return { cors: input.cors, credentials: input.credentials, delayMs: input.delayMs!, failure: input.failure, disableCache: input.disableCache === true };
}

export function quickControlRules(origin: string, controls: QuickControls): IProxyRule[] {
  const rule = (id: string, name: string, actions: IProxyRule['actions'], resourceTypes: string[]): IProxyRule => ({
    id: `session:${id}`, name, enabled: true, source: 'user',
    match: { initiatorOrigins: [origin], urlPattern: '*', resourceTypes },
    actions, createdAt: 0, updatedAt: 0,
  });
  return [
    ...(controls.cors ? [rule('cors', 'Session CORS', [{
      type: 'cors', allowCredentials: controls.credentials,
      allowOrigin: controls.credentials ? 'initiator' : '*',
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH', 'HEAD'], allowHeaders: [],
    }], ['Fetch', 'XHR', 'Preflight'])] : []),
    ...(controls.delayMs ? [rule('delay', 'Session delay', [{ type: 'delay', milliseconds: controls.delayMs }], ['Fetch', 'XHR'])] : []),
    ...(controls.failure ? [rule('failure', 'Session failure', [{ type: 'networkFailure', reason: 'Failed' }], ['Fetch', 'XHR'])] : []),
  ];
}

export function needsProxy(rule: Pick<IProxyRule, 'source' | 'actions'>): boolean {
  if (rule.source === 'legacy-cors') return false;
  return hasRedirectHeaders(rule) || rule.actions.some((action) => ['cors', 'delay', 'networkFailure', 'mockResponse'].includes(action.type));
}

/** DNR cannot preserve the original matcher across a redirect's header phases. */
export function hasRedirectHeaders(rule: Pick<IProxyRule, 'actions'>): boolean {
  return rule.actions.some((action) => action.type === 'redirect')
    && rule.actions.some((action) => action.type === 'setRequestHeaders' || action.type === 'setResponseHeaders');
}

/** Mixed rules can keep their browser actions active after the tab session stops. */
export function hasPersistentActions(rule: Pick<IProxyRule, 'source' | 'actions'>): boolean {
  if (hasRedirectHeaders(rule) && !rule.actions.some((action) => action.type === 'block')) return false;
  return rule.source === 'legacy-cors'
    || rule.actions.some((action) => ['setRequestHeaders', 'setResponseHeaders', 'redirect', 'block'].includes(action.type));
}

/** Credentials modify CORS; by themselves they do not require interception. */
export function hasActiveQuickControls(controls: QuickControls): boolean {
  return controls.cors || controls.disableCache || controls.delayMs > 0 || controls.failure;
}

/** Only effectively enabled saved rules may prepare an interception runtime. */
export function hasRuntimeRules(rules: readonly IProxyRule[], origin: string): boolean {
  return rules.some(rule => rule.enabled && needsProxy(rule)
    && rule.match.initiatorOrigins.some(value => value === '*' || value === origin));
}
