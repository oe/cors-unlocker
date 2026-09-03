# Forth Intercept

Forth Intercept 2.0 is a Chrome-native request lab. It keeps the fast, warning-free CORS path from CORS Unlocker and adds an opt-in, tab-scoped advanced mode for traffic inspection, response mocking, latency and failure simulation, redirects, blocking, and header rewriting.

No native client is required. Advanced mode uses Chrome DevTools Protocol through `chrome.debugger`, so Chrome displays its standard debugging disclosure while a tab is attached.

## What 2.0 includes

- **CORS compatibility mode** — one-click, per-origin CORS rules compiled to `declarativeNetRequest`.
- **Advanced proxy mode** — explicit per-tab attach/detach with request and response observation.
- **Rule engine** — match page origins, request URL globs, methods, and resource types; compose validated JSON action scripts without arbitrary code execution.
- **Actions** — CORS repair, request/response headers, redirects, blocking, static mocks, delays, and simulated network failures.
- **Request inspector** — redacted headers, status/outcome, CORS diagnostics, filtering, and rule creation from a captured request.
- **Local-only operation** — rules and logs stay in the extension; logs are held in memory and cleared when the service worker stops.
- **Safe v1 upgrade** — the first 2.0 startup migrates `allowedOrigins` and `extConfig` into the v2 schema and stores a recovery snapshot. After migration, v2 storage is the only source of truth.

## Architecture

| Path | Chrome API | Best for | Browser disclosure |
| --- | --- | --- | --- |
| Fast path | `declarativeNetRequest` | CORS, headers, redirect, block | None |
| Advanced path | `chrome.debugger` + CDP `Fetch` | inspection, mock, delay, failure, complete CORS repair | Chrome debugging banner |

Advanced mode is deliberately tab-scoped. It detaches when disabled, when the tab closes, when another debugger takes over, or when the tab navigates to a different top-level origin.

## Upgrade behavior

Keep the existing manifest key when publishing 2.0 so Chrome treats it as an update to the same extension ID. On first startup:

1. Existing v1 rules and settings are read.
2. A `legacyBackupV1` snapshot is written.
3. Equivalent v2 rules and settings are written to `proxyAppState`.
4. The write is read back and validated.
5. All later reads and writes use only `proxyAppState`; v1 keys are not dual-written or used as runtime configuration.

The Rules screen imports both v1 rule exports and complete v2 state exports. New exports use the v2 format.

## Development

Requirements: Node.js 18+ and pnpm 9.

```bash
pnpm install
pnpm --filter browser-cors-unlocker dev
```

Build Chrome 2.0:

```bash
pnpm --filter browser-cors-unlocker build:chrome
pnpm --filter browser-cors-unlocker package:chrome
```

The unpacked extension is written to `packages/browser-extension/dist/chrome`; the release archive is `packages/browser-extension/dist/forth-intercept-chrome-v2.0.0.zip`.

## Verification

```bash
pnpm --filter browser-cors-unlocker check
```

The check runs TypeScript, ESLint, unit tests, the production Chrome build, and Playwright acceptance tests. The acceptance suite launches a real Chrome for Testing profile with normal web security enabled and verifies:

- a v1 profile upgrades automatically and retains a recovery snapshot;
- the popup and workspace render;
- a genuinely failing CORS preflight succeeds only after advanced mode attaches;
- preflight and response activity appears in the request log;
- static mocks, DNR request headers, blocking, delay, and network failure work in-browser.

If Playwright's bundled Chromium is not installed, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to a Chrome for Testing executable.

## Permissions and privacy

- `<all_urls>` is required because rules can target arbitrary developer endpoints.
- `declarativeNetRequest` powers the non-debugging fast path.
- `debugger` powers advanced mode and is used only after an explicit user action for the active tab.
- `tabs`, `storage`, and `sidePanel` support tab scope, local persistence, and the inspector.
- Sensitive request and response headers are redacted by default. The extension does not upload traffic, rules, or logs.

Forth Intercept is a development tool, not a system VPN: it affects Chrome requests matched by its rules and cannot proxy other applications or hide the browser's network address.

## Other packages

- `packages/npm` publishes the `cors-unlocker` 0.2 SDK. Its new local bridge exposes `intercept.connect()`, origin-scoped CORS consent, status, and disabled rule drafts; deprecated v1 helpers remain as aliases for upgrade continuity.
- `packages/website` is the Forth Intercept product site, documentation, privacy explanation, FAQ, and live SDK playground.
- `packages/browser-extension` is the Chrome 2.0 product.

## License

MIT
