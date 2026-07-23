---
adr: 0004
title: Diff rendering with react-diff-view
status: Implemented
date: 2026-06-18
owner: default-agent
supersedes:
superseded-by:
depends-on: [0002]
tags: [frontend, diff, review-ui]
---

# ADR 0004 - Diff rendering with react-diff-view

## Context

The core of Lachesi is a readable pull request diff with per-line inline
comments. The app receives raw unified diffs from providers and inline anchors
expressed as path plus old-side or new-side line numbers. The renderer needs
unified and split modes, syntax highlighting, and hooks for comment threads and
draft composers.

Options considered included `react-diff-view`, `@git-diff-view/react`,
`react-diff-viewer-continued`, and a custom CodeMirror 6 merge view.

## Capability statement

Lachesi renders parsed unified diffs with `react-diff-view` and
`gitdiff-parser`. Comment anchoring is centralized in diff helpers that map
provider inline locations to rendered change keys.

## User stories / scenarios

- As a reviewer, I can switch between unified and split diffs while keeping
  comments anchored to the correct changed lines.
- As a reviewer, I can stage inline comments in context under a specific diff
  line.
- As a maintainer, I can replace the diff renderer later by changing the diff
  module and components rather than every provider integration.

## Acceptance criteria

1. Raw unified diffs are parsed directly for rendering.
2. Unified and split diff modes are supported.
3. Inline comment widgets can render under specific changed lines.
4. Provider anchors are mapped through centralized helpers.
5. Rejected alternatives remain documented with concrete reasons.

## Out of scope

- Full-file old/new blob reconstruction.
- Whole-file CodeMirror merge rendering.
- Heavy virtualization beyond file-level collapsible sections.

## Open questions

- None.

## References

- ../../src/lib/diff.ts
- ../../src/components

## Revision History

| Date | Revision | Author | Change |
|------|----------|--------|--------|
| 2026-06-18 | r1 | maintainer | Recorded the original decision in `docs/adr/0003-diff-rendering.md`. |
| 2026-07-10 | r2 | default-agent | Migrated into the docflow catalogue and renumbered from 0003 to 0004. |

## Approvals

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Maintainer | fdg | 2026-07-10 | approved in chat |
