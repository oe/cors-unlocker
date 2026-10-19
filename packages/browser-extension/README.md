# Wireflip browser extension

Wireflip is a browser-native request lab for Chrome and Firefox, built on Manifest V3.

Extension 2.1.0 is public on Firefox and submitted for review on Chrome; the public Chrome version remains 2.0.0. SDK 2.1.0 is being released in the same window. See [the execution model](../../docs/rule-execution.md) and [candidate checklist](../../docs/release-2.1.md).

## Execution model

- Enabled saved rules run automatically on every matching supported page. Recording is optional; temporary controls affect only their selected tab. Rule and group switches control saved execution.
- The browser fast path uses `declarativeNetRequest` for CORS, request/response headers, redirects, and blocking without a debugging banner.
- Chrome automatically prepares the tab-scoped Chrome DevTools Protocol `Fetch` domain for inspection, preflight/response repair, static mocks, delays, and network failures. Chrome shows its standard debugging disclosure while attached.
- Firefox automatically prepares blocking `webRequest` listeners for inspection, headers, redirect, block, delay, failure simulation, and response-body replacement. Tab-scoped DNR applies CORS headers because Firefox MV3 restricts those changes in WebRequest. Body mocks preserve the server HTTP status and require an actual response.
- The page bridge exposes the origin-scoped `wireflip` npm SDK. It derives scope from the browser sender tab, confirms CORS changes, retains disabled drafts, and supports one extension-owned confirmation to enable an origin-scoped rule and prepare its execution. Page code never receives captured traffic.

## Upgrade

The Chrome manifest key and Firefox Gecko ID remain unchanged so browser upgrades retain v1 storage. First startup migrates v1 `allowedOrigins` and `extConfig` into `proxyAppState`, retains `legacyBackupV1`, verifies the write, and then uses only v2 state.

## Develop and verify

```bash
pnpm --filter browser-wireflip dev
pnpm --filter browser-wireflip check
pnpm --filter browser-wireflip package:chrome
pnpm --filter browser-wireflip check:firefox
FIREFOX_BINARY=/path/to/firefox GECKODRIVER=/path/to/geckodriver pnpm --filter browser-wireflip test:e2e:firefox
```

When Playwright's bundled browser is unavailable, provide a Chrome for Testing binary through `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

Production archives are written to `dist/wireflip-chrome-v2.1.0.zip` and `dist/wireflip-firefox-v2.1.0.zip`.

The Firefox E2E suite installs the production build as a temporary add-on in a fresh, headless
Firefox profile. It uses native WebDriver and local HTTP fixtures, including real CORS failures,
server-backed body replacement, session cleanup, SDK scope, redaction and six-language UI screenshots.
No extension APIs are mocked. Python 3, Firefox and geckodriver are required; the Linux CI installer is
`bash packages/browser-extension/scripts/install-firefox-test-browser.sh /tmp/wireflip-firefox` from the repository root.
Browser metadata, screenshots and diagnostics are written to `test-results/firefox`.

## Privacy boundary

Rules are stored locally. Traffic logs are in-memory. Sensitive headers are redacted by default. Saved interception ends when no enabled rule needs it, while recording and temporary controls have separate lifetimes. Tab close releases execution; cross-origin navigation clears temporary controls and reconciles rules for the new origin. Chrome respects its native Stop control and debugger conflicts.


State mutations run through `performProxyStateOperation` in the background. Extension pages
must submit operations rather than writing `proxyAppState` directly. Add a new operation to
that dispatcher when extending settings or rule editing; keep validation and quotas there.
DNR session rules are rebuilt from complete page origins and current tabs. Do not reintroduce
hostname-only dynamic rules or per-window CORS switching.

## SDK archive release acceptance

After building the SDK, run `node scripts/verify-sdk-packages.mjs` from the repository root,
then build the website so its production legacy bridge is available. The Chrome suite
loads the exact new and legacy archives. Firefox additionally runs
`python3 tests/firefox/sdk_package_test.py` with the same browser environment variables.
These are isolated HTTPS transport fixtures with real extension APIs, not checks of live DNS
or hosting. See [release preflight](../../docs/release-preflight.md).
