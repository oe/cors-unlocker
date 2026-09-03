# Forth Intercept — Chrome extension

Forth Intercept 2.0 is a Chrome-native request lab built on Manifest V3.

## Execution paths

- Rules mode uses `declarativeNetRequest` for CORS, request/response headers, redirects, and blocking without a debugging banner.
- Advanced mode uses the tab-scoped Chrome DevTools Protocol `Fetch` domain for inspection, preflight/response repair, static mocks, delays, and network failures. Chrome shows its standard debugging disclosure while attached.
- The page bridge exposes the origin-scoped `cors-unlocker` npm SDK. It derives scope from Chrome's sender tab, confirms CORS changes, creates only disabled rule drafts, and never exposes silent CDP attachment.

## Upgrade

The manifest key remains unchanged so Chrome preserves the extension ID. First startup migrates v1 `allowedOrigins` and `extConfig` into `proxyAppState`, retains `legacyBackupV1`, verifies the write, and then uses only v2 state.

## Develop and verify

```bash
pnpm --filter browser-cors-unlocker dev
pnpm --filter browser-cors-unlocker check
pnpm --filter browser-cors-unlocker package:chrome
```

When Playwright's bundled browser is unavailable, provide a Chrome for Testing binary through `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

The production archive is written to `dist/forth-intercept-chrome-v2.0.0.zip`.

## Privacy boundary

Rules are stored locally. Traffic logs are in-memory. Sensitive headers are redacted by default. Advanced mode detaches on disable, tab close, debugger takeover, and top-level cross-origin navigation.
