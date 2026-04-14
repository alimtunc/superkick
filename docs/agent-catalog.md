# Agent catalog and run policy

Status: design + core contract (SUP-43).

## Why

One orchestrated run may launch multiple agent sessions. To keep that legible
and reviewable the orchestrator must only spawn from an explicit, bounded
catalog of agent roles — not invent providers or commands on the fly.

This document defines the durable contract:

1. the project-level **agent catalog** (reusable roles)
2. the run-level **policy** (which roles a run is allowed to spawn)
3. the **role → provider/command** routing the runtime uses to launch sessions

Everything in this document flows through the same PTY substrate that already
backs terminal-attached runs. There is no second execution path.

## Model

### `AgentDefinition` — a catalog entry

Each entry in the `agents:` map of `superkick.yaml` is a reusable role.

```yaml
agents:
  planner:
    provider: claude
    role: planner            # optional label; defaults to the catalog key
    model: claude-opus-4-6   # optional model id passed to the provider
    system_prompt: |         # optional role preamble
      You are the planner. Think before acting.
    tools: [read, grep]      # optional tool allowlist (informational today)
    budget:
      timeout_secs: 900      # optional per-role session timeout
      max_turns: 8           # optional max turns (provider-dependent)
```

Only `provider` is required. Old two-line entries (`{ provider: claude }`)
keep parsing unchanged.

The catalog is immutable at run launch time. Nothing in the orchestrator can
synthesise a role that is not in the catalog.

### `RunPolicy` — the allowed agent set

A `RunPolicy` is the set of catalog roles a specific run is authorised to
spawn. It can only narrow the catalog, never extend it.

Three layers compose at launch:

| Layer                     | Source                                | Effect                            |
|---------------------------|---------------------------------------|-----------------------------------|
| catalog                   | `agents:` in `superkick.yaml`         | defines the universe of roles     |
| launch profile base policy| `launch_profile.allowed_agents`       | narrows the catalog for every run |
| per-run override          | `RunPolicy::with_override` at launch  | further narrows a single run      |

`allowed_agents: null` (or absent) means "every role in the catalog is allowed".
An empty list means "nothing allowed" and is preserved verbatim — useful to
prove a run is inert.

Per-run overrides exist at the core API level today (`RunPolicy::with_override`)
so higher layers can narrow a launch. Persistent storage of per-run policies is
deferred until the control-center surfaces it.

### `RoleRouter` — deterministic routing

`RoleRouter::resolve(role)` is the only way the runtime spawns an agent. It
returns a `ResolvedAgent`:

```
ResolvedAgent {
    name, role, provider, model, system_prompt,
    program, args, timeout, max_turns,
}
```

Resolution rules:

1. If `role` is not in the catalog → `RouterError::UnknownRole`.
2. If `role` is not allowed by the run policy → `RouterError::NotAllowed`.
3. Otherwise combine the catalog definition with the provider's default
   command (`provider_command` in `role_router.rs`) to produce a launch recipe.

The mapping from provider to program/argv lives in one place (core) so the
route is inspectable from a single file.

## What this ticket ships

- `superkick_core::{AgentCatalog, AgentDefinition, RunPolicy, RoleRouter,
  ResolvedAgent, RouterError}` — the contract
- `superkick_config::{AgentDefinition, AgentBudget,
  SuperkickConfig::{agent_catalog, base_run_policy}}` — parsing + projection
- `launch_profile.allowed_agents` in `superkick.yaml`
- `StepEngine` is router-scoped: `execute_agent`, `execute_review_swarm`,
  and preflight all route through `self.router()` instead of reaching into
  `config.agents` and a hardcoded `agent_command`
- validator rejects workflows that reference roles outside the allowed set
  and policies that reference unknown roles

## Deliberately **not** shipped here

- No UI for editing the catalog or the allowed set.
- No DB migration for per-run policy — policy lives in-memory, derived from
  the project config at launch. When the control-center needs to surface and
  override it, that becomes a focused follow-up.
- No child-session spawning or structured inter-agent handoff. The router
  contract is compatible with that direction (every spawn is already a
  resolved role), but this ticket intentionally stops at the contract.
- No provider-specific tool-restriction enforcement. `tools` is parsed and
  stored; wiring it into provider CLIs is deferred until we pick which
  providers honor which flag.

## Follow-ups

- Persist a run's effective policy (either on `runs` or as a `run_policies`
  table) when we need to display "this run was allowed to spawn X, Y".
- Expose the catalog + active policy in the run detail API so the UI can
  render the authorised set next to the live sessions.
- Honour `tools` and `max_turns` per provider once the provider adapters
  grow a structured launch API (today they are plain CLIs).
