import type { IMessageData, IMessageResponse } from 'browser-app-cors';
// @ts-expect-error chrome / browser is browser extension related object
const extObject: typeof chrome = typeof chrome !== 'undefined' ? chrome : typeof browser !== 'undefined' ? browser : null;

if (parent === window) {
  document.body.innerHTML =
    '<p>This page is intended to be embedded for internal communication.</p>';
} else {
  // tell the parent window that the extension is ready
  parent.postMessage({ type: 'ext', method: 'init' }, '*');
}

let port: chrome.runtime.Port | null = null;

const disconnectPort = () => {
  if (port) {
    port.disconnect();
    port = null;
  }
}

window.addEventListener('unload', () => {
  disconnectPort();
});

window.addEventListener('message', (event) => {
  const data = event.data;
  console.log('frame message', data);
  // not the designated message
  if (!isMessageData(data)) return;
  // message type not supported yet
  if (data.type !== 'ext') return;
  const { method, payload } = data;
  // extension not installed
  if (!extObject || !extObject.runtime) {
    if (method === 'isInstalled' && (!payload || !payload.throw)) {
      return sendMessage({ id: data.id, type: 'response', data: false });
    }
    sendMessage({
      id: data.id,
      type: 'response',
      error: { message: 'extension not installed', type: 'not-installed' },
    });
    return;
  }
  if (method === 'isInstalled') {
    sendMessage({ id: data.id, type: 'response', data: true });
    return;
  }
  if (method === 'toggleChangeListener') {
    disconnectPort();
    if (payload?.enabled) {
      port = extObject.runtime.connect(payload.extID);
      port.onDisconnect.addListener(disconnectPort);
      port.onMessage.addListener((message) => {
        sendMessage({
          id: Math.random().toString(36).slice(2),
          type: 'onChange',
          data: message,
        });
      });
    }
    return;
  }

  extObject.runtime.sendMessage(data.extId, {
    method,
    payload,
  }, (response: any) => {
    console.log('message from chrome', response);
    if (typeof response === 'object' && response.__mozWebExtensionPolyfillReject__) {
      sendMessage({
        id: data.id,
        type: 'response',
        error: {
          message: response.message,
          type: 'inner-error',
        },
      });
      return
    }
    sendMessage({
      id: data.id,
      type: 'response',
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