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
  | { id: string; type: 'onChange'; data?: any; error?: undefined }
  | {
      id: string;
      type: 'response';
      error: { message: string; type: string };
      data?: undefined;
    };

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

function initFrame() {
  if (framePromise) return framePromise;
  framePromise = new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.src = `${EXT_FRAME_URL}?origin=${encodeURIComponent(
      location.origin
    )}&extID=${encodeURIComponent(EXTENSION_ID)}`;
    const onInit = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow) return;
      frameWin = frame.contentWindow;
      window.removeEventListener('message', onInit);
      resolve(frame);
    };
    window.addEventListener('message', onInit);
    frame.onerror = reject;
    frame.style.display = 'none';
    document.body.appendChild(frame);
  });
  return framePromise;
}



export type IOnChangeListener = (changed: { enabled: boolean, credentials: boolean }) => void;

const onChangeCallbacks = new Set<IOnChangeListener>();

/**
 * Listen the change of CORS status
 */
export const onChange = {
  addListener(callback: IOnChangeListener) {
    if (!onChangeCallbacks.size) {
      initFrame()
        .then(() => toggleChangeListener(true))
        .catch(console.error);;
    }
    onChangeCallbacks.add(callback);
  },
  removeListener(callback?: IOnChangeListener) {
    if (!callback) {
      onChangeCallbacks.clear();
    } else {
      onChangeCallbacks.delete(callback);
    }
    if (onChangeCallbacks.size === 0) {
      initFrame()
        .then(() => toggleChangeListener(false))
        .catch(console.error);
    }
  }
};

function toggleChangeListener(enabled: boolean) {
  return sendMessage({
    method: 'toggleChangeListener',
    payload: { enabled }
  });
}

let isEventInited = false;
const listenerMap: Record<string, [Function, Function]> = {};

function initEventMessage() {
  if (isEventInited) return;
  isEventInited = true;
  window.addEventListener('message', (event) => {
    const data = event.data as IMessageResponse;
    if (event.source !== frameWin) return;
    console.log('npm message event', data);
    if (data.type === 'onChange') {
      onChangeCallbacks.forEach((callback) => {
        callback(data.data);
      });
      return;
    }
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
  await initFrame();
  return new Promise((resolve, reject) => {
    if (!frameWin) {
      reject(new Error('frameWin is not ready'));
    }
    const id = Math.random().toString(36).slice(2);
    const message: IMessageData = {
      id,
      ...params,
      type: 'ext',
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
export function isExtInstalled() {
  return sendMessage({ method: 'isInstalled' }) as Promise<boolean>;
}

/**
 * Open the extension's options page
 */
export function openExtOptions() {
  return sendMessage({ method: 'openOptions' }) as Promise<void>;
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
 */
export async function isEnabled() {
  try {
    const result = await sendMessage({ method: 'isEnabled' }) as Promise<
      false | { enabled: true; credentials: boolean }
    >;
    return result;
  } catch (error) {
    // if the extension is not installed, return false instead of throwing an error
    if (error instanceof AppCorsError && error.type === 'not-installed') {
      return false;
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
 */
export function enable(options?: IEnableOptions) {
  return sendMessage({ method: 'enable', payload: options }) as Promise<boolean>;
}

/**
 * Disable CORS for the current page(tab)
 */
export function disable() {
  return sendMessage({ method: 'disable' }) as Promise<boolean>;
}

export default {
  isExtInstalled,
  openExtOptions,
  openStorePage,
  isEnabled,
  onChange,
  enable,
  disable
}