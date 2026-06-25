# ADR 0003 — Diff rendering with react-diff-view

- Status: Accepted
- Date: 2026-06-18

## Context

The core of Lachesi is a GitHub-style diff with **per-line inline comments**. We
have the raw unified diff (Bitbucket's `/diff`) and inline anchors expressed as
`inline.{path, to, from}` (new-side line / old-side line). We need: unified +
split views, syntax highlighting, and the ability to attach comment threads and
a composer to a specific line.

Options considered: `react-diff-view`, `@git-diff-view/react`,
`react-diff-viewer-continued`, and a custom CodeMirror 6 merge view.

## Decision

Use **`react-diff-view`** (+ `gitdiff-parser`).

- It parses the raw unified diff directly (`parseDiff`).
- It supports both `viewType="unified"` and `"split"`.
- Its `widgets` prop (changeKey → ReactNode) is a first-class hook for rendering
  comment threads / draft rows / the composer under a specific line, and
  `gutterEvents` gives us click-to-comment.
- `getChangeKey` + our `changeKeyForAnchor` helper (`src/lib/diff.ts`) map
  Bitbucket's `inline.{to,from}` to the rendered line.

## Consequences

- The comment/composer wiring is localized: all anchor↔line mapping lives in
  `src/lib/diff.ts`, so switching renderer (fallback: `@git-diff-view/react`)
  would touch only that module + the diff components.
- Rejected `react-diff-viewer-continued` (needs full old/new file strings, not a
  unified diff) and a custom CodeMirror merge view (would require fetching each
  file's old+new blobs and rebuilding the entire comment layer).
- Large diffs are rendered file-by-file with collapsible per-file sections;
  heavier virtualization can be added behind the same components if needed.
