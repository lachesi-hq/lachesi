# Plan

This folder holds the project's implementation queue: one file per unit of
work. The queue mirrors the ADR catalogue (`../INDEX.md`) but tracks human
ordering of work, not ADR catalogue ordering.

## Layout

- `todo/NNNN-<slug>.md` - pending work, ordered by priority. Each file names
  the owning ADRs, scope, exit criteria, and dependencies.
- `done/<YYYY-MM-DD>-<slug>.md` - shipped work, chronological. The normal
  completion event moves a file from `todo/` to `done/` and amends it with a
  shipped footer.

## Convention

- A pending item gets a `todo/` file before work starts.
- When work ships, the file moves to `done/` with a new date prefix and a
  shipped footer naming the commit, PR, deploy id, or bootstrap base.
- Small fixes that do not justify a plan file can skip the ceremony.
- The status of owning ADRs advances when the work ships:
  `Accepted -> Implemented`.

## Status semantics on owning ADRs

| ADR status | Meaning |
|---|---|
| Proposed | Draft; decision authored but not yet approved. |
| Accepted | Decision approved; implementation authorised. Sits in `todo/`. |
| Implemented | Shipped per the project's completion event. Sits in `done/`. |
| Superseded | Replaced by another ADR. |
| Deprecated | Was real; the world moved on; no successor. |

See `../CONVENTIONS.md` for the canonical definition.
