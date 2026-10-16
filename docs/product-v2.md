# Wireflip v2 product direction

> The 2.1 candidate revises execution and activation around [the rule execution model](rule-execution.md). Published stores remain 2.0.0 until a separate release.

## Decision

The product is **Wireflip**, described as **an in-browser proxy for developers** for Chrome and Firefox.

Wireflip is an independent product name. It evokes changing request traffic while keeping the application workflow moving. “Browser Proxy” remains a category description: the extension modifies browser requests rather than routing system-wide traffic or changing an IP address.

Core line: **Patch the request. Keep your flow.**

Canonical website: **https://wireflip.forth.ink**. Keep the previously published `cors.forth.ink` hostname available for legacy SDK clients and redirect public pages to the canonical site. DNS, HTTPS and redirects must be configured separately; see `packages/website/README.md`.

## Audience and job

Primary users are frontend engineers and QA engineers who need to reproduce API states without changing backend code or leaving the page they are testing.

The main job is not “remove CORS.” It is:

> Change what the current browser tab sends or receives, observe the result, and turn the successful experiment into a reusable local rule.

## Competitive boundary

Requestly already covers a broad interceptor platform, team collaboration, desktop interception, API clients, script injection, sessions, and cloud features. ModHeader owns the simple header-editing mental model. FoxyProxy and many products called “browser proxy” are mainly upstream proxy switchers.

Wireflip should not compete by copying that breadth. Its useful wedge is:

1. **Small, local, browser-only request lab** with no account and no native install.
2. **One saved-rule model:** enabling a rule applies it to all matching supported pages. DNR, Chrome debugger interception and Firefox WebRequest are execution details; optional recording and temporary tab controls remain separate.
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
- request a real-user-action, extension-owned confirmation to enable an origin-scoped rule;
- open the workspace.

Not allowed:

- enable rules from a website without explicit user approval;
- bypass Chrome's native debugging indicator;
- silently convert a disabled draft into an enabled rule;
- target another page origin;
- read captured traffic into page JavaScript;
- execute arbitrary JavaScript.

The npm package is `wireflip`. Web apps connect with `intercept.connect()`. The SDK and extension use the `wireflip:sdk-request` / `wireflip:sdk-response` page bridge. The previous pre-release brand is replaced directly; no old-brand package, protocol alias, or re-export package is maintained.

## Workspace layout and interaction

The workspace uses a compact 44px context header on desktop, shared by rule management,
editing, and Data & recovery. It shows the page or current rule, unsaved changes, and
the selected rule's save/enable/duplicate/delete controls. The editor starts with its
section tabs, avoiding a second title toolbar. Narrow windows let the header wrap so
titles, state, and actions stay reachable.

The left sidebar holds the Wireflip brand aligned with that header, Rules, Data, and
Settings at the bottom. Both wide and narrow windows show navigation
labels; narrow windows stack short labels beneath their icons. Accessible names and
hover titles retain the full Data & migration description. Settings opens a small popover
with Language and Theme selectors. Theme offers Follow system, Light, and Dark; preferences
persist locally and update all open Workspace, Popup, and Inspector pages. System changes
apply only while Follow system is selected. Escape or clicking outside closes the popover
without discarding a rule draft.

New rule and New group sit at the top of the rule list, beside search and filters.
List and editor scroll independently beneath the shared header, keeping their actions
available. Name and group share a row when the editor is wide enough. Narrow windows show one
pane at a time; Back to rules returns to the list.

Switching pages, creating another rule, or leaving the editor protects unsaved drafts.
Ctrl/Cmd+K focuses rule search (returning to the list on narrow windows, with a discard
prompt if needed); Ctrl/Cmd+S saves the selected rule. Changing language preserves the draft.

## Website information architecture

- Home: positioning, real product surface, two execution paths, SDK wedge, privacy, v1 migration.
- Docs: install, modes, rules, inspector, SDK API, migration, limitations.
- Playground: choose an example, approve once in the extension, then compare the response; retain a capability-checked fallback for published 2.0.0 extensions.
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

## Product family and popup boundary

RequestOrbit serves ordinary users who want to DIY link redirects: source URL, destination URL,
examples, and a safe way to test the result. Wireflip serves developers reproducing API
behavior inside a browser tab. Wireflip is a browser request proxy, not an IP proxy or a system VPN.

Its popup prioritizes the current tab, Inspector, and session-only quick controls. CORS is one
capability alongside API delay and failure simulation. Configurable mocks, headers, and redirects
become shortcuts by pinning named saved rules, not by adding ambiguous category-wide toggles.
Persistent site rules are labeled separately and remain unchanged when a debugging session stops.
Chrome offers a session-only Disable cache switch using CDP HTTP-cache control. Firefox hides this unsupported control. It does not clear browser data or bypass service workers.

The toolbar reflects each tab: gray when inactive, blue with a count for installed persistent rules,
green `ON` for a connected session, amber while connecting, and red on a session error. Its tooltip
lists applied temporary controls, including the delay duration and CORS credentials option, and
keeps the persistent rule count separate. Chrome also reports whether requests are being recorded:
a cache-only session can be connected without recording. Turning off the last quick control stops
an automatically started Chrome session; a manually started session keeps recording until stopped.
Control details disappear on stop or navigation to another origin.
