import type { IMessageData, IMessageResponse } from 'browser-app-cors';
// @ts-expect-error chrome / browser is browser extension related object
const extObject = typeof chrome !== 'undefined' ? chrome : typeof browser !== 'undefined' ? browser : null;

if (parent === window) {
  document.body.innerHTML =
    '<p>This page is intended to be embedded for internal communication.</p>';
} else {
  // tell the parent window that the extension is ready
  parent.postMessage({ type: 'ext', method: 'init' }, '*');
}
window.addEventListener('message', (event) => {
  const data = event.data;
  console.log('message', data);
  // not the designated message
  if (!isMessageData(data)) return;
  // message type not supported yet
  if (data.type !== 'ext') return;
  const { method, payload } = data;
  // extension not installed
  if (!extObject || !extObject.runtime) {
    if (method === 'isInstalled' && (!payload || !payload.throw)) {
      return sendMessage({ id: data.id, data: false });
    }
    sendMessage({
      id: data.id,
      error: { message: 'extension not installed', type: 'not-installed' },
    });
    return;
  }
  if (method === 'isInstalled') {
    sendMessage({ id: data.id, data: true });
    return;
  }
  extObject.runtime.sendMessage(data.extId, {
    method,
    payload,
  }, (response: any) => {
    console.log('response', response);
    if (typeof response === 'object' && response.__mozWebExtensionPolyfillReject__) {
      sendMessage({
        id: data.id,
        error: {
          message: response.message,
          type: 'inner-error',
        },
      });
      return
    }
    sendMessage({
      id: data.id,
      data: response,
    });
  });
});

function isMessageData(data: any): data is IMessageData {
  return data && data.type && data.id && data.extId && data.method;
}

function sendMessage(data: IMessageData | IMessageResponse) {
  parent.postMessage(data, '*');
}