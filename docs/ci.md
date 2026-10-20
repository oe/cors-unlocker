# CI ownership and failure diagnosis

`Build v2 artifacts` owns candidate validation. It builds the SDK, Chrome, Firefox and website once, runs type/lint/unit checks once, and shares an immutable artifact with two parallel native browser jobs. Firefox requires only stdlib Python and the pinned browser/driver; it does not reinstall Node dependencies or rebuild the product. The duplicated automatic-activation workflow is retired; its Chrome flows and all three Firefox suites remain in full acceptance.

The browser jobs fail at the actual failing step. Subsequent independent Firefox suites still run to collect evidence; there is no `continue-on-error` that makes a failed suite appear green. `Accepted release artifacts` requires both browser jobs and the build before promoting installable archives and the website. Diagnostic artifacts are retained separately, with concise step summaries instead of inline base64 screenshots.

The three historically unstable Firefox cases (editor remount, popup/toolbar and group pause) run three times per native job. Every iteration must pass. The signed-v1 migration remains last so it cannot change the environment of the ordinary acceptance tests. Chrome does not retry its serial suite: a failure produces a trace rather than rerunning all earlier tests and hiding instability.

## Readiness boundaries

- Storage visibility is not native rule readiness. A group-pause test waits for its switch to be off and interactive again, after the awaited mutation completes, then asserts the next real request is unmodified. It does not poll requests until one passes.
- A saved editor draft can remount. Wait for the saved UI and reacquire a stale input handle when filling it. Other WebDriver errors fail immediately; saves and user decisions are never retried.
- Native action state can reset on navigation. The product invalidates its toolbar paint cache on navigation, including completion, so identical presentations are reapplied. Queue invalidation behind an in-flight paint.
- Failure artifacts include page URLs/text, tab-specific toolbar state and runtime status. Evidence-capture errors cannot overwrite an existing test failure.

## Efficiency and deployment

Source changes trigger candidate validation; root documentation/marketing-only changes do not rebuild every package. Superseded PR runs are cancelled per workflow/ref. Main runs finish normally. Native Firefox fixtures and Playwright downloads use version-specific caches; the pinned installer verifies cached browser/driver versions. SDK package inspection uses `npm pack --dry-run`, which is valid before and after publication.

Public-store compatibility and website quality are separate checks because they exercise published packages and performance budgets. They also cancel superseded PR runs. Keep their assertions about actual behavior and metadata; legitimate per-channel rollout text is not a failure.

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
