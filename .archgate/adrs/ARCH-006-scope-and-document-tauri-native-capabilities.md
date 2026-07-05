---
id: ARCH-006
title: Scope and document Tauri native capabilities before expanding them
domain: architecture
rules: true
---

# Scope and document Tauri native capabilities before expanding them

## Context

Lachesi currently has a deliberately small Tauri capability surface. `src-tauri/capabilities/default.json` grants only three permissions to the main window:

- `core:default`
- `opener:default`
- `notification:default`

As desktop features expand — local repository operations, file opening, terminal/CLI launching, updates, deep links — it will be tempting to add filesystem, shell, process, updater, or deep-link permissions inline while implementing a feature. Each added native permission widens the attack surface of a tool that already handles provider credentials and can launch local processes.

Readest — the reference app for this work — shows a disciplined permission posture worth adopting: capabilities are scoped per named window (including globs like `reader-*` for dynamic windows) and per platform; `shell:allow-spawn` is restricted to named commands with per-argument regex validators; `opener:allow-open-url` and filesystem access are path/URL-scoped; and **test-only permissions live in a separate `capabilities-extra/` directory loaded at runtime behind a cargo feature so they never ship**. It also shows an anti-pattern to avoid: an HTTP allowlist negated by trailing `http://*` / `https://*` wildcards, which makes the curated list meaningless.

The decision is whether native permissions may be added ad hoc as features need them, or must be intentionally scoped, owned by a concrete product capability, and documented before expansion.

## Decision

Lachesi will keep its Tauri capability surface intentionally scoped and documented, and treat any expansion as a governed change.

This means:

- the set of enabled permissions in `src-tauri/capabilities/default.json` is an explicit, reviewed allowlist; adding a permission is an intentional change to this ADR's allowlist, not an incidental edit
- every permission is tied to a concrete product capability that owns it (why it exists, what feature needs it)
- new permissions are scoped as narrowly as the plugin allows — named windows, named shell commands with argument validators, path/URL scopes — never a broad wildcard that negates the scope
- permissions used only for testing are kept out of the shipped capability set (e.g. a separate directory loaded behind a cargo feature), not added to `default.json`
- adding a native permission comes with expected smoke/parity coverage (ARCH-005) for the feature that introduced it

Review criteria for adding a permission: (1) a concrete product need and owning feature, (2) the narrowest available scope, (3) defined failure behavior when the capability is unavailable, (4) test/smoke coverage, (5) an update to the allowlist below with rationale.

Currently approved permissions (main window): `core:default`, `opener:default`, `notification:default`.

## Do's and Don'ts

### Do

- Add a native permission only with a named owning feature and a rationale recorded here
- Scope permissions as narrowly as possible (named windows, named commands + arg validators, path/URL scopes)
- Keep test-only permissions out of the shipped capability files
- Pair a new permission with smoke/parity coverage for the feature that needs it (ARCH-005)
- Prefer per-window and per-platform capability scoping over one broad grant

### Don't

- Don't add filesystem, shell, process, updater, or deep-link permissions inline while implementing a feature without governing the change here
- Don't grant broad wildcards (e.g. `**`, `http://*`) that negate an otherwise-scoped allowlist
- Don't ship test-only permissions in `default.json`
- Don't reuse an existing capability as an excuse to widen scope for an unrelated feature
- Don't leave a newly granted permission undocumented and unowned

## Consequences

### Positive

- The permission surface stays tight and auditable as the desktop app grows
- Each native capability has a clear owner and rationale
- Security-sensitive permissions (fs, shell, process, external URL) get deliberate review instead of incidental grants
- New native features have a checklist to follow before expanding permissions

### Negative

- Adding a native capability takes an explicit governance step instead of a quick JSON edit
- Narrow scoping (arg validators, path scopes) is more work than a broad grant
- The allowlist here must be kept in sync with `default.json`

### Risks

- The documented allowlist can drift from the actual capability file if updated in only one place
- Over-tight scopes can break legitimate features and get loosened under pressure without re-review
- A machine check on the permission list cannot judge whether a scope is *appropriately* narrow — review must

## Compliance and Enforcement

An automated rule enforces one high-confidence invariant:

- every permission in `src-tauri/capabilities/default.json` must appear in the approved allowlist recorded in this ADR's rule; adding a new permission fails the check until it is intentionally approved here

Code review should still reject broader violations that are not yet machine-checked, such as:

- broad wildcards that negate a scoped allowlist
- a new permission with no owning feature, rationale, failure behavior, or test coverage
- test-only permissions added to the shipped capability files

## References

- `src-tauri/capabilities/default.json`
- `src-tauri/src/launch.rs` (terminal/CLI launching — a future owner of process/shell scope)
- `src-tauri/src/local_repo.rs` (local repository operations — a future owner of filesystem scope)
- [Use a Tauri desktop shell with a React webview and a Rust Bitbucket client](./ARCH-001-tauri-react-rust-bitbucket-boundary.md)
- [Maintain a Tauri IPC smoke and parity test lane separate from jsdom tests](./ARCH-005-tauri-ipc-smoke-and-parity-test-lane.md)
