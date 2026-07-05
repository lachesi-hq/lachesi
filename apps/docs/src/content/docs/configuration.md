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
  mode: balanced
  findings:
    minSeverity: low
paths:
  include:
    - "src/**"
  exclude:
    - "dist/**"
policy:
  rules:
    - id: no-cross-module-imports
      severity: medium
      instruction: "Flag imports that cross module ownership boundaries."
publish:
  defaultMode: inline
  requireManualSubmit: true
```

Repo config should not contain credentials, tokens, private URLs, or other secrets.
