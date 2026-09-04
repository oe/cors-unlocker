const EXTENSION_ID = 'knhlkjdfmgkmelcjfnbbhpphkmjjacng';
const REQUEST_TYPE = 'forth-intercept:sdk-request';
const RESPONSE_TYPE = 'forth-intercept:sdk-response';
const DEFAULT_TIMEOUT = 5_000;

export type InterceptErrorType =
  | 'not-installed'
  | 'user-cancel'
  | 'invalid-request'
  | 'unsupported-origin'
  | 'communication-failed'
  | 'timeout'
  | 'unknown-error';

export class InterceptError extends Error {
  readonly type: InterceptErrorType;

  constructor(options: { type: InterceptErrorType; message: string }) {
    super(options.message);
    this.name = 'InterceptError';
    this.type = options.type;
  }
}

/** @deprecated Use InterceptError. */
export class AppCorsError extends InterceptError {}

export interface InterceptCapabilities {
  protocolVersion: 2;
  product: 'Forth Intercept';
  browser: 'chrome' | 'firefox';
  cors: true;
  draftRules: true;
  workspace: true;
  advancedMode: 'user-initiated';
  interception: {
    responseMock: 'synthetic' | 'body-replacement';
    preflight: 'synthetic' | 'headers-only';
    networkFailure: 'reasoned' | 'cancel';
    resourceTypes: 'distinct-fetch-xhr' | 'combined-fetch-xhr';
  };
}

export interface InterceptStatus {
  origin: string;
  cors: {
    enabled: boolean;
    credentials: boolean;
  };
  advancedMode: 'disabled' | 'connecting' | 'connected' | 'error';
}

export interface RequestCorsOptions {
  credentials?: boolean;
  reason?: string;
}

/** @deprecated Use RequestCorsOptions. */
export type IEnableOptions = RequestCorsOptions;

export type DraftAction =
  | { type: 'cors'; allowCredentials: boolean; allowOrigin: '*' | 'initiator'; allowMethods: string[]; allowHeaders: string[] }
  | { type: 'setRequestHeaders'; headers: Record<string, string> }
  | { type: 'setResponseHeaders'; headers: Record<string, string> }
  | { type: 'redirect'; url: string }
  | { type: 'block' }
  | { type: 'mockResponse'; status: number; headers: Record<string, string>; body: string }
  | { type: 'delay'; milliseconds: number }
  | { type: 'networkFailure'; reason: string };

export interface DraftRuleInput {
  name: string;
  urlPattern: string;
  methods?: string[];
  resourceTypes?: string[];
  actions: DraftAction[];
}

export interface DraftRuleResult {
  id: string;
  enabled: false;
  workspaceOpened: boolean;
}

interface BridgeResponse<T = unknown> {
  type: typeof RESPONSE_TYPE;
  clientId: string;
  id: string;
  data?: T;
  error?: { type?: string; message?: string };
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function assertBrowserContext(): void {
  if (typeof window === 'undefined' || typeof location === 'undefined') {
    throw new InterceptError({
      type: 'unsupported-origin',
      message: 'Forth Intercept SDK must run in a browser page.',
    });
  }
  if (location.protocol !== 'http:' && location.protocol !== 'https:') {
    throw new InterceptError({
      type: 'unsupported-origin',
      message: 'Only HTTP and HTTPS pages can connect to Forth Intercept.',
    });
  }
}

class LocalBridge {
  readonly clientId = randomId();

  request<T>(method: string, payload?: unknown, timeout = DEFAULT_TIMEOUT): Promise<T> {
    assertBrowserContext();
    const id = randomId();
    return new Promise<T>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        window.removeEventListener('message', onMessage);
      };
      const onMessage = (event: MessageEvent<BridgeResponse<T>>) => {
        const response = event.data;
        if (event.source !== window
          || response?.type !== RESPONSE_TYPE
          || response.clientId !== this.clientId
          || response.id !== id) return;
        cleanup();
        if (response.error) {
          reject(new InterceptError({
            type: (response.error.type || 'unknown-error') as InterceptErrorType,
            message: response.error.message || 'Forth Intercept request failed.',
          }));
          return;
        }
        resolve(response.data as T);
      };
      const timer = window.setTimeout(() => {
        cleanup();
        reject(new InterceptError({
          type: method === 'connect' ? 'not-installed' : 'timeout',
          message: method === 'connect'
            ? 'Forth Intercept is not installed or is not available on this page.'
            : `Forth Intercept did not respond to ${method}.`,
        }));
      }, timeout);
      window.addEventListener('message', onMessage);
      window.postMessage({
        type: REQUEST_TYPE,
        clientId: this.clientId,
        id,
        method,
        payload,
      }, location.origin);
    });
  }
}

export class InterceptSession {
  readonly origin: string;
  readonly capabilities: InterceptCapabilities;
  private readonly bridge: LocalBridge;

  constructor(bridge: LocalBridge, origin: string, capabilities: InterceptCapabilities) {
    this.bridge = bridge;
    this.origin = origin;
    this.capabilities = capabilities;
  }

  getStatus(): Promise<InterceptStatus> {
    return this.bridge.request('getStatus');
  }

  requestCors(options: RequestCorsOptions = {}): Promise<InterceptStatus> {
    return this.bridge.request('requestCors', options, 60_000);
  }

  disableCors(): Promise<InterceptStatus> {
    return this.bridge.request('disableCors');
  }

  createRuleDraft(rule: DraftRuleInput, options: { openWorkspace?: boolean } = {}): Promise<DraftRuleResult> {
    return this.bridge.request('createRuleDraft', {
      rule,
      openWorkspace: options.openWorkspace ?? true,
    });
  }

  openWorkspace(): Promise<void> {
    return this.bridge.request('openWorkspace');
  }
}

export const intercept = {
  async connect(options: { timeout?: number } = {}): Promise<InterceptSession> {
    const bridge = new LocalBridge();
    const response = await bridge.request<{ origin: string; capabilities: InterceptCapabilities }>(
      'connect',
      undefined,
      options.timeout ?? 1_500,
    );
    return new InterceptSession(bridge, response.origin, response.capabilities);
  },

  async isAvailable(): Promise<boolean> {
    try {
      await this.connect({ timeout: 750 });
      return true;
    } catch {
      return false;
    }
  },

  openStorePage(): void {
    const url = /firefox/i.test(navigator.userAgent)
      ? 'https://intercept.forth.ink/docs/#install'
      : `https://chromewebstore.google.com/detail/${EXTENSION_ID}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  },
};

async function legacySession(): Promise<InterceptSession> {
  return intercept.connect();
}

/** @deprecated Use intercept.isAvailable(). */
export function isExtInstalled(): Promise<boolean> {
  return intercept.isAvailable();
}

/** @deprecated Use intercept.connect().then(session => session.openWorkspace()). */
export async function openExtOptions(): Promise<void> {
  await (await legacySession()).openWorkspace();
}

/** @deprecated Use intercept.openStorePage(). */
export function openStorePage(): void {
  intercept.openStorePage();
}

/** @deprecated Use InterceptSession.getStatus(). */
export async function isEnabled(): Promise<{ enabled: boolean; credentials: boolean }> {
  if (!(await intercept.isAvailable())) return { enabled: false, credentials: false };
  return (await (await legacySession()).getStatus()).cors;
}

/** @deprecated Use InterceptSession.requestCors(). */
export async function enable(options?: IEnableOptions): Promise<{ enabled: boolean; credentials: boolean }> {
  return (await (await legacySession()).requestCors(options)).cors;
}

/** @deprecated Use InterceptSession.disableCors(). */
export async function disable(): Promise<void> {
  await (await legacySession()).disableCors();
}

export interface IMessageData {
  type: 'from-npm' | 'from-cs' | 'from-page';
  id: string;
  method: string;
  payload?: Record<string, unknown>;
}

export type IMessageResponse =
  | { id: string; type: 'response'; data?: unknown; error?: undefined }
  | { id: string; type: 'response'; error: { message: string; type: string }; data?: undefined };

export default intercept;
