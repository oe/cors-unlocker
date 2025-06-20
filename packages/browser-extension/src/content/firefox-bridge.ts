/**
 * Firefox Content Script Bridge
 * Bridges communication between web pages and extension background script
 * This is needed because Firefox doesn't support externally_connectable
 */

// Use Firefox's native browser API (no polyfill needed)
declare const browser: typeof chrome;

// Debug logging for development
const DEBUG = import.meta.env.MODE === 'development';

const script = document.createElement('script');
script.textContent = `
  window.__cors_unlocker_ready__ = true;
`;
document.documentElement.appendChild(script);
script.remove(); // 注入后可以删除标签

function log(...args: any[]) {
  if (DEBUG) {
    console.log('[Firefox Bridge]', ...args);
  }
}

function logError(...args: any[]) {
  console.error('[Firefox Bridge]', ...args);
}

// Track pending messages to avoid memory leaks
const pendingMessages = new Map<string, {
  resolve: (value: any) => void;
  reject: (error: any) => void;
  timestamp: number;
}>();

// Clean up old pending messages (timeout after 30 seconds)
setInterval(() => {
  const now = Date.now();
  for (const [id, pending] of pendingMessages.entries()) {
    if (now - pending.timestamp > 30000) {
      pending.reject({
        type: 'timeout',
        message: 'Message timeout'
      });
      pendingMessages.delete(id);
    }
  }
}, 5000);

/**
 * Listen for messages from the web page
 */
window.addEventListener('message', async (event) => {
  // Only accept messages from the same window
  if (event.source !== window) return;
  const data = event.data;
  // Ignore non-extension messages
  if (!data || data.type !== 'to-cs') return;
  log('Received message from page:', data);

  const { id, method, payload } = data;
  
  if (!id || !method) {
    logError('Invalid message format:', data);
    return;
  }

  try {
    // Forward message to background script
    log('Sending message to background:', { method, payload });
    const response = await browser.runtime.sendMessage({
      method,
      payload
    });

    log('Received response from background:', response);

    // Send response back to page
    window.postMessage({
      id,
      type: 'from-cs',
      data: response
    }, '*');

  } catch (error: any) {
    logError('Error forwarding message to background:', error);
    
    // Handle Firefox specific error format
    let errorObj = error;
    if (error && typeof error === 'object' && error.__mozWebExtensionPolyfillReject__) {
      try {
        errorObj = JSON.parse(error.message);
      } catch {
        errorObj = { message: error.message, type: 'communication-error' };
      }
    } else if (typeof error === 'string') {
      try {
        errorObj = JSON.parse(error);
      } catch {
        errorObj = { message: error, type: 'communication-error' };
      }
    } else if (error instanceof Error) {
      errorObj = { message: error.message, type: 'communication-error' };
    } else {
      // Fallback for unknown error types
      errorObj = { message: 'Unknown error occurred', type: 'communication-error' };
    }

    // Send error response back to page
    window.postMessage({
      id,
      type: 'from-cs',
      error: errorObj
    }, '*');
  }
});
