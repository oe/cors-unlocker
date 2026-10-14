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

The canonical site is `https://wireflip.forth.ink`. The tracked `public/CNAME` configures GitHub Pages; it does not create DNS records.

## Domain migration

1. In Cloudflare DNS for `forth.ink`, create a DNS-only CNAME named `wireflip` targeting `oe.github.io`. Keep GitHub Pages configured for `wireflip.forth.ink`.
2. Wait for GitHub Pages to issue its certificate, enable Enforce HTTPS, and verify `/`, `/docs/`, `/playground/` and `/message/` over HTTPS.
3. Keep the `cors.forth.ink` DNS record proxied through Cloudflare. Configure a Single Redirect for public pages using the expression below, a dynamic destination `concat("https://wireflip.forth.ink", http.request.uri.path)`, status 301 and Preserve query string enabled.

```text
(http.host eq "cors.forth.ink" and not (http.request.uri.path eq "/message" or starts_with(http.request.uri.path, "/message/") or starts_with(http.request.uri.path, "/_astro/")))
```

Do not redirect the legacy `/message/` iframe across origins: published SDK 0.1 clients depend on its original origin. Serve the built `message/index.html` at `/message/` on `cors.forth.ink` using a separate static deployment behind Cloudflare, with `/message` normalized to `/message/`. GitHub Pages supports one custom hostname per site, so changing its CNAME alone cannot host the old bridge. Deploy the website output including its `_astro/` assets (without reusing the new site's CNAME), and preserve the bridge's original origin; the extension continues to allow `https://cors.forth.ink`.

Before declaring migration complete, verify that an old public URL such as `https://cors.forth.ink/docs/?from=legacy` redirects to the same path and query on the new domain, and that `/message/` still serves the bridge at the old origin. `intercept.forth.ink` was an unpublished intermediate hostname and is not a compatibility requirement.
