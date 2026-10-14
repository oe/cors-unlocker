## CORS Unlocker is becoming Wireflip

**This 0.1.1 release updates documentation only. Its JavaScript bundles, type definitions, API and hosted-bridge address are unchanged from 0.1.0.**

You can continue using `cors-unlocker`. Migration is optional, and no retirement date for the old SDK bridge has been announced. The old `cors.forth.ink` domain and its `/message/` bridge are retained for existing applications. Do not replace the bridge hostname in your application: the iframe must keep its original origin.

Wireflip expands the browser extension beyond CORS repair to request inspection, header changes, redirects, blocking, mocks and delay/failure simulation. It keeps the existing extension IDs; no reinstall is required solely for the rename.

**Check release availability before upgrading.** This documentation patch does not publish the new `wireflip` package or the new extension. Keep your existing dependency until both are publicly available. See the [migration guide on the existing domain](https://cors.forth.ink/migration/) for current release status and upgrade steps, or [read it in the repository](https://github.com/oe/cors-unlocker/blob/main/packages/website/src/pages/migration.mdx).

After release, the new SDK uses `import { intercept } from 'wireflip'` and a packaged local bridge instead of the hosted iframe. CORS requests require user confirmation and apply only to the application's actual page origin. Read the guide for the API mapping and behavior changes before switching packages.

The reference below describes the unchanged **legacy `cors-unlocker` API**.
