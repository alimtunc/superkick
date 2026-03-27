# Superkick V1 Spec

Status: target product direction for the clean-slate Rust + React rebuild.

## Product contract

Superkick turns a Linear issue into a reviewed pull request on the user's own machine by executing the project's engineering playbook inside an isolated git worktree. The system should only escalate to a human when it is truly blocked or when a project-defined decision point requires intervention.

Short version:

`Linear issue -> local run -> project playbook -> review swarm -> PR`

## V1 scope

V1 is intentionally narrow:

- Linear only
- single repo only
- local runner only
- one reliable run before multi-run
- project-specific workflow execution rather than a generic visual builder
- direct webhook ingress to the backend via tunnel or reverse proxy, not a required edge worker layer

## Explicit non-goals for V1

These are intentionally out of scope:

- support for issue trackers other than Linear
- VPS runners
- multi-repo orchestration
- multi-team control plane
- full workflow editor
- permanent human chat loop with the agents

## Product pillars

### 1. Linear issue to PR

The top-level promise must stay concrete and outcome-driven. The product is not sold as an "agent platform". It is sold as a system that starts from a Linear issue and ends with a pull request that is ready for final human review and merge.

### 2. Playbook runtime

The core engine executes a project-specific playbook rather than a universal workflow. This reflects the real user workflow: fetch issue context, plan, implement, run project commands, review, and open a PR.

### 3. Human interrupt layer

The human is not in a continuous chat loop. The default mode is autonomous execution. Human intervention exists only for:

- true blockage
- ambiguity that cannot be resolved safely
- explicit project checkpoints

### 4. Review swarm

Multi-agent review is a native step before the PR is finalized. It is part of the trust model and should not be treated as an optional afterthought.

## Demo magic

The first compelling demo should look like this:

1. A Linear issue moves to `In Progress` or is explicitly launched.
2. Superkick detects the issue and starts a local run.
3. A dedicated git worktree is created for that issue.
4. The project playbook starts executing step by step.
5. The dashboard shows live run state, logs, and outputs.
6. If the run is blocked, Superkick pauses and asks for targeted human input.
7. If the run succeeds, Superkick opens a PR with a generated description and review trace.

This demo should be real end to end. The worktree, local execution, and PR creation should not be faked.

Ingress note for V1:

- `Linear` should call the backend directly through a tunnel or reverse proxy.
- A Cloudflare Worker may exist later as an optional ingress layer, but it is not part of the core V1 architecture.

## Proposed workflow model

The workflow should be described as ordered steps. A minimal V1 path:

1. `load_issue`
2. `prepare_repo`
3. `create_worktree`
4. `plan`
5. `code`
6. `run_commands`
7. `review_swarm`
8. `create_pr`
9. `await_human`

Each step should have:

- an owner agent or execution mode
- retries and budget rules
- success or failure conditions
- emitted logs and outputs

## Proposed config model

This is the target config direction.

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

## Run lifecycle

Each run should move through explicit states:

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

This state model matters because the product value depends on observability, intervention, and safe recovery.

## Hard technical constraints

The V1 only works if these foundations are solid:

### Reliable worktree execution

The system must create, reuse when appropriate, and clean up git worktrees safely. If the worktree layer is flaky, the product is not credible.

### Local agent control plane

The system must be able to start, observe, interrupt, and resume local agent executions reliably. Calling a model API is not enough.

### Step and sub-agent orchestration

The engine must coordinate sequential steps and delegated review runs with coherent state transitions and logging.

### Concurrent run isolation

This is not required for the first proof, but it is part of the long-term product promise. After one reliable run works, the architecture must support multiple isolated runs.

## Build order

The recommended implementation order:

### Phase 1: single reliable run

Build one end-to-end run that works every time:

- issue ingestion
- repo prep
- worktree lifecycle
- agent execution
- logs
- PR creation

### Phase 2: human interrupt layer

Add:

- pause on blockage
- targeted questions
- resume semantics
- explicit run states in UI

### Phase 3: review swarm

Add:

- parallel review agents
- collection and display of review outputs
- project-defined review gate before PR finalization

### Phase 4: multi-run

Only after the above is stable:

- concurrent run scheduling
- isolation guarantees
- resource budgets
- queueing and fairness

## Acceptance for the first real milestone

The first milestone is successful when this is true:

- a Linear issue can trigger one local run
- the run creates a dedicated worktree
- the run executes the project playbook visibly
- the run can pause on true blockage
- the run opens a real PR on success
- the user can inspect logs and final outputs without digging through the terminal
