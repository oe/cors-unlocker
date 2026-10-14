# wireflip

An origin-scoped browser SDK for connecting a web app to the locally installed Wireflip extension.

The origin-scoped browser SDK for Chrome and Firefox. Install and import `wireflip` directly.

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

The `wireflip` package is not yet published. Keep the old dependency until the new SDK and compatible extension are released. See the [migration guide](https://wireflip.forth.ink/migration/) for upgrade steps and the old-to-new API mapping.
