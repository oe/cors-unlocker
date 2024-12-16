
export interface IMessageData {
  /**
   * The type of message.
   */
  type: 'ext';
  /**
   * The message id
   */
  id: string;
  /**
   * The extension id.
   */
  extId: string;
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
  | { id: string; data?: any; error?: undefined }
  | { id: string; error: { message: string; type: string }; data?: undefined };

const EXT_FRAME_URL =
  process.env.NODE_ENV === 'development'
    ? '/message/index.html'
    : 'https://cors.forth.ink/message/index.html';

const EXTENSION_ID_MAP = {
  chrome: 'knhlkjdfmgkmelcjfnbbhpphkmjjacng',
  firefox: 'my-firefox-extension-id'
};

const IS_FIREFOX = navigator.userAgent.includes('firefox');

const EXTENSION_ID = IS_FIREFOX
  ? EXTENSION_ID_MAP.firefox
  : EXTENSION_ID_MAP.chrome;


class AppCorsError extends Error {
  readonly type: string;
  constructor(options: { type: string, message: string }) {
    super(options.message);
    this.type = options.type;
    this.name = 'AppCorsError';
  }
}

let framePromise: Promise<HTMLIFrameElement> | null = null;
let frameWin: Window | null = null;

async function initFrame() {
  if (framePromise) return framePromise;
  framePromise = new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.src = EXT_FRAME_URL;
    const onInit = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow) return;
      window.removeEventListener('message', onInit);
      resolve(frame);
    };
    window.addEventListener('message', onInit);
    frame.onload = () => {
      console.log('frame loaded');
      frameWin = frame.contentWindow;
    };
    frame.onerror = reject;
    frame.style.display = 'none';
    document.body.appendChild(frame);
    return frame;
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
      reject(new AppCorsError(data.error));
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
  return new Promise((resolve, reject) => {
    if (!frameWin) {
      reject(new Error('frameWin is not ready'));
    }
    const id = Math.random().toString(36).slice(2);
    const message: IMessageData = {
      id,
      ...params,
      type: 'ext',
      extId: EXTENSION_ID
    };
    initEventMessage();
    listenerMap[id] = [resolve, reject];
    frameWin!.postMessage(message, '*');
  });
}

/**
 * Check whether the extension is installed
 * @returns Promise<boolean>
 */
export async function isExtInstalled() {
  await initFrame();
  return sendMessage({ method: 'isInstalled' });
}

/**
 * Open the extension's options page
 */
export async function openExtOptions() {
  await initFrame();
  return sendMessage({ method: 'openOptions' });
}

/**
 * open the extension store page
 * * use it when the extension isn't installed
 */
export function openStorePage() {
  const url = IS_FIREFOX
    ? `https://addons.mozilla.org/en-US/firefox/addon/browser-app-cors/`
    : `https://chromewebstore.google.com/detail/${EXTENSION_ID}`;

  window.open(url, '_blank');
}

/**
 * Check whether CORS is enabled for the current page(tab)
 * @returns Promise<{ enabled: boolean, credentials: boolean }>
 */
export async function isEnabled() {
  await initFrame();
  return sendMessage({ method: 'isEnabled' });
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
 */
export async function enable(options?: IEnableOptions) {
  await initFrame();
  const rule: any = await sendMessage({ method: 'getRule'});
  if (rule && !rule.disabled) {
    // already enabled, nothing to do
    if (!options || typeof options.credentials === 'undefined') return true;
    if (rule.credentials === options.credentials) return true;
  }
  // if the rule is disabled or 
  //  or want to enable with different credentials
  if (rule.disabled || (!rule.credentials && options?.credentials)) {
    let message = ''
    if (rule.disabled) {
      message = `Current page(${origin}) is requesting to enable CORS`;
      if (options) {
        if (options.credentials) {
          message += ' with credentials.';
        } else {
          message += '.';
        }
        if (options.reason) {
          message += `\nMessage from current Page:\n\n${options.reason}\n\n`;
        }
      }
      message += 'Please only enable CORS if you trust the current page.\nDo you want to enable CORS?';
    } else {
      message = 'Current page is requesting to enable CORS with credentials.';
      if (options?.reason) {
        message += `\nMessage from current Page:\n\n${options.reason}\n\n`;
      }
      message += 'Please only enable CORS with credentials if you trust the current page. Do you want to continue?';
    }
    if (!confirm(message)) {
      throw new AppCorsError({ type: 'user-cancel', message: 'User canceled' });
    }
  }
  return sendMessage({ method: 'enable', payload: options });
}

/**
 * Disable CORS for the current page(tab)
 */
export async function disable() {
  await initFrame();
  return sendMessage({ method: 'disable' });
}

export default {
  isExtInstalled,
  openExtOptions,
  openStorePage,
  isEnabled,
  enable,
  disable
}