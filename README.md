# superkick

From Linear issue to reviewed PR, on your own machine.

Superkick is being rebuilt as a local-first agent orchestration product with:

- a Rust runtime and control plane
- a React dashboard
- isolated `git worktree` execution
- project-specific playbooks
- human interrupts only on real blockage
- review swarm before final PR handoff

## Current repository state

This repository has been intentionally cleaned up to restart from the target architecture.

What remains in the repo right now:

- product specification
- target architecture
- implementation backlog and tickets

What was intentionally removed:

- the old Node/Temporal runtime
- the old webhook/dashboard implementation
- legacy config files tied to that runtime
- generated runtime artifacts

## Planning docs

- [docs/v1-spec.md](docs/v1-spec.md)
- [docs/target-architecture.md](docs/target-architecture.md)
- [docs/implementation-plan.md](docs/implementation-plan.md)

## Product contract

Superkick turns a Linear issue into a reviewed pull request on the user's own machine by executing a project-specific engineering playbook inside an isolated git worktree.

Short form:

`Linear issue -> local run -> playbook -> review swarm -> PR`

## V1 scope

- Linear only
- single repo only
- local runner only
- one reliable run before multi-run

## Next step

Start with ticket `SK-001` from [docs/implementation-plan.md](docs/implementation-plan.md) to bootstrap the Rust workspace and React UI shell.
