# Forth Intercept website

The Astro website and documentation for Forth Intercept, a Chrome-native request lab.

```bash
pnpm --filter cors-unlocker build
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
- `/message/` — legacy hidden bridge retained for clients using SDK 0.1

The site is currently hosted at `cors.forth.ink`; the legacy hostname can remain during the product rename.
