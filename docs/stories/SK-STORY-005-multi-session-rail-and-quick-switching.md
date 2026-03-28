# SK-STORY-005 - Multi-Session Rail and Quick Switching

## User Story

As a developer supervising multiple Superkick runs,
I want to keep several sessions visible in the same window and switch between them quickly,
so that I can understand what is happening across runs without opening multiple tabs.

## Why This Story Exists

A single-run dashboard is fine for early debugging,
but the product becomes much more compelling when it supports real supervision.
This story introduces a "watch several runs at once" model without turning the UI into a noisy wall of logs.

## Scope

- define a persistent session rail in the dashboard shell
- let the user pin or watch several runs
- show compact live state for each watched session
- support instant focus switching between watched sessions
- keep one primary focused context while preserving awareness of others

## Acceptance Criteria

- a user can watch multiple runs in the same dashboard window
- each watched session shows:
  - issue identifier
  - state
  - current step
  - age or recency
  - alert signal when needed
- clicking a watched session changes the main focus instantly
- the pattern remains readable with 3 to 5 watched sessions
- the dashboard does not require multiple browser tabs for normal supervision

## Out of Scope

- full split-screen comparison
- multi-monitor layouts
- streaming all logs from all watched sessions at once
- multi-user collaboration

## Notes

- this should feel like a mission-control rail, not like duplicate navigation
- one focused run should still own the main detail view
- later expansions can include compare mode, unread event counts, and mini live previews

## Open Questions

- Should watched sessions persist across page reloads?
- Should the rail live only on the overview page, or across all dashboard pages?
- Should a blocked session auto-pin itself into the rail?
