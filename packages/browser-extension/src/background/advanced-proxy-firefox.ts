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

interface Session {
  origin: string;
  credentials: boolean;
  extraHeaders?: string;
}

interface HeaderEntry {
  name: string;
  value?: string;
  binaryValue?: number[];
}

interface RequestDetails {
  requestId: string;
  tabId: number;
  url: string;
  method: string;
  type: string;
  requestHeaders?: HeaderEntry[];
  responseHeaders?: HeaderEntry[];
  statusCode?: number;
  error?: string;
}

const sessions = new Map<number, Session>();
const statuses = new Map<number, IAdvancedProxyStatus>();
const requestLogs = new Map<number, IRequestLogEntry[]>();
const requestIndexes = new Map<string, IRequestLogEntry>();
const requestHeaders = new Map<string, ProxyHeaderMap>();
const mockActions = new Map<string, Extract<IProxyAction, { type: 'mockResponse' }>>();
let cachedRules: IProxyRule[] = [];
let requestLogLimit = 500;

const SENSITIVE_HEADERS = new Set(['authorization', 'cookie', 'proxy-authorization', 'set-cookie']);

function keyFor(details: RequestDetails): string {
  return `${details.tabId}:${details.requestId}`;
}

function headersToMap(headers: HeaderEntry[] = []): ProxyHeaderMap {
  return Object.fromEntries(headers.flatMap((header) => (
    typeof header.value === 'string' ? [[header.name, header.value]] : []
  )));
}

function mapToHeaders(headers: ProxyHeaderMap): HeaderEntry[] {
  return Object.entries(headers).map(([name, value]) => ({ name, value }));
}

function redactHeaders(headers: ProxyHeaderMap): ProxyHeaderMap {
  return Object.fromEntries(Object.entries(headers).map(([name, value]) => [
    name,
    SENSITIVE_HEADERS.has(name.toLowerCase()) ? '••••••••' : value,
  ]));
}

function normalizeResourceType(resourceType?: string): string {
  const lower = (resourceType || 'other').toLowerCase();
  if (lower === 'xmlhttprequest' || lower === 'xhr' || lower === 'fetch') return 'XHR';
  return lower.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function globMatches(pattern: string, value: string): boolean {
  if (!pattern || pattern === '*') return true;
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i').test(value);
}

function matchingRules(session: Session, details: RequestDetails): IProxyRule[] {
  const method = details.method.toUpperCase();
  const resourceType = normalizeResourceType(details.type);
  return cachedRules.filter((rule) => rule.enabled
    && rule.match.initiatorOrigins.some((origin) => origin === '*' || origin === session.origin)
    && globMatches(rule.match.urlPattern, details.url)
    && (!rule.match.methods?.length || rule.match.methods.includes(method))
    && (!rule.match.resourceTypes?.length || rule.match.resourceTypes.some(
      (expected) => normalizeResourceType(expected) === resourceType,
    )));
}

function actionsFor(session: Session, details: RequestDetails): {
  rules: IProxyRule[];
  actions: IProxyAction[];
} {
  const rules = matchingRules(session, details);
  return { rules, actions: rules.flatMap((rule) => rule.actions) };
}

function actionOfType<T extends IProxyAction['type']>(
  actions: IProxyAction[],
  type: T,
): Extract<IProxyAction, { type: T }> | undefined {
  return actions.find((action): action is Extract<IProxyAction, { type: T }> => action.type === type);
}

function upsertHeader(headers: HeaderEntry[], name: string, value: string): HeaderEntry[] {
  return [
    ...headers.filter((header) => header.name.toLowerCase() !== name.toLowerCase()),
    { name, value },
  ];
}

function getHeader(headers: ProxyHeaderMap, name: string): string | undefined {
  const target = name.toLowerCase();
  return Object.entries(headers).find(([header]) => header.toLowerCase() === target)?.[1];
}

function corsHeaders(session: Session, headers: ProxyHeaderMap): HeaderEntry[] {
  const origin = getHeader(headers, 'origin') || session.origin;
  const requestedMethod = getHeader(headers, 'access-control-request-method');
  const requestedHeaders = getHeader(headers, 'access-control-request-headers');
  const result: HeaderEntry[] = [
    { name: 'Access-Control-Allow-Origin', value: session.credentials ? origin : '*' },
    { name: 'Access-Control-Allow-Methods', value: requestedMethod || 'GET, POST, PUT, DELETE, OPTIONS, PATCH' },
    { name: 'Access-Control-Allow-Headers', value: requestedHeaders || mergeHeaders(session.extraHeaders).join(', ') },
    { name: 'Access-Control-Max-Age', value: '600' },
  ];
  if (session.credentials) result.push({ name: 'Access-Control-Allow-Credentials', value: 'true' });
  return result;
}

function recordRequest(details: RequestDetails, rules: IProxyRule[]): IRequestLogEntry {
  const entry: IRequestLogEntry = {
    id: details.requestId,
    tabId: details.tabId,
    url: details.url,
    method: details.method,
    resourceType: normalizeResourceType(details.type),
    startedAt: Date.now(),
    requestHeaders: {},
    matchedRuleIds: rules.map((rule) => rule.id),
    diagnostics: [],
    outcome: 'pending',
  };
  const entries = requestLogs.get(details.tabId) || [];
  entries.unshift(entry);
  entries.splice(requestLogLimit);
  requestLogs.set(details.tabId, entries);
  requestIndexes.set(keyFor(details), entry);
  return entry;
}

function notifyLogChanged(tabId: number) {
  void browser.runtime.sendMessage({
    type: 'advancedProxyLogChange',
    payload: { tabId },
  }).catch(() => undefined);
}

async function notifyStatus(status: IAdvancedProxyStatus) {
  statuses.set(status.tabId, status);
  await browser.runtime.sendMessage({
    type: 'advancedProxyStatusChange',
    payload: status,
  }).catch(() => undefined);
}

function installMockFilter(
  details: RequestDetails,
  mock: Extract<IProxyAction, { type: 'mockResponse' }>,
  entry: IRequestLogEntry,
) {
  const filterResponseData = (browser.webRequest as unknown as {
    filterResponseData?: (requestId: string) => {
      ondata: ((event: { data: ArrayBuffer }) => void) | null;
      onstop: (() => void) | null;
      onerror: (() => void) | null;
      write(data: ArrayBuffer | Uint8Array): void;
      close(): void;
      disconnect(): void;
    };
  }).filterResponseData;
  if (!filterResponseData) {
    entry.diagnostics.push('Firefox response filtering is unavailable; the mock was skipped.');
    return;
  }
  const key = keyFor(details);
  const filter = filterResponseData(details.requestId);
  mockActions.set(key, mock);
  filter.ondata = () => undefined;
  filter.onstop = () => {
    filter.write(new TextEncoder().encode(mock.body));
    filter.close();
    entry.outcome = 'mocked';
    entry.duration = Date.now() - entry.startedAt;
    entry.diagnostics.push('Firefox replaced the response body; the original HTTP status was preserved.');
    mockActions.delete(key);
    notifyLogChanged(details.tabId);
  };
  filter.onerror = () => {
    mockActions.delete(key);
    entry.diagnostics.push('Firefox could not replace the response body.');
    filter.disconnect();
    notifyLogChanged(details.tabId);
  };
}

async function onBeforeRequest(details: RequestDetails) {
  const session = sessions.get(details.tabId);
  if (!session) return {};
  const { rules, actions } = actionsFor(session, details);
  const entry = recordRequest(details, rules);
  const delay = actionOfType(actions, 'delay');
  if (delay) {
    await new Promise((resolve) => setTimeout(
      resolve,
      Math.min(Math.max(delay.milliseconds, 0), 30_000),
    ));
  }
  if (actionOfType(actions, 'block')) {
    entry.outcome = 'blocked';
    entry.duration = Date.now() - entry.startedAt;
    notifyLogChanged(details.tabId);
    return { cancel: true };
  }
  const failure = actionOfType(actions, 'networkFailure');
  if (failure) {
    entry.outcome = 'failed';
    entry.duration = Date.now() - entry.startedAt;
    entry.diagnostics.push(`Firefox cancelled this request: ${failure.reason}`);
    notifyLogChanged(details.tabId);
    return { cancel: true };
  }
  const redirect = actionOfType(actions, 'redirect');
  if (redirect) {
    entry.outcome = 'continued';
    entry.diagnostics.push(`Redirected to ${redirect.url}`);
    notifyLogChanged(details.tabId);
    return { redirectUrl: redirect.url };
  }
  const mock = actionOfType(actions, 'mockResponse');
  if (mock) installMockFilter(details, mock, entry);
  else entry.outcome = 'continued';
  notifyLogChanged(details.tabId);
  return {};
}

function onBeforeSendHeaders(details: RequestDetails) {
  const session = sessions.get(details.tabId);
  if (!session) return {};
  const original = headersToMap(details.requestHeaders);
  requestHeaders.set(keyFor(details), original);
  const { actions } = actionsFor(session, details);
  const headerActions = actions.filter(
    (action): action is Extract<IProxyAction, { type: 'setRequestHeaders' }> => action.type === 'setRequestHeaders',
  );
  const merged = headerActions.reduce(
    (headers, action) => ({ ...headers, ...action.headers }),
    original,
  );
  const entry = requestIndexes.get(keyFor(details));
  if (entry) entry.requestHeaders = redactHeaders(merged);
  return headerActions.length > 0 ? { requestHeaders: mapToHeaders(merged) } : {};
}

function onHeadersReceived(details: RequestDetails) {
  const session = sessions.get(details.tabId);
  if (!session) return {};
  const key = keyFor(details);
  const sentHeaders = requestHeaders.get(key) || {};
  const { actions } = actionsFor(session, details);
  let headers = details.responseHeaders || [];
  if (normalizeResourceType(details.type) === 'XHR') {
    for (const header of corsHeaders(session, sentHeaders)) {
      if (header.value) headers = upsertHeader(headers, header.name, header.value);
    }
  }
  for (const action of actions) {
    if (action.type !== 'setResponseHeaders') continue;
    for (const [name, value] of Object.entries(action.headers)) {
      headers = upsertHeader(headers, name, value);
    }
  }
  const mock = mockActions.get(key);
  if (mock) {
    headers = headers.filter((header) => header.name.toLowerCase() !== 'content-length');
    const contentType = Object.entries(mock.headers)
      .find(([name]) => name.toLowerCase() === 'content-type')?.[1]
      || 'application/json; charset=utf-8';
    headers = upsertHeader(headers, 'Content-Type', contentType);
    for (const [name, value] of Object.entries(mock.headers)) {
      headers = upsertHeader(headers, name, value);
    }
  }
  const entry = requestIndexes.get(key);
  if (entry) {
    entry.status = details.statusCode;
    entry.responseHeaders = redactHeaders(headersToMap(headers));
    entry.duration = Date.now() - entry.startedAt;
    notifyLogChanged(details.tabId);
  }
  return { responseHeaders: headers };
}

function finish(details: RequestDetails, error?: string) {
  const key = keyFor(details);
  const entry = requestIndexes.get(key);
  if (entry) {
    if (error && entry.outcome !== 'blocked' && entry.outcome !== 'failed') {
      entry.outcome = 'failed';
      entry.diagnostics.push(error);
    } else if (entry.outcome === 'pending') {
      entry.outcome = 'continued';
    }
    if (typeof details.statusCode === 'number') entry.status = details.statusCode;
    entry.duration = Date.now() - entry.startedAt;
    notifyLogChanged(details.tabId);
  }
  requestHeaders.delete(key);
  mockActions.delete(key);
}

const filter = { urls: ['<all_urls>'] };
browser.webRequest.onBeforeRequest.addListener(onBeforeRequest as never, filter, ['blocking', 'requestBody']);
browser.webRequest.onBeforeSendHeaders.addListener(onBeforeSendHeaders as never, filter, ['blocking', 'requestHeaders']);
browser.webRequest.onHeadersReceived.addListener(onHeadersReceived as never, filter, ['blocking', 'responseHeaders']);
browser.webRequest.onCompleted.addListener(((details: RequestDetails) => finish(details)) as never, filter);
browser.webRequest.onErrorOccurred.addListener(((details: RequestDetails) => finish(details, details.error)) as never, filter);

browser.tabs.onRemoved.addListener((tabId) => {
  sessions.delete(tabId);
  statuses.delete(tabId);
  requestLogs.delete(tabId);
  for (const store of [requestIndexes, requestHeaders, mockActions]) {
    for (const key of store.keys()) {
      if (key.startsWith(`${tabId}:`)) store.delete(key);
    }
  }
});

browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
  const session = sessions.get(tabId);
  if (!session || !changeInfo.url) return;
  try {
    if (new URL(changeInfo.url).origin !== session.origin) void disableAdvancedProxy(tabId);
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

export async function enableAdvancedProxy(
  tabId: number,
  options: { credentials?: boolean; extraHeaders?: string } = {},
): Promise<IAdvancedProxyStatus> {
  const tab = await browser.tabs.get(tabId);
  if (!tab.url) throw new Error('The active tab URL is unavailable.');
  const url = new URL(tab.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Intercept mode only supports HTTP and HTTPS tabs.');
  }
  if (sessions.has(tabId)) return getAdvancedProxyStatus(tabId);
  await notifyStatus({ tabId, phase: 'connecting', origin: url.origin });
  try {
    const state = await ensureProxyAppState();
    cachedRules = state.rules;
    requestLogLimit = state.settings.requestLogLimit;
    sessions.set(tabId, {
      origin: url.origin,
      credentials: !!options.credentials,
      extraHeaders: options.extraHeaders,
    });
    const status = { tabId, phase: 'connected', origin: url.origin } satisfies IAdvancedProxyStatus;
    await notifyStatus(status);
    return status;
  } catch (error) {
    sessions.delete(tabId);
    const status = {
      tabId,
      phase: 'error',
      origin: url.origin,
      error: error instanceof Error ? error.message : 'Unable to start Firefox interception.',
    } satisfies IAdvancedProxyStatus;
    await notifyStatus(status);
    return status;
  }
}

export async function disableAdvancedProxy(tabId: number): Promise<IAdvancedProxyStatus> {
  sessions.delete(tabId);
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

logger.info('Firefox WebRequest interception engine initialized.');
