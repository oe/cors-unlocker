# Wireflip 2.0.1 candidate (superseded)

The UI changes below are now included in the [unreleased 2.1 candidate](release-2.1.md). No 2.0.1 package was published.

This patch simplifies the extension workspace. The published Chrome and Firefox versions remain 2.0.0 until a new store submission is reviewed and released.

## User-visible changes

- Keep rule context, enabled status and Save in the header; move Duplicate and Delete into a keyboard-accessible More actions menu
- Collapse secondary list filters and show the number of active filters with a clear action
- Use a quiet New rule button while editing
- Collapse successful legacy-upgrade information into a small expandable notice; preserve recovery warnings and acknowledgment

The redesigned website Playground works with the existing 2.0.0 extensions. It shows the next setup step, request URL, expected response and actual response together, with optional rule configuration under Advanced options. Website-created rules remain disabled until the user enables them; tab sessions remain an explicit toolbar action.

## Release checklist

- [ ] Review the exact candidate commit and its Chrome / Firefox build artifacts
- [ ] Confirm CI type checks, lint, unit tests, Chrome E2E, native Firefox E2E and SDK compatibility
- [ ] Review desktop / narrow workspace screenshots, keyboard menu interaction and legacy-upgrade notice
- [ ] Install each candidate package and spot-check editing, saving, duplication, deletion, filters and recovery
- [ ] Submit Chrome 2.0.1 and Firefox 2.0.1 through their existing store listings
- [ ] Verify public signed 2.0.1 packages before updating published-package baselines
- [ ] Update release records and public-version acceptance workflows to the reviewed package fingerprints
- [ ] Keep the legacy domain and SDK bridge available; no migration endpoint redirects

Use [the full release checklist](release-checklist.md) for packaging, store metadata, rollback and compatibility checks. Do not overwrite the immutable 2.0.0 fingerprints in `release/chrome-store-2.0.0.json`.
