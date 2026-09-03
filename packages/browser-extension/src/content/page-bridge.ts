import browser from 'webextension-polyfill';

const REQUEST_TYPE = 'forth-intercept:sdk-request';
const RESPONSE_TYPE = 'forth-intercept:sdk-response';
const ALLOWED_METHODS = new Set([
  'connect',
  'getStatus',
  'requestCors',
  'disableCors',
  'createRuleDraft',
  'openWorkspace',
]);

interface PageRequest {
  type: typeof REQUEST_TYPE;
  clientId: string;
  id: string;
  method: string;
  payload?: unknown;
}

function isPageRequest(value: unknown): value is PageRequest {
  if (!value || typeof value !== 'object') return false;
  const request = value as Partial<PageRequest>;
  return request.type === REQUEST_TYPE
    && typeof request.clientId === 'string'
    && request.clientId.length <= 128
    && typeof request.id === 'string'
    && request.id.length <= 128
    && typeof request.method === 'string'
    && ALLOWED_METHODS.has(request.method);
}

function sendResponse(request: PageRequest, response: unknown) {
  const result = response && typeof response === 'object' && 'error' in response
    ? { error: { type: 'invalid-request', message: String((response as { error?: unknown }).error || 'Request failed.') } }
    : { data: response };
  window.postMessage({
    type: RESPONSE_TYPE,
    clientId: request.clientId,
    id: request.id,
    ...result,
  }, location.origin);
}

window.addEventListener('message', async (event) => {
  if (event.source !== window || event.origin !== location.origin || !isPageRequest(event.data)) return;
  const request = event.data;
  try {
    if (JSON.stringify(request.payload ?? null).length > 65_536) {
      throw new Error('SDK request exceeds the 64 KB limit.');
    }
    if (request.method === 'requestCors') {
      const options = request.payload && typeof request.payload === 'object'
        ? request.payload as { credentials?: unknown; reason?: unknown }
        : {};
      const reason = typeof options.reason === 'string'
        ? options.reason.trim().slice(0, 160)
        : '';
      const credentials = options.credentials === true;
      const details = [
        `${location.origin} is asking Forth Intercept to repair CORS for this origin.`,
        credentials ? 'Credentialed requests will be allowed.' : 'Credentials will not be enabled.',
        reason ? `Reason: ${reason}` : '',
        'Continue?',
      ].filter(Boolean).join('\n\n');
      if (!window.confirm(details)) {
        window.postMessage({
          type: RESPONSE_TYPE,
          clientId: request.clientId,
          id: request.id,
          error: { type: 'user-cancel', message: 'The user declined the CORS request.' },
        }, location.origin);
        return;
      }
    }
    const response = await browser.runtime.sendMessage({
      type: 'sdkRequest',
      payload: { method: request.method, data: request.payload },
    });
    sendResponse(request, response);
  } catch (cause) {
    window.postMessage({
      type: RESPONSE_TYPE,
      clientId: request.clientId,
      id: request.id,
      error: {
        type: 'communication-failed',
        message: cause instanceof Error ? cause.message : 'Extension communication failed.',
      },
    }, location.origin);
  }
});
