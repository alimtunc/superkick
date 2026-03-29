# SK-005 — Reliable End-to-End Demo Path

## Goal

One boringly repeatable local demo path. A developer follows documented steps, launches a run from the CLI, observes it in the dashboard, and can interrupt it when blocked.

## Context

The repo already has: example config, demo script, smoke-test script, and the full runtime path (plan → code → commands → review → PR). What's missing is alignment — the scripts, docs, and config don't tell the same story as the actual CLI product.

## Decisions

| Decision | Rationale |
|----------|-----------|
| Demo targets superkick's own repo | Self-referential — no external repo dependency |
| `demo.sh` is a guided walkthrough, not an executor | Developer learns the CLI by running commands themselves |
| `smoke-test.sh` stays as raw curl | Different purpose: fast API surface validation, no agents needed |
| No Rust or UI code changes | This is a docs/scripts alignment issue only |
| Config stripped to essentials | Remove plumbing fields that distract from the demo story |

## Files Modified

### 1. `examples/demo.sh` — Full rewrite

Interactive step-by-step guide with 6 stages:

1. **Prerequisites** — checks `git`, `gh`, `cargo` on PATH. Prints what's missing. Suggests `superkick doctor` for full check.
2. **Build** — prints `cargo build --release` for user to run. Waits for Enter.
3. **Config** — prints `superkick init` for user to run. Explains it creates `superkick.yaml`.
4. **Serve** — tells user to open a second terminal, run `superkick serve`. Script auto-polls `/health` until server responds.
5. **Run** — prints `superkick run SK-ISSUE-005 --follow`. Explains the step sequence. Mentions dashboard at `localhost:5173`.
6. **Observe** — prints `superkick status` and `superkick cancel <id>`. Explains interrupt handling via dashboard.

Principles:
- Colors for readability (green stages, cyan commands, yellow warnings)
- Script never launches `superkick serve` or `superkick run` itself
- No `set -e` — this is a guide, not an automation
- Each step explains what and why before showing the command

### 2. `examples/superkick.yaml` — Rewrite for demo quality

```yaml
version: 1

issue_source:
  provider: linear
  trigger: in_progress

runner:
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

interrupts:
  on_blocked: ask_human
```

Changes from current:
- Remove `mode`, `repo_root`, `worktree_prefix` (internal plumbing, not demo-relevant)
- Setup command → `cargo build` (matches the superkick repo, not pnpm)
- Commands → `cargo test` + `cargo clippy` (real checks for this repo)
- Agent names → `planner`/`coder`/`reviewer` (clear roles)
- Remove `budget` section (advanced config, not demo)
- Remove `generate_description` from pr step (keep minimal)

### 3. `examples/smoke-test.sh` — Light cleanup

Stays as raw curl. Changes:
- Add header comment explaining purpose: "API surface validation — not the product demo"
- Verify port defaults align with 3100
- Verify payload fields match current API expectations
- Document the distinction from `demo.sh` at the top

### 4. `docs/local-setup.md` — Realign with CLI story

Rewrite to match the same narrative as `demo.sh`:

Sections:
1. **Prerequisites** — git, gh, claude CLI (or codex), cargo
2. **Build** — `cargo build --release`
3. **Initialize** — `superkick init` (creates `superkick.yaml`)
4. **Start the server** — `superkick serve`
5. **Launch a run** — `superkick run <ISSUE> --follow`
6. **Observe** — dashboard (`localhost:5173`) + `superkick status`
7. **Control** — `superkick cancel`, interrupt handling
8. **Smoke test (API-only)** — points to `examples/smoke-test.sh`, explains it's a different path
9. **Troubleshooting** — common issues (port conflicts, missing agents, stale DB)

### 5. `README.md` — Minimal update

- Update "Quick Start" section to point to `docs/local-setup.md`
- Update "Demo" mention to point to `examples/demo.sh`
- No full rewrite

## Verification

- `cargo test` — no Rust changes, should pass unchanged
- `pnpm --dir ui build` — no UI changes, should pass unchanged
- `shellcheck examples/demo.sh examples/smoke-test.sh` — scripts are clean
- Manual read-through: docs and scripts tell the same story
- `demo.sh` runs to completion in guide mode (no real agents needed to validate the script itself)

## Non-goals

- No binary distribution
- No new CLI commands
- No Rust code changes
- No UI changes
- No Linear webhook integration
