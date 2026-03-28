# SK-STORY-003 - Start the Local Service and Open the Dashboard

## User Story

As a developer who has configured a repository,
I want to start Superkick locally and open the dashboard,
so that I can observe runs, logs, and interrupts from a stable control surface.

## Why This Story Exists

The product promise is not just execution.
It is visible, controllable execution on the developer's own machine.
This story defines the handoff from CLI entry to the persistent local control plane.

## Scope

- define the `superkick start` command
- define the `superkick open` command
- define the expected relationship between CLI, local API, and web dashboard
- define the minimum local service lifecycle for V1
- make the browser dashboard the primary observation surface

## Acceptance Criteria

- a developer can start the local Superkick service from the CLI
- a developer can open the dashboard from the CLI
- the dashboard is reached through a local browser URL
- the service model is understandable without requiring desktop packaging
- the story makes clear which responsibilities belong to:
  - the CLI
  - the local service
  - the web UI

## Out of Scope

- automatic background boot on OS login
- desktop app packaging
- multi-user access control
- production-grade service management

## Notes

- V1 should prefer clarity over daemon sophistication.
- The browser UI is part of the core product surface, not a debugging convenience.

## Open Questions

- Should `superkick open` auto-start the service if it is not already running?
- Should the service serve the frontend bundle directly in V1, or should local UI dev remain a separate process?
- Do we need a visible service status command in the first CLI cut?
