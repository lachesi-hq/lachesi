# Ship keychain credential storage

Owning ADR: `../../adr/0003-credentials-keychain.md`

## Scope

Store provider secrets in the OS credentials layer and keep non-secret settings
in config JSON.

## Exit criteria

1. Secrets do not live in plaintext app settings.
2. Environment credentials remain a development fallback.
3. Credential access is isolated behind the Rust credentials module.

## Shipped

Shipped before docflow bootstrap. Historical record migrated from
`docs/adr/0002-credentials-keychain.md`; bootstrap base `c9daa5a`.
