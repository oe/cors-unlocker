# Legacy SDK documentation patch

This directory prepares `cors-unlocker@0.1.1` from the exact published `0.1.0` archive. It does not rename the new SDK, add a workspace package, or rebuild the old JavaScript from today's sources.

```bash
python3 scripts/prepare-legacy-sdk-patch.py
npm publish ./artifacts/legacy-sdk/cors-unlocker-0.1.1.tgz --dry-run --ignore-scripts
```

The script pins and checks the published archive's SHA-512 integrity, prepends `migration-notice.md` to its original README, and changes only the package version. It verifies that runtime bundles, declarations, entry points and the file list are unchanged. Generated archives are ignored by Git.

If the source archive is already downloaded, pass `--source /path/to/cors-unlocker-0.1.0.tgz`. It receives the same integrity check. Do not publish from `packages/npm`: that directory builds the new `wireflip` SDK.

The notice deliberately links to the retained old domain and repository, so it is useful before the new domain launches. It asks readers to check availability rather than assuming the new package is live. Once Wireflip is publicly released, update the website migration guide's release status before publishing the legacy documentation patch.

Publication is a separate step. Use the [release checklist](../../docs/release-checklist.md), including old SDK acceptance testing, publisher access, archive inspection and post-publication integrity checks. Do not deprecate the legacy package or retire its bridge as part of this release.
