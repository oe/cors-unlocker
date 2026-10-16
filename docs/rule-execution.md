# Rule execution model — Wireflip 2.1 candidate

The published extension remains 2.0.0. This design and its implementation belong to the unreleased 2.1 candidate; do not publish the extension or SDK as part of this change.

## User model

An enabled saved rule runs automatically on every supported page whose top-level origin and requests match its conditions. Turning a group off pauses its enabled rules without changing their individual switches. Turning it back on resumes execution without another start action.

Request recording is optional. Inspector Start recording includes additional traffic in its log; Stop recording clears this tab's temporary controls while saved rules keep running. Temporary CORS, delays, failures and cache bypass affect only their selected tab and are cleared on stop or navigation to another origin.

The browser toolbar uses blue for enabled saved rules, green for recording or temporary changes, amber while preparing and red when browser execution needs attention. Counts describe enabled rules, not proof that a particular request changed.

## Website and Playground

1. The visitor chooses Enable example
2. An extension-owned window shows the actual requesting origin, URL pattern and actions
3. One explicit approval saves and enables the rule, prepares matching tabs, closes the approval and returns to the page
4. The page enables its test only after the extension reports that exact rule ready

Cancel, closing approval, invalid input and navigation before approval do not authorize a rule. A page cannot approve itself or broaden the initiating origin. An existing rule ID is checked against the actual sender origin before changes.

SDK `requestRule` and per-rule readiness are additive capabilities in the 0.3 candidate. Existing `createRuleDraft` remains a disabled draft and preserves its existing workspace behavior. The website detects capabilities, so published 2.0.0 extensions retain the compatible setup path until their store update.

## Execution

- Simple actions continue using browser network rules
- Chrome prepares debugger interception automatically where saved actions require it; its native debugging indicator cannot be hidden
- Firefox prepares its WebRequest / response replacement and CORS network rules automatically
- Existing matching tabs, newly opened tabs and origin changes reconcile from the current enabled rules
- No eligible saved rules, recording or temporary controls means no interception connection is retained
- Unmatched automatic traffic is not added to the request log
- Browser-imposed restrictions and debugger conflicts are shown as execution errors rather than claimed as success
- Stopping debugging through Chrome's own control is respected for that tab; the extension must not reopen it in a retry loop

Firefox body replacement still contacts the upstream server and preserves its HTTP status. This change does not turn Wireflip into a VPN or an IP proxy.

## Acceptance

Both candidate engines must pass the same saved-rule / recording contract and the new built-website journey. Required evidence includes approval cancellation, accurate origin, first enabled test, another matching tab, unrelated origin, stop recording, rule off, group off/on, reload without duplicates, cache restoration and actual response-body verification. Published Chrome / Firefox 2.0.0 compatibility is tested separately.
