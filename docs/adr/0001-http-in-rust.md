# ADR 0001 — All Bitbucket HTTP lives in Rust

- Status: Accepted
- Date: 2026-06-18

## Context

Lachesi talks to the Bitbucket Cloud REST API (list PRs, diffs, comments) using
an Atlassian API token. We must decide where those HTTP calls happen: in the
React webview (`fetch`), via the Tauri HTTP plugin, or in Rust (`reqwest`).

Constraints:
- The API token is sensitive (it guards a shared company repo).
- `api.bitbucket.org` does not send permissive CORS headers for a `tauri://` /
  `localhost` origin, so webview `fetch` is blocked.
- The `/diff` endpoint 30x-redirects to a signed URL and must be followed.

## Decision

All Bitbucket HTTP goes through Rust `#[tauri::command]`s using a blocking
`reqwest` client (`rustls-tls`), run off the UI thread via
`tauri::async_runtime::spawn_blocking`. The webview only ever sends/receives
typed DTOs over IPC; it never sees the token or makes cross-origin requests.

## Consequences

- The token never enters the webview — XSS or a rogue JS dependency cannot
  exfiltrate it.
- No CORS issues; `connect-src` in the CSP can stay tight (`'self'` + dev server).
- `reqwest` follows the `/diff` redirect by default.
- Cost: every API surface needs a Rust command + DTO. The frontend mocks these
  commands (`src/mock-tauri/`) so it still runs in the browser, Storybook, and tests.
