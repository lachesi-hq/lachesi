# Spec 0002 — v0.1 Bitbucket Publication Model for Findings and Reviewer Drafts

- Status: Draft
- Date: 2026-06-23
- GitHub issue: #29

## Context

`main` already ships a useful publication flow:

- AI review output can be converted into structured inline comment suggestions.
- Suggestions are normalized against the current diff before they become drafts.
- Draft comments are staged locally and remain reviewer-controlled.
- Reviewers can edit, remove, publish individually, or publish all staged
  comments.
- Bitbucket writes already happen through the existing inline/general comment
  APIs.

That baseline is good interaction design, but it still lacks a stable contract
between:

- normalized findings
- staged local drafts
- published Bitbucket comments
- reruns where the diff or anchors have changed

## Goals

- document the current baseline already present in `main`
- define when a finding is:
  - an inline draft
  - a general PR draft/comment
  - local-only reviewer context with no publish affordance
- define reviewer-controlled publication as the canonical Bitbucket write path
- define dedupe, rerun, stale-anchor, and accepted-risk behavior clearly enough
  to implement incrementally
- ensure `Fix with Claude` consumes the same lifecycle vocabulary

## Non-goals

- auto-posting Bitbucket comments without reviewer confirmation
- solving multi-provider publication
- replacing the existing draft-comment UX immediately

## Current baseline in code

### Findings

`ReviewRun` + `ReviewFinding` are now stored additively alongside the existing
 AI review thread.

Each finding may already carry:

- a stable `fingerprint`
- an optional anchor
- a publication object with:
  - `mode`
  - `draftIds`
  - `remoteCommentIds`
  - `publishedAt`

### Draft comments

Draft comments remain local frontend artifacts.

They are:

- persisted per repo + PR
- editable before publication
- publishable one-by-one or in batch

For v0.1, a draft may also carry provenance back to the finding that generated
it:

- `reviewRunId`
- `findingId`
- `findingFingerprint`

This provenance is additive and does not change the current reviewer workflow.

## Decision

Bitbucket publication in v0.1 happens through reviewer-curated drafts, not by
posting findings directly.

The lifecycle is:

1. a finding is generated
2. the app may suggest one or more draft comments for it
3. the reviewer decides whether to keep, edit, remove, or publish those drafts
4. only after explicit reviewer action does the app write to Bitbucket

Findings are canonical review artifacts.

Draft comments are publication artifacts derived from findings or created
manually by the reviewer.

## Publication classes

### Inline

Use an inline draft/comment when all of the following are true:

- the finding has a reliable anchor
- the anchor maps to a changed line in the current diff
- the comment can be expressed as a concrete, actionable remark on that change

This is the default target for anchored AI findings.

### General PR comment

Use a general PR comment when the finding is real and publishable, but the app
cannot safely map it to a changed line in the current diff.

Examples:

- the issue concerns a changed file but the exact line is ambiguous
- the finding spans multiple hunks or files
- the reviewer still wants the feedback posted remotely despite anchor drift

### Local-only

Keep a finding local-only when:

- the app cannot anchor it precisely enough for inline publication
- a general PR comment would be too noisy or underspecified
- the reviewer wants to keep it as private context while deciding what to do

Local-only findings remain visible in the review UI and may still feed
`Fix with Claude`, but they have no direct publish affordance until the reviewer
curates them into a publishable draft.

## Anchor requirements

An inline-publishable finding must satisfy:

- exact file path match
- matching side (`new` vs `old`)
- a line anchor that maps to the current diff

v0.1 may use a small tolerance when matching generated draft suggestions back to
findings, but remote publication must still target a valid line in the current
PR diff.

If that mapping fails, the finding must fall back to:

- general draft/comment, or
- local-only state

It must not be auto-posted as a misleading inline comment.

## Reviewer confirmation rules

Every Bitbucket write remains manual.

Required reviewer confirmations:

- publishing a single draft comment
- publishing all staged draft comments

No background sync, auto-post, or implicit publish is allowed in v0.1.

## Dedupe and reruns

### Against staged drafts

When a new review run produces a finding whose `fingerprint` already maps to an
existing staged draft:

- the existing draft remains canonical
- the app should avoid staging a duplicate draft automatically
- the finding may still be shown as already represented by a staged draft

### Against published comments

When a finding reruns with the same `fingerprint` and already has published
remote comment ids:

- the app should treat it as previously published
- the reviewer may still draft a follow-up comment manually
- the app should not auto-stage a duplicate publication draft by default

### Against changed diffs

When the same logical finding reruns but its old anchor no longer maps cleanly:

- preserve the finding identity via `fingerprint`
- mark the old publication mapping as stale at the workflow level
- prefer a new inline mapping when available
- otherwise degrade to general draft or local-only

## Status semantics

v0.1 workflow-level meanings:

- `new`: finding exists and has not been published or explicitly dispositioned
- `published`: at least one Bitbucket comment has been posted for the finding
- `accepted`: reviewer agrees the finding is real but does not want to fix it
  now
- `dismissed`: reviewer rejects the finding
- `fixed`: later work resolves the issue
- `stale`: the finding identity still exists, but its old anchor/publication
  context is no longer reliable for the current diff

`accepted`, `dismissed`, and `stale` are primarily workflow states; they do not
imply any remote write on their own.

## Interaction with `Fix with Claude`

`Fix with Claude` should consume structured findings, not only free-form review
markdown.

Publication and fixing are related but separate:

- a finding may be fixed before any Bitbucket comment is published
- a published finding may later be fixed
- a local-only finding may still be a valid fix input

The publication model must not require publication before a fix flow can start.

## Implementation guidance

Implement incrementally:

1. store provenance from staged drafts back to findings
2. record stage/remove/publish transitions additively in `ReviewFindingPublication`
3. surface dedupe/published/stale signals in the UI
4. introduce explicit disposition actions (`accepted`, `dismissed`, `stale`)
5. let future fix flows consume the structured lifecycle directly

The first cut should strengthen traceability without changing the current
reviewer-controlled UX.
