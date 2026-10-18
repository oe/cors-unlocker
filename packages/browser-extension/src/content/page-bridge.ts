import browser from 'webextension-polyfill';

const REQUEST_TYPE = 'wireflip:sdk-request';
const RESPONSE_TYPE = 'wireflip:sdk-response';
const ALLOWED_METHODS = new Set([
  'connect',
  'getStatus',
  'requestCors',
  'disableCors',
  'createRuleDraft',
  'requestRule',
  'openWorkspace',
  'enableRule',
  'disableRule',
  'deleteRule',
]);

// Page JavaScript can ask for approval, but cannot fabricate a trusted input event.
// Consume one activation so a timer or a loop cannot open repeated approval windows.
let activationDeadline = 0;
const noteActivation = (event: Event) => { if (event.isTrusted) activationDeadline = performance.now() + 5_000; };
window.addEventListener('click', noteActivation, true);
window.addEventListener('keydown', noteActivation, true);

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
  const result = response && typeof response === 'object' && 'error' in response && !('id' in response)
    ? { error: typeof (response as { error?: unknown }).error === 'object' ? (response as { error: object }).error : { type: 'invalid-request', message: String((response as { error?: unknown }).error || 'Request failed.') } }
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
    const mutation = ['requestCors', 'disableCors', 'createRuleDraft', 'requestRule', 'enableRule', 'disableRule', 'deleteRule'].includes(request.method);
    const userActivated = activationDeadline > 0 && performance.now() <= activationDeadline;
    if (mutation) activationDeadline = 0;
    const response = await browser.runtime.sendMessage({
      type: 'sdkRequest',
      payload: { method: request.method, data: request.payload, userActivated },
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
