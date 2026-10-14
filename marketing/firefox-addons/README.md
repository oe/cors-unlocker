# Firefox Add-ons screenshots

This five-scene English gallery adapts the approved Goldie-inspired, straight-on
Chrome layout for Firefox. It uses the production Firefox UI with labeled sample
data. The shared renderer runs in Chromium; these marketing fixtures do not prove
native Firefox interception. Native Firefox acceptance remains a separate gate.

Upload `screenshots/en/01-popup-1280x800.png` through
`05-delay-1280x800.png` in order. Captions describe response CORS headers,
request inspection, response body replacement, matching, and Fetch/XHR delay.
Firefox response replacement contacts the upstream server and preserves its HTTP
status. The gallery does not claim tab cache bypass or Chrome debugger support.

To regenerate from the repository root after building Firefox:

```bash
pnpm --filter browser-wireflip build:firefox
WIREFLIP_MARKETING_TARGET=firefox \
WIREFLIP_MARKETING_CAPTURES="$PWD/marketing/firefox-addons/source/captures" \
node marketing/chrome-web-store/source/capture.mjs
WIREFLIP_MARKETING_DESIGN="$PWD/marketing/firefox-addons/source/design.json" \
WIREFLIP_MARKETING_OUTPUT="$PWD/marketing/firefox-addons" \
WIREFLIP_MARKETING_CAPTURES="$PWD/marketing/firefox-addons/source/captures" \
node marketing/chrome-web-store/source/export.mjs
```

Set `CHROMIUM_PATH` when the default Playwright executable is unavailable. Copy,
colors and scene order live in `source/design.json`; layout and licensed fonts are
shared with `../chrome-web-store/source/`. Preserve sample labeling and the shared
font attribution. All screenshots are 1280x800 RGB PNGs without transparency.
