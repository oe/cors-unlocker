# Native Firefox verification and MV3 CORS fix

The production Firefox extension was installed as a temporary add-on in official Firefox
157.0.1 on Linux using geckodriver 0.37.1, a fresh profile and native WebDriver. No extension
APIs or page networking were mocked, and browser CORS restrictions were left enabled.

## Finding

Firefox MV3 rejects WebRequest edits to `Access-Control-*` response headers. The original
engine recorded its attempted edits as changes, but a real cross-origin fetch still failed.
Firefox reported `Disallowed change restricted response header Access-Control-Allow-Origin`.
This was a release blocker missed by mocked WebRequest tests and build/lint checks.

## Fix

Connected Firefox sessions now install tab-scoped CORS rules through DNR. Temporary CORS
rules share the existing serialized reconciliation queue with persistent rules, use a separate
ID range, and are excluded from the toolbar's persistent-rule count. Quick controls and saved
CORS rules are reconciled when edited and cleared on stop, tab close or cross-origin navigation.
WebRequest continues to capture requests, apply delay/failure and replace response bodies.
Native screenshots also exposed missing CJK glyphs with the Linux Firefox `system-ui` fallback.
Chinese, Japanese and Korean now prefer their existing system fonts; no font assets are bundled.
No product dependencies or permissions were added.

## Verification

Eleven native Firefox scenarios pass:

- Body replacement contacts the server, preserves its status and stops when the session stops.
- CORS repair works for simple and credentialed requests; failed server preflights remain unsupported.
- Same-origin tabs remain isolated; closing a tab removes its temporary rules.
- Saved CORS rules follow edits and only apply during a connected session.
- Persistent headers, redirects and blocking work without a session and respect origin scope.
- Delay, failure, tooltip changes and recovery affect real requests.
- Cross-origin navigation clears quick controls while preserving saved browser rules.
- Authorization values are redacted in captured logs.
- The page SDK connects and creates disabled drafts scoped to the actual calling origin.
- Real popup clicks start CORS repair and stop the session.
- Popup and Inspector render in Firefox, with six-language popup and narrow-content checks.

Run from the repository root after building Firefox:

```bash
bash packages/browser-extension/scripts/install-firefox-test-browser.sh /tmp/forth-firefox
FIREFOX_BINARY=/tmp/forth-firefox/firefox/firefox \
GECKODRIVER=/tmp/forth-firefox/geckodriver \
pnpm --filter browser-cors-unlocker test:e2e:firefox
```

CI runs the suite and uploads browser metadata, screenshots and driver diagnostics.
The current evidence covers Linux Firefox 157.0.1 with a temporary add-on. It does not prove
AMO signing, store installation/update prompts or behavior on every supported OS/version.
A public release still requires the Chrome store update, Firefox signing and SDK publication.
