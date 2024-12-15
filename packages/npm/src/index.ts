
const EXT_FRAME_URL = 'https://cors.forth.ink/message/index.html';

const EXTENSION_ID_MAP = {
  chrome: 'knhlkjdfmgkmelcjfnbbhpphkmjjacng',
  firefox: 'my-firefox-extension-id',
}

const IS_FIREFOX = navigator.userAgent.includes('firefox')

const EXTENSION_ID = IS_FIREFOX
  ? EXTENSION_ID_MAP.firefox
  : EXTENSION_ID_MAP.chrome;

let framePromise: Promise<HTMLIFrameElement> | null = null;
let frameWin: Window | null = null;

async function initFrame() {
  if (framePromise) return framePromise;
  framePromise = new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.src = EXT_FRAME_URL;
    frame.onload = () => {
      frameWin = frame.contentWindow;
      resolve(frame);
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
    const data = event.data;
    if (event.source !== frameWin) return;
    const callbacks = listenerMap[data.id];
    if (!callbacks) return;
    delete listenerMap[data.id];
    const [resolve, reject] = callbacks;
    if (data.error) {
      reject(new Error(data.error));
    } else {
      resolve(data);
    }
  });
}

interface ISendMessageParams {
  method: string;
  data?: Record<string, any>;
}

async function sendMessage(params: ISendMessageParams) {
  return new Promise((resolve, reject) => {
    if (!frameWin) {
      reject(new Error('frameWin is not ready'));
    }
    const id = Math.random().toString(36).slice(2);
    const message = { id, ...params, type: 'ext', extId: EXTENSION_ID };
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

  window.open(url, '_blank')
}

/**
 * Check whether CORS is enabled for the current page(tab)
 * @returns Promise<{ enabled: boolean, credentials: boolean }>
 */
export async function isEnabled() {
  await initFrame();
  return sendMessage({ method: 'isEnabled'});
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
  return sendMessage({ method: 'enable', data: options });
}

/**
 * Disable CORS for the current page(tab)
 */
export async function disable() {
  await initFrame();
  return sendMessage({ method: 'disable' });
}
