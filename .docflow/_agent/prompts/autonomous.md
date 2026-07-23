# Autonomous-completion prompt

You are this project's autonomous agent. Your task: drive the implementation
queue in `.docflow/plan/todo/` to completion, committing per item with the
verify gate green, until the queue is empty or a documented stop condition
fires.

## Step 1 - Orient

Read these files in order, in full, before any tool calls:

1. `AGENTS.md`
2. `.docflow/CONVENTIONS.md`
3. `.docflow/plan/README.md`
4. `.docflow/_agent/CURRENT_FOCUS.md`
5. `.docflow/INDEX.md`
6. Tail of `.docflow/_agent/WORKLOG.md`
7. The queue item file at `.docflow/plan/todo/NNNN-*.md` you are about to work,
   and the ADRs it names.

## Step 2 - Pick the next item

List `.docflow/plan/todo/` and pick the lowest-numbered file.

## Step 3 - Implement

Implement against the ADR's numbered acceptance criteria. Add or update tests
that map back to those criteria where practical.

## Step 4 - Verify

Run the project's verify gate:

```bash
pnpm run typecheck
pnpm run test
archgate check
```

Do not proceed if the gate fails. Fix the root cause and re-run.

## Step 5 - Commit

Use Conventional Commits. Add a `Rationale:` footer to any commit touching an
ADR.

## Step 6 - Integrate

- Check before merge: sync onto the current `main` and run the docflow audit.
  If a new ADR or `plan/todo` number clashes with what landed on `main`,
  renumber locally before integrating.
- Push the work branch.
- Open a draft PR.
- Run the local gate before requesting merge.
- Mark the PR ready after the local gate passes.
- Merge with squash unless the maintainer chooses a different strategy.
- Confirm the merge landed on `main` before treating the item as shipped.

## Step 7 - Ship the queue item

Once the change is on `main`:

- Move `.docflow/plan/todo/NNNN-<slug>.md` to
  `.docflow/plan/done/<YYYY-MM-DD>-<slug>.md`.
- Amend the moved file with a "Shipped" footer naming the commit, PR, deploy
  id, or bootstrap base.
- Advance owning ADRs from `Accepted` to `Implemented`.
- Regenerate `.docflow/INDEX.md`.

## Step 8 - Record

- Append a one-line `.docflow/_agent/WORKLOG.md` entry naming the branch, HEAD,
  verify result, and any deferral.
- Update `.docflow/_agent/CURRENT_FOCUS.md` with the new state.

## Stop conditions

- Verify gate fails and the cause is not understood.
- Queue empty.
- A queue item references an ADR whose status is not Accepted.
- Acceptance criteria are ambiguous or untestable.
- Same-priority items target the same files.

When a stop condition fires, stop cleanly: leave the repo in a committed state,
record the reason in `.docflow/_agent/CURRENT_FOCUS.md`, and surface it.
