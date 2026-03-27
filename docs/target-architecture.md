# Superkick Target Architecture

Status: target implementation architecture for the Rust + React version of Superkick.

This document is intentionally opinionated. It is designed to help implementation start immediately, not to preserve optionality forever.

## 1. Product contract

Superkick turns a Linear issue into a reviewed pull request on the user's own machine by executing a project-specific engineering playbook inside an isolated git worktree. The system should only interrupt the human when it is truly blocked or when a project-defined checkpoint requires a decision.

Short form:

`Linear issue -> local run -> playbook -> review swarm -> PR`

## 2. Architectural principles

- Local-first before distributed
- Single reliable run before multi-run
- Explicit state machine before "agent magic"
- Project playbook execution before generic workflow builder
- Human interrupt layer before full chat surface
- Database-backed run state before log-file-driven orchestration
- Git CLI before libgit2
- Simple HTTP + browser UI before desktop packaging

## 3. Chosen stack

### Backend and runtime

- Language: Rust
- HTTP: `axum`
- Async runtime: `tokio`
- Storage: `SQLite` with WAL
- DB access and migrations: `sqlx`
- Serialization and config: `serde`, `serde_yaml`
- Logging and tracing: `tracing`, `tracing-subscriber`
- IDs: `uuid`
- Time: `time` or `chrono`

### Frontend

- Language: TypeScript
- UI: React
- Build tool: Vite
- Data fetching: native fetch or TanStack Query
- Realtime transport: SSE first, WebSocket only if needed later

### External interfaces

- Linear: HTTP API and webhook ingestion
- Ingress: direct webhook delivery to the backend through a tunnel or reverse proxy
- GitHub: `gh` CLI first
- Git: `git` CLI
- Agent providers: `claude`, `codex` via subprocesses

## 4. What we are explicitly not using

- Temporal
- microservices
- distributed queues
- Postgres at the start
- libgit2 at the start
- Cloudflare Worker as a required ingress layer
- a full workflow visual editor
- a permanently open human-agent chat loop

## 5. Repository layout

The repository has been reset to a planning-first state. The new implementation starts from this target structure.

```text
/
  Cargo.toml
  Cargo.lock
  crates/
    superkick-config/
    superkick-core/
    superkick-storage/
    superkick-runtime/
    superkick-integrations/
    superkick-api/
  ui/
    package.json
    vite.config.ts
    src/
  migrations/
  examples/
    superkick.yaml
  docs/
```

## 6. Module boundaries

### `superkick-config`

Responsible for:

- parsing `superkick.yaml`
- validating configuration
- environment loading
- providing typed configuration to the rest of the system

Should not know:

- HTTP
- database persistence
- UI

### `superkick-core`

Responsible for:

- domain types
- run state machine
- step definitions
- budgets and retry policy types
- interrupt model
- application services

This crate is the business heart of Superkick.

### `superkick-storage`

Responsible for:

- SQLite connection management
- migrations
- repository implementations
- querying runs, steps, events, interrupts, artifacts

This crate persists and reads all runtime state.

### `superkick-runtime`

Responsible for:

- worktree lifecycle
- repo cache management
- subprocess supervision for agents
- subprocess supervision for `git`, `gh`, project commands
- streaming raw process output into events

This is the execution substrate.

### `superkick-integrations`

Responsible for:

- Linear webhook and API client logic
- GitHub helpers
- future provider adapters

This crate must remain thin. It adapts external systems to core interfaces.

### `superkick-api`

Responsible for:

- HTTP server
- webhook routes
- run list/detail endpoints
- action endpoints
- SSE streams for events and logs
- serving built frontend assets

This crate should not own business logic. It calls core services.

### `ui`

Responsible for:

- run list
- run detail
- live event stream rendering
- interrupt actions
- minimal settings and status screens

## 7. High-level component flow

```text
Linear webhook / Manual trigger / CLI
                |
                v
            axum API
                |
                v
         Core run service
                |
    +-----------+------------+
    |                        |
    v                        v
 Storage repositories   Runtime executors
    |                        |
    v                        v
 SQLite                git / gh / claude / codex / project commands
                |
                v
           Event stream
                |
                v
           React dashboard
```

## 8. Run lifecycle

Every run must move through explicit states:

- `queued`
- `preparing`
- `planning`
- `coding`
- `running_commands`
- `reviewing`
- `waiting_human`
- `opening_pr`
- `completed`
- `failed`
- `cancelled`

State transitions must be enforced in code. They should not be implicit side effects of ad hoc step functions.

## 9. Data model

The database is the runtime truth. Logs as files can exist later as optional artifacts, but the control plane must not depend on JSONL files.

### `runs`

- `id`
- `issue_id`
- `issue_identifier`
- `repo_slug`
- `state`
- `trigger_source`
- `current_step_key`
- `base_branch`
- `worktree_path`
- `branch_name`
- `started_at`
- `updated_at`
- `finished_at`
- `error_message`

### `run_steps`

- `id`
- `run_id`
- `step_key`
- `status`
- `attempt`
- `agent_provider`
- `started_at`
- `finished_at`
- `input_json`
- `output_json`
- `error_message`

### `run_events`

- `id`
- `run_id`
- `run_step_id` nullable
- `ts`
- `kind`
- `level`
- `message`
- `payload_json`

### `agent_sessions`

- `id`
- `run_id`
- `run_step_id`
- `provider`
- `command`
- `pid` nullable
- `status`
- `started_at`
- `finished_at`
- `exit_code` nullable

### `interrupts`

- `id`
- `run_id`
- `run_step_id` nullable
- `question`
- `context_json`
- `status`
- `answer_json` nullable
- `created_at`
- `resolved_at` nullable

### `artifacts`

- `id`
- `run_id`
- `kind`
- `path_or_url`
- `metadata_json`
- `created_at`

## 10. Config model

Per-project config must become a single file, `superkick.yaml`.

```yaml
version: 1

issue_source:
  provider: linear
  trigger: in_progress

runner:
  mode: local
  repo_root: .
  base_branch: main
  worktree_prefix: superkick

agents:
  implementation:
    provider: claude
  review:
    provider: codex

workflow:
  steps:
    - type: plan
      agent: implementation
    - type: code
      agent: implementation
    - type: commands
      run:
        - pnpm lint
        - pnpm test
    - type: review_swarm
      agents:
        - review
        - review
        - review
    - type: pr
      create: true
      generate_description: true

interrupts:
  on_blocked: ask_human
  on_review_conflict: ask_human

budget:
  max_retries_per_step: 2
  max_parallel_agents: 3
  token_budget: medium
```

## 11. Runtime services

### Run service

Creates runs, transitions state, coordinates step execution, handles success and failure.

### Step engine

Maps step definitions from config to typed executors. It should support:

- `plan`
- `code`
- `commands`
- `review_swarm`
- `create_pr`
- `await_human`

### Workspace manager

Responsible for:

- repo clone and fetch
- base branch checkout assumptions
- worktree naming
- cleanup and prune
- safety checks around collisions

### Agent supervisor

Responsible for:

- spawning CLI agents
- streaming output
- cancellation
- timeout handling
- retries
- collecting artifacts and summaries

### Interrupt service

Responsible for:

- opening an interrupt
- transitioning a run to `waiting_human`
- applying answer actions: retry, continue, abort, manual note

### Review swarm service

Responsible for:

- launching N review sessions in parallel
- collecting results
- aggregating a summary
- deciding whether to proceed or interrupt

## 12. API surface

Minimal required endpoints:

- `POST /webhooks/linear`
- `POST /runs`
- `GET /runs`
- `GET /runs/:id`
- `GET /runs/:id/events`
- `POST /runs/:id/cancel`
- `POST /runs/:id/retry`
- `POST /interrupts/:id/answer`
- `GET /health`

Ingress note:

- The backend itself receives the Linear webhook.
- During local development, expose it through a tunnel if needed.
- During self-hosted deployment, put it behind a reverse proxy if needed.
- A Cloudflare Worker can be added later, but it is not required for this architecture.

## 13. UI surface

The initial dashboard should have:

- run list
- run detail
- step timeline
- live event stream
- interrupt panel
- action buttons for retry, cancel, answer

The UI should optimize for observability first, not visual flourish.

## 14. Build order

### Phase 1

One reliable end-to-end run:

- manual or webhook trigger
- config load
- run creation
- worktree lifecycle
- plan and code
- project commands
- PR creation

### Phase 2

Observability and human control:

- persisted events
- SSE
- dashboard
- interrupt workflow

### Phase 3

Differentiation:

- review swarm
- stronger policies and budgets
- multi-run scheduler

## 15. Definition of first success

The first version is considered successful when:

- one Linear issue can start one local run
- the run creates an isolated worktree
- the system executes a typed playbook rather than a single ad hoc prompt
- all run progress is visible in the dashboard
- a blocked run can pause and ask for human input
- a successful run can open a real PR
