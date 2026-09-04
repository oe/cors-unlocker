# Forth Intercept architecture

Forth Intercept is a browser-native request lab for Chrome and Firefox with four cooperating packages:

- `packages/browser-extension` owns request interception, local rule storage, the traffic inspector, and the page capability bridge.
- `packages/npm` is the canonical application-facing SDK published as `forth-intercept`.
- `packages/npm-compat` preserves the published `cors-unlocker` name as a thin re-export.
- `packages/website` is the product site, documentation, privacy page, and SDK playground.

## Execution paths

Common rules compile to Chrome `declarativeNetRequest`. This path covers CORS, request and response headers, redirects, and blocking without attaching a debugger.

Advanced mode attaches Chrome DevTools Protocol `Fetch` to one user-selected tab. It supports inspection, complete preflight repair, static mocks, delays, and simulated failures. Chrome shows its standard debugging disclosure while attached. The extension detaches on disable, tab close, debugger takeover, or cross-origin top-level navigation.

Firefox Intercept mode uses blocking `webRequest` listeners for observation, headers, redirects, cancellation, and delay. `filterResponseData` replaces response bodies while preserving the server's original HTTP status. It uses install-time Firefox permissions instead of a debugger attachment.

## Local data and migration

`proxyAppState` is the only live v2 configuration. On first v2 startup, legacy `allowedOrigins` and `extConfig` values are converted once, validated, and stored alongside a `legacyBackupV1` recovery snapshot. Old keys are not read or dual-written afterward.

Rules persist in `chrome.storage.local`. Traffic logs are held in memory and disappear when the extension service worker stops. Sensitive authorization and cookie headers are masked in the inspector.

## SDK trust boundary

The content script accepts SDK messages only from the top-level page and passes them to the extension runtime. The background derives the caller origin from Chrome's trusted sender metadata, rate-limits requests, and never accepts an arbitrary target origin from page JavaScript.

The SDK can connect, read current-origin status, request CORS access with an extension-owned confirmation, disable that origin's CORS rule, create a disabled origin-scoped rule draft, and open the workspace. It cannot attach CDP, enable drafts, read captured traffic, target another origin, or execute arbitrary JavaScript.

See [`docs/product-v2.md`](docs/product-v2.md) for the positioning and product gates, and [`README.md`](README.md) for build and verification commands.
