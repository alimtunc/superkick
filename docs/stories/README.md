# Story Backlog

This folder captures product and implementation stories that refine the
current architecture into smaller iterative slices.

These stories do not replace the milestone tickets in
`docs/implementation-plan.md`.
They sit one level below them and help drive iterative discussion,
scoping, and implementation.

## Current Story Sequence

1. `SK-STORY-001` Install Superkick once per machine and run `doctor`
2. `SK-STORY-002` Initialize a repository with `superkick init`
3. `SK-STORY-003` Start the local service and open the dashboard
4. `SK-STORY-004` Trigger a manual run from the CLI
5. `SK-STORY-005` Multi-session rail and quick switching
6. `SK-STORY-006` Distribute the CLI binary without requiring Rust

## Current Near-Term Focus

- `SK-STORY-004` closes the manual local-first trigger loop
- `SK-STORY-005` turns the dashboard into a real multi-run supervision surface
- `SK-STORY-006` reduces adoption friction once the product loop is stronger

## Working Rules

- Keep each story independently reviewable.
- Favor user-facing behavior over internal abstraction.
- Do not hide unresolved product decisions inside implementation details.
- Update the story itself when scope changes during iteration.
