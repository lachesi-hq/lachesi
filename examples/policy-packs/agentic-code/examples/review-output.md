# Agentic Review Example

Profile: `agentic-balanced`

Loaded policy packs:

- `agentic-code`

## Findings

### High - Missing verification evidence

Rule: `agentic.verification-required`

The change updates repository configuration parsing but the review notes do not
name a parser test, typecheck, or config validation command that was run.

Suggested fix: run the focused config loader tests and include the command in
the review summary.

### Medium - Documentation overclaims current behavior

Rule: `agentic.docs-match-implementation`

The new guide describes hosted policy distribution even though the current
implementation only supports local policy pack paths.

Suggested fix: describe hosted distribution as future work or remove the claim.

## Evidence

- Changed paths: `src-tauri/src/repo_config.rs`, `docs/guides/policies.md`
- Local checks: `pnpm run typecheck`
