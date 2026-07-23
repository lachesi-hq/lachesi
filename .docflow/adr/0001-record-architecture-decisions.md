---
adr: 0001
title: Record architecture decisions as ADRs
status: Implemented
date: 2026-07-10
owner: default-agent
supersedes:
superseded-by:
depends-on: []
tags: [process, conventions]
---

# ADR 0001 - Record architecture decisions as ADRs

## Context

Lachesi needs significant decisions to be discoverable, traceable, and durable,
not held only in chat logs, pull-request threads, or one person's memory. The
lightweight Architecture Decision Record practice records each decision as a
small, numbered file stored beside the code, so the reasons behind the system
are part of the repository.

This repository already had architectural notes in `docs/adr/` and enforced
rules in `.archgate/adrs/`. The docflow retrofit gives the human-readable
catalogue a consistent lifecycle, index, and work queue while leaving Archgate
as the enforcement layer.

## Capability statement

This repository is documentation-led and ADR-driven: every significant
decision is recorded as a numbered ADR under `.docflow/adr/`; the catalogue is
the source of truth the running system is expected to match; and a status
lifecycle drives a `.docflow/plan/` work queue. The authoring rules live in
`.docflow/CONVENTIONS.md`. This ADR records the decision to adopt the practice,
not the rules themselves.

## User stories / scenarios

- As a contributor, I find the reasons behind this system in the catalogue
  instead of reconstructing them from memory.
- As a maintainer, each decision, the work that implements it, and the commit
  that ships it are linked through stable repository artefacts.
- As a new agent, I can start from `AGENTS.md`, the conventions, and the index
  before changing behaviour.

## Acceptance criteria

1. Significant decisions are recorded as numbered ADRs under `.docflow/adr/`.
2. ADR authoring, the status lifecycle, numbering, audit trail, and git
   contract follow `.docflow/CONVENTIONS.md`.
3. ADR-backed implementation work is tracked under `.docflow/plan/`.
4. Existing Archgate rules remain in place and are not replaced by docflow.

## Out of scope

- Detailed authoring rules. They live in `.docflow/CONVENTIONS.md`.
- Automated Archgate policy implementation. That stays in `.archgate/`.

## Open questions

- None.

## References

- ../CONVENTIONS.md
- https://adr.github.io

## Revision History

| Date | Revision | Author | Change |
|------|----------|--------|--------|
| 2026-07-10 | r1 | default-agent | Adopted the documentation-led, ADR-driven method during bootstrap. |

## Approvals

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Maintainer | fdg | 2026-07-10 | approved in chat |
