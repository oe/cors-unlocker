# Wireflip brand assets

The approved mark has two rounded, opposing forms separated by a curved route.
Its palette is soft periwinkle **#6b80cc** and slate blue **#435d91**.
Use the two-color mark for product branding and store icons. The toolbar uses
the same silhouette in white on its existing status-color background, so idle,
rules, connecting, active sessions and errors remain clear on light and dark
browser themes. Badges and localized tooltips continue to describe the state.

![Approved mark](icons/256.png)

## Files

- [Vector mark](wireflip-mark.svg): two filled paths, transparent background,
  no fonts, external images, filters or gradients
- [PNG exports](icons/): transparent 16, 32, 48, 128, 256 and 512 px icons
- [Manifest](manifest.json): palette, provenance and deployment locations
- [Approved concept](source/approved-concept.png): selected logo and wordmark
- [Extracted mark](source/mark-cutout.png): standalone ImageGen extraction

The approved concept and extraction were produced with Codex ImageGen on
2026-10-13. The extracted silhouette was traced with `potrace@2.1.8`, removing
raster specks and preserving its two contours. The flat production colors use
the approved palette. The paths and view box in
[`brand-geometry.ts`](../../packages/browser-extension/src/common/brand-geometry.ts)
are the source of truth shared with the native toolbar renderer.

## Regenerate

From the repository root after the usual dependency installation:

```bash
pnpm --filter browser-wireflip exec tsx ../../marketing/brand/export.mts
```

This uses the existing Playwright dependency and `CHROMIUM_PATH`, system
Chromium, or Playwright's installed Chromium. It generates the SVG and PNG
exports, extension icons, website mark and self-contained social image, then
updates the manifest. It adds no production dependency or extension permission.
The source images are provenance, not runtime assets.

To refresh the store gallery after exporting and rebuilding the extension,
follow the [Chrome Web Store workflow](../chrome-web-store/README.md).
