# Superkick Implementation Plan

This document is the execution backlog for building the Rust + React version of Superkick.

Use it together with:

- `docs/v1-spec.md`
- `docs/target-architecture.md`

## Current status snapshot

This plan started as a clean-slate implementation backlog.
The codebase has now moved past the empty bootstrap stage and already includes:

- Rust workspace and core crates
- SQLite-backed run persistence
- a local `superkick` CLI with `doctor`, `init`, `serve`, `status`, and `cancel`
- a Control Center dashboard
- SSE event streaming
- interrupts and cancellation primitives

Near-term work is now split across two layers:

- **ticket plan in this document** for the architectural backbone
- **story backlog in `docs/stories/`** for smaller product-facing iterations such as manual run, multi-session supervision, and CLI distribution

Recommended next product slices after the current shipped baseline:

1. `SK-STORY-004` manual run from the CLI
2. `SK-STORY-005` multi-session rail and quick switching
3. `SK-STORY-006` CLI distribution without a Rust requirement

## How to use this backlog with Claude

For each ticket:

1. Give Claude the ticket section verbatim.
2. Also give Claude `docs/target-architecture.md`.
3. Instruct Claude to implement only that ticket and not future tickets.
4. Ask Claude to return:
   - changed files
   - architecture decisions taken
   - tests or manual verification
   - follow-up gaps

Recommended instruction prefix:

`Implement ticket SK-00X exactly as scoped. Do not anticipate future tickets unless required for clean boundaries. Prefer the simplest implementation that satisfies the acceptance criteria.`

## Milestones

### Milestone A: one real run works

Goal:

- single repo
- local runner
- one end-to-end run
- worktree
- plan/code/commands/pr

Tickets:

- SK-001
- SK-002
- SK-003
- SK-004
- SK-005
- SK-006
- SK-007
- SK-008
- SK-009

### Milestone B: product-grade visibility and control

Goal:

- API
- live events
- dashboard
- interrupts

Tickets:

- SK-010
- SK-011
- SK-012

### Milestone C: differentiation

Goal:

- review swarm
- hardening
- demo-quality path

Tickets:

- SK-013
- SK-014

## Ticket index

| Ticket | Title | Depends on |
|---|---|---|
| SK-001 | Bootstrap Rust workspace and repo layout | none |
| SK-002 | Define domain model and run lifecycle | SK-001 |
| SK-003 | Implement config system and sample `superkick.yaml` | SK-001 |
| SK-004 | Add SQLite storage and migrations | SK-001, SK-002 |
| SK-005 | Add Linear ingress and run creation flow | SK-002, SK-003, SK-004 |
| SK-006 | Implement repo cache and worktree manager | SK-002, SK-003, SK-004 |
| SK-007 | Implement local agent supervisor | SK-002, SK-004 |
| SK-008 | Build typed step engine for the single-run path | SK-002, SK-003, SK-004, SK-006, SK-007 |
| SK-009 | Add GitHub PR delivery step | SK-006, SK-008 |
| SK-010 | Expose HTTP API and SSE event streams | SK-004, SK-008 |
| SK-011 | Build React dashboard shell | SK-010 |
| SK-012 | Add human interrupt workflow | SK-008, SK-010, SK-011 |
| SK-013 | Add review swarm as native step | SK-007, SK-008, SK-010 |
| SK-014 | Harden the end-to-end demo path | SK-005 through SK-013 |

## Detailed tickets

## SK-001 - Bootstrap Rust workspace and repo layout

**Goal**

Create the new Rust + React project skeleton as the new primary codebase for this repository.

**Scope**

- add root `Cargo.toml` workspace
- create crates:
  - `superkick-config`
  - `superkick-core`
  - `superkick-storage`
  - `superkick-runtime`
  - `superkick-integrations`
  - `superkick-api`
- create `ui/` Vite React app shell
- add shared formatting and linting config for Rust

**Deliverables**

- compilable empty workspace
- basic `main.rs` in API crate
- minimal frontend booting page
- documented repo layout

**Acceptance criteria**

- `cargo check` passes
- frontend installs and builds

**Out of scope**

- business logic
- DB schema
- webhooks

**Claude handoff**

Implement the new Rust workspace and UI shell as the fresh starting point of the codebase. Do not add business logic yet.

## SK-002 - Define domain model and run lifecycle

**Goal**

Create the typed core domain for runs, steps, events, states, budgets, and interrupts.

**Scope**

- run state enum
- step key enum
- interrupt status enum
- domain structs for runs, steps, events, interrupts, artifacts
- state transition rules
- core errors

**Deliverables**

- `superkick-core` domain module
- tests for valid and invalid state transitions

**Acceptance criteria**

- state transitions are explicit and tested
- the run lifecycle matches `docs/target-architecture.md`

**Out of scope**

- storage implementation
- runtime execution

**Claude handoff**

Focus on the core model only. Do not add persistence or HTTP concerns.

## SK-003 - Implement config system and sample `superkick.yaml`

**Goal**

Replace the current split config model with a typed, single-file project config.

**Scope**

- define config schema
- parse YAML into typed Rust structs
- add validation
- create example config in `examples/`
- support minimal workflow steps:
  - `plan`
  - `code`
  - `commands`
  - `review_swarm`
  - `pr`

**Deliverables**

- config crate API
- sample `examples/superkick.yaml`
- config validation tests

**Acceptance criteria**

- invalid configs fail with readable errors
- example config parses successfully

**Out of scope**

- env secrets loading beyond basic support
- migration from old config files

**Claude handoff**

Build the config model exactly for the target architecture, not for the legacy `.claude-agent.yml`.

## SK-004 - Add SQLite storage and migrations

**Goal**

Make the database the source of truth for runs, steps, events, interrupts, and artifacts.

**Scope**

- set up SQLite connection handling
- add migrations for:
  - `runs`
  - `run_steps`
  - `run_events`
  - `agent_sessions`
  - `interrupts`
  - `artifacts`
- add repository interfaces and SQLite implementations

**Deliverables**

- migration files
- storage crate repositories
- integration tests against SQLite

**Acceptance criteria**

- schema can be created from scratch
- repositories can insert and read core entities
- WAL mode is enabled or documented

**Out of scope**

- API endpoints
- query optimization beyond basics

**Claude handoff**

Treat the DB as a durable control-plane store, not just a cache for the UI.

## SK-005 - Add Linear ingress and run creation flow

**Goal**

Create the path from a Linear event or manual trigger to a persisted run.

**Scope**

- Linear webhook endpoint
- signature verification
- issue fetch and enrichment
- manual run creation endpoint for local testing
- run creation service that persists the initial run row and event

**Deliverables**

- Linear client adapter
- webhook route
- manual trigger route
- run creation path into storage

**Acceptance criteria**

- a webhook or manual call can create a queued run
- run includes issue metadata needed by later steps

**Out of scope**

- worktree creation
- agent execution

**Claude handoff**

The goal is ingress and persistence, not end-to-end execution.

## SK-006 - Implement repo cache and worktree manager

**Goal**

Build the execution substrate for local repo preparation and isolated worktrees.

**Scope**

- repo cache directory
- clone/fetch repo
- create worktree for a run
- cleanup and prune
- collision and stale-path handling

**Deliverables**

- runtime workspace module
- typed workspace result model
- tests for path naming and cleanup logic

**Acceptance criteria**

- a run can get a dedicated worktree path
- repeated runs do not corrupt the repo cache
- cleanup paths are safe and deterministic

**Out of scope**

- multi-run scheduling
- PR creation

**Claude handoff**

Use the `git` CLI, not libgit2. Favor reliability and clarity over clever abstractions.

## SK-007 - Implement local agent supervisor

**Goal**

Create a robust process supervisor for `claude` and `codex` runs.

**Scope**

- spawn provider commands
- stream stdout and stderr into run events
- capture exit code and duration
- support cancellation and timeout
- store session metadata

**Deliverables**

- agent supervisor module
- provider command abstraction
- tests for process lifecycle handling where practical

**Acceptance criteria**

- one agent session can be launched from a worktree
- logs are emitted into `run_events`
- timeout and cancellation are handled cleanly

**Out of scope**

- review swarm
- step engine orchestration

**Claude handoff**

Do not try to design a generic LLM framework. Build a clean supervisor for local CLI-based agents.

## SK-008 - Build typed step engine for the single-run path

**Goal**

Execute a project playbook through typed steps instead of a monolithic agent prompt.

**Scope**

- load workflow steps from config
- step executor trait or equivalent
- minimal support for:
  - `plan`
  - `code`
  - `commands`
  - `pr`
- persist step start, success, failure, retries
- transition run state as steps progress

**Deliverables**

- step engine module
- end-to-end single-run service path without review swarm

**Acceptance criteria**

- one run can go from `queued` to `completed` through typed steps
- failed steps persist a clear failure state
- events are emitted for each step transition

**Out of scope**

- interrupt workflow
- review swarm

**Claude handoff**

This is the most important ticket in Milestone A. Keep the implementation boring and explicit.

## SK-009 - Add GitHub PR delivery step

**Goal**

Finish the first end-to-end path by turning a successful run into a real PR.

**Scope**

- stage and commit changes
- detect no-diff situations
- push branch
- create PR via `gh`
- generate a PR description from issue context and run outputs

**Deliverables**

- GitHub delivery module
- PR step integration into the step engine

**Acceptance criteria**

- successful code changes can produce a real PR
- no-change runs are handled gracefully
- PR body contains issue and run context

**Out of scope**

- review swarm aggregation
- human interrupts

**Claude handoff**

Keep auth simple by using the `gh` CLI. Avoid direct GitHub API integration for this ticket.

## SK-010 - Expose HTTP API and SSE event streams

**Goal**

Make runs observable and controllable through a stable HTTP surface.

**Scope**

- `GET /health`
- `GET /runs`
- `GET /runs/:id`
- `GET /runs/:id/events`
- SSE stream for live events
- `POST /runs/:id/cancel`
- `POST /runs`

**Deliverables**

- API routes
- DTOs for run summaries and details
- SSE implementation

**Acceptance criteria**

- the dashboard can consume all data through the API
- event stream updates live during run execution

**Out of scope**

- interrupt answering UI
- auth

**Claude handoff**

Focus on a stable internal product API, not on external public API design.

## SK-011 - Build React dashboard shell

**Goal**

Replace the static HTML dashboard with a UI that can grow into the product control panel.

**Scope**

- run list page
- run detail page
- step timeline
- live event stream view
- basic action buttons: refresh, cancel

**Deliverables**

- React app wired to API
- layout for list and detail views
- SSE client integration

**Acceptance criteria**

- a user can watch a run live from the browser
- the UI can inspect past runs and current run state

**Out of scope**

- polished design system
- auth
- human interrupt answers

**Claude handoff**

Prioritize clarity and product debugging value over visual sophistication.

## SK-012 - Add human interrupt workflow

**Goal**

Introduce the first-class product concept of human intervention on true blockage.

**Scope**

- interrupt entity persistence
- run transition to `waiting_human`
- API to answer an interrupt
- actions:
  - retry step
  - continue with note
  - abort run
- UI interrupt panel in run detail

**Deliverables**

- interrupt service
- answer endpoint
- dashboard action surface

**Acceptance criteria**

- a blocked run can pause safely
- a user can answer the interrupt and resume or abort
- the interrupt history is visible

**Out of scope**

- full conversational chat
- arbitrary freeform run editing

**Claude handoff**

This ticket defines the trust model of the product. Keep the action model narrow and explicit.

## SK-013 - Add review swarm as native step

**Goal**

Implement the product differentiator: parallel pre-review before the PR is finalized.

**Scope**

- `review_swarm` step executor
- launch N review sessions in parallel
- collect summaries
- aggregate findings
- if findings exceed threshold, interrupt the human or fail the gate

**Deliverables**

- review swarm service
- event model for child review sessions
- UI rendering of review results

**Acceptance criteria**

- review agents can run in parallel for one parent run
- the aggregated review result affects the main run flow
- review output is visible in the UI

**Out of scope**

- multi-run across different issues
- advanced weighting strategies

**Claude handoff**

Build review swarm as a first-class step in the engine, not as a sidecar script.

## SK-014 - Harden the end-to-end demo path

**Goal**

Produce the first version that is convincing in real usage and safe to iterate on.

**Scope**

- end-to-end happy path verification
- failure path verification
- cleanup guarantees
- example config and sample run docs
- lightweight developer setup documentation
- minimal smoke test plan

**Deliverables**

- working demo script or walkthrough
- example project setup
- docs for local bring-up

**Acceptance criteria**

- a developer can run the product locally against a real repo
- the full path `Linear issue -> local run -> PR` works
- failure and interrupt paths are demonstrable

**Out of scope**

- remote runners
- multi-run production scheduler
- auth and permissions system

**Claude handoff**

Treat this as the product-readiness ticket for the first credible release, not as a generic cleanup pass.

## Recommended first execution sequence

If you want to start immediately with Claude, launch tickets in this order:

1. `SK-001`
2. `SK-002`
3. `SK-003`
4. `SK-004`
5. `SK-006`
6. `SK-007`
7. `SK-008`
8. `SK-009`
9. `SK-010`
10. `SK-011`
11. `SK-005`
12. `SK-012`
13. `SK-013`
14. `SK-014`

Reason:

- build the local engine first
- then the UI and control plane
- then wire the Linear ingress once the local path is already stable

## First version exit criteria

Do not call V1 working until all of the following are true:

- one issue can create one run
- one run creates one worktree
- the step engine is typed and persisted
- the dashboard shows live progress
- the human interrupt path works
- a successful run can open a PR
- review swarm exists, even if still simple
