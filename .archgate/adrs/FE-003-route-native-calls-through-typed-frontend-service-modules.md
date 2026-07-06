---
id: FE-003
title: Route native calls through typed frontend service modules above tauriCall
domain: frontend
rules: true
---

# Route native calls through typed frontend service modules above tauriCall

## Context

ARCH-001 established `tauriCall` in `src/lib/tauri.ts` as the single low-level IPC entry point, and forbids ad hoc `invoke()` in the UI. That boundary holds. The remaining problem is one layer up: command names and payload details are spread across the product UI. `tauriCall` is invoked directly from ~20 hooks and from several components, so raw command-name strings (`"approve_pull_request"`, `"cancel_inline_review"`, `"open_repository_file_external"`, …) and payload shapes leak into presentational code.

Readest — the reference app for this work — keeps a typed capability layer above raw IPC: an `AppService` interface with per-domain service modules, and a single typed bridge module per native plugin where the command-name strings are quarantined. UI code calls typed service methods, not raw command strings, which keeps command-contract coupling out of the presentation layer.

Lachesi already has the seams for this: hooks act as an informal service layer, and `src/lib/` holds cohesive helper modules. The gap is that there is no explicit, typed service boundary that owns command names, and — most visibly — presentational components still reach across the IPC boundary directly.

The decision is whether the UI should keep calling IPC command strings directly, or route native calls through typed service methods that centralize command names and payloads above `tauriCall`.

## Decision

Lachesi will route native calls through typed frontend service modules layered above `tauriCall`, and keep raw IPC out of presentational components.

This means:

- typed service modules (e.g. a provider service, a review service, a local-repo service, a context service) wrap IPC commands behind typed request/response methods
- command-name strings and payload shapes are centralized in the service/hook layer, not scattered through components
- `tauriCall` in `src/lib/tauri.ts` remains the only low-level IPC implementation; services are built on top of it, never beside it
- **presentational components (`src/components/**`) must not call `tauriCall` directly** — they go through hooks or services
- the mock IPC layer (ARCH-003) continues to back services in browser dev, Storybook, and Vitest, so the native/mock split is preserved end-to-end

The enforced machine-checked invariant is the component boundary. Consolidating the hook call sites into named, typed services is the broader direction: migrate feature paths incrementally, moving raw command strings out of hooks into services as they are touched.

## Do's and Don'ts

### Do

- Call `tauriCall` only from `src/lib/tauri.ts` and from typed service/hook modules
- Give services typed request/response methods and let them own the command-name strings
- Route component IPC needs through a hook or service, never a direct `tauriCall`
- Keep the mock IPC path working underneath services so browser dev, Storybook, and Vitest still run
- When adding a native feature, add its typed service method in the same change as the command and mock handler (ARCH-003)
- Migrate at least one existing feature path end-to-end to a typed service as the reference example

### Don't

- Don't call `tauriCall` from a presentational component
- Don't spread raw command-name strings and payload shapes across UI code
- Don't add a second low-level IPC path beside `tauriCall`
- Don't bypass the service/hook layer just to save a hop
- Don't let a component depend on the native command contract directly

## Consequences

### Positive

- The UI depends on stable, typed product APIs instead of raw command strings
- Command names and payloads are centralized, so contract changes touch fewer files
- The native/mock split stays intact underneath services
- Components become easier to test and reason about without knowing the IPC surface

### Negative

- A typed service layer is more upfront structure than calling `tauriCall` inline
- Existing hook call sites must be migrated gradually, so the pattern is mixed during transition
- One more indirection between a component and the native command

### Risks

- Services can drift into thin passthroughs that add indirection without real typing value
- The hook-to-service migration can stall after the first example, leaving two conventions in place
- A service method's types can drift from the Rust DTO if not updated with the command (ARCH-003)

## Compliance and Enforcement

An automated rule enforces one high-confidence invariant:

- files under `src/components/` must not call `tauriCall` directly

Code review should still reject broader violations that are not yet machine-checked, such as:

- raw command-name strings spread across hooks instead of centralized in services
- new product code that calls `tauriCall` directly instead of a typed service method
- service types that diverge from the underlying Rust command DTOs

## References

- `src/lib/tauri.ts`
- `src/lib/providerService.ts`
- `src/lib/localRepoService.ts`
- `src/lib/reviewService.ts`
- `src/components/pr-detail/PrDetailPanel.tsx`
- `src/components/repository-explorer/RepositoryExplorerPanel.tsx`
- `src/components/review-history/ReviewHistoryPanel.tsx`
- `src/components/repositories/RepositoryBranchesPanel.tsx`
- [Use a Tauri desktop shell with a React webview and a Rust Bitbucket client](./ARCH-001-tauri-react-rust-bitbucket-boundary.md)
- [Keep Tauri command and mock IPC surfaces in sync](./ARCH-003-keep-tauri-command-and-mock-ipc-surfaces-in-sync.md)
