import type {
  IMessageData,
  IMessageResponse,
  IEnableOptions,
} from 'browser-app-cors';
// @ts-expect-error chrome / browser is browser extension related object
const extObject: typeof chrome = typeof chrome !== 'undefined' ? chrome : typeof browser !== 'undefined' ? browser : null;

if (parent === window) {
  document.body.innerHTML =
    '<p>This page is intended to be embedded for internal communication.</p>';
} else {
  // tell the parent window that the extension is ready
  parent.postMessage({ type: 'ext', method: 'init' }, '*');
}

// get the basic config from the query string
const BASIC_CONFIG = (()=> {
  const query = new URLSearchParams(location.search);
  return {
    extID: query.get('extID'),
    origin: query.get('origin'),
  }
})();

// browser auto disconnect the port when the page is unloaded
let port: chrome.runtime.Port | null = null;

const disconnectPort = () => {
  if (!port) return
  port.disconnect();
  port = null;
}

const messageCallbacks = {
  isInstalled: async (payload?: { throw?: boolean}) => {
    const installed = !!extObject && !!extObject.runtime;
    if (!installed && payload?.throw) {
      throw {
        type: 'not-installed',
        message: 'extension not installed'
      };
    }
    return installed;
  },
  enable: async (options?: IEnableOptions) => {
    const rule: any = await sendMessage2ext('getRule');
    console.log('rule', rule);
    if (rule && !rule.disabled) {
      // already enabled, nothing to do
      if (!options || typeof options.credentials === 'undefined') return true;
      if (rule.credentials === options.credentials) return true;
    }
    // if the rule is disabled or
    //  or want to enable with different credentials
    if (!rule || rule.disabled || (!rule.credentials && options?.credentials)) {
      let message = '';
      if (!rule || rule.disabled) {
        message = `Current page("${origin}") is requesting to enable CORS`;
        if (options) {
          if (options.credentials) {
            message += ' with credentials.';
          } else {
            message += '.';
          }
          if (options.reason) {
            message += `\nMessage from current Page:\n\n${options.reason}\n\n`;
          }
        } else {
          message += '\n\n';
        }
        message +=
          'Please only enable CORS if you trust the current page.\nDo you want to enable CORS?';
      } else {
        message = 'Current page is requesting to enable CORS with credentials.';
        if (options?.reason) {
          message += `\nMessage from current Page:\n\n${options.reason}\n\n`;
        } else {
          message += '\n\n';
        }
        message +=
          'Please only enable CORS with credentials if you trust the current page. Do you want to continue?';
      }
      if (!confirm(message)) {
        throw {
          type: 'user-cancel',
          message: 'User canceled'
        };
      }
    }
    return sendMessage2ext('enable', options);
  },
  toggleChangeListener: async (payload) => {
    disconnectPort();
    if (payload?.enabled) {
      port = extObject.runtime.connect(BASIC_CONFIG.extID!);
      port.onDisconnect.addListener(disconnectPort);
      port.onMessage.addListener((message) => {
        sendMessage2frame({
          id: Math.random().toString(36).slice(2),
          type: 'onChange',
          data: message
        });
      });
    }
    return;
  }
} satisfies Record<string, (payload?: any) => Promise<any>>;

window.addEventListener('message', async (event) => {
  const data = event.data;
  console.log('frame message', data);
  // not the designated message
  if (!isMessageData(data)) return;
  // message type not supported yet
  if (data.type !== 'ext') return;
  const { method, payload } = data;
  try {
    // @ts-expect-error ignore type issues
    const callback = messageCallbacks[method]
    if (method !== 'isInstalled') {
      await messageCallbacks.isInstalled({ throw: true });
    }
    if (!BASIC_CONFIG.extID || !BASIC_CONFIG.origin) {
      throw {
        type: 'config-error',
        message: 'extID or origin not provided'
      }
    }
    try {
      new URL(BASIC_CONFIG.origin);
    } catch (error) {
      throw {
        type: 'invalid-origin',
        message: 'invalid origin'
      }
    }
    let response: any
    if (callback) {
      response = await callback(payload);
    } else {
      response = await sendMessage2ext(data.method, data.payload);
    }
    sendMessage2frame({
      id: data.id,
      type: 'response',
      data: response
    });
  } catch(error: any) {
    sendMessage2frame({
      id: data.id,
      type: 'response',
      error: error && typeof error === 'object' ? error : {
        message: error,
        type: 'inner-error'
      }
    });
  }
});

function sendMessage2ext(method: string, payload?: any) {
  return new Promise((resolve, reject) => {
    extObject.runtime.sendMessage(BASIC_CONFIG.extID, {
      method,
      payload: {
        ...payload,
        origin: BASIC_CONFIG.origin
      }
    }, (response: any) => {
      console.log('ext response', response);
      if (
        (response && typeof response === 'object') &&
        response.__mozWebExtensionPolyfillReject__
      ) {
        try {
          return reject(JSON.parse(response.message));
        } catch (error) {
          return reject(response.message);  
        }
        
      }
      resolve(response);
    })
  })
}

function isMessageData(data: any): data is IMessageData {
  return data && data.type && data.id && data.method;
}

function sendMessage2frame(data: IMessageData | IMessageResponse) {
  parent.postMessage(data, '*');
}