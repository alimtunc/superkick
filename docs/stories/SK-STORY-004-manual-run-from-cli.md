# SK-STORY-004 - Trigger a Manual Run from the CLI

## User Story

As a developer working on a configured Superkick repository,
I want to trigger a run from the CLI with an issue identifier,
so that I can launch the issue-to-PR flow without waiting for webhook automation.

## Why This Story Exists

Manual launch is the fastest path to a credible first demo and to local developer trust.
It also gives the product a concrete fallback when Linear automation is not yet wired.

## Scope

- define the `superkick run <issue>` command
- define the minimum required inputs for manual launch
- route the command through the local service rather than bypassing it
- ensure the created run appears in the dashboard
- define the success and failure messages shown in the CLI

## Acceptance Criteria

- a developer can launch a run from the CLI with a clear issue identifier
- the command validates that the current repo is a configured Superkick project
- the run is created through the local control plane
- the dashboard reflects the new run
- failures are actionable and do not require reading internal logs first

## Out of Scope

- Linear webhooks
- multi-repo dispatch
- advanced queueing
- remote runners

## Notes

- This story should preserve the architecture principle that the local service
  owns durable run state.
- The CLI should behave like a client of the product, not as a second execution engine.

## Open Questions

- Should the command accept both `SK-123` and a raw external issue ID?
- Should the CLI block until the run is created only, or stream early events too?
- Should manual launch support an explicit `--repo` flag later, once multi-repo becomes relevant?
