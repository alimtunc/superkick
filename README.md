# Superkick

From Linear issue to reviewed PR, on your own machine.

Superkick is a local-first agent orchestrator focused on the path from Linear issue to reviewed PR. The current codebase already provides the local control plane, CLI, dashboard, and run lifecycle foundations for that loop, and is now iterating toward the full end-to-end path.

## Current status

Today, the project already includes:

- a local `superkick` CLI with `doctor`, `init`, `serve`, `run`, `status`, and `cancel`
- a local HTTP control plane and SQLite-backed run state
- a React dashboard with Control Center, Issues, Runs, and Issue Detail pages
- Linear issue sync with status mapping, comments ingestion, and operator filter buckets
- launch profiles with operator instructions and duplicate run guards
- run state transitions, interrupts, review results, and realtime SSE event streaming
- CI quality gates for both engine and dashboard

The next product loop is now:

`issue sync -> launch from dashboard -> live run supervision -> reviewed PR`

## Target flow

```
                         superkick.yaml
                              |
   Linear issue               v
   (In Progress)  --->  [ Control Plane ]
                              |
                    +---------+---------+
                    |                   |
               [ Worktree ]      [ Dashboard ]
                    |              (live UI)
                    v
              +----------+
              |  plan    |
              +----------+
                    |
              +----------+
              |  code    |  <-- claude / codex
              +----------+
                    |
              +----------+
              | commands |  <-- lint, test, build
              +----------+
                    |
              +----------+       blocked?
              |  review  |  -----> ask human
              |  swarm   |  <----- resume
              +----------+
                    |
              +----------+
              | open PR  |
              +----------+
                    |
                    v
              Ready to merge
```

## Core ideas

**Issue to PR, not agent platform.** The product is not a chatbot or a generic AI framework. It takes an issue, runs a complete engineering workflow, and outputs a PR.

**Playbook runtime.** Each project defines its own workflow: which agents to use, which commands to run, what review strategy to apply. Superkick executes that playbook, it does not impose a universal process.

**Human interrupt layer.** The system runs autonomously by default. It only pauses when it hits a real blocker or an explicit project checkpoint. No continuous chat loop.

**Review swarm.** Before the PR is finalized, multiple review agents inspect the work in parallel. This is a native step, not an afterthought.

**Local-first.** Everything runs on your machine. Your code, your git, your tools, your tokens. No SaaS dependency.

## Stack

| Layer | Tech |
|-------|------|
| Runtime | Rust (edition 2024), Tokio, Axum |
| Storage | SQLite (WAL), sqlx |
| Frontend | React 19, Vite, TypeScript, Tailwind v4, TanStack |
| Realtime | SSE |
| Agents | Claude, Codex (subprocess) |
| Issue tracker | Linear |
| Git | git CLI, worktrees |
| GitHub | gh CLI |

## Project config

Each repository has a `superkick.yaml` that declares the playbook:

```yaml
version: 1

issue_source:
  provider: linear
  trigger: in_progress

runner:
  mode: local
  base_branch: main
  setup_commands:
    - cargo build

agents:
  planner:
    provider: claude
  coder:
    provider: claude
  reviewer:
    provider: claude

workflow:
  steps:
    - type: plan
      agent: planner
    - type: code
      agent: coder
    - type: commands
      run:
        - cargo test
        - cargo clippy -- -D warnings
    - type: review_swarm
      agents: [reviewer, reviewer]
    - type: pr
      create: true

interrupts:
  on_blocked: ask_human
```

## Getting started

```bash
# From the repo, install the CLI locally
cargo install --path crates/superkick-cli

# Check prerequisites
superkick doctor

# Initialize a repo
cd your-project
superkick init

# Start the local service
superkick serve

# Check the local service
superkick status

# Launch a run
superkick run SK-001 --follow
```

## CLI reference

### `superkick serve`

Start the local server. Must be running before using `run`, `cancel`, or `status`.

```bash
superkick serve              # default port 3100
superkick serve -p 4000      # custom port
```

### `superkick run <ISSUE>`

Trigger a run for an issue. Returns immediately by default (daemon mode).

```bash
superkick run LES-56          # fire-and-forget
superkick run LES-56 --follow # stay attached, stream events in terminal
superkick run LES-56 -f       # short form
```

### `superkick status`

Check server health and list active runs with their IDs.

```bash
superkick status              # checks ports 3100 and 3000
superkick status -p 4000      # check a specific port
```

```
  [ok]  Superkick server running on port 3100
        http://127.0.0.1:3100

  [>>]  LES-56  running/code  f6df0c65-1df0-4003-9866-450ba1bc9829
```

### `superkick cancel <RUN_ID>`

Cancel an active run. Stops the running agent process immediately.

```bash
superkick status              # find the run ID
superkick cancel f6df0c65-1df0-4003-9866-450ba1bc9829
```

### `superkick doctor`

Check that required tools are installed (git, gh, agent CLIs).

### `superkick init`

Initialize a repository with a `superkick.yaml` config file.

## Run lifecycle

Every run moves through explicit states:

```
queued -> preparing -> planning -> coding -> running_commands -> reviewing -> opening_pr -> completed
                                                    |
                                              waiting_human  (on blockage)
                                                    |
                                                 resumed
```

## Dashboard

The dashboard is a local web control center with:

- **Control Center** — summary metrics, KPI ribbon (completed/active runs, success rate, duration), attention zone, active runs board
- **Issues** — Linear issues synced with status mapping and operator filter buckets (triage, backlog, active, done)
- **Issue Detail** — full issue view with comments, review context, and "Start Run" action with launch profiles
- **Runs** — active and completed runs with live state
- **Run Detail** — step-by-step progress, interrupt panel, and SSE event stream

Next on the dashboard side:

- persistent multi-session watching and fast focus switching
- deeper reliability analytics and KPI aggregation
- cancel/stop run from dashboard

## Roadmap

### Shipped
- [x] Rust workspace and crate structure (7 crates)
- [x] CLI surface (`doctor`, `init`, `serve`, `run`, `status`, `cancel`)
- [x] SQLite storage (runs, steps, artifacts, events, interrupts)
- [x] Project config model and validation (`superkick.yaml`)
- [x] Worktree lifecycle (create, use, cleanup)
- [x] Step engine and agent supervisor
- [x] SSE realtime event stream
- [x] Interrupt service (create, resolve, persist)
- [x] Run state transitions (`waiting_human` / resume)
- [x] Run isolation via worktrees
- [x] Runtime health checks and real cancellation
- [x] `superkick run <issue>` for manual local-first launch
- [x] Linear issue list query and sync contract
- [x] Linear status mapping and operator filter buckets
- [x] Issue detail with comments and review context ingestion
- [x] Start run action from issue detail
- [x] Duplicate active run guard for issue launches
- [x] Launch profiles and operator instructions
- [x] Launch queue with Linear-style issues surface
- [x] Dashboard: Control Center, Issues, Runs, Issue Detail, app shell with sidebar
- [x] CI quality gates for engine and dashboard

### Next up
- [ ] Persistent multi-session rail and quick focus switching
- [ ] Cancel/stop run from dashboard
- [ ] Full pause/resume flow end-to-end
- [ ] Parallel review agents and project-defined review gate
- [ ] End-to-end agent execution through plan, code, commands, and PR creation

### After that
- [ ] Deeper KPI aggregation and reliability analytics
- [ ] Concurrent run scheduling
- [ ] Resource budgets
- [ ] Queueing and fairness
- [ ] CLI distribution without requiring a local Rust toolchain

### Future
- [ ] VPS runners
- [ ] Multi-repo orchestration
- [ ] Token and cost analytics
- [ ] Additional issue trackers beyond Linear

## V1 scope

V1 is intentionally narrow:

- Linear only
- Single repo only
- Local runner only
- One reliable run before multi-run

This is by design. The product proves itself on one path first: `Linear issue -> local run -> playbook -> review swarm -> PR`.

## License

MIT
