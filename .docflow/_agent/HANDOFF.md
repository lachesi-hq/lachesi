# Handoff

Entry point for a fresh agent picking up this repo. Read these files in order
before any tool calls:

1. `AGENTS.md` - hard rules. Read in full.
2. `.docflow/CONVENTIONS.md` - authoring rules, ADR status semantics, and plan
   folder convention.
3. `.docflow/plan/README.md` - queue convention.
4. `.docflow/_agent/CURRENT_FOCUS.md` - live snapshot.
5. `.docflow/INDEX.md` - ADR catalogue.
6. Tail of `.docflow/_agent/WORKLOG.md` - confirms what landed.
7. The next queue item at `.docflow/plan/todo/NNNN-*.md`, and the ADRs it
   names, before implementing.

## Stop conditions

Stop and surface the issue rather than guessing if:

- The verify gate fails.
- The queue is empty.
- A `plan/todo/` item references an ADR whose status is not Accepted.
- An ADR's acceptance criteria are ambiguous or untestable.
- Two same-priority plan items target the same files.
