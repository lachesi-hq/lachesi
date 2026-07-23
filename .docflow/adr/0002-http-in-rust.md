---
adr: 0002
title: All Bitbucket HTTP lives in Rust
status: Implemented
date: 2026-06-18
owner: default-agent
supersedes:
superseded-by:
depends-on: []
tags: [tauri, rust, bitbucket, credentials]
---

# ADR 0002 - All Bitbucket HTTP lives in Rust

## Context

Lachesi talks to the Bitbucket Cloud REST API for pull requests, diffs, and
comments using an Atlassian API token. The project had to decide where those
HTTP calls happen: in the React webview with `fetch`, via the Tauri HTTP
plugin, or in Rust with `reqwest`.

Constraints:

- The API token is sensitive.
- `api.bitbucket.org` does not send permissive CORS headers for a `tauri://` or
  `localhost` origin, so webview `fetch` is blocked.
- The Bitbucket diff endpoint redirects to a signed URL and must be followed.

## Capability statement

All Bitbucket HTTP access runs through Rust Tauri commands using a blocking
`reqwest` client with `rustls-tls`, run off the UI thread through
`tauri::async_runtime::spawn_blocking`. The webview sends and receives typed
DTOs over IPC; it never sees the token or performs cross-origin provider HTTP.

## User stories / scenarios

- As a reviewer, I can list and inspect Bitbucket pull requests without placing
  provider tokens in the webview.
- As a maintainer, I can keep the browser security policy tight while still
  following provider redirects and using authenticated provider APIs.
- As a frontend developer, I can exercise provider flows in browser dev,
  Storybook, and tests through mock IPC handlers.

## Acceptance criteria

1. Bitbucket API requests are implemented in Rust Tauri commands rather than
   browser `fetch`.
2. The webview exchanges typed DTOs with the backend and does not receive the
   raw Bitbucket token.
3. Blocking provider requests are run off the UI thread.
4. Browser, Storybook, and test modes can use mock handlers for the same
   frontend IPC surface.

## Out of scope

- GitHub provider API placement.
- Credential storage mechanics.
- General provider abstraction across all source hosts.

## Open questions

- None.

## References

- ../../.archgate/adrs/ARCH-001-tauri-react-rust-bitbucket-boundary.md
- ../../src/lib/tauri.ts
- ../../src-tauri/src/lib.rs

## Revision History

| Date | Revision | Author | Change |
|------|----------|--------|--------|
| 2026-06-18 | r1 | maintainer | Recorded the original decision in `docs/adr/0001-http-in-rust.md`. |
| 2026-07-10 | r2 | default-agent | Migrated into the docflow catalogue and renumbered from 0001 to 0002. |

## Approvals

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Maintainer | fdg | 2026-07-10 | approved in chat |
