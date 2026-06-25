---
id: ARCH-003
title: Keep Tauri command and mock IPC surfaces in sync
domain: architecture
rules: true
---

# Keep Tauri command and mock IPC surfaces in sync

## Context

Lachesi intentionally supports two execution modes for the frontend:

- inside Tauri, where `tauriCall` forwards to Rust commands
- outside Tauri, where `tauriCall` forwards to the mock IPC layer for browser dev, Storybook, and Vitest

That split is implemented today through:

- `src-tauri/src/lib.rs`, which registers the real command surface through `tauri::generate_handler!`
- `src/lib/tauri.ts`, which chooses between `invoke()` and `mockInvoke()`
- `src/mock-tauri/mock-handlers.ts`, which provides the browser/test replacement handlers

If the real command list and the mock command list drift apart, browser development and tests stop reflecting the desktop app accurately. The app may appear to work in Storybook or browser dev while failing in Tauri, or vice versa.

## Decision

Lachesi will treat the Tauri command surface and the mock IPC surface as one contract that must remain synchronized.

This means:

- every command exposed in `src-tauri/src/lib.rs` must have a corresponding handler in `src/mock-tauri/mock-handlers.ts`
- mock handlers should use the same command names as the registered Tauri commands
- frontend code should continue to go through `tauriCall`, so the same contract is exercised in both runtime modes

## Do's and Don'ts

### Do

- Add the mock handler in the same change where a new Tauri command is registered
- Keep mock command names byte-for-byte aligned with the command names registered in Rust
- Use the mock layer to support browser dev, Storybook, and Vitest without needing Tauri
- Keep command contract changes visible and centralized
- When extending an existing command's output DTO (adding a new field), update all three surfaces in the same change: the Rust output struct, the TypeScript interface in `src/types.ts`, and the mock fixture data in `src/mock-tauri/fixtures.ts` — treat these as one atomic contract update
- When a command uses an explicit Bitbucket `fields=` query selection, add any new DTO field to that query string in the same change — omitting it causes the Bitbucket API to silently exclude the field from the response

### Don't

- Don't register a new Tauri command without updating the mock layer
- Don't add browser-only commands to `mockHandlers` that have no real Tauri equivalent
- Don't bypass `tauriCall` when a feature depends on the native command contract
- Don't let Storybook/test ergonomics justify drift from the production IPC API
- Don't extend a command's output struct in Rust without also updating the TypeScript interface and the mock fixture data in the same change — partial updates create runtime shape mismatches that TypeScript cannot catch at the IPC boundary

## Consequences

### Positive

- Browser development and tests remain representative of the desktop app contract
- Contract drift is caught as a governance violation rather than a late runtime surprise
- New command work naturally stays paired across Rust and TypeScript

### Negative

- Every new command requires one more piece of plumbing to keep the mock layer honest
- The mock layer needs ongoing maintenance as command payloads evolve
- Extending an existing command's DTO requires coordinated edits across up to four locations (Rust deserialize struct, Rust output struct, TypeScript interface, mock fixtures) and — when the command uses explicit `fields=` selection — a fifth edit to the query string; missing any one of these produces a silent data gap rather than a compile error

### Risks

- Mock implementations can still differ behaviorally even when the command names are synchronized
- Regex-based contract checks may need updates if the Rust registration style changes substantially

## Compliance and Enforcement

Automated rules enforce two high-confidence invariants:

- every command registered in `src-tauri/src/lib.rs` must exist in `src/mock-tauri/mock-handlers.ts`
- every command key in `src/mock-tauri/mock-handlers.ts` must correspond to a registered Tauri command

Code review should still reject broader violations that are not yet machine-checked, such as:

- mock payload shapes that drift from real command payloads
- mocks that return unrealistic data for core product flows

## References

- `src-tauri/src/lib.rs`
- `src/lib/tauri.ts`
- `src/mock-tauri/index.ts`
- `src/mock-tauri/mock-handlers.ts`
