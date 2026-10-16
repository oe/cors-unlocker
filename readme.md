<img src="marketing/brand/icons/128.png" width="64" height="64" alt="Wireflip" align="right" />

# Wireflip

Wireflip is a browser-native request lab for Chrome and Firefox: CORS repair, response mocking, latency and failure simulation, redirects, blocking, header rewriting, and optional request recording.

The current source prepares **extension 2.1.0 and SDK 0.3.0**. Enabled saved rules run automatically on all matching supported pages; recording and temporary tab controls are separate. Stores remain 2.0.0 and npm remains 0.2.0 until a separate release. See the [execution model](docs/rule-execution.md) and [candidate checklist](docs/release-2.1.md).

No native client is required. Chrome uses Chrome DevTools Protocol through `chrome.debugger`, so Chrome displays its standard debugging disclosure while a tab is attached. Firefox uses blocking WebRequest APIs and does not show a debugger banner.

## Migrating from CORS Unlocker

Existing `cors-unlocker@0.1.0` integrations remain supported. The old `cors.forth.ink` hostname and its `/message/` bridge are retained; public pages redirect to the new website. Upgrading the SDK is optional and does not require reinstalling the extension. [`wireflip@0.2.0`](https://www.npmjs.com/package/wireflip) is available on npm and requires Wireflip 2.0. Wireflip 2.0.0 is available on the [Chrome Web Store](https://chromewebstore.google.com/detail/knhlkjdfmgkmelcjfnbbhpphkmjjacng) and [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/cors-unlocker/). Update the extension before migrating the SDK; existing integrations remain supported.

See the [migration guide](packages/website/src/pages/migration.mdx) for the API mapping, user-confirmation changes and upgrade steps. DNS and old-origin bridge deployment remain separate operational prerequisites.

## What Wireflip includes

- **CORS compatibility mode** — one-click, per-origin CORS rules compiled to `declarativeNetRequest`.
- **Automatic saved rules** — enabling a rule applies it on every matching supported page. Recording additional traffic is optional.
- **Rules workspace** — full-window navigation, compact searchable rule list, and a dedicated editor with Match / Actions / Test sections. Configure actions with structured forms, with JSON available as an advanced option.
- **Rule engine** — match page origins, request URL globs, methods, and resource types; test unsaved conditions without sending requests. Actions are validated data, not arbitrary JavaScript.
- **Actions** — CORS repair, request/response headers, redirects, blocking, static mocks, delays, and simulated network failures.
- **Site controls** — manage the current site's rules in the side panel, create or edit rules from captured requests, and inspect recorded matches and applied changes with sensitive headers masked.
- **Local-only operation** — rules and logs stay in the extension; logs are held in memory and cleared when the service worker stops.
- **Safe v1 upgrade** — the first 2.0 startup migrates `allowedOrigins` and `extConfig` into the v2 schema and stores a recovery snapshot. After migration, v2 storage is the only source of truth.

## Rule groups

Organize rules by scenario, such as Local development or Staging. In the workspace, choose **New group**, add rules with the group's **+** button, or change a rule's **Group** in the editor. Groups can be renamed and collapsed; searching reveals matching rules even inside collapsed groups.

Turning a group off pauses all its saved rules while remembering each individual switch. Turning it back on restores only the rules that were already on. Popup and Inspector show groups relevant to the current site, with **Group paused** beside paused rules. Group switches affect all matching supported tabs. Restoring a group automatically prepares its enabled rules, including mocks and delays.

Deleting a group moves its rules to **Ungrouped**, retaining individual switches. Enabled rules in a paused group resume, as the deletion dialog explains. No rules are deleted. Grouping does not change execution priority or request matching. Export/import includes group membership and paused states; merge retains current settings and merges groups by ID, including imported group switches.

## Popup debugging controls

The popup controls the current tab: open Inspector, start or stop recording, pause relevant rule groups, and apply temporary CORS repair, HTTP-cache bypass (Chrome), Fetch/XHR delay or simulated failure.

Temporary controls start their required execution automatically. They affect only this tab and reset when cleared, when recording stops, when the tab closes, or on navigation to another origin. They never create saved rules. Disabling temporary CORS does not disable an independently enabled saved CORS rule.

Saved rules can be pinned as shortcuts. Pinning changes the shortcut list; their switches change saved configuration across matching pages. Stop recording clears temporary controls while saved rules keep running. Cross-origin mocks still need appropriate CORS rules or mock response headers.

Disable cache bypasses HTTP cache without clearing stored data or bypassing service workers. Resetting it restores ordinary cache behavior. Chrome releases its connection when no saved rule, recording or temporary control needs it; Firefox hides the unsupported cache control.

## Toolbar status

The toolbar follows each tab: gray when inactive, blue with the enabled saved-rule count, green **ON** while recording or applying temporary changes, amber **…** while preparing, and red **!** when execution needs attention. Gray **OFF** means relevant saved rules are paused by groups.

Hover for enabled counts, paused groups, applied temporary controls and errors. These describe configuration and execution state, not proof that a request changed. Click for group switches and temporary controls. **Retry rules** resumes saved execution without starting a recording; **Start recording** and **Stop recording** control optional recording.

Chrome may display its native debugging indicator on matching pages. Stopping it through the browser is respected for that tab, with an explicit retry rather than an automatic reconnect loop. Navigation to another origin reconciles the new page's rules and clears temporary controls.

## First request: mock an API response

1. Open your application tab, then choose **Inspect and modify requests** from the popup.
2. Choose **Start recording** and trigger the API request in your application.
3. Select the request in the **Requests** tab, then choose **Mock** (Chrome) or **Replace body** (Firefox).
4. Enter the response body and save. The captured page origin, URL, method, and resource type are already filled in.
   Expand **Request matching** to rename the rule or change its scope; the default URL includes query parameters.
5. Trigger the request again. **View request** opens a new recorded match so you can inspect the applied changes.
   A recorded match alone does not prove that every action ran. Old records are not used to verify a new save.

Saved site rules appear in the **Rules** tab with their enabled or paused state.
Use **Disable this rule** after verification to restore the original behavior, unless other rules apply.
**Reset temporary changes** clears popup controls. **Stop recording** stops additional traffic recording and clears temporary controls; enabled saved rules keep running. Turn a rule or group off to stop its saved changes.
Firefox response replacement still contacts the server and preserves its status.

Response bodies and **Advanced JSON** have a lightweight JSON editor. Choose **Format JSON**
or press **Alt+Shift+F** to indent the text; **Undo format** restores the original. Formatting
only changes whitespace, preserving large numbers, duplicate keys and string escapes.
Syntax errors appear after leaving the field or formatting, with **Go to error** when the
browser reports a position. Response bodies can switch to **Plain text** for HTML, malformed
JSON or other test payloads; syntax hints never prevent saving a raw mock body.

The editor keeps native selection, clipboard, undo, IME and Tab navigation. Optional
highlighting and formatting pause above 50,000 characters; dense token streams also fall
back to ordinary text. Payloads remain editable. No editor dependency, remote asset or new
permission is required.

## Architecture

The extension UI supports English, Simplified Chinese, Korean, Japanese, French and Spanish. It follows the browser language by default, falling back to English. The language selector in the settings header updates the options page, popup and Site controls, including other open surfaces, without discarding drafts. The preference is saved locally as `uiLanguage`, separately from portable rule configuration and v1 migration. Rule names, URLs, HTTP/CDP identifiers and raw browser diagnostics are not translated. Website and store listing localization are separate work.

| Browser path | API | Best for | Disclosure |
| --- | --- | --- | --- |
| Fast path | `declarativeNetRequest` | CORS, headers, redirect, block | None |
| Chrome Advanced | `chrome.debugger` + CDP `Fetch` | inspection, mock, delay, failure, complete CORS repair | Chrome debugging banner |
| Firefox Intercept | blocking `webRequest` + `filterResponseData` | inspection, headers, redirect, block, delay, failure, body replacement | Install-time permissions |

Execution is managed per tab internally, while saved rules apply automatically across matching pages. A new origin clears temporary controls and gets its own matching rules. Chrome detaches when another debugger takes over and reports the conflict.

Redirect and header combinations are prepared automatically as a complete action. Chrome preparation on navigation is asynchronous: requests sent before readiness may pass through. Playground waits for its exact rule to be ready before enabling a test.

## Rule reliability and recovery

Saved page scopes use the complete top-level HTTP(S) origin, including protocol and port.
The fast path installs session DNR rules bound to matching tab IDs and refreshes them on
navigation and tab closure. Saved configuration remains local and persistent; browser
rules are rebuilt at startup. Older dynamic rules are removed during reconciliation.
Fast rules combine Fetch, XHR and EventSource into the browser's `xmlhttprequest` type;
Advanced mode can distinguish Chrome resource types.

URL globs use anchored, case-insensitive matching in the editor and interception engines,
and are compiled to equivalent DNR regex filters. Only `*` is a wildcard; punctuation in
URLs and query strings is literal. Invalid scopes and headers are rejected before saving.

Rules, settings and imports are updated by a single background writer. Concurrent edits
to different rules are preserved, additions share the configured rule quota, and an import
checks its preview against the latest state before creating a recovery backup. Browser
rule installation errors return to the caller and restore the previous configuration.

Invalid or newer stored schemas are preserved instead of being replaced by a fresh v1
migration. The workspace offers an export of the original data and a validated backup
restore flow. A separate `preRecoveryBackup` retains the data replaced by an explicit restore.

## Upgrade behavior

Release availability: Wireflip 2.0.0 is public on the [Chrome Web Store](https://chromewebstore.google.com/detail/knhlkjdfmgkmelcjfnbbhpphkmjjacng) and [Firefox AMO](https://addons.mozilla.org/en-US/firefox/addon/cors-unlocker/). The following explanation-page behavior is included in the published Chrome update and current source. The initial public Firefox 2.0.0 predates that page and remains unchanged.

Updating from 1.x opens a local extension explanation page once, showing the old and new
names and logos, preserved CORS rules, the new request lab, and browser-specific limits.
Fresh installs do not show this notice. A first patch of the already distributed 2.0.0
can also deliver it to v1 users identified by their original local migration snapshot;
importing someone else's rules does not qualify. After delivery, later updates do not
automatically reopen it. Popup and Workspace retain
a short reminder until **Got it** is selected; acknowledgment is local, shared across
surfaces, and excluded from portable rule exports. Opening the explanation never starts
an interception session. If configuration migration fails, it points to Data & recovery
instead of claiming the rules were migrated successfully.

Keep the existing Chrome manifest key and Firefox Gecko ID when publishing 2.0 so each browser treats it as an update. On first startup:

1. Existing v1 rules and settings are read.
2. A `legacyBackupV1` snapshot is written.
3. Equivalent v2 rules and settings are written to `proxyAppState`.
4. The write is read back and validated.
5. All later reads and writes use only `proxyAppState`; v1 keys are not dual-written or used as runtime configuration.

Data & migration accepts v1 rule exports and complete v2 state exports. Import first previews added, overwritten and removed rules; choose merge-by-ID or full replacement before applying. Legacy backups are converted to v2. A `preImportBackup` snapshot is saved locally before each import and can be exported for recovery. New exports use the v2 format.

The rule editor protects unsaved changes when switching rules or tabs and when closing the editor. Search and filters preserve the current draft. Browser reload/close uses the browser's native unsaved-changes prompt. The compact side-panel editor shares the same action forms and close protection.

Use ⌘/Ctrl+K to search, arrow keys or Home/End on rule rows to select, and ⌘/Ctrl+S to save. Toggling another rule keeps the current draft intact. Duplicate creates a disabled draft that only becomes a stored rule after saving. Narrow windows switch between the list and editor instead of stacking them. Rule enabled state does not indicate whether an advanced-proxy tab is connected; verify actual effects in Site controls.

## Store marketing assets

Approved Chrome Web Store screenshots, promo tiles, editable layouts, and
regeneration instructions are in [marketing/chrome-web-store](marketing/chrome-web-store/README.md).
The project-local [Goldie skill](.agents/skills/goldie/SKILL.md) is installed in
`.agents/skills/goldie`; follow the Chrome-specific guide when using it here.

## Development

Requirements: Node.js 18+ and pnpm 9.

```bash
pnpm install
pnpm --filter browser-wireflip dev
```

Build the Chrome candidate:

```bash
pnpm --filter browser-wireflip build:chrome
pnpm --filter browser-wireflip package:chrome
```

The unpacked extension is written to `packages/browser-extension/dist/chrome`; the release archive is `packages/browser-extension/dist/wireflip-chrome-v2.1.0.zip`.

Build and validate the Firefox candidate:

```bash
pnpm --filter browser-wireflip check:firefox
```

The Firefox archive is written to `packages/browser-extension/dist/wireflip-firefox-v2.1.0.zip`.

## Verification

Before publishing, follow the [release checklist](docs/release-checklist.md), including old SDK/domain compatibility, store approval, npm publication and post-release verification. The [legacy SDK documentation patch](release/legacy-sdk/README.md) prepares `cors-unlocker@0.1.1` without changing its published runtime code.

```bash
pnpm --filter browser-wireflip check
```

The check runs TypeScript, ESLint, unit tests, the production Chrome build, and Playwright acceptance tests. The acceptance suite launches a real Chrome for Testing profile with normal web security enabled and verifies:

- a v1 profile upgrades automatically and retains a recovery snapshot;
- the popup and workspace render;
- resource types support consecutive selections and persist after saving;
- structured multi-action forms, condition testing, draft protection and import preview/recovery work;
- editing a mock in Site controls changes the next real response, and disabling it restores the server response;
- enabled saved CORS repairs a failing preflight automatically on supported Chrome pages;
- one native approval activates a Playground rule, another matching tab uses it, stopping recording preserves it, and disabling the rule restores the server response;
- preflight and response activity appears in the request log;
- static mocks, DNR request headers, blocking, delay, and network failure work in-browser.

If Playwright's bundled Chromium is not installed, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to a Chrome for Testing executable.

## Permissions and privacy

- `<all_urls>` is required because rules can target arbitrary developer endpoints.
- `declarativeNetRequest` powers the non-debugging fast path.
- `debugger` powers Chrome interception for enabled matching saved rules, optional recording and temporary controls. Chrome displays its native debugging indicator.
- `tabs`, `storage`, and `sidePanel` support tab scope, local persistence, and the inspector.
- Sensitive request and response headers are redacted by default. The extension does not upload traffic, rules, or logs.

Wireflip is a development tool, not a system VPN: it affects matching browser requests and cannot proxy other applications or hide the browser's network address.

## Other packages

The approved logo, vector source, icon exports, and regeneration instructions are
in [`marketing/brand`](marketing/brand/README.md).

- `packages/npm` publishes the `wireflip` SDK; 0.3 is the source candidate and 0.2 remains published. Install and import `wireflip`; no renamed-package wrapper is shipped.
- `packages/website` is the Wireflip product site, documentation, privacy explanation, FAQ, and live SDK playground.
- `packages/browser-extension` builds the Chrome and Firefox products.

## License

MIT

## Runtime resource use

A Chrome session started with only Disable cache uses the Network domain without pausing requests,
provided no enabled rule applies to the site. Inspector offers **Start recording** to enable
capture. Enabling another request-changing control or adding an applicable rule also enables capture;
once enabled, capture remains active until that session stops.

Both engines evict internal log indexes along with visible records. Log notifications are combined in
100 ms windows per tab; Inspector refreshes logs without rereading rule storage on every notification.
Releasing an execution connection cancels its outstanding delay timers. Stopping recording keeps the connection and saved actions when an enabled saved rule still needs them.
