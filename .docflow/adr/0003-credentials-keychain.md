---
adr: 0003
title: Credentials in the OS keychain, config in a settings file
status: Implemented
date: 2026-06-18
owner: default-agent
supersedes:
superseded-by:
depends-on: [0002]
tags: [credentials, security, settings]
---

# ADR 0003 - Credentials in the OS keychain, config in a settings file

## Context

Lachesi needs two kinds of state: sensitive provider credentials and non-secret
app configuration such as workspace, repository, diff view, and theme.
Bitbucket Cloud authenticates with HTTP Basic using an email address plus API
token.

The repository needed a boundary that keeps tokens encrypted at rest and out of
ordinary settings files while still supporting local development.

## Capability statement

Secrets are stored in the OS credentials store through the Rust credentials
layer, while non-secret configuration is stored as JSON in the OS config
directory. Credential resolution checks the keychain first, then development
environment variables, then treats credentials as absent. Environment-sourced
credentials are never silently persisted.

## User stories / scenarios

- As a reviewer, I can save provider credentials locally without committing or
  exposing them through app configuration.
- As a developer, I can use environment variables for local testing without
  changing the user's stored credentials.
- As a maintainer, I can swap credential storage behind one Rust module if the
  backend changes later.

## Acceptance criteria

1. Provider secrets are stored through the OS credentials layer, not plaintext
   repository or app settings files.
2. Non-secret settings are stored separately in the OS config directory.
3. Credential resolution prefers stored credentials, then environment
   fallbacks, then no credentials.
4. Environment fallback credentials are not persisted silently.

## Out of scope

- Enterprise secret managers such as 1Password CLI.
- Token rotation policy.
- Remote synchronization of settings.

## Open questions

- None.

## References

- ../../src-tauri/src/credentials.rs
- ../../README.md#local-storage-and-secrets

## Revision History

| Date | Revision | Author | Change |
|------|----------|--------|--------|
| 2026-06-18 | r1 | maintainer | Recorded the original decision in `docs/adr/0002-credentials-keychain.md`. |
| 2026-07-10 | r2 | default-agent | Migrated into the docflow catalogue and renumbered from 0002 to 0003. |

## Approvals

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Maintainer | fdg | 2026-07-10 | approved in chat |
