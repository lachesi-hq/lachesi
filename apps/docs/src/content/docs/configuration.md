---
title: Configuration
description: App settings and repository-owned review configuration.
---

## App Settings

The desktop app settings include:

- review provider;
- tracked repositories;
- local clone paths;
- provider credentials;
- default diff view;
- AI provider, model, and effort;
- preferred terminal for review and fix flows;
- Jira and Notion context integration tokens;
- automatic sync interval;
- menu bar sync and notifications.

## Repository Config

Lachesi can read `.lachesi.yaml` from a configured local repository.

```yaml
version: "0.1"
review:
  profile: frontend-strict
  mode: balanced
  findings:
    minSeverity: low
profiles:
  frontend-strict:
    mode: strict
    minSeverity: medium
    policyPacks:
      - ./lachesi-policies/react-saas
    analyzers:
      tsc: required
paths:
  include:
    - "src/**"
  exclude:
    - "dist/**"
policy:
  packs:
    - ./lachesi-policies/agentic-code
  rules:
    - id: no-cross-module-imports
      severity: medium
      instruction: "Flag imports that cross module ownership boundaries."
publish:
  defaultMode: inline
  requireManualSubmit: true
```

Policy packs can contribute prompt extensions, rules, path rules, profiles, and analyzer defaults from local directories. Profiles can be selected from the desktop AI review panel per run. Repo config and policy packs should not contain credentials, tokens, private URLs, or other secrets.

The repository includes a loadable prototype pack at `examples/policy-packs/agentic-code`. Use it as a local-path example for agentic-code review rules, named profiles, analyzer defaults, and structured output samples.

Validate repo config locally before running a review:

```sh
lachesi config validate --repo-path . --format json
```

The command exits with code `2` when the config is invalid.
