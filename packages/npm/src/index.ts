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

const IS_FIREFOX = navigator.userAgent.includes('firefox');

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

function initFrame() {
  // if frameDom.isConnected is false, it means the frame is not in the document, need to reinitialize
  if (framePromise && (!frameDom || frameDom.isConnected)) return framePromise;

  framePromise = new Promise((resolve, reject) => {
    if (process.env.NODE_ENV === 'development') console.log('Initializing frame with URL:', EXT_FRAME_URL);
    if (process.env.NODE_ENV === 'development') console.log('Extension ID:', EXTENSION_ID);
    if (process.env.NODE_ENV === 'development') console.log('Current origin:', location.origin);
    
    frameDom = document.createElement('iframe');
    frameDom.src = `${EXT_FRAME_URL}?origin=${encodeURIComponent(
      location.origin
    )}&extID=${encodeURIComponent(EXTENSION_ID)}`;
    
    if (process.env.NODE_ENV === 'development') console.log('Frame src:', frameDom.src);
    
    let timeoutId: NodeJS.Timeout;
    
    const onInit = (event: MessageEvent) => {
      if (process.env.NODE_ENV === 'development') console.log('Frame message received:', event.data, 'from:', event.origin);
      if (event.source !== frameDom!.contentWindow) return;
      if (event.data?.type === 'ext' && event.data?.method === 'init') {
        if (process.env.NODE_ENV === 'development') console.log('Frame initialized successfully');
        frameWin = frameDom!.contentWindow;
        window.removeEventListener('message', onInit);
        clearTimeout(timeoutId);
        resolve(frameDom!);
      }
    };
    
    window.addEventListener('message', onInit);
    frameDom!.onerror = (error) => {
      clearTimeout(timeoutId);
      reject(error);
    };
    
    // Add timeout to prevent infinite waiting
    timeoutId = setTimeout(() => {
      console.error('Frame initialization timeout');
      window.removeEventListener('message', onInit);
      reject(new AppCorsError({ 
        type: 'communication-failed', 
        message: 'Frame initialization timeout - extension may not be installed or may not have permission to communicate with this origin' 
      }));
    }, 10000); // 10 second timeout
    
    frameDom!.style.display = 'none';
    document.body.appendChild(frameDom!);
  });
  return framePromise;
}

let isEventInited = false;
const listenerMap: Record<string, [Function, Function]> = {};

function initEventMessage() {
  if (isEventInited) return;
  isEventInited = true;
  window.addEventListener('message', (event) => {
    const data = event.data as IMessageResponse;
    if (event.source !== frameWin) return;
    
    const callbacks = listenerMap[data.id];
    if (!callbacks) return;
    delete listenerMap[data.id];
    const [resolve, reject] = callbacks;
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
    
    // Add timeout for individual messages
    const timeoutId = setTimeout(() => {
      if (listenerMap[id]) {
        delete listenerMap[id];
        reject(new AppCorsError({ 
          type: 'communication-failed', 
          message: `Message timeout: ${params.method}` 
        }));
      }
    }, 5000); // 5 second timeout for individual messages
    
    listenerMap[id] = [
      (data: any) => {
        clearTimeout(timeoutId);
        resolve(data);
      }, 
      (error: any) => {
        clearTimeout(timeoutId);
        reject(error);
      }
    ];
    
    try {
      frameWin!.postMessage(message, '*');
    } catch (error) {
      clearTimeout(timeoutId);
      delete listenerMap[id];
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
 * Enable CORS for the current page(tab)
 * @param options Configuration options for enabling CORS
 * @throws {AppCorsError} When the extension is not installed, user cancels, or operation fails
 */
/**
 * Enable CORS for the current page(tab)
 * @param options Configuration options for enabling CORS
 * @throws {AppCorsError} When the extension is not installed, user cancels, or operation fails
 */
export async function enable(options?: IEnableOptions): Promise<void> {
  await sendMessage({ method: 'enable', payload: options });
}

/**
 * Disable CORS for the current page(tab)
 * @throws {AppCorsError} When the extension is not installed or operation fails
 */
/**
 * Disable CORS for the current page(tab)
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