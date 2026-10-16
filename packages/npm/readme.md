# wireflip

> Source candidate: SDK 0.3.0 for the unreleased Wireflip 2.1 extension. The published SDK remains 0.2.0 and stores remain 2.0.0. Existing API methods continue to work; the new `requestRule` flow must be capability-checked until the extension update is public.

An origin-scoped browser SDK for connecting a web app to the locally installed Wireflip extension.

Requires the Wireflip 2.0 extension. Wireflip 2.0.0 is available on the [Chrome Web Store](https://chromewebstore.google.com/detail/knhlkjdfmgkmelcjfnbbhpphkmjjacng) and [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/cors-unlocker/). Update the extension, then install and import `wireflip` directly. Existing `cors-unlocker` integrations remain supported; migration is optional.

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

## One confirmation to enable an example (2.1 candidate)

```ts
// Connect before the click, so the click's user activation is retained
const session = await intercept.connect();

button.addEventListener('click', async () => {
  if (!session.capabilities.ruleActivation) {
    // Keep your existing draft flow or explain that this feature needs Wireflip 2.1
    return;
  }
  const rule = await session.requestRule({
    name: 'Empty projects',
    urlPattern: 'https://api.example.com/projects',
    actions: [{ type: 'mockResponse', status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: '[]' }],
  });
  if (rule.ready) {
    // Test the response; no additional tab session is required
  }
});
```

Use `getStatus({ ruleId: rule.id })` to distinguish an enabled, ready rule from a disabled rule, paused group or browser execution error. A recorded response still needs comparison with the expected result.

## Safety model

- Communication uses a packaged content-script bridge, not a hosted traffic relay.
- The browser supplies the actual sender tab; page code cannot claim a different origin.
- Enabling CORS requires confirmation.
- `createRuleDraft` still creates a disabled, origin-scoped draft for review.
- `requestRule` requires a real click or keyboard action and explicit approval in an extension-owned window; it cannot widen the requesting origin.
- Approved rules execute automatically on matching pages; request recording is optional.
- Advanced mode cannot be silently attached by the SDK.
- Requests are size- and rate-limited.

## API

- `intercept.connect()`
- `intercept.isAvailable()`
- `intercept.openStorePage()`
- `session.getStatus({ ruleId? })`
- `session.requestCors()`
- `session.disableCors()`
- `session.createRuleDraft()`
- `session.requestRule(rule, { id? })` — 2.1 extension, checked through `capabilities.ruleActivation`
- `session.openWorkspace()`

Legacy aliases: `isExtInstalled`, `isEnabled`, `enable`, `disable`, `openExtOptions`, and `openStorePage`.

Full documentation: [wireflip.forth.ink/docs](https://wireflip.forth.ink/docs/)

## Upgrading from cors-unlocker

Existing `cors-unlocker@0.1.0` applications can keep using the retained `cors.forth.ink/message/` bridge. The old domain is not being retired. This package uses a local bridge and requires user confirmation for CORS requests; migration is optional.

Migration is optional. Confirm that Wireflip 2.0 is installed in your browser before changing dependencies. See the [migration guide](https://wireflip.forth.ink/migration/) for current browser availability, upgrade steps and the old-to-new API mapping.
