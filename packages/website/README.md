# Wireflip website

The Astro website and documentation for Wireflip, a browser-native request lab for Chrome and Firefox.

```bash
pnpm --filter wireflip build
pnpm --filter website dev
```

Production build:

```bash
pnpm --filter website build
```

Routes:

- `/` — product positioning and feature overview
- `/docs/` — extension and SDK documentation
- `/playground/` — live origin-scoped SDK bridge test
- `/faq/` — product, migration, and browser-disclosure answers
- `/privacy/` — permissions, local data, and SDK trust boundary
- `/migration/` — user-facing domain and SDK migration guide
- `/message/` — legacy hidden bridge retained for clients using SDK 0.1

The canonical site is `https://wireflip.forth.ink`. On 2026-10-15, the successful CI website artifact from `200cb674f15fbc63c35525bbdd701d75f8e3b7a2` was deployed independently to the Cloudflare Pages project `cors-unlocker-legacy`. Its proxied custom domain `cors.forth.ink` serves the retained bridge. Both exact legacy SDK archives (`0.1.0` and the documentation-only `0.1.1`) passed real public HTTPS bridge acceptance before changing the GitHub Pages CNAME. GitHub Pages now targets the new hostname; deployment and certificate checks are recorded in the release evidence.

## Domain migration

1. First deploy and verify the old-origin bridge and its assets on separate hosting, as described below. Keep the existing GitHub Pages CNAME until that deployment serves `/message/` successfully on `cors.forth.ink`.
2. In Cloudflare DNS for `forth.ink`, create a DNS-only CNAME named `wireflip` targeting `oe.github.io`. Only after the old bridge is verified, change `public/CNAME` and GitHub Pages to `wireflip.forth.ink`.
3. Wait for GitHub Pages to issue its certificate, enable Enforce HTTPS, and verify `/`, `/docs/`, `/playground/` and `/message/` over HTTPS.
4. Keep the `cors.forth.ink` DNS record proxied through Cloudflare. Configure a Single Redirect for public pages using the expression below, a dynamic destination `concat("https://wireflip.forth.ink", http.request.uri.path)`, status 301 and Preserve query string enabled.

```text
(http.host eq "cors.forth.ink" and not (http.request.uri.path eq "/message" or starts_with(http.request.uri.path, "/message/") or starts_with(http.request.uri.path, "/_astro/")))
```

Do not redirect the legacy `/message/` iframe across origins: published SDK 0.1 clients depend on its original origin. Serve the built `message/index.html` at `/message/` on `cors.forth.ink` using a separate static deployment behind Cloudflare, with `/message` normalized to `/message/`. GitHub Pages supports one custom hostname per site, so changing its CNAME alone cannot host the old bridge. Deploy the website output including its `_astro/` assets (without reusing the new site's CNAME), and preserve the bridge's original origin; the extension continues to allow `https://cors.forth.ink`.

Before declaring migration complete, verify that an old public URL such as `https://cors.forth.ink/docs/?from=legacy` redirects to the same path and query on the new domain, and that `/message/` still serves the bridge at the old origin. `intercept.forth.ink` was an unpublished intermediate hostname and is not a compatibility requirement.

## Website quality checks

The website uses static Astro pages. React and the SDK are hydrated only on Playground.
Install links share one browser-aware component and fall back to browser choices when
JavaScript is unavailable or the visitor is using a mobile/unknown browser.

Docs start with extension setup; the extension guide, optional SDK guide and troubleshooting
have separate routes. Existing `/docs/#install` and `/docs/#sdk` entry points remain useful.

After a production build, run:

```bash
pnpm --filter browser-wireflip exec playwright install chromium
node packages/website/scripts/verify-site.mjs
```

Set `WIREFLIP_LIGHTHOUSE=1` to also run pinned Lighthouse 12.8.2 mobile checks.
CI checks every public sitemap route at 1280px and 390px, internal links/anchors,
browser-specific store choices, menu keyboard/outside dismissal, Playground UI states,
canonical/OG/Twitter metadata, structured data and JavaScript gzip budgets.
The probe UI test uses a deterministic network fixture; it is not an interception test.

Budgets: 15 KiB runtime JavaScript gzip on static pages, 90 KiB on Playground;
mobile Lighthouse performance ≥90, SEO ≥95, accessibility ≥90.
Reports and native browser screenshots are saved under ignored `artifacts/website-qa/`
and uploaded by the **Website quality** workflow. Screenshots may also be emitted in
chunked CI evidence records for inspection when a local workspace is unavailable.

Lighthouse is lab evidence, not real-user INP or a guarantee of search rankings.
No analytics or third-party telemetry is added. The old message bridge keeps its
`noindex` directive and is excluded from the public sitemap.
