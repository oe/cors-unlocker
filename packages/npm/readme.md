# forth-intercept

An origin-scoped browser SDK for connecting a web app to the locally installed Forth Intercept extension.

The canonical, origin-scoped browser SDK for Chrome and Firefox. Existing users can keep using the `cors-unlocker` compatibility package.

```bash
pnpm add forth-intercept
```

```ts
import { intercept } from 'forth-intercept';

const session = await intercept.connect();

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
- Chrome supplies the actual sender tab; page code cannot claim a different origin.
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

Full documentation: [intercept.forth.ink/docs](https://intercept.forth.ink/docs/)
