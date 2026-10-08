import type browser from 'webextension-polyfill';

/** The packaged SDK bridge and the legacy hosted-site bridge share Firefox's listener. */
export function createFirefoxMessageRouter(
  internal: (message: any, sender: browser.Runtime.MessageSender) => Promise<any>,
  external: (message: any, sender: browser.Runtime.MessageSender) => Promise<any>,
  extensionRoot: string,
) {
  return (message: any, sender: browser.Runtime.MessageSender) => {
    if (sender.url?.startsWith(extensionRoot)) return internal(message, sender);
    if (sender.tab && sender.url && message?.type === 'sdkRequest') return internal(message, sender);
    if (sender.tab && sender.url && !message?.type) return external(message, sender);
    return Promise.resolve();
  };
}
