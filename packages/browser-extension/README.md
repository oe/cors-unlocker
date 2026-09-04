# Forth Intercept browser extension

Forth Intercept 2.0 is a browser-native request lab for Chrome and Firefox, built on Manifest V3.

## Execution paths

- Rules mode uses `declarativeNetRequest` for CORS, request/response headers, redirects, and blocking without a debugging banner.
- Advanced mode uses the tab-scoped Chrome DevTools Protocol `Fetch` domain for inspection, preflight/response repair, static mocks, delays, and network failures. Chrome shows its standard debugging disclosure while attached.
- Firefox Intercept mode uses blocking `webRequest` listeners for inspection, headers, redirect, block, delay, failure simulation, and response-body replacement. Body mocks preserve the server HTTP status and require an actual response.
- The page bridge exposes the origin-scoped `forth-intercept` npm SDK. It derives scope from the browser sender tab, confirms CORS changes, creates only disabled rule drafts, and never exposes silent debugger attachment.

## Upgrade

The Chrome manifest key and Firefox Gecko ID remain unchanged so browser upgrades retain v1 storage. First startup migrates v1 `allowedOrigins` and `extConfig` into `proxyAppState`, retains `legacyBackupV1`, verifies the write, and then uses only v2 state.

## Develop and verify

```bash
pnpm --filter browser-cors-unlocker dev
pnpm --filter browser-cors-unlocker check
pnpm --filter browser-cors-unlocker package:chrome
pnpm --filter browser-cors-unlocker check:firefox
```

When Playwright's bundled browser is unavailable, provide a Chrome for Testing binary through `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

Production archives are written to `dist/forth-intercept-chrome-v2.0.0.zip` and `dist/forth-intercept-firefox-v2.0.0.zip`.

## Privacy boundary

Rules are stored locally. Traffic logs are in-memory. Sensitive headers are redacted by default. Interception stops on disable, tab close, and top-level cross-origin navigation; Chrome also detaches when another debugger takes over.
