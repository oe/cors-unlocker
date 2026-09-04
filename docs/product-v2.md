# Forth Intercept v2 product direction

## Decision

The product is **Forth Intercept**, described as **a Chrome-native request lab**.

“Browser Proxy” is not the brand. It is too generic, overlaps with IP/VPN proxy products, and incorrectly suggests system-wide routing. “Forth Intercept” is tied to the existing forth.ink identity while describing what the extension actually does: intercept and patch request behavior inside a browser tab.

Core line: **Patch the request. Keep your flow.**

Canonical website: **https://intercept.forth.ink**. The former `cors.forth.ink` hostname remains a redirect and legacy SDK compatibility surface.

## Audience and job

Primary users are frontend engineers and QA engineers who need to reproduce API states without changing backend code or leaving the page they are testing.

The main job is not “remove CORS.” It is:

> Change what the current browser tab sends or receives, observe the result, and turn the successful experiment into a reusable local rule.

## Competitive boundary

Requestly already covers a broad interceptor platform, team collaboration, desktop interception, API clients, script injection, sessions, and cloud features. ModHeader owns the simple header-editing mental model. FoxyProxy and many products called “browser proxy” are mainly upstream proxy switchers.

Forth Intercept should not compete by copying that breadth. Its useful wedge is:

1. **Small, local, browser-only request lab** with no account and no native install.
2. **Two explicit execution paths:** warning-free DNR rules for common work and opt-in tab-scoped CDP only when deeper interception is needed.
3. **Application-aware SDK:** a web app can detect the extension, request origin-scoped CORS access, and prepare a disabled rule draft for user review.
4. **Upgrade continuity:** existing CORS Unlocker rules migrate automatically.

Research references:

- Requestly HTTP Interceptor: https://requestly.com/products/http-interceptor/
- Requestly Chrome extension: https://chromewebstore.google.com/detail/mdnleldcmiljblolnjhpnblkcekpdkpa
- ModHeader comparison and feature boundary: https://requestly.com/modheader/
- FoxyProxy browser extension: https://github.com/foxyproxy/browser-extension

## SDK product role

The SDK is not a remote control surface for arbitrary interception. It is a consented capability bridge between the current web app and its local extension.

Allowed:

- detect and connect;
- read status for the current origin;
- request CORS repair after confirmation;
- disable that origin's CORS rule;
- create a disabled, origin-scoped rule draft;
- open the workspace.

Not allowed:

- attach CDP silently;
- enable a draft automatically;
- target another page origin;
- read captured traffic into page JavaScript;
- execute arbitrary JavaScript.

The npm package remains `cors-unlocker` for continuity. Version 0.2 adds `intercept.connect()` and marks the old helpers as deprecated aliases. A future major version can move to a new package name after the brand has proven useful.

## Website information architecture

- Home: positioning, real product surface, two execution paths, SDK wedge, privacy, v1 migration.
- Docs: install, modes, rules, inspector, SDK API, migration, limitations.
- SDK playground: live extension detection, consented CORS request, disabled draft creation.
- FAQ: product category, CDP disclosure, script limits, Firefox status.
- Privacy: local data boundary, permissions, detach behavior, SDK sender-origin trust boundary.

## Next product gates

Before expanding breadth, validate:

- SDK connection and consent completion rate;
- how often captured requests become enabled rules;
- whether Advanced mode detach failures occur;
- whether users understand the debugging banner before enabling;
- demand for request/response body transforms and reusable profiles.

Do not add cloud sync, team collaboration, arbitrary scripts, or a native client until real usage proves they are worth the additional trust and maintenance surface.
