# Wireflip 2.1.0 release execution

Release requested on 2026-10-19; execution continued on 2026-10-20 (Asia/Shanghai).

## Channels

| Channel | Verified state |
| --- | --- |
| Chrome | 2.1.0 submitted through original ID `knhlkjdfmgkmelcjfnbbhpphkmjjacng`; dashboard shows **Pending review**; automatic publication checked; safe-static-rules review bypass unchecked. Public version remains 2.0.0. |
| Firefox | 2.1.0 public; AMO version `6595977`, file `5140102`; release notes, reviewer build instructions and source archive attached. |
| npm | 2.1.0 publication in progress; do not call it published until registry and exact consumer checks finish. |

Store runtime source: `28f4c306b7f4d183290bcd2ded4af6ec7461aa38`.
[Build and native acceptance](https://github.com/oe/cors-unlocker/actions/runs/39280521099)
and [website/archive build](https://github.com/oe/cors-unlocker/actions/runs/39280520929)
completed successfully. GitHub initially showed queued/in-progress summaries even
while completed job logs and artifacts were available; final completion was
verified independently. The original successful job logs were retained locally.

## Verified artifacts and behavior

- Extension tests: 238; SDK tests: 8; Chrome E2E: 30; Firefox E2E: 17; exact SDK Firefox consumers: 4; one-approval Firefox Playground: 1.
- Both submission ZIPs match their corresponding tested CI directories byte for byte (excluding CI-only `INSTALL.md`).
- Chrome submission ZIP SHA-256: `be79cc7b0af3ad7881032a18e23c5a03d366d3dfdf48ca9a6383e96b7fffba14`.
- Firefox submission ZIP SHA-256: `bbcea22a17b92a1cc4ed0b84400e16cf70770a2088a2a6585e85ded6c285b2fa`.
- Public Firefox XPI SHA-256: `d22d8c00c227ae884ed7f174042bb560feaf91aa061fdcc0b087648b0928416e`. All 36 non-signature files match the submission ZIP; Mozilla signature files remain intact. See [Firefox fingerprints](../release/firefox-store-2.1.0.json).
- Native Chromium 138 manual fixture: a matching request returned the saved Mock; clicking the browser's own Cancel restored the upstream response; Popup displayed the stopped-execution warning and Retry rules. Explicit Retry restored the Mock and displayed Saved rules active / Not recording requests. Opening native DevTools on that browser coexisted with the extension and retained the Mock; this is not evidence of a debugger-takeover event on another Chrome version.
- Six-language Popup/workspace/Inspector CI captures were inspected; the native approval screenshot was inspected in English, and the E2E checks cover all six approval languages at 360px without horizontal overflow. No claim of six-language manual approval-window review is made.
- Refreshed straight-on Goldie-inspired galleries: five Chrome screenshots per locale (English / Simplified Chinese), five Firefox English screenshots, and promotional assets. Production UI fixtures retain Sample data labels and font attribution. Capture now scopes the origin locator and captures the complete Popup element to avoid a stitched duplicate header.
- Chrome English/Chinese copy, permission justifications and Firefox copy explain automatic saved rules, independent recording, exact-origin website approval/trust and browser limits.

## Publication follow-through

The SDK README is being corrected before publishing so it reports the actual
Firefox-public / Chrome-pending rollout instead of the earlier source-candidate
state. SDK runtime files remain unchanged; use the new successful CI archive and
verify it before publication. Public Firefox CI now retains the pinned 2.0.0
compatibility check and adds signed 2.1.0 SDK and automatic Playground checks.

Local signed-Firefox WebDriver attempts with the installed Firefox 155.0.1 failed
before tests started (`Could not find profile folder`). These attempts are not
passes. The signed 2.1.0 CI job provides the required native installation and
protocol verification instead.

Local ignored evidence is in `artifacts/release-2026-10-19/28f4c30/`, including
public metadata/XPI, submitted ZIPs, exact SDK archives, source ZIP, original CI
logs, marketing QA previews and browser submission/manual screenshots.

## Remaining gates

- Verify the final SDK registry archive, latest tag and clean consumer installation.
- Wait for Chrome 2.1.0 approval, then verify the public signed CRX and an actual existing-profile store update.
- Keep the 2.0.0 fingerprint records intact; do not mark Chrome 2.1.0 public based on submission alone.
- Complete the additional manual localized approval-window review and real existing v1-profile upgrade evidence where available.
- Announce coordinated general availability and publish the combined extension Release only after all channels are available. A draft Release may hold the exact artifacts in the meantime.
- Preserve `cors.forth.ink/message/`, original extension IDs and legacy SDK compatibility.
