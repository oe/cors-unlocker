export type BrowserTarget = 'chrome' | 'firefox';

export type InterceptCapabilities = ReturnType<typeof capabilitiesFor>;

export function capabilitiesFor(target: BrowserTarget) {
  const isChrome = target === 'chrome';
  return {
    protocolVersion: 2 as const,
    product: 'Forth Intercept' as const,
    browser: target,
    cors: true as const,
    draftRules: true as const,
    workspace: true as const,
    advancedMode: 'user-initiated' as const,
    interception: {
      responseMock: isChrome ? 'synthetic' as const : 'body-replacement' as const,
      preflight: isChrome ? 'synthetic' as const : 'headers-only' as const,
      networkFailure: isChrome ? 'reasoned' as const : 'cancel' as const,
      resourceTypes: isChrome ? 'distinct-fetch-xhr' as const : 'combined-fetch-xhr' as const,
    },
  };
}

export const BROWSER_TARGET: BrowserTarget = typeof __TARGET__ === 'string' && __TARGET__ === 'firefox'
  ? 'firefox'
  : 'chrome';
export const PRODUCT_CAPABILITIES = capabilitiesFor(BROWSER_TARGET);
