const EXTENSION_ID = {
  chrome: 'knhlkjdfmgkmelcjfnbbhpphkmjjacng',
  firefox: 'my-firefox-extension-id',
}

const globalObject: any = typeof globalThis !== 'undefined' ? globalThis : {}

const browserAPI = !!globalObject.chrome
  ? globalObject.chrome
  : !!globalObject.browser ? globalObject.browser : null;

async function sendMessage(params: any) {
  if (!browserAPI) throw new Error("unsupported browser");
  return new Promise((resolve) => {
    browserAPI.runtime.sendMessage(EXTENSION_ID.chrome, params, resolve);
  });
}