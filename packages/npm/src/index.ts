export interface IMessageData {
  /**
   * The type of message.
   */
  type: 'ext';
  /**
   * The message id for tracking requests
   */
  id: string;
  /**
   * The method to call on the extension.
   */
  method: string;
  /**
   * The parameters to pass to the method.
   */
  payload?: Record<string, any>;
}

export type IMessageResponse =
  | { id: string; type: 'response'; data?: any; error?: undefined }
  | {
      id: string;
      type: 'response';
      error: { message: string; type: string };
      data?: undefined;
    };

const EXT_FRAME_URL =
  process.env.NODE_ENV === 'development'
    ? `/message`
    : 'https://cors.forth.ink/message/index.html';

const EXTENSION_ID_MAP = {
  chrome: 'knhlkjdfmgkmelcjfnbbhpphkmjjacng',
  firefox: 'my-firefox-extension-id'
};

const IS_FIREFOX = /firefox/i.test(navigator.userAgent);

const EXTENSION_ID = IS_FIREFOX
  ? EXTENSION_ID_MAP.firefox
  : EXTENSION_ID_MAP.chrome;


/**
 * Error types that can be thrown by the CORS Unlocker API
 */
export type CorsErrorType = 
  | 'not-installed'           // Extension is not installed
  | 'forbidden-origin'        // Origin is not allowed to use the extension
  | 'rate-limit'              // Too many requests from this origin
  | 'user-cancel'             // User cancelled the operation
  | 'invalid-sender'          // Invalid message sender
  | 'missing-method'          // Missing method in message
  | 'missing-origin'          // Missing origin in payload
  | 'unsupported-origin'      // Unsupported origin protocol (only http/https allowed)
  | 'unsupported-method'      // Unsupported method
  | 'config-error'            // Extension configuration error
  | 'invalid-origin'          // Origin format is invalid
  | 'inner-error'             // Internal extension error
  | 'communication-failed'    // Failed to communicate with extension
  | 'unknown-error';          // Fallback for unexpected errors

/**
 * Custom error class for CORS Unlocker operations
 */
export class AppCorsError extends Error {
  readonly type: CorsErrorType;
  
  constructor(options: { type: CorsErrorType, message: string }) {
    super(options.message);
    this.type = options.type;
    this.name = 'AppCorsError';
  }
}

let framePromise: Promise<HTMLIFrameElement> | null = null;
let frameWin: Window | null = null;
let frameDom: HTMLIFrameElement | null = null;

function initFrame(): Promise<HTMLIFrameElement> {
  // if frameDom.isConnected is false, it means the frame is not in the document, need to reinitialize
  if (framePromise && (!frameDom || frameDom.isConnected)) return framePromise;

  framePromise = new Promise((resolve, reject) => {
    frameDom = document.createElement('iframe');
    frameDom.src = `${EXT_FRAME_URL}?origin=${encodeURIComponent(
      location.origin
    )}&extID=${encodeURIComponent(EXTENSION_ID)}`;
    frameDom.style.display = 'none';
    frameDom.className = 'cors-unlocker-frame';

    const cleanup = () => {
      window.removeEventListener('message', onInit);
      clearTimeout(timeoutId);
    };

    const onInit = (event: MessageEvent) => {
      if (event.source !== frameDom!.contentWindow ||
        !event.data ||
        event.data.type !== 'ext' ||
        event.data.method !== 'init'
      ) return;

      frameWin = frameDom!.contentWindow;
      cleanup();
      resolve(frameDom!);
    };

    const timeoutId = setTimeout(() => {
      cleanup();
      reject(
        new AppCorsError({
          type: 'communication-failed',
          message:
            'Frame initialization timeout - extension may not be installed or may not have permission to communicate with this origin'
        })
      );
    }, 10000);

    window.addEventListener('message', onInit);
    frameDom.onerror = () => {
      cleanup();
      reject(
        new AppCorsError({
          type: 'communication-failed',
          message: 'Frame failed to load'
        })
      );
    };

    document.body.appendChild(frameDom);
  });
  return framePromise;
}

let isEventInited = false;
const listenerMap: Record<string, [(data: any) => void, (error: AppCorsError) => void, NodeJS.Timeout | null]> = {};

function initEventMessage() {
  if (isEventInited) return;
  isEventInited = true;
  window.addEventListener('message', (event) => {
    const data = event.data as IMessageResponse;
    if (event.source !== frameWin) return;
    
    const callbacks = listenerMap[data.id];
    if (!callbacks) return;
    
    const [resolve, reject, timeoutId] = callbacks;
    delete listenerMap[data.id];
    if (timeoutId) clearTimeout(timeoutId);
    
    if (data.error) {
      reject(new AppCorsError({
        type: data.error.type as CorsErrorType,
        message: data.error.message
      }));
    } else {
      resolve(data.data);
    }
  });
}

interface ISendMessageParams {
  method: string;
  payload?: Record<string, any>;
}

async function sendMessage(params: ISendMessageParams) {
  try {
    await initFrame();
  } catch (error) {
    // Reset frame promise to allow retry
    framePromise = null;
    frameWin = null;
    throw error;
  }
  
  return new Promise((resolve, reject) => {
    if (!frameWin) {
      reject(new AppCorsError({ 
        type: 'communication-failed', 
        message: 'Frame window is not ready' 
      }));
      return;
    }
    
    const id = Math.random().toString(36).slice(2);
    const message: IMessageData = {
      id,
      ...params,
      type: 'ext',
    };
    initEventMessage();
    
    // For methods that require user interaction, don't set timeout to avoid race conditions
    // For other methods, use default 5 second timeout
    let timeoutId: NodeJS.Timeout | null = null;
    
    if (params.method !== 'enable') {
      timeoutId = setTimeout(() => {
        const callbacks = listenerMap[id];
        if (callbacks) {
          delete listenerMap[id];
          reject(new AppCorsError({ 
            type: 'communication-failed', 
            message: `Message timeout: ${params.method}` 
          }));
        }
      }, 5000);
    }
    
    listenerMap[id] = [
      (data: any) => resolve(data), 
      (error: AppCorsError) => reject(error),
      timeoutId
    ];
    
    try {
      frameWin.postMessage(message, '*');
    } catch (error) {
      const callbacks = listenerMap[id];
      if (callbacks) {
        if (callbacks[2]) clearTimeout(callbacks[2]);
        delete listenerMap[id];
      }
      // Reset frame for retry
      framePromise = null;
      frameWin = null;
      reject(new AppCorsError({ 
        type: 'communication-failed', 
        message: 'Failed to send message to frame' 
      }));
    }
  });
}

/**
 * Check whether the extension is installed
 * @returns Promise<boolean>
 * @throws {AppCorsError} When there's an error communicating with the extension infrastructure
 */
export function isExtInstalled(): Promise<boolean> {
  return sendMessage({ method: 'isInstalled' }) as Promise<boolean>;
}

/**
 * Open the extension's options page
 * @throws {AppCorsError} When the extension is not installed or fails to open options
 */
export async function openExtOptions(): Promise<void> {
  await sendMessage({ method: 'openOptions' });
}

/**
 * open the extension store page
 * * use it when the extension isn't installed
 */
export function openStorePage() {
  const url = IS_FIREFOX
    ? `https://addons.mozilla.org/en-US/firefox/addon/cors-unlocker/`
    : `https://chromewebstore.google.com/detail/${EXTENSION_ID}`;

  window.open(url, '_blank');
}

/**
 * Check whether CORS is enabled for the current page(tab)
 * @returns Promise<{ enabled: boolean, credentials: boolean }>
 * @throws {AppCorsError} When there's an error checking CORS status (except when extension is not installed)
 */
export async function isEnabled(): Promise<{ enabled: boolean, credentials: boolean }> {
  try {
    const result = await sendMessage({ method: 'isEnabled' }) as { enabled: boolean; credentials: boolean };
    return result;
  } catch (error) {
    // if the extension is not installed, return false instead of throwing an error
    if (error instanceof AppCorsError && error.type === 'not-installed') {
      return { enabled: false, credentials: false };
    }
    throw error;
  }
}

export interface IEnableOptions {
  /**
   * whether allow cors with credentials
   */
  credentials?: boolean;
  /**
   * reason of enabling CORS
   */
  reason?: string;
}

/**
 * Get extension configuration (internal use only)
 * @internal
 */
async function getExtConfig() {
  return await sendMessage({ method: 'getExtConfig' }) as { dftEnableCredentials: boolean };
}

/**
 * Enable CORS for the current page(tab)
 * Note: This method may require user confirmation and has no timeout limit to avoid race conditions.
 * The operation will complete when the user responds to the confirmation dialog or when a network/system timeout occurs.
 * @param options Configuration options for enabling CORS
 * @returns Promise<{ enabled: boolean, credentials: boolean }> The resulting CORS status
 * @throws {AppCorsError} When the extension is not installed, user cancels, or operation fails
 */
export async function enable(options?: IEnableOptions): Promise<{ enabled: boolean, credentials: boolean }> {
  let finalOptions = options;
  
  // If credentials is not explicitly set, use extension default
  if (!options || typeof options.credentials === 'undefined') {
    try {
      const config = await getExtConfig();
      finalOptions = {
        ...options,
        credentials: config.dftEnableCredentials
      };
    } catch (error) {
      // If config fetch fails, proceed with original options
      console.warn('Failed to get extension config, using provided options:', error);
    }
  }
  
  const result = await sendMessage({ method: 'enable', payload: finalOptions }) as { enabled: boolean; credentials: boolean };
  return result;
}

/**
 * Disable CORS for the current page(tab)
 * @returns Promise<void>
 * @throws {AppCorsError} When the extension is not installed or operation fails
 */
export async function disable(): Promise<void> {
  await sendMessage({ method: 'disable' });
}

export default {
  isExtInstalled,
  openExtOptions,
  openStorePage,
  isEnabled,
  enable,
  disable
}