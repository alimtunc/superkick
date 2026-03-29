# Superkick Product Context

This document is the repo-side product context for Superkick.

Use it when a ticket or implementation task needs product intent beyond the local issue description.

## Product definition

Superkick is a local-first control center for software execution, connected first to Linear.

It does not replace Linear. Linear remains the source-of-truth backlog, while Superkick adds:

- execution
- supervision
- orchestration
- session recovery
- operator visibility

The core loop is not only `issue -> run`.

The real product loop is:

`issue -> start -> supervise -> recover/intervene -> review -> merge`

## Core principles

- Local-first
- Single repo first
- Reliable path before broader expansion
- Linear remains backlog source of truth
- Human-triggered launch in V1
- Human review before merge remains part of the product model
- Superkick should feel like a control center, not only a monitor

## Product boundaries

### What Superkick is

- a surface to see relevant Linear issues
- a place to start runs from issue context
- a place to supervise multiple runs
- a place to recover and reattach sessions
- a place to chat with sessions in context
- a place to see attention states, review states, and later orchestrator signals

### What Superkick is not

- a replacement for Linear backlog planning
- a generic chatbot detached from execution context
- a fully autonomous backlog scheduler in the current phase
- a multi-repo workspace product yet

## V1 target experience

The operator should be able to:

- open Superkick and see relevant Linear issues
- inspect issue context without always returning to Linear
- press `Start` from an issue
- see the resulting run inside the dashboard
- supervise multiple runs
- recover blocked or existing sessions
- interact with a session in context
- see what needs attention now
- see what is waiting, in review, or otherwise operationally relevant

## Main product surfaces

The intended product surfaces are:

- Overview
- Issues
- Runs
- Sessions
- Attention
- Settings

These are product surfaces, not only technical routes.

## Orchestrator role

The orchestrator is part of the product direction, but its role is bounded in the near term.

### In near-term scope

- route work to the right provider or agent
- understand waiting and blocked execution states
- coordinate sub-agents
- help with context-aware interventions
- evolve toward work-state awareness across issue, run, PR/review, and dependency context

### Not yet in scope

- free-form autonomous prioritization of the whole backlog
- opaque automatic scheduling across all issues

## Work-state direction

Superkick should converge toward a coherent model of work states such as:

- done
- waiting
- in PR / review
- blocked
- blocked by dependency

This matters both for the orchestrator and for operator-facing attention surfaces.

## Product phases

### Launch

Trustworthy single-repo loop:

- Linear intake
- issue detail
- app shell
- start run from issue
- first visible issue/run linkage

### V1

Usable control center:

- session recovery
- session chat
- attention surfaces
- reliability signals
- settings and integrations

### V1.5

Visible orchestrator coordination layer:

- provider/agent routing
- waiting-state handling
- dependency and work-state awareness
- sub-agent coordination

### V2

Adoption and packaging:

- distribution path
- easier install
- desktop bridge exploration

### Later

Workspace expansion:

- multi-repo foundations
- repo registry
- workspace-level control model

## Explicitly deferred

- full multi-repo daily-use experience
- broad desktop-first packaging before the core loop is solid
- generalized autonomous backlog management

## How to use this document

When executing a product ticket:

1. Read the ticket first.
2. Read this file only if product intent is ambiguous or cross-cutting.
3. Do not re-brainstorm the product if this file already answers the question.
