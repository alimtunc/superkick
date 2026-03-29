# SK-005 — Reliable End-to-End Demo Path

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the demo scripts, example config, and docs so a developer can follow one documented path and run superkick on its own repo.

**Architecture:** No code changes. Five files rewritten/updated: `examples/superkick.yaml`, `examples/demo.sh`, `examples/smoke-test.sh`, `docs/local-setup.md`, `README.md`.

**Tech Stack:** Bash, YAML, Markdown

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `examples/superkick.yaml` | Rewrite | Demo-quality config targeting superkick's own Rust repo |
| `examples/demo.sh` | Rewrite | Interactive guided walkthrough (6 stages) |
| `examples/smoke-test.sh` | Edit header | Add purpose header, clarify distinction from demo |
| `docs/local-setup.md` | Rewrite | Single-source setup guide matching the CLI story |
| `README.md` | Edit sections | Update config example and getting started to match |

---

### Task 1: Rewrite example config

**Files:**
- Modify: `examples/superkick.yaml`

- [ ] **Step 1: Replace the full file contents**

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

Changes from current:
- Remove `repo_root` and `worktree_prefix` (have defaults, not demo-relevant)
- `setup_commands` → `cargo build` (this is a Rust repo, not pnpm)
- Agents renamed: `implementation` → `planner`/`coder`, `review` → `reviewer` (clear roles)
- Commands → `cargo test` + `cargo clippy` (real checks for this repo)
- Remove `generate_description` from pr step
- Remove `on_review_conflict` from interrupts (default is fine)
- Remove `budget` section entirely (advanced, not demo)

- [ ] **Step 2: Validate the config parses**

Run: `cd /Users/alimtunc/Developement/Side/superkick-sk-005 && cargo run -p superkick-config --example validate 2>&1 || SUPERKICK_CONFIG=examples/superkick.yaml cargo test -p superkick-config 2>&1 | tail -5`

If there's no validation binary, just verify the YAML is valid:
Run: `python3 -c "import yaml; yaml.safe_load(open('examples/superkick.yaml'))" && echo "YAML OK"`

- [ ] **Step 3: Commit**

```bash
git add examples/superkick.yaml
git commit -m "chore(examples): rewrite config for demo-quality Rust workflow"
```

---

### Task 2: Rewrite demo script

**Files:**
- Modify: `examples/demo.sh`

- [ ] **Step 1: Replace the full file contents**

```bash
#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────────────────
# Superkick guided demo
#
# An interactive walkthrough that tells you what to run at each stage.
# You run the commands yourself — this script guides and verifies.
#
# The demo uses Superkick's own repo as the target project.
#
# Prerequisites:
#   - git, gh, cargo on PATH
#   - claude (or codex) CLI installed
#   - A GitHub fork or clone of this repo with push access
#
# Usage:
#   ./examples/demo.sh
# ───────────────────────────────────────────────────────────────────────

API="http://127.0.0.1:3100"

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[0;33m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

stage()   { echo -e "\n${GREEN}${BOLD}━━━ Stage $1: $2 ━━━${NC}\n"; }
cmd()     { echo -e "  ${CYAN}▸ $*${NC}"; }
note()    { echo -e "  ${DIM}$*${NC}"; }
warning() { echo -e "  ${YELLOW}⚠ $*${NC}"; }

wait_enter() {
    echo ""
    read -rp "  Press Enter when ready... "
    echo ""
}

# ── Stage 1: Prerequisites ───────────────────────────────────────────

stage 1 "Check prerequisites"

echo "  Make sure these tools are on your PATH:"
echo ""
cmd "git    — repo operations"
cmd "gh     — PR creation (run 'gh auth login' first)"
cmd "cargo  — Rust build"
cmd "claude — AI agent (or codex)"
echo ""
echo "  For a full machine check, run:"
cmd "superkick doctor"

MISSING=0
for tool in git gh cargo; do
    if ! command -v "$tool" >/dev/null 2>&1; then
        warning "$tool not found on PATH"
        MISSING=1
    fi
done

# Check for at least one agent
if ! command -v claude >/dev/null 2>&1 && ! command -v codex >/dev/null 2>&1; then
    warning "Neither claude nor codex found on PATH"
    MISSING=1
fi

if [ "$MISSING" -eq 1 ]; then
    echo ""
    warning "Some prerequisites are missing. Install them before continuing."
    exit 1
fi

echo -e "  ${GREEN}All prerequisites found.${NC}"

wait_enter

# ── Stage 2: Build ───────────────────────────────────────────────────

stage 2 "Build superkick"

echo "  Build the CLI and server from source:"
echo ""
cmd "cargo build --release"
echo ""
note "This produces target/release/superkick (CLI) and target/release/superkick-api (server)."
note "Add target/release to your PATH or use cargo run."

wait_enter

# ── Stage 3: Initialize config ──────────────────────────────────────

stage 3 "Initialize project config"

echo "  From the repo root, create a superkick.yaml:"
echo ""
cmd "superkick init"
echo ""
note "This creates a starter config. Edit it to match your project."
note "For this demo, use examples/superkick.yaml which targets this Rust repo:"
echo ""
cmd "cp examples/superkick.yaml superkick.yaml"
echo ""
note "Key settings:"
note "  - agents: planner, coder, reviewer (all using claude)"
note "  - commands: cargo test, cargo clippy"
note "  - interrupts: ask_human on blocked steps"

wait_enter

# ── Stage 4: Start the server ───────────────────────────────────────

stage 4 "Start the server"

echo "  Open a second terminal and run:"
echo ""
cmd "superkick serve"
echo ""
note "The server starts on port 3100 by default."
note "It creates a local SQLite database for run state."
echo ""
echo "  Waiting for the server to be reachable..."

ATTEMPTS=0
MAX_ATTEMPTS=30
while [ $ATTEMPTS -lt $MAX_ATTEMPTS ]; do
    if curl -sf "$API/health" >/dev/null 2>&1; then
        echo -e "  ${GREEN}Server is healthy at $API${NC}"
        break
    fi
    ATTEMPTS=$((ATTEMPTS + 1))
    sleep 2
done

if [ $ATTEMPTS -ge $MAX_ATTEMPTS ]; then
    warning "Server not reachable at $API after 60 seconds."
    warning "Make sure 'superkick serve' is running in another terminal."
    exit 1
fi

wait_enter

# ── Stage 5: Launch a run ───────────────────────────────────────────

stage 5 "Launch a run"

echo "  Trigger a run for an issue. The --follow flag streams live events:"
echo ""
cmd "superkick run SK-ISSUE-005 --follow"
echo ""
note "This will:"
note "  1. Clone the repo into a worktree"
note "  2. Run the planner agent"
note "  3. Run the coder agent"
note "  4. Execute cargo test + cargo clippy"
note "  5. Run two review agents in parallel"
note "  6. Open a PR on GitHub"
echo ""
note "Press Ctrl+C to detach — the run continues server-side."
echo ""
echo "  To also watch in the dashboard, open another terminal:"
echo ""
cmd "cd ui && pnpm dev"
echo ""
note "Then open http://localhost:5173 in your browser."

wait_enter

# ── Stage 6: Observe and control ────────────────────────────────────

stage 6 "Observe and control"

echo "  Check server health and active runs:"
echo ""
cmd "superkick status"
echo ""
echo "  Cancel a run by its ID:"
echo ""
cmd "superkick status                              # find the run ID"
cmd "superkick cancel <run-id>"
echo ""
echo "  If a step fails and the run pauses (waiting_human),"
echo "  respond to the interrupt in the dashboard or via the API:"
echo ""
cmd "curl http://127.0.0.1:3100/runs/<run-id>/interrupts | jq"
echo ""
note "The dashboard shows interrupts inline on the run detail page."

echo ""
echo -e "${GREEN}${BOLD}━━━ Demo complete ━━━${NC}"
echo ""
echo "  You've seen the full superkick path:"
echo "    issue → config → serve → run → observe → control"
echo ""
echo "  Next steps:"
echo "    - Edit superkick.yaml for your own project"
echo "    - Try different agents (codex instead of claude)"
echo "    - Run the smoke tests: ./examples/smoke-test.sh"
echo ""
```

- [ ] **Step 2: Make executable and shellcheck**

Run: `chmod +x /Users/alimtunc/Developement/Side/superkick-sk-005/examples/demo.sh`
Run: `shellcheck /Users/alimtunc/Developement/Side/superkick-sk-005/examples/demo.sh || true`

Fix any shellcheck warnings (SC2086, SC2034, etc.) if present.

- [ ] **Step 3: Commit**

```bash
git add examples/demo.sh
git commit -m "chore(examples): rewrite demo as guided walkthrough"
```

---

### Task 3: Update smoke test header

**Files:**
- Modify: `examples/smoke-test.sh`

- [ ] **Step 1: Replace the file header comment (lines 1-15)**

Replace the existing header block with:

```bash
#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────────────────
# Superkick smoke test — API surface validation
#
# This is NOT the product demo. This script validates the HTTP API
# surface using raw curl calls. It does not require agent CLIs
# (claude, codex) or a real repository.
#
# For the guided product demo, use: ./examples/demo.sh
# For full setup instructions, see: docs/local-setup.md
#
# Usage:
#   # Terminal 1: start the server
#   superkick serve
#
#   # Terminal 2: run the smoke tests
#   ./examples/smoke-test.sh
# ───────────────────────────────────────────────────────────────────────
```

- [ ] **Step 2: Verify PORT default is 3100**

The script already uses `API="${API_URL:-http://127.0.0.1:3100}"` — confirm this is correct (it is).

- [ ] **Step 3: Commit**

```bash
git add examples/smoke-test.sh
git commit -m "chore(examples): clarify smoke test purpose and point to demo"
```

---

### Task 4: Rewrite local-setup.md

**Files:**
- Modify: `docs/local-setup.md`

- [ ] **Step 1: Replace the full file contents**

```markdown
# Local Setup

Get superkick running on your machine and launch your first run.

---

## Prerequisites

| Tool | Purpose | Install |
|------|---------|---------|
| Rust 1.82+ | Build | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| git | Repo operations | system package manager |
| gh | PR creation | `brew install gh` / [cli.github.com](https://cli.github.com) |
| claude **or** codex | AI agent | [claude.ai/download](https://claude.ai/download) / `npm i -g @openai/codex` |

Authenticate GitHub before running:

```bash
gh auth login
```

---

## Build

```bash
cargo build --release
```

This produces `target/release/superkick` (CLI) and `target/release/superkick-api` (server).

Verify your machine has everything:

```bash
superkick doctor
```

---

## Initialize a project

From the root of your repository:

```bash
superkick init
```

This creates a starter `superkick.yaml`. Edit it to match your project.

For a working example that targets this repo:

```bash
cp examples/superkick.yaml superkick.yaml
```

See [examples/superkick.yaml](../examples/superkick.yaml) for the reference config.

---

## Start the server

```bash
superkick serve
```

The server listens on port 3100 by default and creates a local SQLite database.

Options:

```bash
superkick serve -p 4000         # custom port
RUST_LOG=info superkick serve   # with logging
```

Check the server is running:

```bash
superkick status
```

---

## Launch a run

```bash
superkick run SK-001 --follow
```

This:
1. Reads `superkick.yaml` for config
2. Derives `repo_slug` from your git remote
3. Creates the run via the local server
4. Streams live events to your terminal

Options:

| Flag | Effect |
|------|--------|
| `--follow` / `-f` | Stay attached, stream events (default) |
| `--no-follow` | Create the run and exit immediately |
| `--port <port>` / `-p` | Server port (default 3100) |

Press `Ctrl+C` to detach from the event stream. The run continues server-side.

---

## Observe

**CLI:**

```bash
superkick status        # server health + active runs
```

**Dashboard:**

```bash
cd ui && pnpm dev       # starts on http://localhost:5173
```

The dashboard shows KPIs, active runs, and an attention zone for blocked work.

---

## Control

**Cancel a run:**

```bash
superkick status                    # find the run ID
superkick cancel <run-id>
```

**Handle interrupts:**

When a step fails and the interrupt policy is `ask_human`, the run pauses in `waiting_human`. Respond via the dashboard or the API:

```bash
# List interrupts
curl http://127.0.0.1:3100/runs/<run-id>/interrupts | jq

# Retry the failed step
curl -X POST http://127.0.0.1:3100/runs/<run-id>/interrupts/<interrupt-id>/answer \
  -H "Content-Type: application/json" \
  -d '"RetryStep"'
```

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SUPERKICK_CONFIG` | `superkick.yaml` | Path to config file |
| `DATABASE_URL` | `sqlite:superkick.db` | SQLite database path |
| `PORT` | `3100` | HTTP listen port |
| `SUPERKICK_CACHE_DIR` | `.superkick-cache` | Bare clone cache directory |
| `RUST_LOG` | (none) | Log level, e.g. `info` or `superkick_runtime=debug` |

---

## Demo and smoke tests

**Guided demo** — interactive walkthrough of the full product path:

```bash
./examples/demo.sh
```

**Smoke tests** — fast API surface validation (no agents required):

```bash
./examples/smoke-test.sh
```

These are separate paths by design. The demo shows the product; the smoke test validates the API.

---

## Cleanup

Worktrees are cleaned up automatically when a run completes or fails.

```bash
# Reset the database
rm superkick.db

# Manual worktree cleanup (if needed)
git -C .superkick-cache/<repo>.git worktree prune
```
```

- [ ] **Step 2: Verify links are valid**

Check that `../examples/superkick.yaml` resolves from `docs/`:
Run: `ls /Users/alimtunc/Developement/Side/superkick-sk-005/examples/superkick.yaml`

- [ ] **Step 3: Commit**

```bash
git add docs/local-setup.md
git commit -m "docs: rewrite local-setup to match CLI-first demo path"
```

---

### Task 5: Update README.md

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the config example in "Project config" section**

Replace the YAML block in the "Project config" section (lines 86-118) with the new example config content matching `examples/superkick.yaml`:

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

- [ ] **Step 2: Update the PORT default in docs/local-setup.md table reference**

In README "Getting started" section, the sequence is already correct (`cargo install`, `doctor`, `init`, `serve`, `status`). Verify no changes needed.

In the "Getting started" section (lines 122-138), add the run command after `superkick status`:

```bash
# Launch a run
superkick run SK-001 --follow
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(readme): align config example and getting started with demo path"
```

---

### Task 6: Verify everything

- [ ] **Step 1: Run cargo test**

Run: `cd /Users/alimtunc/Developement/Side/superkick-sk-005 && cargo test 2>&1 | tail -20`
Expected: all tests pass (no Rust changes were made)

- [ ] **Step 2: Run UI build**

Run: `cd /Users/alimtunc/Developement/Side/superkick-sk-005 && pnpm --dir ui build 2>&1 | tail -10`
Expected: build succeeds (no UI changes were made)

- [ ] **Step 3: Shellcheck scripts**

Run: `shellcheck /Users/alimtunc/Developement/Side/superkick-sk-005/examples/demo.sh /Users/alimtunc/Developement/Side/superkick-sk-005/examples/smoke-test.sh`
Expected: no errors (warnings acceptable)

- [ ] **Step 4: Validate example config YAML**

Run: `python3 -c "import yaml; yaml.safe_load(open('/Users/alimtunc/Developement/Side/superkick-sk-005/examples/superkick.yaml')); print('OK')"`
Expected: OK

- [ ] **Step 5: Read-through consistency check**

Verify these all tell the same story:
- `examples/demo.sh` stage sequence matches `docs/local-setup.md` section order
- `examples/superkick.yaml` agent names match what `demo.sh` and `local-setup.md` reference
- `README.md` config block matches `examples/superkick.yaml`
- Port 3100 is consistent everywhere
- No references to `cargo run -p superkick-api` as the primary path (CLI is primary)
