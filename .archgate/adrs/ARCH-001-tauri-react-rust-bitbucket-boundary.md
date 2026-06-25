---
id: ARCH-001
title: Use a Tauri desktop shell with a React webview and a Rust Bitbucket client
domain: architecture
rules: true
---

# Use a Tauri desktop shell with a React webview and a Rust Bitbucket client

## Context

Lachesi is a desktop review tool for Bitbucket pull requests. The project needs a responsive local UI, direct access to OS capabilities such as the keychain and terminal launching, and secure Bitbucket API access without exposing credentials inside browser JavaScript.

The current codebase already reflects a split architecture:

- the desktop shell and native integrations live in `src-tauri/`
- the UI lives in `src/` as a React 19 + TypeScript + Vite application
- Bitbucket HTTP calls run in Rust via `reqwest` in `src-tauri/src/commands/bitbucket.rs`
- additional external-service calls (Jira, Notion) run in Rust via `reqwest` in `src-tauri/src/commands/context.rs`
- credentials are loaded from the keychain or env fallback, scoped per provider, in `src-tauri/src/credentials.rs`
- the frontend crosses the native boundary only through `tauriCall` in `src/lib/tauri.ts`

Although Bitbucket is the primary integration and the running example throughout this ADR, the same boundary now governs every external service Lachesi talks to (Bitbucket, Jira, Notion, and any future provider). The rules below apply to all of them, not to Bitbucket alone.

The main decision is whether Lachesi should remain a Tauri desktop app with a strict Rust/native boundary, or move API access and runtime behavior into the webview.

## Decision

Lachesi will use:

- Tauri v2 as the desktop application shell
- React + TypeScript + Vite for the webview UI
- Rust commands as the sole implementation point for all external-service HTTP (Bitbucket, Jira, Notion, and future providers), credentials, and OS-level integrations
- a narrow IPC boundary where the frontend calls named commands and treats Rust as the source of truth

This means:

- external-service tokens (Bitbucket, Jira, Notion) do not live in browser-fetch code
- the webview does not talk directly to any external API; it only receives non-secret typed DTOs
- each provider gets its own keychain-scoped credential, loaded in Rust
- native features such as keychain storage and terminal launching stay in Rust commands
- browser development, Storybook, and tests use the mock IPC layer instead of bypassing the command boundary

## Do's and Don'ts

### Do

- Add new external-service calls behind Tauri commands first, then consume them via `tauriCall`
- Keep secret handling and OS integrations in `src-tauri/`
- Give each external integration its own keychain-scoped credential (with an env fallback) and return only non-secret typed DTOs from its command — never include tokens in command payloads
- Preserve the mock IPC path so frontend development and tests can run without Tauri
- Keep frontend DTOs aligned with Rust command payloads
- When invoking a user-installed CLI binary from a Rust Tauri command (e.g. `claude`), prepend the known macOS CLI installer paths before the command so the binary is found regardless of how the user's shell profile is structured: `export PATH="$HOME/.local/bin:$HOME/.npm/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"; <cmd>` — do NOT rely on `-l` (login shell) alone, because many installers (including the Claude CLI) add to `~/.zshrc` which is only sourced by interactive shells (`-i`), and do NOT use `-i` because it can print to stdout and corrupt captured output

### Don't

- Don't fetch Bitbucket directly from React components or hooks
- Don't fetch any external API (Jira, Notion, or others) directly from the webview — route it through a Rust command
- Don't reuse one provider's token to authenticate a different service — even within the same vendor family. Example: a Bitbucket API token returns `401` against the Jira REST API despite sharing the Atlassian account email; each service needs its own scoped token
- Don't store long-lived credentials in frontend storage
- Don't bypass `src/lib/tauri.ts` with ad hoc `invoke` calls scattered through the UI
- Don't move terminal, keychain, or native file-system behavior into browser-only code

## Consequences

### Positive

- Credentials stay out of ordinary browser networking code
- Native integrations are straightforward to implement and test at the command boundary
- The frontend remains fast to iterate on because the mock IPC layer supports browser dev, Storybook, and Vitest
- The architecture matches the product shape: a local desktop tool with native affordances

### Negative

- Every new capability that crosses the boundary requires parallel Rust and TypeScript changes
- DTO drift is possible if Rust and frontend types are not updated together
- Some debugging spans two runtimes instead of one

### Risks

- The IPC contract can become noisy if command payloads are poorly shaped
- Native-only behavior can be under-tested if browser mocks diverge from Rust behavior
- Team members may accidentally introduce direct frontend networking unless the boundary is kept explicit

## Compliance and Enforcement

Automated rules enforce two high-confidence invariants:

- frontend files must not call `invoke()` directly outside `src/lib/tauri.ts`
- frontend files must not reference `api.bitbucket.org` directly

Code review should still reject broader violations that are not yet machine-checked, such as:

- introducing new secret storage in browser state or local storage
- moving native integrations from Rust into browser-only code

## References

- `src/lib/tauri.ts`
- `src-tauri/src/commands/bitbucket.rs`
- `src-tauri/src/commands/context.rs` (Jira and Notion integration commands)
- `src-tauri/src/credentials.rs` (per-provider keychain-scoped credentials with env fallbacks)
- [Keep Tauri command and mock IPC surfaces in sync](./ARCH-003-keep-tauri-command-and-mock-ipc-surfaces-in-sync.md)
- [Expose AI review as explicit user-invoked actions](./FE-001-expose-ai-review-as-explicit-user-invoked-actions.md)
- `README.md`
