# wireflip

An origin-scoped browser SDK for connecting a web app to the locally installed Wireflip extension.

Requires the Wireflip 2.0 extension. Firefox 2.0.0 is available on [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/cors-unlocker/). Chrome 2.0.0 has been submitted to the [Chrome Web Store](https://chromewebstore.google.com/detail/knhlkjdfmgkmelcjfnbbhpphkmjjacng) and is awaiting review; Chrome users should keep `cors-unlocker` until the update is available. Install and import `wireflip` directly once your browser has the compatible extension.

```bash
pnpm add wireflip
```

```ts
import { intercept } from 'wireflip';

const session = await intercept.connect();
console.log(session.capabilities.browser, session.capabilities.interception);

await session.requestCors({
  reason: 'Preview staging data',
});

await session.createRuleDraft({
  name: 'Slow projects API',
  urlPattern: 'https://api.example.com/projects/*',
  methods: ['GET'],
  resourceTypes: ['XHR', 'Fetch'],
  actions: [{ type: 'delay', milliseconds: 800 }],
});
```

## Safety model

- Communication uses a packaged content-script bridge, not a hosted traffic relay.
- The browser supplies the actual sender tab; page code cannot claim a different origin.
- Enabling CORS requires confirmation.
- SDK-created rules are always disabled and origin-scoped until reviewed by the user.
- Advanced mode cannot be silently attached by the SDK.
- Requests are size- and rate-limited.

## API

- `intercept.connect()`
- `intercept.isAvailable()`
- `intercept.openStorePage()`
- `session.getStatus()`
- `session.requestCors()`
- `session.disableCors()`
- `session.createRuleDraft()`
- `session.openWorkspace()`

Legacy aliases: `isExtInstalled`, `isEnabled`, `enable`, `disable`, `openExtOptions`, and `openStorePage`.

Full documentation: [wireflip.forth.ink/docs](https://wireflip.forth.ink/docs/)

## Upgrading from cors-unlocker

Existing `cors-unlocker@0.1.0` applications can keep using the retained `cors.forth.ink/message/` bridge. The old domain is not being retired. This package uses a local bridge and requires user confirmation for CORS requests; migration is optional.

Migration is optional. Confirm that Wireflip 2.0 is installed in your browser before changing dependencies. See the [migration guide](https://wireflip.forth.ink/migration/) for current browser availability, upgrade steps and the old-to-new API mapping.
