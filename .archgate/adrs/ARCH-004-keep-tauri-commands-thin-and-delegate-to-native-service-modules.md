---
id: ARCH-004
title: Keep Tauri commands thin and delegate to focused native service modules
domain: architecture
rules: true
---

# Keep Tauri commands thin and delegate to focused native service modules

## Context

Lachesi's native layer has grown around a few large command modules. Today:

- `src-tauri/src/commands/review.rs` is ~5,981 lines with 24 commands
- `src-tauri/src/commands/bitbucket.rs` is ~2,123 lines with 24 commands
- `src-tauri/src/commands/repositories.rs` is ~1,026 lines with 9 commands

These files mix concerns that are easier to reason about — and test — when kept apart: command registration and input validation, provider HTTP clients (`reqwest` currently lives inline in `bitbucket.rs` and `context.rs`), DTO/request mapping, review persistence, long-running AI review/fix orchestration, and local repository operations. There is no dedicated client/provider or service layer under `src-tauri/src/` yet; `review_storage.rs` is the one example of an already-extracted focused module (persistence).

Readest — a mature cross-platform Tauri app used as a reference for this work — demonstrates the target discipline: one module per domain feature, with the `#[tauri::command]` acting as a thin adapter that validates input, offloads heavy work (`spawn_blocking`), and delegates to a private `*_sync`/service function or a provider struct. Its plugin commands are literally one-line delegates (`commands.rs`) to a service (`desktop.rs`/`mobile.rs`), and pure decision logic is split from side-effecting shells so it can be unit-tested without a webview. Most of its modules stay well under ~500 lines.

The decision is whether Lachesi should keep letting command modules absorb provider, persistence, and orchestration logic, or push that logic behind focused native modules so command handlers stay thin.

## Decision

Lachesi will keep Tauri command handlers thin and delegate real work to focused native modules.

This means:

- a `#[tauri::command]` function primarily validates/coerces input, calls a focused service or client, and maps errors into IPC-safe strings
- provider HTTP behavior (Bitbucket, GitHub, Jira/Notion) lives in dedicated client modules, not inline in command files
- review persistence, review-job state, and AI review/fix orchestration live in their own modules, not embedded in command handlers
- CPU- or IO-heavy work is offloaded off the IPC dispatch worker (e.g. `spawn_blocking`) so concurrent `invoke()`s do not serialize
- errors returned across the IPC boundary stay IPC-safe: `Result<T, String>` (with `.map_err(|e| format!(...))`) for app commands, or a `thiserror` enum with a string `Serialize` impl — never a structured Rust error type leaked to the frontend
- command modules under `src-tauri/src/commands/` stay small; the enforced hard ceiling is 1,500 lines per file, but the intent is much thinner adapters with logic extracted out

This is an architecture-hardening direction, not a behavior rewrite. Extractions should be mechanical and low-risk, and must keep frontend command names compatible unless changed deliberately with matching mock and type updates (see ARCH-003).

## Do's and Don'ts

### Do

- Keep command handlers to input validation + delegation + error mapping
- Put provider/API HTTP behavior in dedicated client modules separate from command registration
- Keep review persistence and AI workflow state in focused modules (as `review_storage.rs` already does)
- Offload heavy CPU/IO work off the IPC worker so concurrent commands do not block each other
- Map errors to IPC-safe strings at the command boundary
- Add unit tests to extracted client/orchestration modules so native logic is testable without a Tauri webview
- Keep command names stable across an extraction; if a name changes, update the mock handler and TypeScript types in the same change (ARCH-003)

### Don't

- Don't let a command module accumulate provider clients, DTO mapping, persistence, and orchestration in one file
- Don't build `reqwest` clients inline inside command handlers
- Don't run heavy work directly on the Tauri async worker thread
- Don't return structured Rust error types across IPC — collapse them to strings
- Don't grow `src-tauri/src/commands/*.rs` past the size ceiling instead of extracting focused modules
- Don't change a command's public name during a refactor without updating the mock/type surfaces

## Consequences

### Positive

- Command behavior, provider clients, persistence, and orchestration can be reasoned about independently
- Extracted modules become unit-testable without a webview, closing a real coverage gap
- The `generate_handler!` registration stays readable as the native surface grows
- Concurrency improves when heavy work leaves the IPC worker thread

### Negative

- More files and module boundaries to navigate than a few large command files
- The first extraction pass adds churn without changing behavior
- Some shared helpers must be introduced to avoid duplicating logic across the split modules

### Risks

- A mechanical split can accidentally change a command name or DTO shape and break the mock/type contract (ARCH-003)
- A line-count ceiling is a blunt proxy; a file can stay under the limit and still mix concerns, so review must still judge cohesion
- Over-splitting can fragment logic that genuinely belongs together

## Compliance and Enforcement

An automated rule enforces one high-confidence invariant:

- no file under `src-tauri/src/commands/` may exceed 1,500 lines

Code review should still reject broader violations that are not yet machine-checked, such as:

- provider HTTP clients constructed inline inside command handlers
- persistence or long-running orchestration embedded directly in command functions
- structured Rust error types returned across the IPC boundary
- heavy CPU/IO work run on the IPC worker instead of being offloaded

## References

- `src-tauri/src/commands/review.rs`
- `src-tauri/src/commands/bitbucket.rs`
- `src-tauri/src/commands/repositories.rs`
- `src-tauri/src/review_storage.rs` (existing example of an extracted focused module)
- [Use a Tauri desktop shell with a React webview and a Rust Bitbucket client](./ARCH-001-tauri-react-rust-bitbucket-boundary.md)
- [Keep Tauri command and mock IPC surfaces in sync](./ARCH-003-keep-tauri-command-and-mock-ipc-surfaces-in-sync.md)
