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

const PROTOCOL_VERSION = '1.3';

export type AdvancedProxyPhase = 'disabled' | 'connecting' | 'connected' | 'error';

export interface IAdvancedProxyStatus {
  tabId: number;
  phase: AdvancedProxyPhase;
  origin?: string;
  error?: string;
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
  diagnostics: string[];
  outcome: 'pending' | 'continued' | 'mocked' | 'blocked' | 'failed';
}

interface IAdvancedProxySession {
  origin: string;
  credentials: boolean;
  extraHeaders?: string;
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
  return cachedRules.filter((rule) => rule.enabled
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
    diagnostics: [],
    outcome: 'pending',
  };
  const entries = requestLogs.get(tabId) || [];
  entries.unshift(entry);
  entries.splice(requestLogLimit);
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
): IHeaderEntry[] {
  const requestOrigin = getHeader(requestHeaders, 'origin') || session.origin;
  const requestedMethod = getHeader(requestHeaders, 'access-control-request-method');
  const requestedHeaders = getHeader(requestHeaders, 'access-control-request-headers');
  const headers: IHeaderEntry[] = [
    { name: 'Access-Control-Allow-Origin', value: session.credentials ? requestOrigin : '*' },
    { name: 'Access-Control-Allow-Methods', value: requestedMethod || 'GET, POST, PUT, DELETE, OPTIONS, PATCH' },
    { name: 'Access-Control-Allow-Headers', value: requestedHeaders || mergeHeaders(session.extraHeaders).join(', ') },
    { name: 'Access-Control-Max-Age', value: '600' },
  ];
  if (session.credentials) {
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

function notifyLogChanged(tabId: number) {
  void browser.runtime.sendMessage({
    type: 'advancedProxyLogChange',
    payload: { tabId },
  }).catch(() => undefined);
}

async function handleRequestPaused(tabId: number, params: IRequestPausedParams) {
  const session = sessions.get(tabId);
  if (!session) {
    await continueUnchanged(tabId, params.requestId);
    return;
  }

  const isResponseStage = typeof params.responseStatusCode === 'number';
  const rules = matchingRules(session, params);
  const actions = allActions(rules);
  const entry = isResponseStage
    ? requestIndexes.get(`${tabId}:${params.requestId}`)
    : recordRequest(tabId, params, rules);
  const isCorsPreflight = !isResponseStage
    && params.request.method.toUpperCase() === 'OPTIONS'
    && !!getHeader(params.request.headers, 'access-control-request-method');

  if (!isResponseStage) {
    const delayAction = actionOfType(actions, 'delay');
    if (delayAction) {
      await new Promise((resolve) => setTimeout(
        resolve,
        Math.min(Math.max(delayAction.milliseconds, 0), 30_000),
      ));
    }

    if (actionOfType(actions, 'block')) {
      await chrome.debugger.sendCommand({ tabId }, 'Fetch.failRequest', {
        requestId: params.requestId,
        errorReason: 'BlockedByClient',
      });
      if (entry) entry.outcome = 'blocked';
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
      notifyLogChanged(tabId);
      return;
    }

    const mockAction = actionOfType(actions, 'mockResponse');
    if (mockAction) {
      const mockHeaders = {
        'Content-Type': 'application/json; charset=utf-8',
        ...headersToMap(createCorsHeaders(session, params.request.headers)),
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
        entry.responseHeaders = mockHeaders;
        entry.outcome = 'mocked';
        entry.duration = Date.now() - entry.startedAt;
      }
      notifyLogChanged(tabId);
      return;
    }
  }

  if (isCorsPreflight) {
    await chrome.debugger.sendCommand({ tabId }, 'Fetch.fulfillRequest', {
      requestId: params.requestId,
      responseCode: 204,
      responsePhrase: 'No Content',
      responseHeaders: createCorsHeaders(session, params.request.headers),
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
    notifyLogChanged(tabId);
    return;
  }

  const shouldPatchResponse = isResponseStage
    && (params.resourceType === 'XHR' || params.resourceType === 'Fetch');
  if (!shouldPatchResponse) {
    updateRequestLog(tabId, params, 'continued');
    await continueUnchanged(tabId, params.requestId);
    notifyLogChanged(tabId);
    return;
  }

  let headers = params.responseHeaders || [];
  for (const header of createCorsHeaders(session, params.request.headers)) {
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
    const logged = requestIndexes.get(`${tabId}:${params.requestId}`);
    logged?.diagnostics.push('CORS response headers were repaired before browser enforcement.');
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
  sessions.delete(source.tabId);
  void notifyStatus({
    tabId: source.tabId,
    phase: 'disabled',
    error: reason === 'canceled_by_user' ? 'Chrome debugging was stopped by the user.' : undefined,
  });
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
  });
}

export async function enableAdvancedProxy(
  tabId: number,
  options: { credentials?: boolean; extraHeaders?: string } = {},
): Promise<IAdvancedProxyStatus> {
  if (__TARGET__ !== 'chrome') {
    return { tabId, phase: 'error', error: 'Advanced proxy is currently available in Chrome only.' };
  }
  const tab = await browser.tabs.get(tabId);
  if (!tab.url) throw new Error('The active tab URL is unavailable.');
  const url = new URL(tab.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Advanced proxy only supports HTTP and HTTPS tabs.');
  }
  if (sessions.has(tabId)) return getAdvancedProxyStatus(tabId);

  await notifyStatus({ tabId, phase: 'connecting', origin: url.origin });
  try {
    await refreshRuleCache();
    await chrome.debugger.attach({ tabId }, PROTOCOL_VERSION);
    sessions.set(tabId, {
      origin: url.origin,
      credentials: !!options.credentials,
      extraHeaders: options.extraHeaders,
    });
    await chrome.debugger.sendCommand({ tabId }, 'Fetch.enable', {
      patterns: [
        { urlPattern: '*', requestStage: 'Request' },
        { urlPattern: '*', requestStage: 'Response' },
      ],
    });
    const status = { tabId, phase: 'connected', origin: url.origin } satisfies IAdvancedProxyStatus;
    await notifyStatus(status);
    return status;
  } catch (error) {
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

export async function disableAdvancedProxy(tabId: number): Promise<IAdvancedProxyStatus> {
  sessions.delete(tabId);
  if (__TARGET__ === 'chrome') {
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
