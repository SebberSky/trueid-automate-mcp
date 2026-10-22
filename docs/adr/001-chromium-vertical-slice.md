# ADR 001: Chromium vertical slice first

## Status

Accepted — 22 October 2026

## Context

Feasibility study concluded we can own REST + MCP, but device control requires a runner. Two runner approaches exist: (A) library/driver under our API, (B) native runner. We must not wrap vendor MCP servers as the primary backend.

## Decision

1. Ship a **Chromium-only vertical slice** first: session → navigate → inspect → find → click/type → assert → screenshot → release.
2. Use **Approach A** for this slice: Playwright library (Apache-2.0) under our service layer. Our REST and MCP call that layer; we do not run Playwright MCP or Appium MCP as backends.
3. Keep one **capability registry** so unsupported actions return explicit `unsupported`, not silent substitutes.
4. Defer iOS/Android native runners until this loop passes acceptance tests on Chromium.

## Consequences

- Faster proof of multi-client contract (REST + MCP) and session/lease semantics.
- Chromium semantics will not automatically equal iOS/Android; each platform needs its own runner later.
- Playwright version and browser binaries become pinned dependencies for the execution package only; the research catalog site stays install-free.
