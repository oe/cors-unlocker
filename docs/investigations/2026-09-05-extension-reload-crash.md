# Chrome crash after extension reload — 2026-09-05

## Verdict

The user's browser crash is confirmed. Its trigger/root cause is **not reproduced or resolved**.
No runtime workaround is being presented as a fix.

## Local crash evidence

macOS report `Google Chrome-2026-09-05-193640.ips`:

- Capture time: 2026-09-05 19:36:35 +0800.
- Application: Google Chrome 152.0.7977.76 (the browser process, not a renderer).
- Exception: EXC_BREAKPOINT / SIGTRAP; termination signal 5.
- Faulting thread: CrBrowserMain / com.apple.main-thread.
- Incident: 1FFDD0F8-1B47-48D5-914A-385319F367D1.
- Chrome frames are only symbolized as ChromeMain plus offsets. They do not identify the failing
  extension API or justify attributing the crash to Network.setCacheDisabled, Fetch, or the side panel.

The full crash dump and the user's browser profile are not copied into this repository.

## Isolated reproduction

Temporary profiles, only the local unpacked extension, local fixture traffic, native side panel opened
through the popup, and the actual Reload button in chrome://extensions:

| Browser | Proxy off | CORS on | Cache bypass on | Request paused by 3 s delay |
| --- | --- | --- | --- | --- |
| Installed Google Chrome 152.0.7977.76 | 3 survived | 3 survived | 3 survived | 3 survived |
| Chrome for Testing 152.0.7977.82 | 3 survived | 3 survived | 3 survived | 3 survived |

The installed Chrome executable was launched against a new temporary profile. Its unpacked extension
was loaded through CDP Extensions.loadUnpacked with the dedicated extension-debugging flag. The user's
normal profile, extensions, cookies, and browser settings were not changed.

Earlier Chrome for Testing 151 checks were not used to rule out a Chrome 152 issue. Programmatic
runtime.reload also encountered an extension-load restriction without developer mode; that is not a
browser crash and is not counted as a successful manager-button reproduction.

## Regression coverage

The extension E2E suite now exercises the native manager reload with active observation, cache bypass,
a paused request, and CORS. It checks that the browser remains usable, the extension reloads, proxy
sessions are disabled afterward, and saved rule state is preserved. Requests in flight during unload
may be cancelled; the recovery check retries a fresh request rather than requiring the old one to survive.

Validation: all 15 Playwright E2E tests passed on Chrome for Testing 152.0.7977.82,
including the new reload regression. TypeScript checking and ESLint for the changed test passed.

## Remaining uncertainty

The user's exact pre-crash toggle state, DevTools state, open-page traffic, and interaction with other
extensions are not reproduced by these clean-profile checks. A passing matrix does not establish that
the original crash is fixed. Further attribution requires reproducing the original state or a
symbolized browser crash / Chromium fatal assertion message.
