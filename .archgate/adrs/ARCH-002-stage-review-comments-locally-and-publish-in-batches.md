---
id: ARCH-002
title: Stage review comments locally and publish them in batches
domain: architecture
rules: true
---

# Stage review comments locally and publish them in batches

## Context

Lachesi is intentionally modeled after GitHub-style review rather than Bitbucket's default comment flow. Reviewers need to inspect a diff, leave multiple comments across files, revise or discard them locally, and only then publish the review to Bitbucket.

The code already implements this behavior:

- draft comments are stored locally per workspace/repo/PR in `src/hooks/useDraftComments.ts`
- inline and reply publishing happens only when the user triggers `publishAll`
- the pending-review UI is rendered through `PendingReviewBar`
- server-side posting still uses Bitbucket comment APIs in `src-tauri/src/commands/bitbucket.rs`

The decision is whether Lachesi should continue to treat comment composition as a staged local workflow or switch to immediate remote posting on every comment submission.

## Decision

Lachesi will stage review comments locally first and publish them to Bitbucket only when the user performs an explicit batch publish action.

This applies to:

- top-level inline comments
- file-level comments that resolve to a file but not a diff line
- replies drafted locally before publish

The local draft store is the temporary source of truth during review. Bitbucket becomes the source of truth only after the publish step completes.

## Do's and Don'ts

### Do

- Keep draft comments scoped by workspace, repo, and PR id
- Preserve the distinction between local drafts and remote comments in UI and data flow
- Allow reviewers to discard all local drafts before publishing
- Make partial failures visible when batch publish does not fully succeed

### Don't

- Don't auto-publish a comment as soon as the composer submits
- Don't silently drop local drafts on refresh or navigation
- Don't collapse replies and inline comments into one generic post flow if that loses anchor fidelity
- Don't treat local drafts as authoritative after publish has succeeded

## Consequences

### Positive

- The workflow matches reviewer expectations from GitHub-style pending review
- Reviewers can edit their thinking before creating noise in Bitbucket threads
- The app can support batched failure handling and dry-run publishing more cleanly
- Local state enables richer UI such as pending counts and discard-all actions

### Negative

- There is more client-side state to manage than in an immediate-post model
- Draft persistence introduces edge cases around stale local state
- The publish flow must reconcile local and remote comments carefully

### Risks

- Drafts can become confusing if a PR changes heavily before publish
- Local storage can fail or be cleared unexpectedly
- Reply behavior can drift from Bitbucket semantics if anchor or parent handling changes

## Compliance and Enforcement

An automated rule enforces one high-confidence invariant:

- frontend calls to `create_inline_comment` and `create_general_comment` must stay inside the staged publish flow (`src/hooks/useDraftComments.ts`) or the mock IPC layer

Code review should still reject broader violations that are not yet machine-checked, such as:

- post comments immediately from the composer without going through draft state
- remove explicit batch publish/discard affordances
- mix local-draft and remote-comment models in a way that hides which state the reviewer is editing

## References

- `src/hooks/useDraftComments.ts`
- `src/components/comments/PendingReviewBar.tsx`
- `src/components/comments/CommentComposer.tsx`
- `src/components/pr-detail/PrDetailPanel.tsx`
- `src-tauri/src/commands/bitbucket.rs`
