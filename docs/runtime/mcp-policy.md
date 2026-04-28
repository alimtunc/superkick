# MCP and tool policy per agent (SUP-104)

Superkick spawns child agents with **no MCP access by default**. A role that
needs MCP must opt in explicitly via two pieces of configuration:

1. A project-level `mcp_servers` registry that names the servers the project
   is willing to expose at all.
2. A per-role `mcp` policy block that lists which registry entries the role
   may use.

The same shape covers tool allowlists/denylists and per-call audit
toggles, recorded on every `agent_sessions` row.

## Why this layout

Earlier versions of Superkick wired the Linear MCP into every agent that
asked for `linear_context: snapshot_plus_mcp`, and there was no way to
extend the same mechanism to other MCP servers without editing the
runtime. The result was an implicit, hard-coded permission policy. SUP-104
makes the policy:

- **Declarative** — one registry, one allowlist per role.
- **Auditable** — every spawn records which servers were actually wired
  and what the tool policy looked like at spawn time.
- **Provider-aware** — Claude gets a strict MCP file; Codex falls back to
  a documented no-op until the upstream CLI supports the equivalent flag.

## YAML model

```yaml
# Project-level registry. Empty by default — declare a server here once,
# reference it by name from any role that needs it.
mcp_servers:
  linear:
    type: http
    url: https://mcp.linear.app/mcp
    # Env-var NAMES (not values) the supervisor passes through to the
    # spawned MCP process. Values are resolved on disk and never persisted.
    env_passthrough: []
  fs:
    type: stdio
    command: mcp-fs-server
    args: ["--root", "."]
    env_passthrough: ["MCP_FS_TOKEN"]

agents:
  planner:
    provider: claude
    # Per-role MCP policy. Mode is `none` by default (no MCP file written,
    # no `--mcp-config` flag added). Switch to `servers` and list the
    # registry entries the role may use.
    mcp:
      mode: servers
      servers: [linear, fs]
    # Per-role tool policy. Allow/deny lists are informational and
    # provider-best-effort. The booleans drive audit columns.
    tool_policy:
      allow: [read, grep]
      deny: [bash]
      require_approval: true
      persist_results: true
```

Two complete examples ship in the repo:

- [`examples/superkick.yaml`](../../examples/superkick.yaml) — Linear-only
  via the legacy shortcut.
- [`examples/superkick.multi-mcp.yaml`](../../examples/superkick.multi-mcp.yaml)
  — explicit multi-server registry plus per-role allowlists.

### `linear_context: snapshot_plus_mcp` shortcut

The pre-SUP-104 sugar still works. A role with
`linear_context: snapshot_plus_mcp` is desugared at catalog-build time
into:

- `mcp.mode = servers` (preserved if already set).
- The implicit `linear` entry pushed onto `mcp.servers` if absent.
- A `linear` entry auto-injected into the `mcp_servers` registry pointing
  at `https://mcp.linear.app/mcp`, unless the project already declared
  one (in which case the project's URL wins).

This is the only place the desugaring lives —
`superkick_config::SuperkickConfig::agent_catalog` and
`effective_mcp_servers`.

## Provider behaviour

| Provider | Per-role MCP file | CLI flags appended | Notes |
|---|---|---|---|
| Claude | Written | `--mcp-config <path> --strict-mcp-config` | `--strict-mcp-config` makes Claude refuse any other MCP source — neither the worktree's `.mcp.json` nor the user's `~/.config/claude/...` is read. |
| Codex | Written for inspection | *(none — v1)* | Codex has no equivalent of `--strict-mcp-config` in v1. The runtime emits a warning event and the audit row records `mcp_servers_used = []` so the run log is honest about what the child actually saw. |

If the upstream Codex CLI gains a strict-config flag later, switching
behaviour is a one-liner in `crates/superkick-runtime/src/mcp_policy.rs`
(`mcp_cli_args_for_provider`).

## Env-var refs and on-disk artefacts

For stdio servers, `env_passthrough` lists the names of variables the
supervisor copies from its own environment into the MCP child's
environment. The values are resolved at spawn time and embedded in the
JSON file under `<worktree>/.superkick/mcp-{role}-{run-id}.json` so the
child can authenticate. **Names are persisted; values are not.**

The `<worktree>/.superkick/` directory lives inside a worktree which is
itself gitignored (`.worktrees/`, `superkick-worktrees/`). Operators
should not commit anything from there.

The `audit row → on-disk file` distinction:

- **Audit row** (`agent_sessions.mcp_servers_used`) → JSON array of
  server *names* only.
- **On-disk file** → server names plus resolved values. Ephemeral by
  convention. Never logged by Superkick.

## Audit columns

Migration `018_agent_session_tool_policy` adds four columns to
`agent_sessions`:

| Column | Type | Meaning |
|---|---|---|
| `mcp_servers_used` | `TEXT NULL` (JSON array) | Names of MCP servers wired into the child's strict-config file. Empty `[]` when the role's policy resolved to `none`, or all entries were dropped (Codex no-op, write failure, missing registry entry). |
| `tools_allow_snapshot` | `TEXT NULL` (JSON array) | Snapshot of the role's tool allowlist at spawn. `NULL` ⇒ the role declared no allowlist (no restriction). `Some([])` ⇒ explicit deny-everything. |
| `tool_approval_required` | `INTEGER NOT NULL DEFAULT 0` | `1` when the role required operator approval per tool call. Default `0` for legacy rows. |
| `tool_results_persisted` | `INTEGER NOT NULL DEFAULT 1` | `1` when tool result payloads are stored on the audit trail (default; the historical behaviour). Set to `0` for roles handling secrets. |

Only the resolved policy is persisted — never resolved env values, never
the on-disk file path (which is ephemeral and may be gone by the time
the operator inspects the row).

## Degradation policy

The runtime never fails a spawn because of MCP issues; it logs and
proceeds:

- Missing registry entry referenced by a role → the entry is dropped
  with a `Warn` event; remaining entries are still wired.
- Failed file write under `.superkick/` → the spawn proceeds without
  any MCP wiring; the audit row records an empty `mcp_servers_used`.
- Codex provider with a non-empty policy → the file is written for
  inspection, no flag is appended, and `mcp_servers_used` is recorded
  as `[]` to reflect what the child actually saw.
- `linear_context: snapshot_plus_mcp` but the Linear MCP did not make
  it into the file → effective mode degrades to `snapshot` so the
  prompt block is still injected without falsely claiming MCP access.

## Touchpoints

- Resolution: `superkick_config::SuperkickConfig::agent_catalog` and
  `effective_mcp_servers`.
- Per-role projection: `superkick_core::ResolvedMcpPolicy` and
  `ResolvedToolPolicy`, attached to `ResolvedAgent`.
- File writing + provider flags:
  `superkick_runtime::mcp_policy::write_role_mcp_config` and
  `mcp_cli_args_for_provider`.
- Step-engine glue: `StepEngine::prepare_mcp_policy` in
  `crates/superkick-runtime/src/step_engine/agent.rs`.
- Persistence: migration `018_agent_session_tool_policy.sql` plus the
  read/write paths in `SqliteAgentSessionRepo`.
