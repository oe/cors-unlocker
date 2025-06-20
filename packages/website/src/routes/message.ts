import type {
  IMessageData,
  IMessageResponse,
  IEnableOptions,
} from 'cors-unlocker';

// Browser detection
const IS_FIREFOX = /firefox/i.test(navigator.userAgent);

// @ts-expect-error chrome / browser is browser extension related object
const extObject: typeof chrome = typeof chrome !== 'undefined' ? chrome : typeof browser !== 'undefined' ? browser : null;

// event callbacks map for Firefox bridge
const EVENT_CALLBACKS_MAP: Record<
  string,
  [(v: any) => void, (v: any) => void]
> = {};

if (parent === window) {
  document.body.innerHTML = '<p>This page is intended to be embedded for internal communication.</p>';
} else {
  // tell the parent window that the page is ready
  parent.postMessage({ type: 'from-page', method: 'init' }, '*');
}

// get the basic config from the query string
const BASIC_CONFIG = (() => {
  const query = new URLSearchParams(location.search);
  return {
    extID: query.get('extID'),
    origin: query.get('origin'),
  }
})();

const messageCallbacks = {
  isInstalled: async (payload?: { throw?: boolean}) => {
    // In Firefox, check if bridge is ready instead of extObject
    if (IS_FIREFOX) {
      console.warn('Using Firefox bridge, checking if bridge is ready');
      // @ts-expect-error __cors_unlocker_ready__ is injected by the content script
      return !!window.__cors_unlocker_ready__;
    }
    // Chrome/Edge: Basic check for extension API availability
    const hasExtAPI = !!extObject && !!extObject.runtime;
    if (!hasExtAPI) {
      if (payload?.throw) {
        throw {
          type: 'not-installed',
          message: 'browser extension API not available'
        };
      }
      return false;
    }
    // If extID is not provided, can only do basic check
    if (!BASIC_CONFIG.extID) {
      if (payload?.throw) {
        throw {
          type: 'config-error',
          message: 'extID not provided'
        };
      }
      return false;
    }

    // Verify if the specific extension ID is installed and available
    try {
      await sendMessage2ext('ping', {}, 2000);
      return true;
    } catch {
      if (payload?.throw) {
        throw {
          type: 'not-installed',
          message: `extension with ID ${BASIC_CONFIG.extID} not installed or not responding`
        };
      }
      return false;
    }
  },
  enable: async (options?: IEnableOptions) => {
    const rule: any = await sendMessage2ext('getRule');
    if (rule && !rule.disabled) {
      // already enabled, nothing to do
      if (!options || typeof options.credentials === 'undefined') return { enable: true, credentials: rule.credentials };
      if (rule.credentials === options.credentials) return { enabled: true, credentials: rule.credentials };
    }

    const origin = BASIC_CONFIG.origin;
    // oly confirm when rule is not found or disabled or no credentials set
    // if downgrade from credentials to no credentials, there is no need to confirm
    if (!rule || rule.disabled || !rule.credentials) {
      let message = `Current page("${origin}") is requesting to enable CORS`;
      message += options?.credentials ? ' **with credentials**.' : '.';
      message += options?.reason
        ? `\n\nMessage from current Page:\n${options.reason}\n\n`
        : '\n\n';

      message +=
        'Please only enable CORS with credentials if you trust the current page. Do you want to continue?';

      if (!confirm(message)) {
        throw {
          type: 'user-cancel',
          message: 'User canceled'
        };
      }
    }

    return sendMessage2ext('enable', options);
  }
} satisfies Record<string, (payload?: any) => Promise<any>>;

window.addEventListener('message', async (event) => {
  const data = event.data;
  if (!data) return;
  // message from content script bridge
  if (data.type === 'from-cs' && event.source === window) {
    const eventItem = EVENT_CALLBACKS_MAP[data.id];
    if (!eventItem) return;
    const [resolve, reject] = eventItem;
    if (data.error) {
      return reject(data.error);
    }
    return resolve(data.data);
  }
  // not the designated message
  if (!isMessageData(data) || data.type !== 'from-npm') return;
  
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
    } catch {
      throw {
        type: 'invalid-origin',
        message: 'invalid origin'
      }
    }
    
    const response = callback ? await callback(payload) : await sendMessage2ext(method, payload);
    
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

function sendMessage2ext(method: string, payload?: any, timeout?: number) {
  // In Firefox, use window.postMessage to communicate with content script bridge
  if (IS_FIREFOX) {
    return sendMessage2extViaContentScript(method, payload, timeout);
  }

  // Chrome/Edge: use direct extension messaging
  return new Promise((resolve, reject) => {
    extObject.runtime.sendMessage(BASIC_CONFIG.extID, {
      method,
      payload: {
        ...payload,
        origin: BASIC_CONFIG.origin
      }
    }, (response: any) => {
      if (
        (response && typeof response === 'object') &&
        response.__mozWebExtensionPolyfillReject__
      ) {
        try {
          return reject(JSON.parse(response.message));
        } catch {
          return reject(response.message);  
        }
      }
      
      // Check for runtime errors (connection issues)
      if (extObject.runtime.lastError) {
        return reject({
          type: 'communication-failed',
          message: extObject.runtime.lastError.message || 'Connection failed'
        });
      }
      
      resolve(response);
    })
    if (timeout) {
      setTimeout(() => {
        reject({
          type: 'timeout',
          message: `Message "${method}" timed out after ${timeout}ms`
        });
      }, timeout);
    }
  })
}

function sendMessage2extViaContentScript(method: string, payload?: any, timeout?: number) {
  return new Promise((resolve, reject) => {
    const id = Math.random().toString(36).substring(2, 15);
    EVENT_CALLBACKS_MAP[id] = [resolve, reject];
    window.postMessage({
      type: 'to-cs',
      id,
      method,
      payload: {
        ...payload,
        origin: BASIC_CONFIG.origin
      }
    }, '*');
    if (timeout) {
      setTimeout(() => {
        if (!EVENT_CALLBACKS_MAP[id]) return;
        const [_, rejectFn] = EVENT_CALLBACKS_MAP[id];
        delete EVENT_CALLBACKS_MAP[id];
        rejectFn({
          type: 'timeout',
          message: `Message "${method}" timed out after ${timeout}ms`
        });
      }, timeout);
    }  
  })
}


function isMessageData(data: any): data is IMessageData {
  return data && data.type && data.id && data.method;
}

function sendMessage2frame(data: IMessageData | IMessageResponse) {
  parent.postMessage(data, '*');
}