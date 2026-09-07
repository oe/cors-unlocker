import { batchTabNotifications, waitForDelay } from './session-work';
import browser from 'webextension-polyfill';
import { logger } from '@/common/logger';
import { mergeHeaders } from '@/common/rules';
import {
  APP_STATE_KEY,
  ensureProxyAppState,
  isProxyAppState,
  type IProxyAction,
  type IProxyRule,
  type ProxyHeaderMap,
} from '@/common/proxy-state';
import { normalizeResourceType } from '@/common/request-match';
import { EMPTY_QUICK_CONTROLS, hasActiveQuickControls, parseQuickControls, quickControlRules, type QuickControls } from '@/common/quick-controls';

const PROTOCOL_VERSION = '1.3';

export type AdvancedProxyPhase = 'disabled' | 'connecting' | 'connected' | 'error';

export interface IAdvancedProxyStatus {
  tabId: number;
  phase: AdvancedProxyPhase;
  origin?: string;
  error?: string;
  quickControls?: QuickControls;
  captureEnabled?: boolean;
}

export interface IRequestLogEntry {
  id: string;
  tabId: number;
  url: string;
  method: string;
  resourceType: string;
  status?: number;
  startedAt: number;
  duration?: number;
  requestHeaders: ProxyHeaderMap;
  responseHeaders?: ProxyHeaderMap;
  matchedRuleIds: string[];
  matchedRules?: Array<{ id: string; name: string }>;
  changes?: Array<{ label: string; before?: string; after: string }>;
  diagnostics: string[];
  outcome: 'pending' | 'continued' | 'mocked' | 'blocked' | 'failed';
}

interface IAdvancedProxySession {
  abort: AbortController;
  origin: string;
  startedByQuickControls: boolean;
  captureEnabled: boolean;
  captureStarting?: Promise<void>;
  quickControls: QuickControls;
}

interface IHeaderEntry {
  name: string;
  value: string;
}

interface IRequestPausedParams {
  requestId: string;
  request: {
    url: string;
    method: string;
    headers: Record<string, string>;
    postData?: string;
  };
  resourceType?: string;
  responseStatusCode?: number;
  responseStatusText?: string;
  responseHeaders?: IHeaderEntry[];
}

const sessions = new Map<number, IAdvancedProxySession>();
const statuses = new Map<number, IAdvancedProxyStatus>();
const requestLogs = new Map<number, IRequestLogEntry[]>();
const requestIndexes = new Map<string, IRequestLogEntry>();
let cachedRules: IProxyRule[] = [];
let requestLogLimit = 500;

const SENSITIVE_HEADERS = new Set(['authorization', 'cookie', 'proxy-authorization', 'set-cookie']);

function headersToMap(headers: IHeaderEntry[]): ProxyHeaderMap {
  return Object.fromEntries(headers.map((header) => [header.name, header.value]));
}

function redactHeaders(headers: ProxyHeaderMap): ProxyHeaderMap {
  return Object.fromEntries(Object.entries(headers).map(([name, value]) => [
    name,
    SENSITIVE_HEADERS.has(name.toLowerCase()) ? '••••••••' : value,
  ]));
}

function globMatches(pattern: string, value: string): boolean {
  if (!pattern || pattern === '*') return true;
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i').test(value);
}

function matchingRules(session: IAdvancedProxySession, params: IRequestPausedParams): IProxyRule[] {
  const method = params.request.method.toUpperCase();
  const resourceType = normalizeResourceType(params.resourceType);
  return [...quickControlRules(session.origin, session.quickControls), ...cachedRules].filter((rule) => rule.enabled
    && rule.match.initiatorOrigins.some((origin) => origin === '*' || origin === session.origin)
    && globMatches(rule.match.urlPattern, params.request.url)
    && (!rule.match.methods?.length || rule.match.methods.includes(method))
    && (!rule.match.resourceTypes?.length || rule.match.resourceTypes.some(
      (expected) => normalizeResourceType(expected) === resourceType,
    )));
}

function recordRequest(tabId: number, params: IRequestPausedParams, rules: IProxyRule[]): IRequestLogEntry {
  const entry: IRequestLogEntry = {
    id: params.requestId,
    tabId,
    url: params.request.url,
    method: params.request.method,
    resourceType: normalizeResourceType(params.resourceType),
    startedAt: Date.now(),
    requestHeaders: redactHeaders(params.request.headers),
    matchedRuleIds: rules.map((rule) => rule.id),
    matchedRules: rules.map(({ id, name }) => ({ id, name })),
    changes: [],
    diagnostics: [],
    outcome: 'pending',
  };
  const entries = requestLogs.get(tabId) || [];
  entries.unshift(entry);
  for (const evicted of entries.splice(requestLogLimit)) {
    const key = `${tabId}:${evicted.id}`;
    if (requestIndexes.get(key) === evicted) requestIndexes.delete(key);
  }
  requestLogs.set(tabId, entries);
  requestIndexes.set(`${tabId}:${params.requestId}`, entry);
  return entry;
}

function updateRequestLog(tabId: number, params: IRequestPausedParams, outcome?: IRequestLogEntry['outcome']) {
  const entry = requestIndexes.get(`${tabId}:${params.requestId}`);
  if (!entry) return;
  if (typeof params.responseStatusCode === 'number') entry.status = params.responseStatusCode;
  if (params.responseHeaders) entry.responseHeaders = redactHeaders(headersToMap(params.responseHeaders));
  if (outcome) entry.outcome = outcome;
  entry.duration = Date.now() - entry.startedAt;
}

function allActions(rules: IProxyRule[]): IProxyAction[] {
  return rules.flatMap((rule) => rule.actions);
}

function actionOfType<T extends IProxyAction['type']>(
  actions: IProxyAction[],
  type: T,
): Extract<IProxyAction, { type: T }> | undefined {
  return actions.find((action): action is Extract<IProxyAction, { type: T }> => action.type === type);
}

function toHeaderEntries(headers: ProxyHeaderMap): IHeaderEntry[] {
  return Object.entries(headers).map(([name, value]) => ({ name, value }));
}

function getHeader(headers: Record<string, string>, name: string): string | undefined {
  const target = name.toLowerCase();
  return Object.entries(headers).find(([header]) => header.toLowerCase() === target)?.[1];
}

function upsertHeader(
  headers: IHeaderEntry[],
  name: string,
  value: string,
): IHeaderEntry[] {
  return [
    ...headers.filter((header) => header.name.toLowerCase() !== name.toLowerCase()),
    { name, value },
  ];
}

function createCorsHeaders(
  session: IAdvancedProxySession,
  requestHeaders: Record<string, string>,
  cors: Extract<IProxyAction, { type: 'cors' }>,
): IHeaderEntry[] {
  const requestOrigin = getHeader(requestHeaders, 'origin') || session.origin;
  const requestedMethod = getHeader(requestHeaders, 'access-control-request-method');
  const requestedHeaders = getHeader(requestHeaders, 'access-control-request-headers');
  const headers: IHeaderEntry[] = [
    { name: 'Access-Control-Allow-Origin', value: (cors.allowCredentials || cors.allowOrigin === 'initiator') ? requestOrigin : '*' },
    { name: 'Access-Control-Allow-Methods', value: requestedMethod || cors.allowMethods.join(', ') },
    { name: 'Access-Control-Allow-Headers', value: requestedHeaders || mergeHeaders(cors.allowHeaders.join(',')).join(', ') },
    { name: 'Access-Control-Max-Age', value: '600' },
  ];
  if (cors.allowCredentials) {
    headers.push({ name: 'Access-Control-Allow-Credentials', value: 'true' });
  }
  return headers;
}

async function notifyStatus(status: IAdvancedProxyStatus) {
  statuses.set(status.tabId, status);
  await browser.runtime.sendMessage({
    type: 'advancedProxyStatusChange',
    payload: status,
  }).catch(() => undefined);
}

async function continueUnchanged(tabId: number, requestId: string) {
  await chrome.debugger.sendCommand({ tabId }, 'Fetch.continueRequest', { requestId });
}

function encodeBody(body: string): string {
  const bytes = new TextEncoder().encode(body);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

const logNotifications = batchTabNotifications((tabId) => {
  void browser.runtime.sendMessage({ type: 'advancedProxyLogChange', payload: { tabId } }).catch(() => undefined);
});
const notifyLogChanged = (tabId: number) => logNotifications.notify(tabId);

async function handleRequestPaused(tabId: number, params: IRequestPausedParams) {
  const session = sessions.get(tabId);
  if (!session) {
    await continueUnchanged(tabId, params.requestId);
    return;
  }

  const isResponseStage = typeof params.responseStatusCode === 'number';
  const rules = matchingRules(session, params);
  const actions = allActions(rules);
  const cors = actionOfType(actions, 'cors');
  const entry = isResponseStage
    ? requestIndexes.get(`${tabId}:${params.requestId}`)
    : recordRequest(tabId, params, rules);
  const isCorsPreflight = !isResponseStage
    && params.request.method.toUpperCase() === 'OPTIONS'
    && !!getHeader(params.request.headers, 'access-control-request-method');

  if (!isResponseStage) {
    const delayAction = actionOfType(actions, 'delay');
    if (delayAction) {
      if (!await waitForDelay(delayAction.milliseconds, session.abort.signal)) return;
      entry?.changes?.push({ label: 'Delay', after: `${Math.min(Math.max(delayAction.milliseconds, 0), 30_000)} ms` });
    }

    if (sessions.get(tabId) !== session) return;

    if (actionOfType(actions, 'block')) {
      await chrome.debugger.sendCommand({ tabId }, 'Fetch.failRequest', {
        requestId: params.requestId,
        errorReason: 'BlockedByClient',
      });
      if (entry) {
        entry.outcome = 'blocked';
        entry.duration = Date.now() - entry.startedAt;
        entry.changes?.push({ label: 'Request blocked', after: 'BlockedByClient' });
      }
      notifyLogChanged(tabId);
      return;
    }

    const failureAction = actionOfType(actions, 'networkFailure');
    if (failureAction) {
      await chrome.debugger.sendCommand({ tabId }, 'Fetch.failRequest', {
        requestId: params.requestId,
        errorReason: failureAction.reason || 'Failed',
      });
      if (entry) entry.outcome = 'failed';
      entry?.changes?.push({ label: 'Simulated failure', after: failureAction.reason || 'Failed' });
      notifyLogChanged(tabId);
      return;
    }

    const mockAction = actionOfType(actions, 'mockResponse');
    if (mockAction) {
      const mockHeaders = {
        'Content-Type': 'application/json; charset=utf-8',
        ...(cors ? headersToMap(createCorsHeaders(session, params.request.headers, cors)) : {}),
        ...mockAction.headers,
      };
      await chrome.debugger.sendCommand({ tabId }, 'Fetch.fulfillRequest', {
        requestId: params.requestId,
        responseCode: Math.min(Math.max(mockAction.status, 100), 599),
        responseHeaders: toHeaderEntries(mockHeaders),
        body: encodeBody(mockAction.body),
      });
      if (entry) {
        entry.status = mockAction.status;
        entry.responseHeaders = redactHeaders(mockHeaders);
        entry.changes?.push({ label: 'Local mock', after: `HTTP ${mockAction.status}; ${new TextEncoder().encode(mockAction.body).length} bytes; server not contacted` });
        entry.outcome = 'mocked';
        entry.duration = Date.now() - entry.startedAt;
      }
      notifyLogChanged(tabId);
      return;
    }
  }

  if (isCorsPreflight && cors) {
    await chrome.debugger.sendCommand({ tabId }, 'Fetch.fulfillRequest', {
      requestId: params.requestId,
      responseCode: 204,
      responsePhrase: 'No Content',
      responseHeaders: createCorsHeaders(session, params.request.headers, cors),
    });
    if (entry) {
      entry.status = 204;
      entry.outcome = 'mocked';
      entry.duration = Date.now() - entry.startedAt;
      entry.diagnostics.push('CORS preflight was synthesized locally with status 204.');
    }
    notifyLogChanged(tabId);
    return;
  }

  if (!isResponseStage) {
    const redirectAction = actionOfType(actions, 'redirect');
    const requestHeaderActions = actions.filter(
      (action): action is Extract<IProxyAction, { type: 'setRequestHeaders' }> => action.type === 'setRequestHeaders',
    );
    const mergedRequestHeaders = requestHeaderActions.reduce(
      (headers, action) => ({ ...headers, ...action.headers }),
      { ...params.request.headers },
    );
    await chrome.debugger.sendCommand({ tabId }, 'Fetch.continueRequest', {
      requestId: params.requestId,
      ...(redirectAction ? { url: redirectAction.url } : {}),
      ...(requestHeaderActions.length > 0 ? { headers: toHeaderEntries(mergedRequestHeaders) } : {}),
    });
    if (entry) entry.outcome = 'continued';
    if (redirectAction) entry?.changes?.push({ label: 'Redirect', before: params.request.url, after: redirectAction.url });
    for (const action of requestHeaderActions) {
      for (const [name, value] of Object.entries(action.headers)) {
        entry?.changes?.push({ label: `Request header: ${name}`, before: redactHeaders({ [name]: getHeader(params.request.headers, name) || '(absent)' })[name], after: redactHeaders({ [name]: value })[name] });
      }
    }
    notifyLogChanged(tabId);
    return;
  }

  const shouldPatchResponse = isResponseStage
    && (!!cors || actions.some((action) => action.type === 'setResponseHeaders'));
  if (!shouldPatchResponse) {
    updateRequestLog(tabId, params, 'continued');
    await continueUnchanged(tabId, params.requestId);
    notifyLogChanged(tabId);
    return;
  }

  let headers = params.responseHeaders || [];
  for (const header of cors ? createCorsHeaders(session, params.request.headers, cors) : []) {
    headers = upsertHeader(headers, header.name, header.value);
  }
  const responseHeaderActions = actions.filter(
    (action): action is Extract<IProxyAction, { type: 'setResponseHeaders' }> => action.type === 'setResponseHeaders',
  );
  for (const action of responseHeaderActions) {
    for (const [name, value] of Object.entries(action.headers)) {
      headers = upsertHeader(headers, name, value);
    }
  }

  try {
    await chrome.debugger.sendCommand({ tabId }, 'Fetch.continueResponse', {
      requestId: params.requestId,
      responseCode: params.responseStatusCode,
      responsePhrase: params.responseStatusText,
      responseHeaders: headers,
    });
    updateRequestLog(tabId, { ...params, responseHeaders: headers }, 'continued');
    const original = headersToMap(params.responseHeaders || []);
    for (const { name, value } of headers) {
      if (getHeader(original, name) !== value) entry?.changes?.push({ label: `Response header: ${name}`, before: redactHeaders({ [name]: getHeader(original, name) || '(absent)' })[name], after: redactHeaders({ [name]: value })[name] });
    }
    const logged = requestIndexes.get(`${tabId}:${params.requestId}`);
    if (cors) logged?.diagnostics.push('CORS response headers were repaired before browser enforcement.');
  } catch (error) {
    logger.warn('Unable to patch response headers, continuing unchanged:', error);
    await continueUnchanged(tabId, params.requestId);
    updateRequestLog(tabId, params, 'continued');
  }
  notifyLogChanged(tabId);
}

async function onDebuggerEvent(
  source: chrome.debugger.Debuggee & { sessionId?: string },
  method: string,
  params?: object,
) {
  const tabId = source.tabId;
  if (method !== 'Fetch.requestPaused' || typeof tabId !== 'number' || !params) return;
  try {
    await handleRequestPaused(tabId, params as IRequestPausedParams);
  } catch (error) {
    logger.error('Advanced proxy request handler failed:', error);
    await continueUnchanged(tabId, (params as IRequestPausedParams).requestId).catch(() => undefined);
  }
}

function onDebuggerDetach(source: chrome.debugger.Debuggee, reason: string) {
  if (typeof source.tabId !== 'number') return;
  sessions.get(source.tabId)?.abort.abort();
  sessions.delete(source.tabId);
  void notifyStatus({
    tabId: source.tabId,
    phase: 'disabled',
    error: reason === 'canceled_by_user' ? 'Chrome debugging was stopped by the user.' : undefined,
  });
}

function requiresCapture(session: IAdvancedProxySession, controls = session.quickControls): boolean {
  return controls.cors || controls.delayMs > 0 || controls.failure || cachedRules.some((rule) =>
    rule.enabled && rule.match.initiatorOrigins.some((origin) => origin === '*' || origin === session.origin));
}

async function startCapture(tabId: number, session: IAdvancedProxySession): Promise<void> {
  if (session.captureEnabled) return;
  if (session.captureStarting) return session.captureStarting;
  session.captureStarting = (async () => {
    await chrome.debugger.sendCommand({ tabId }, 'Fetch.enable', {
      patterns: [{ urlPattern: '*', requestStage: 'Request' }, { urlPattern: '*', requestStage: 'Response' }],
    });
    if (sessions.get(tabId) !== session) throw new Error('Start a proxy session first.');
    session.captureEnabled = true;
  })();
  try { await session.captureStarting; } finally { session.captureStarting = undefined; }
}

async function refreshRuleCache() {
  const state = await ensureProxyAppState();
  cachedRules = state.rules;
  requestLogLimit = state.settings.requestLogLimit;
}

if (__TARGET__ === 'chrome') {
  chrome.debugger.onEvent.addListener(onDebuggerEvent);
  chrome.debugger.onDetach.addListener(onDebuggerDetach);
  chrome.tabs.onRemoved.addListener((tabId) => {
    logNotifications.cancel(tabId);
    sessions.get(tabId)?.abort.abort();
    sessions.delete(tabId);
    statuses.delete(tabId);
    requestLogs.delete(tabId);
    for (const key of requestIndexes.keys()) {
      if (key.startsWith(`${tabId}:`)) requestIndexes.delete(key);
    }
  });
  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    const session = sessions.get(tabId);
    if (!session || !changeInfo.url) return;
    try {
      if (new URL(changeInfo.url).origin !== session.origin) {
        void disableAdvancedProxy(tabId);
      }
    } catch {
      void disableAdvancedProxy(tabId);
    }
  });
  browser.storage.onChanged.addListener((changes, areaName) => {
    const value = changes[APP_STATE_KEY]?.newValue;
    if (areaName !== 'local' || !isProxyAppState(value)) return;
    cachedRules = value.rules;
    requestLogLimit = value.settings.requestLogLimit;
    for (const [tabId, session] of sessions) {
      if (!session.captureEnabled && requiresCapture(session)) {
        void startCapture(tabId, session).then(() => notifyStatus({ ...getAdvancedProxyStatus(tabId), captureEnabled: true }))
          .catch((error) => { logger.warn('Unable to start request capture:', error); void disableAdvancedProxy(tabId); });
      }
    }
  });
}

export async function enableAdvancedProxy(
  tabId: number,
  options: { quickControls?: QuickControls } = {},
): Promise<IAdvancedProxyStatus> {
  if (__TARGET__ !== 'chrome') {
    return { tabId, phase: 'error', error: 'Advanced proxy is currently available in Chrome only.' };
  }
  const quickControls = options.quickControls ? parseQuickControls(options.quickControls) : { ...EMPTY_QUICK_CONTROLS };
  const tab = await browser.tabs.get(tabId);
  if (!tab.url) throw new Error('The active tab URL is unavailable.');
  const url = new URL(tab.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Advanced proxy only supports HTTP and HTTPS tabs.');
  }
  const existing = sessions.get(tabId);
  if (existing) {
    // An explicit start takes ownership of an already-running automatic session.
    if (!options.quickControls) {
      await startCapture(tabId, existing);
      existing.startedByQuickControls = false;
      await notifyStatus({ ...getAdvancedProxyStatus(tabId), captureEnabled: true });
    }
    return getAdvancedProxyStatus(tabId);
  }

  await notifyStatus({ tabId, phase: 'connecting', origin: url.origin });
  try {
    await refreshRuleCache();
    await chrome.debugger.attach({ tabId }, PROTOCOL_VERSION);
    sessions.set(tabId, {
      abort: new AbortController(),
      captureEnabled: false,
      startedByQuickControls: !!options.quickControls,
      origin: url.origin,
      quickControls,
    });
    await chrome.debugger.sendCommand({ tabId }, 'Network.enable');
    await chrome.debugger.sendCommand({ tabId }, 'Network.setCacheDisabled', { cacheDisabled: quickControls.disableCache });
    const session = sessions.get(tabId)!;
    if (!options.quickControls || !quickControls.disableCache || requiresCapture(session)) await startCapture(tabId, session);
    const status = { tabId, phase: 'connected', origin: url.origin, quickControls, captureEnabled: session.captureEnabled } satisfies IAdvancedProxyStatus;
    await notifyStatus(status);
    return status;
  } catch (error) {
    sessions.get(tabId)?.abort.abort();
    sessions.delete(tabId);
    await chrome.debugger.detach({ tabId }).catch(() => undefined);
    const status = {
      tabId,
      phase: 'error',
      origin: url.origin,
      error: error instanceof Error ? error.message : 'Unable to attach Chrome debugger.',
    } satisfies IAdvancedProxyStatus;
    await notifyStatus(status);
    return status;
  }
}

export async function updateQuickControls(tabId: number, value: unknown): Promise<IAdvancedProxyStatus> {
  const quickControls = parseQuickControls(value);
  const session = sessions.get(tabId);
  if (!session) throw new Error('Start a proxy session first.');
  if (session.startedByQuickControls && !hasActiveQuickControls(quickControls)) {
    return disableAdvancedProxy(tabId);
  }
  if (session.quickControls.disableCache !== quickControls.disableCache) {
    await chrome.debugger.sendCommand({ tabId }, 'Network.setCacheDisabled', { cacheDisabled: quickControls.disableCache });
    if (sessions.get(tabId) !== session) throw new Error('Start a proxy session first.');
  }
  if (requiresCapture(session, quickControls)) await startCapture(tabId, session);
  if (sessions.get(tabId) !== session) throw new Error('Start a proxy session first.');
  session.quickControls = quickControls;
  const status = { tabId, phase: 'connected', origin: session.origin, quickControls, captureEnabled: session.captureEnabled } satisfies IAdvancedProxyStatus;
  await notifyStatus(status);
  return status;
}

export async function disableAdvancedProxy(tabId: number): Promise<IAdvancedProxyStatus> {
  const session = sessions.get(tabId);
  sessions.get(tabId)?.abort.abort();
  sessions.delete(tabId);
  if (__TARGET__ === 'chrome') {
    if (session?.quickControls.disableCache) {
      await chrome.debugger.sendCommand({ tabId }, 'Network.setCacheDisabled', { cacheDisabled: false }).catch(() => undefined);
    }
    await chrome.debugger.detach({ tabId }).catch(() => undefined);
  }
  const status = { tabId, phase: 'disabled' } satisfies IAdvancedProxyStatus;
  await notifyStatus(status);
  return status;
}

export function getAdvancedProxyStatus(tabId: number): IAdvancedProxyStatus {
  return statuses.get(tabId) || { tabId, phase: 'disabled' };
}

export function getRequestLog(tabId: number): IRequestLogEntry[] {
  return [...(requestLogs.get(tabId) || [])];
}

export function clearRequestLog(tabId: number): void {
  requestLogs.delete(tabId);
  for (const key of requestIndexes.keys()) {
    if (key.startsWith(`${tabId}:`)) requestIndexes.delete(key);
  }
  notifyLogChanged(tabId);
}
