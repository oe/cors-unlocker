# wireflip

> SDK 2.1.0 targets Wireflip 2.1 website authorization and rule control. Firefox 2.1.0 is available; Chrome 2.1.0 has been submitted for review and the public Chrome version is still 2.0.0. Capability-check newer APIs during rollout. Basic CORS and draft APIs remain compatible with extension 2.0; installed extensions update separately from this package.

An origin-scoped browser SDK for connecting a web app to the locally installed Wireflip extension.

Requires Wireflip 2.0 or later. Install from the [Chrome Web Store](https://chromewebstore.google.com/detail/knhlkjdfmgkmelcjfnbbhpphkmjjacng) and [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/cors-unlocker/). Update the extension and check its capabilities, then install and import `wireflip` directly. Existing `cors-unlocker` integrations remain supported; migration is optional.

```bash
pnpm add wireflip
```

```ts
import { intercept } from 'wireflip';

const session = await intercept.connect();
console.log(session.capabilities.browser, session.capabilities.interception);

enableCorsButton.addEventListener('click', async () => {
  try { await session.requestCors({ reason: 'Preview staging data' }); }
  catch (error) { console.error(error); } // Show cancellation or errors in your UI
});

createDraftButton.addEventListener('click', async () => {
  try {
    await session.createRuleDraft({
      name: 'Slow projects API',
      urlPattern: 'https://api.example.com/projects/*',
      methods: ['GET'],
      resourceTypes: ['XHR', 'Fetch'],
      actions: [{ type: 'delay', milliseconds: 800 }],
    });
  } catch (error) { console.error(error); } // Show feedback in your UI
});
```

## One confirmation to enable an example (Wireflip 2.1)

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

Use `disableRule(rule.id)` from a separate button to restore original requests (unless another rule applies). Disable, enable and delete operations require the same authorization as rule creation. Only SDK-owned rules from this exact origin can be managed. Saved changes persist after refresh and can affect other tabs from the same origin. The popup shows the last completed website operation.

Use `getStatus({ ruleId: rule.id })` to distinguish an enabled, ready rule from a disabled rule, paused group or browser execution error. A recorded response still needs comparison with the expected result.

## Safety model

- Communication uses a packaged content-script bridge, not a hosted traffic relay.
- The browser supplies the actual sender tab; page code cannot claim a different origin.
- Website mutations require extension-owned confirmation by default, including disabling CORS, creating drafts, and changing or deleting rules. Start each untrusted request from a real click or key action.
- Only the extension popup can grant persistent trust to an exact origin. Trusted sites can manage their SDK-owned rules without repeated confirmation; credential access still requires explicit approval.
- Revoking trust restores confirmations without changing saved rules. Manual and older unowned rules remain controlled in the extension. For an existing CORS rule, read its status and use it as configured; remove and recreate it through the SDK only if the user wants to transfer management.
- `createRuleDraft` still creates a disabled, origin-scoped draft for review.
- `requestRule` cannot widen the requesting origin. Without site trust it requires a real click or keyboard action and explicit approval in an extension-owned window.
- Approved rules execute automatically on matching pages; request recording is optional.
- Authorized enabled rules may automatically start the browser transport; request recording remains controlled in the extension.
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
- `session.enableRule(id)` / `session.disableRule(id)` / `session.deleteRule(id)` — check `capabilities.ruleManagement`
- `session.openWorkspace()`

Legacy aliases: `isExtInstalled`, `isEnabled`, `enable`, `disable`, `openExtOptions`, and `openStorePage`.

Full documentation: [wireflip.forth.ink/docs](https://wireflip.forth.ink/docs/)

## Upgrading from cors-unlocker

Existing `cors-unlocker@0.1.0` applications can keep using the retained `cors.forth.ink/message/` bridge. The old domain is not being retired. This package uses a local bridge and requires user confirmation for CORS requests; migration is optional.

Migration is optional. Confirm that Wireflip 2.0 is installed in your browser before changing dependencies. See the [migration guide](https://wireflip.forth.ink/migration/) for current browser availability, upgrade steps and the old-to-new API mapping.


## Upgrading website control to Wireflip 2.1

Wireflip 2.1 asks for approval in an extension window unless the user has manually trusted this exact site in **Popup → Website control**. Trust does not authorize sensitive credential access or transfer ownership of existing rules. Revoking trust restores prompts; saved rules remain in their current state.

Website developers should use `wireflip@2.1.0` for the new authorization flow. Published `wireflip@0.2.0` stops waiting after 5 seconds for some operations, so Wireflip 2.1 rejects requests that need approval immediately with an `invalid-request` upgrade message. It does not leave a pending window that could change rules after the website reports failure. Read-only methods still work; manually trusted sites can continue ordinary operations. Sensitive requests still need the updated SDK. Show the returned message in your website instead of reporting success.

If an existing CORS rule has no website ownership, open **Wireflip → Rules** to manage it. To let the website create a new owned rule, delete the old CORS rule there, return to the website, and retry. This deliberately does not grant websites control of manual or older unowned rules.

Coordinated release: the Chrome extension, Firefox extension and npm SDK share version 2.1.0 and one release announcement. Submit both store updates and coordinate npm publication in the same release window; store review and propagation can finish at different times. Announce general availability once all three channels are available. Basic SDK CORS/draft APIs remain compatible with extension 2.0; capability-check newer APIs during rollout. Firefox 2.1.0 is public; Chrome 2.1.0 is awaiting review. Check the migration guide for current channel availability.
