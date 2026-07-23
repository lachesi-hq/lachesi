# Ship Rust Bitbucket HTTP boundary

Owning ADR: `../../adr/0002-http-in-rust.md`

## Scope

Provider HTTP for Bitbucket is routed through Rust Tauri commands rather than
browser-origin fetches.

## Exit criteria

1. Bitbucket requests are handled in Rust.
2. The frontend communicates through typed IPC DTOs.
3. Browser and Storybook development can use mock IPC.

## Shipped

Shipped before docflow bootstrap. Historical record migrated from
`docs/adr/0001-http-in-rust.md`; bootstrap base `c9daa5a`.
