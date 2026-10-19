# Wireflip 2.1.0 coordinated rollout

Supersedes the unreleased 2.0.1 UI-only candidate. Firefox 2.1.0 is public and its signed XPI matches the tested candidate. Chrome 2.1.0 is submitted with automatic publication after review; public Chrome remains 2.0.0. SDK publication is in progress. See [execution evidence](release-2.1-execution.md).

- [x] Review automatic saved-rule execution and optional recording: [product model](rule-execution.md)
- [x] Review the exact successful candidate commit and Chrome / Firefox archives — source `7df1ccc0fbfd53f5f519e0cca553686b0aa5b952`, successful [build and artifacts](https://github.com/oe/cors-unlocker/actions/runs/38857618679)
- [x] Verify new one-approval Playground journeys in both candidate browsers — [native candidate acceptance](https://github.com/oe/cors-unlocker/actions/runs/38857618859)
- [x] Verify published 2.0.0 compatibility, legacy SDK bridges and SDK archive consumers — [public Chrome](https://github.com/oe/cors-unlocker/actions/runs/38857618816), [public Firefox](https://github.com/oe/cors-unlocker/actions/runs/38857618667), and archive consumers in the full build
- [ ] Review native approval, Popup, workspace and Inspector screenshots in six languages and narrow windows
- [ ] Check automatic execution on existing / new matching tabs, unrelated origins, group pause / resume, stopping recording, browser cancellation and debugger conflicts; Retry rules must not start recording
- [x] Update store screenshots and release notes to the accepted candidate UI; explicitly explain that previously enabled 2.0 Mock / delay / CORS rules now run on all matching pages without starting a tab session
- [x] User requested this release; submit Chrome / Firefox 2.1.0 through their original listings — Chrome pending review, Firefox public
- [ ] Verify both signed public packages and record immutable fingerprints — Firefox complete, Chrome awaits review
- [ ] Coordinate npm wireflip@2.1.0 publication with both extension 2.1.0 store submissions in one release window; verify registry contents, then announce once all channels are available
- [ ] Update published-version records, website rollout copy and store acceptance baselines

Do not overwrite 2.0.0 fingerprints or discontinue the original cors.forth.ink SDK bridge. See [the full release checklist](release-checklist.md).

## Candidate source validation — 2026-10-16

The tested runtime commit is `7df1ccc0fbfd53f5f519e0cca553686b0aa5b952` in [PR #29](https://github.com/oe/cors-unlocker/pull/29). Documentation added afterward does not change that runtime. All six workflow families passed on that commit, including [website quality](https://github.com/oe/cors-unlocker/actions/runs/38857618649).

| Acceptance | Result |
| --- | --- |
| TypeScript, ESLint, extension unit / component tests | 208 passed; Chrome and Firefox production builds and ZIP validation passed |
| SDK unit tests | 5 passed |
| Chrome native browser suite | 29 passed without retries |
| Firefox native browser suite | 17 passed |
| Firefox candidate + built website activation journey | 1 passed |
| Firefox exact new / legacy SDK archive consumers | 3 passed |
| Published signed Chrome / Firefox 2.0.0 + candidate website | Both passed independently |

The candidate journeys use real installed extensions, native browser input and actual HTTP responses. They verify one approval without opening the workspace, matching peer tabs, stopping recording without stopping saved rules, rule disable, reload without duplicate rules, and comparison of the response body. Chrome also verifies cancellation, an unrelated origin, rejection without trusted input, and six approval-window languages at 360px. Existing browser suites cover group off/on, temporary-control isolation, HTTP cache restoration, local recovery, migration, appearance and narrow layouts.

Chrome additionally checks that an execution error clears when its group is paused, Retry rules does not record, and cancelling automatic preparation keeps that tab paused until Retry. Native browser Stop / external DevTools takeover should still receive the manual release check above; automatic cancellation is not evidence of clicking Chrome's own indicator.

Native screenshots for approval, Playground, Popup and desktop / narrow workspaces are included in the successful build diagnostics. Store screenshots and release sign-off remain unchecked. The Chrome v1 fixture and signed Firefox v1 migration tests do not replace an actual Chrome Web Store in-place update on a real existing profile.

Chrome prepares new matching pages asynchronously. Requests sent before readiness may pass through; Playground waits for the exact rule before enabling its test. Chrome's native debugging indicator remains visible. Firefox response-body replacement still contacts the upstream server and preserves its status. These limits must remain accurate in the release notes.


## Coordinated version and release notes — 2026-10-19

Chrome, Firefox and the npm SDK now share **2.1.0**. The SDK intentionally jumps from published 0.2.0 to 2.1.0 to align the product version; no intermediate 0.3.0 release is planned. See [the release notes](../release/2.1.0-notes.md) for user-facing changes, migration guidance and rollout limits.

The authorization runtime in PR #30 passed [full native acceptance](https://github.com/oe/cors-unlocker/actions/runs/39145364873): Chrome 30 tests, Firefox 17 tests and 4 exact SDK archive tests, plus 238 extension tests and 8 SDK tests. [Public Firefox 2.0 compatibility](https://github.com/oe/cors-unlocker/actions/runs/39145378752) passed; its 2.1-only contract check was explicitly skipped. The version-alignment commit requires its own checks before merge.

Merging prepares source and deploys the documented candidate website through the existing workflow. It does not publish npm or submit store packages. Keep public-version fingerprints unchanged until each channel is independently verified. Store assets and manual store/profile checks above remain release tasks; CI does not certify them.
