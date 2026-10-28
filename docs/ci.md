# CI ownership and failure diagnosis

`Build v2 artifacts` owns candidate validation. It builds the SDK, Chrome, Firefox and website once, runs type/lint/unit checks once, and shares an immutable artifact with two parallel native browser jobs. Firefox requires only stdlib Python and the pinned browser/driver; it does not reinstall Node dependencies or rebuild the product. The duplicated automatic-activation workflow is retired; its Chrome flows and all three Firefox suites remain in full acceptance.

The browser jobs fail at the actual failing step. Subsequent independent Firefox suites still run to collect evidence; there is no `continue-on-error` that makes a failed suite appear green. `Accepted release artifacts` runs only on main pushes and manual builds, after both browsers pass. PRs finish with the two browser results; they do not start a separate artifact-promotion runner. Main uploads the accepted site for deployment; manual builds additionally publish installable/SDK archives. Diagnostic artifacts are retained separately, with concise step summaries instead of inline base64 screenshots.

Ordinary PR/main runs execute the Firefox suite once. For a race investigation, manually dispatch `Build v2 artifacts` with `stability: true` to run the three historical cases (editor remount, popup/toolbar and group pause) three times. Every iteration must pass. The signed-v1 migration remains last so it cannot change the environment of the ordinary acceptance tests. Chrome does not retry its serial suite: a failure produces a trace rather than rerunning all earlier tests and hiding instability.

## Readiness boundaries

- Storage visibility is not native rule readiness. A group-pause test waits for its switch to be off and interactive again, after the awaited mutation completes, then asserts the next real request is unmodified. It does not poll requests until one passes.
- A saved editor draft can remount. Wait for the saved UI and reacquire a stale input handle when filling it. Other WebDriver errors fail immediately; saves and user decisions are never retried.
- Native action state can reset on navigation. The product invalidates its toolbar paint cache on navigation, including completion, so identical presentations are reapplied. Queue invalidation behind an in-flight paint.
- Failure artifacts include page URLs/text, tab-specific toolbar state and runtime status. Evidence-capture errors cannot overwrite an existing test failure.

## Efficiency and deployment

Source changes trigger candidate validation; root documentation/marketing-only changes do not rebuild every package. Superseded PR runs are cancelled per workflow/ref. Running main checks are not cancelled; GitHub concurrency retains only the latest pending run. Native Firefox fixtures and Playwright downloads use version-specific caches; the pinned installer verifies cached browser/driver versions. SDK package inspection uses `npm pack --dry-run`, which is valid before and after publication.

Public Chrome, public Firefox Playground and the SDK/public-Firefox compatibility matrix run only via manual dispatch after release changes or when diagnosing compatibility. They do not rebuild and install public browsers on every PR or main website edit. Candidate Chrome/Firefox acceptance remains automatic. Website navigation/metadata checks run for website PRs; Lighthouse runs on main/manual requests, rather than on every PR update. Legitimate per-channel rollout text is not a failure.

Intermediate shared build artifacts expire after one day; diagnostics are uploaded only on failure and retained for three days. Release bundles are produced on manual request and retained for seven days. Passing website PRs do not upload screenshots or inline base64 evidence. A typical source PR uses three runners (build + Chrome + Firefox), or four if website quality also applies, instead of the earlier seven-job combination.

Main website deployment consumes the already accepted `wireflip-site-<sha>` artifact from a successful **push-to-main** run in this repository. Fork/PR workflow completions cannot deploy. A newer main SHA suppresses stale deployment. Tag-triggered draft-release packaging remains separate and does not publish npm or stores.

## Local checks

```sh
pnpm --filter browser-wireflip exec tsc -p tsconfig.json --noEmit
pnpm --filter browser-wireflip exec eslint src tests
pnpm --filter browser-wireflip test:run
python3 -m unittest discover -s packages/browser-extension/tests/firefox -p '*_unit_test.py'
# After building dist/firefox and installing the pinned native browser:
FIREFOX_STABILITY_REPEATS=3 python3 packages/browser-extension/tests/firefox/extension_test.py
# Validate workflows with actionlint (tested with 1.7.12).
actionlint
```

A green run is evidence for that exact candidate, not proof that a race is impossible. Keep regression repetitions and failure evidence when changing the harness; do not replace readiness checks with fixed sleeps or blanket workflow reruns.
