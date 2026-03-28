# Superkick

From Linear issue to reviewed PR, on your own machine.

Superkick is a local-first agent orchestrator focused on the path from Linear issue to reviewed PR. The current codebase already provides the local control plane, CLI, dashboard, and run lifecycle foundations for that loop, and is now iterating toward the full end-to-end path.

## Current status

Today, the project already includes:

- a local `superkick` CLI with `doctor`, `init`, `serve`, `run`, `status`, and `cancel`
- a local HTTP control plane and SQLite-backed run state
- a React Control Center dashboard with KPIs, attention zones, active runs, and completed work
- run state transitions, interrupts, review results, and realtime event streaming

The next product loop is now:

`manual run -> multiple live runs -> multi-session supervision in one window`

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
| Runtime | Rust, Tokio, Axum |
| Storage | SQLite (WAL) |
| Frontend | React, Vite, TypeScript |
| Realtime | SSE |
| Agents | Claude, Codex (subprocess) |
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

agents:
  implementation:
    provider: claude
  review:
    provider: codex

workflow:
  steps:
    - type: plan
    - type: code
    - type: commands
      run: [pnpm lint, pnpm test]
    - type: review_swarm
    - type: pr

interrupts:
  on_blocked: ask_human

budget:
  max_retries_per_step: 2
  token_budget: medium
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

The dashboard is now a local web control center with:

- **Control Center home** -- summary metrics and operational visibility
- **KPI ribbon** -- completed runs, active runs, success rate, run duration
- **Attention zone** -- blocked runs, failed runs, pending human input
- **Active runs board** -- live state grouped by stage
- **Completed issues** -- recently finished work with timing and outcome
- **Session watch rail foundation** -- an initial shell for multi-session supervision

Next on the dashboard side:

- persistent multi-session watching
- fast focus switching between watched runs
- deeper reliability analytics and KPI aggregation

## Roadmap

### Shipped foundations
- [x] Rust workspace and crate structure
- [x] CLI surface (`doctor`, `init`, `serve`, `run`, `status`, `cancel`)
- [x] React dashboard with Control Center, KPIs, run board
- [x] SQLite storage (runs, steps, artifacts, events, interrupts)
- [x] Project config model and validation (`superkick.yaml`)
- [x] Worktree lifecycle (create, use, cleanup)
- [x] Step engine and agent supervisor
- [x] SSE realtime event stream
- [x] Interrupt service (create, resolve, persist)
- [x] Run state transitions (`waiting_human` / resume)
- [x] Interrupt panel in dashboard
- [x] Review data model and storage
- [x] Run isolation via worktrees

### Next up
- [x] `superkick run <issue>` for manual local-first launch
- [x] Real HTTP health checks and run cancellation
- [ ] Persistent multi-session rail and quick focus switching
- [ ] Full pause/resume flow end-to-end
- [ ] Parallel review agents and project-defined review gate
- [ ] Issue ingestion from Linear
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
