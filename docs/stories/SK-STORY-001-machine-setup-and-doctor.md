# SK-STORY-001 - Install Superkick Once Per Machine and Run `doctor`

## User Story

As a developer using Superkick on my machine,
I want to install Superkick once and run a `doctor` command,
so that I can verify my local environment before connecting any repository.

## Why This Story Exists

The product positioning becomes weaker if developers think Superkick must be
installed separately in every repository.
This story establishes the machine-level runtime model early and makes the
entrypoint concrete.

## Scope

- define the machine-level installation contract
- define the `superkick doctor` command behavior
- verify required tools are available on `PATH`
- report actionable setup failures
- state clearly that repositories only need configuration, not full install

## Acceptance Criteria

- a first-time developer can understand that Superkick is installed once per machine
- `superkick doctor` can run without being inside a project repository
- `superkick doctor` checks at least:
  - `git`
  - `gh`
  - configured agent CLIs supported by V1
- failures tell the developer what is missing and what to do next
- the setup flow makes a clean distinction between:
  - machine installation
  - per-repository initialization

## Out of Scope

- generating `superkick.yaml`
- starting the local service
- opening the dashboard
- running a workflow
- desktop packaging

## Notes

- This story defines the first impression of the product.
- The UX should feel like a serious dev tool, not like a repo plugin.
- Existing runtime preflight behavior is a technical input, but this story is
  about product entry and developer understanding.

## Open Questions

- Should `doctor` inspect auth state for `gh`, or only binary presence in V1?
- Should `doctor` check both `claude` and `codex`, or only the providers used by the current config when a repo is present?
- Should the install target be a Rust binary only in V1, or do we need a wrapper installer?
