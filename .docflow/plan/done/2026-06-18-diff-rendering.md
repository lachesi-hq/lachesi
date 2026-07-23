# Ship diff rendering with react-diff-view

Owning ADR: `../../adr/0004-diff-rendering.md`

## Scope

Render provider unified diffs with unified/split modes, syntax highlighting,
and per-line inline comment widgets.

## Exit criteria

1. Unified diffs render through the selected parser and renderer.
2. Inline comment anchors map to rendered diff lines.
3. Renderer-specific wiring remains localized.

## Shipped

Shipped before docflow bootstrap. Historical record migrated from
`docs/adr/0003-diff-rendering.md`; bootstrap base `c9daa5a`.
