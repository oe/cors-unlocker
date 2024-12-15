interface IMessageData {
  /**
   * The type of message.
   */
  type: 'ext',
  /**
   * The message id
   */
  id: string,
  /**
   * The extension id.
   */
  extId: string,
  /**
   * The method to call on the extension.
   */
  method: string,
  /**
   * The parameters to pass to the method.
   */
  data?: Record<string, any>,
}
// @ts-expect-error chrome / browser is browser extension related object
const extObject = typeof chrome !== 'undefined' ? chrome : typeof browser !== 'undefined' ? browser : null;

console.log('xxx', extObject);

if (parent === window) {
  document.body.innerHTML =
    '<p>This page is intended to be embedded in an extension popup or options page.</p>';
}
window.addEventListener('message', (event) => {
  const data = event.data;
  // not the designated message
  if (!isMessageData(data)) return;
  // message type not supported yet
  if (data.type !== 'ext') return;
  // extension not installed
  if (!extObject || !extObject.runtime) {
    sendMessage({
      type: 'ext',
      id: data.id,
      extId: data.extId,
      method: data.method,
      data: { error: 'unsupported browser' },
    });
    return;
  }
  extObject.runtime.sendMessage(data.extId, data.data || {}, (response: any) => {
    sendMessage({
      type: 'ext',
      id: data.id,
      extId: data.extId,
      method: data.method,
      data: response,
    });
  });
});

function isMessageData(data: any): data is IMessageData {
  return data && data.type && data.id && data.extId && data.method;
}


function sendMessage(data: IMessageData) {
  parent.postMessage(data, '*');
}