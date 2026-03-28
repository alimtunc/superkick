# SK-STORY-002 - Initialize a Repository with `superkick init`

## User Story

As a developer inside a repository,
I want to run `superkick init`,
so that the repo becomes a known Superkick project without reinstalling the product.

## Why This Story Exists

Once the machine-level installation is clear, the next friction point is the
repo setup step.
This story makes the per-repository contract minimal and explicit.

## Scope

- define the `superkick init` command
- generate or scaffold `superkick.yaml`
- detect repo-local defaults when possible
- explain what becomes machine-level state versus repo-level state
- make it obvious that the repo is being configured, not "installing Superkick"

## Acceptance Criteria

- a developer can run `superkick init` from a repository root
- the command creates a valid starter `superkick.yaml`
- the generated config includes the minimum fields needed for a first run
- the flow explains what the developer should edit next
- re-running `superkick init` does not silently destroy an existing config

## Out of Scope

- background service lifecycle
- dashboard interactions
- Linear webhook setup
- multi-repo selection UX

## Notes

- The generated config should align with the current target architecture and
  existing example config.
- The command should prefer safe scaffolding over "smart" mutation.

## Open Questions

- Should `init` also register the repo with a local Superkick service in V1?
- Should the command support interactive and non-interactive modes from the start?
- Should secrets be referenced only through env vars in the initial scaffold?
