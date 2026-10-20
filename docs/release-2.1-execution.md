# Wireflip 2.1.0 release execution

Release requested on 2026-10-19; execution continued on 2026-10-20 (Asia/Shanghai).

## Channels

| Channel | Verified state |
| --- | --- |
| Chrome | 2.1.0 submitted through original ID `knhlkjdfmgkmelcjfnbbhpphkmjjacng`; dashboard shows **Pending review**; automatic publication checked; safe-static-rules review bypass unchecked. Public version remains 2.0.0. |
| Firefox | 2.1.0 public; AMO version `6595977`, file `5140102`; release notes, reviewer build instructions and source archive attached. |
| npm | `wireflip@2.1.0` public; `latest` is 2.1.0; registry SHA-256/SHA-512, seven installed files and clean ESM/CommonJS/NodeNext consumers verified. |

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

The SDK README was corrected in `a29dcaf353b4016b0988e0b9e93c622b1f22f88e`
before publication. The [public Firefox SDK workflow](https://github.com/oe/cors-unlocker/actions/runs/39285971607)
passed on both pinned public versions. Signed 2.1.0 passed all four exact SDK
consumers plus the automatic one-approval Playground journey on official Firefox
157.0.1. The 2.0.0 check retains its explicit skip for the 2.1-only contract.

The new SDK archive SHA-256 is
`0a353abba2a2b3ae243b205ebdfa5870aa063e63b143c800e447c3911248dc12`.
Only its README differs from the `28f4c30` SDK archive; all runtime, type and
package metadata files are identical. All seven files also match the locally
clean-consumer-verified archive. The exact CI archive passed publish dry-run.
The initial publish request was cancelled before authorization so the earlier
candidate README was not published. After browser verification, npm accepted
publication on 2026-10-20. The public registry then exposed version 2.1.0 and
`latest: 2.1.0`; the downloaded archive has the exact SHA-256 above and matching
SHA-512 integrity. A fresh-cache registry install matched all seven files and
passed ESM, CommonJS and NodeNext `.mts` / `.cts` consumers. See
[the npm fingerprint](../release/npm-2.1.0.json).

A [combined draft Release](https://github.com/oe/cors-unlocker/releases)
holds the submitted extension ZIPs, signed Firefox XPI, matching Firefox source,
new SDK tarball and SHA256SUMS. All six uploaded asset digests match local bytes.
It is not a general-availability announcement.

The original public `cors.forth.ink` bridge was also exercised from a disposable
Chromium profile with exact published `cors-unlocker@0.1.0` runtime files and the
2.1.0 candidate. Detection, status, explicit cancellation, page plus native
extension approval, credential confirmation, independent-origin isolation and
final disable all passed. The frame stayed on `https://cors.forth.ink/message/`;
no network routes or extension APIs were stubbed. `0.1.1` runtime equivalence
remains separately verified by the archive checks. The temporary profile was
closed after returning its test origin to disabled / no credentials.

Local signed-Firefox WebDriver attempts with the installed Firefox 155.0.1 failed
before tests started (`Could not find profile folder`). These attempts are not
passes. The signed 2.1.0 CI job provides the required native installation and
protocol verification instead.

Local evidence (not committed) is in `artifacts/release-2026-10-19/28f4c30/`, including
public metadata/XPI, submitted ZIPs, exact SDK archives, source ZIP, original CI
logs, marketing QA previews and browser submission/manual screenshots.

## Follow-up validation

The website acceptance check incorrectly rejected any mention of pending store
review. That assertion was removed so accurate channel-specific rollout copy is
allowed; navigation, metadata, links, responsive layout and performance budgets
remain checked. Local built-site acceptance passed across all nine public routes.
The 700ed5a Firefox activation job had an intermittent toolbar-selection timeout
in its six-language fixture; Chrome activation and the full native build passed.
[Chrome / Firefox activation acceptance](https://github.com/oe/cors-unlocker/actions/runs/39348849328)
and [website quality including Lighthouse](https://github.com/oe/cors-unlocker/actions/runs/39348849094)
both passed on `d462dc94fd0ead7039c20b51eef7acc5625940ff`.
[Website deployment](https://github.com/oe/cors-unlocker/actions/runs/39348849114)
also passed; live SDK, FAQ and migration pages report npm 2.1.0 available and
Chrome awaiting review. No extension runtime changed during this follow-up.

## Remaining gates

- Wait for Chrome 2.1.0 approval, then verify the public signed CRX and an actual existing-profile store update.
- Keep the 2.0.0 fingerprint records intact; do not mark Chrome 2.1.0 public based on submission alone.
- Complete the additional manual localized approval-window review and real existing v1-profile upgrade evidence where available.
- Announce coordinated general availability and publish the combined extension Release only after all channels are available. A draft Release may hold the exact artifacts in the meantime.
- Preserve `cors.forth.ink/message/`, original extension IDs and legacy SDK compatibility.
