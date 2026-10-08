# Changelog

## Unreleased

- Preserve concurrent rule/settings writes with a single background mutation queue and shared quotas.
- Reconcile tab-scoped DNR rules using full page origins; remove obsolete dynamic rules and stale CORS rules.
- Use matching URL glob semantics across browser engines and the rule tester; validate HTTP headers and actions.
- Route Firefox SDK requests correctly while keeping privileged operations limited to extension pages.
- Preserve damaged/newer local configuration and provide explicit backup export and recovery.
- Fix CORS session requirements in the editor and inspector, root test commands and draft-release packaging.


All notable changes to this project will be documented in this file.

## v1.1.0

### Added
- **Custom Headers Support**: Added `extraHeaders` field to `IRuleItem` interface for custom CORS headers
- **Comprehensive Test Suite**: Added Vitest, Testing Library, and Playwright testing infrastructure
- **Manifest V2 vs V3 Comparison**: Created detailed documentation comparing capabilities and limitations
- **Homepage Limitations Notice**: Added technical limitations notice with link to FAQ

### Enhanced
- **CORS Header Management**: Implemented `mergeHeaders()` function to combine preset and custom headers
- **Website Navigation**: Fixed anchor link functionality and auto-expansion for FAQ sections
- **Test Coverage**: Added unit tests for rules, storage, and React components

### Fixed
- **Test Isolation**: Resolved mock hoisting and module isolation issues
- **Anchor Navigation**: Fixed conflicts between H2 anchors and details element IDs
- **Client-side Routing**: Fixed anchor expansion when navigating between pages

### Documentation
- Enhanced type definitions with JSDoc comments
- Documented Manifest V3 limitations (cannot modify response status codes)
- Improved FAQ structure with proper anchor handling
