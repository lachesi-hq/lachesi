---
id: ARCH-005
title: Maintain a Tauri IPC smoke and parity test lane separate from jsdom tests
domain: architecture
rules: true
---

# Maintain a Tauri IPC smoke and parity test lane separate from jsdom tests

## Context

Lachesi has a browser/dev mock IPC layer and ARCH-003 keeps the Tauri command surface and the mock surface name-synchronized. Testing today runs only through jsdom Vitest (`pnpm test` → `vitest run`); there is no test that exercises the real Tauri command surface in a webview.

As the native layer grows (ARCH-004), browser-only tests can pass while real command registration, permission scoping, serialization, or platform setup fails at runtime. The name-parity check in ARCH-003 proves the two command *lists* match, but not that a command actually boots, deserializes its payload, and returns the DTO shape the frontend expects.

Readest — the reference app for this work — closes exactly this gap. It routes tests by filename suffix, and its `*.tauri.test.ts` lane runs Vitest *inside a real Tauri WebView*, calling actual Rust commands (a smoke test invokes real commands like `get_executable_dir`; a parity test checks a native parser against its TS counterpart). A shell orchestrator boots the dev server, launches the app behind a test-only cargo feature and a test-only capability, polls for readiness, runs the suite, and tears everything down — and this lane is a separate CI job from the jsdom suite.

The decision is whether Lachesi should keep relying on jsdom tests plus name-parity alone, or add a dedicated lane that runs selected commands through the real IPC bridge.

## Decision

Lachesi will maintain a Tauri IPC smoke and parity test lane, separate from the jsdom Vitest lane.

This means:

- `package.json` exposes a dedicated `test:tauri` script (or equivalent) that runs the IPC lane
- the lane exercises at least one real Tauri command through the webview/IPC bridge — starting narrow, not a full desktop E2E suite
- the lane can run locally without publishing comments or mutating remote providers
- it is kept separate from the regular jsdom Vitest tests so the two lanes do not overlap
- it complements ARCH-003: name-parity stays a static check; this lane adds runtime proof that selected commands boot, serialize, and return expected shapes

Candidate first coverage: a command-registration smoke test for low-risk commands (e.g. config/state load), a serialization round trip for a representative provider/review DTO, and a failure-path shape for missing credentials or invalid configuration.

## Do's and Don'ts

### Do

- Keep a documented `test:tauri` (or equivalent) script that runs the real-IPC lane
- Start narrow: prove the app boots enough to call a few low-risk commands
- Assert real serialization/DTO shapes for representative provider/review commands
- Keep the lane side-effect-free — no remote provider writes, no published comments
- Keep this lane separate from the jsdom Vitest lane (e.g. distinct config or file-suffix routing)
- Document how to run it locally and how it maps into CI, even if CI enablement is a follow-up

### Don't

- Don't fold real-IPC tests into the jsdom Vitest run where the native bridge is absent
- Don't let this lane publish comments, approve PRs, or mutate remote provider state
- Don't rely on ARCH-003 name-parity alone as proof that a command works at runtime
- Don't require a full desktop automation suite before landing the first smoke test

## Consequences

### Positive

- IPC/native drift (registration, permissions, serialization) is caught early instead of in production
- The mock IPC layer gets a runtime counterpart, so browser tests and real commands are both validated
- New native work (ARCH-004) has a place to prove commands boot and serialize
- The lane stays cheap because it starts as a smoke/parity check, not full E2E

### Negative

- A real-webview lane needs orchestration (boot, poll, teardown) and desktop dependencies to run in CI
- It is slower and more environment-sensitive than jsdom tests
- Keeping two lanes separate is extra configuration to maintain

### Risks

- Without CI enablement the lane can rot; local-only runs may be skipped
- Desktop/webview test harnesses can be flaky if boot/teardown is not robust
- The lane can creep toward heavyweight E2E, defeating the "start narrow" intent

## Compliance and Enforcement

An automated rule enforces one high-confidence invariant:

- `package.json` must define a `test:tauri` script

Code review should still reject broader violations that are not yet machine-checked, such as:

- a `test:tauri` script that never actually calls a real Tauri command
- the IPC lane being merged into the jsdom Vitest run
- IPC tests that mutate remote provider state

## References

- `package.json` (test scripts)
- `src/lib/tauri.ts`
- `src/mock-tauri/mock-handlers.ts`
- [Keep Tauri command and mock IPC surfaces in sync](./ARCH-003-keep-tauri-command-and-mock-ipc-surfaces-in-sync.md)
- [Keep Tauri commands thin and delegate to focused native service modules](./ARCH-004-keep-tauri-commands-thin-and-delegate-to-native-service-modules.md)
