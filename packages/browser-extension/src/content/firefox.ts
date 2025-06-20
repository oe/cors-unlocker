// content.js
window.addEventListener('message', (event) => {
  if (event.source !== window) return;

  if (event.data && event.data.type === 'FROM_PAGE') {
    chrome.runtime.sendMessage({
      type: 'FROM_PAGE',
      payload: event.data.payload
    });
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  window.postMessage({ type: 'FROM_EXTENSION', payload: msg }, '*');
});
