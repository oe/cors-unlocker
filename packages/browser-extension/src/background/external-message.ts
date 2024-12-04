import browser from 'webextension-polyfill';
export function onExternalMessage(
  message: any,
  sender: browser.Runtime.MessageSender
) {
  console.log('onExternalMessage', message, sender);
  if (message.type === 'ping') {
    return Promise.resolve('pong');
  }
  return Promise.reject(new Error('unknown message type'));
}
