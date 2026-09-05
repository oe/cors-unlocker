# Forth Intercept

Forth Intercept 2.0 is a browser-native request lab for Chrome and Firefox. It keeps the fast, warning-free CORS path from CORS Unlocker and adds opt-in, tab-scoped traffic inspection, response mocking, latency and failure simulation, redirects, blocking, and header rewriting.

No native client is required. Chrome Advanced mode uses Chrome DevTools Protocol through `chrome.debugger`, so Chrome displays its standard debugging disclosure while a tab is attached. Firefox Intercept mode uses blocking WebRequest APIs and does not show a debugger banner.

## What 2.0 includes

- **CORS compatibility mode** — one-click, per-origin CORS rules compiled to `declarativeNetRequest`.
- **Advanced proxy mode** — explicit per-tab attach/detach with request and response observation.
- **Rules workspace** — full-window navigation, compact searchable rule list, and a dedicated editor with Match / Actions / Test sections. Configure actions with structured forms, with JSON available as an advanced option.
- **Rule engine** — match page origins, request URL globs, methods, and resource types; test unsaved conditions without sending requests. Actions are validated data, not arbitrary JavaScript.
- **Actions** — CORS repair, request/response headers, redirects, blocking, static mocks, delays, and simulated network failures.
- **Site controls** — manage the current site's rules in the side panel, create or edit rules from captured requests, and inspect recorded matches and applied changes with sensitive headers masked.
- **Local-only operation** — rules and logs stay in the extension; logs are held in memory and cleared when the service worker stops.
- **Safe v1 upgrade** — the first 2.0 startup migrates `allowedOrigins` and `extConfig` into the v2 schema and stores a recovery snapshot. After migration, v2 storage is the only source of truth.

## Architecture

| Browser path | API | Best for | Disclosure |
| --- | --- | --- | --- |
| Fast path | `declarativeNetRequest` | CORS, headers, redirect, block | None |
| Chrome Advanced | `chrome.debugger` + CDP `Fetch` | inspection, mock, delay, failure, complete CORS repair | Chrome debugging banner |
| Firefox Intercept | blocking `webRequest` + `filterResponseData` | inspection, headers, redirect, block, delay, failure, body replacement | Install-time permissions |

Interception is deliberately tab-scoped. It stops when disabled, when the tab closes, or when the tab navigates to a different top-level origin. Chrome Advanced mode also detaches when another debugger takes over.

## Upgrade behavior

Keep the existing Chrome manifest key and Firefox Gecko ID when publishing 2.0 so each browser treats it as an update. On first startup:

1. Existing v1 rules and settings are read.
2. A `legacyBackupV1` snapshot is written.
3. Equivalent v2 rules and settings are written to `proxyAppState`.
4. The write is read back and validated.
5. All later reads and writes use only `proxyAppState`; v1 keys are not dual-written or used as runtime configuration.

Data & migration accepts v1 rule exports and complete v2 state exports. Import first previews added, overwritten and removed rules; choose merge-by-ID or full replacement before applying. Legacy backups are converted to v2. A `preImportBackup` snapshot is saved locally before each import and can be exported for recovery. New exports use the v2 format.

The rule editor protects unsaved changes when switching rules or tabs and when closing the editor. Search and filters preserve the current draft. Browser reload/close uses the browser's native unsaved-changes prompt. The compact side-panel editor shares the same action forms and close protection.

Use ⌘/Ctrl+K to search, arrow keys or Home/End on rule rows to select, and ⌘/Ctrl+S to save. Toggling another rule keeps the current draft intact. Duplicate creates a disabled draft that only becomes a stored rule after saving. Narrow windows switch between the list and editor instead of stacking them. Rule enabled state does not indicate whether an advanced-proxy tab is connected; verify actual effects in Site controls.

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

Build and validate Firefox 2.0:

```bash
pnpm --filter browser-cors-unlocker check:firefox
```

The Firefox archive is written to `packages/browser-extension/dist/forth-intercept-firefox-v2.0.0.zip`.

## Verification

```bash
pnpm --filter browser-cors-unlocker check
```

The check runs TypeScript, ESLint, unit tests, the production Chrome build, and Playwright acceptance tests. The acceptance suite launches a real Chrome for Testing profile with normal web security enabled and verifies:

- a v1 profile upgrades automatically and retains a recovery snapshot;
- the popup and workspace render;
- resource types support consecutive selections and persist after saving;
- structured multi-action forms, condition testing, draft protection and import preview/recovery work;
- editing a mock in Site controls changes the next real response, and disabling it restores the server response;
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

Forth Intercept is a development tool, not a system VPN: it affects matching browser requests and cannot proxy other applications or hide the browser's network address.

## Other packages

- `packages/npm` publishes the canonical `forth-intercept` 0.2 SDK. `packages/npm-compat` publishes `cors-unlocker` as a thin compatibility re-export for existing users.
- `packages/website` is the Forth Intercept product site, documentation, privacy explanation, FAQ, and live SDK playground.
- `packages/browser-extension` builds the Chrome and Firefox 2.0 products.

## License

MIT
