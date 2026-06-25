# ADR 0002 — Credentials in the OS keychain, config in a settings file

- Status: Accepted
- Date: 2026-06-18

## Context

Lachesi needs two kinds of state: the Bitbucket credentials (Atlassian email +
API token — sensitive) and non-secret config (workspace, repo, default diff
view, theme). Bitbucket Cloud authenticates with **HTTP Basic** using the email
+ API token (verified: Basic → 200, Bearer → 401).

## Decision

- **Secrets** (`username` + `token`) are stored in the **OS keychain** via the
  Rust `keyring` crate (macOS Keychain), as a single JSON entry under
  `app.lachesi.desktop`.
- **Non-secret config** is stored as `settings.json` in the OS config dir.
- Credential resolution order: **keychain → `BITBUCKET_*` env vars → none**. The
  env fallback is a dev convenience (e.g. sourcing the existing `.env.local`);
  env-sourced credentials are never silently persisted to the keychain.

## Consequences

- The token is encrypted at rest and never written to disk in plaintext.
- macOS may prompt for keychain access — expected.
- All credential access is behind `src-tauri/src/credentials.rs`, so swapping the
  backend (file, 1Password CLI, …) later touches one module.
