# Local Setup

Superkick is installed **once per machine**, then **configured per repository**.

---

## Step 1 — Machine setup (one-time)

### Prerequisites

| Tool | Purpose | Install |
|------|---------|---------|
| Rust (1.82+) | Build | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| git | Repo operations | system package manager |
| gh | PR creation | `brew install gh` / [cli.github.com](https://cli.github.com) |
| claude **or** codex | AI agent (plan/code/review) | [claude.ai/download](https://claude.ai/download) / `npm i -g @openai/codex` |

Authenticate `gh` before running:

```bash
gh auth login
```

### Build

```bash
cargo build --release
```

This produces two binaries:

| Binary | Path | Purpose |
|--------|------|---------|
| `superkick` | `target/release/superkick` | CLI — doctor, init, serve, status, cancel |
| `superkick-api` | `target/release/superkick-api` | HTTP server + runtime engine |

### Verify your machine

```bash
superkick doctor
```

This checks that `git`, `gh`, and at least one agent CLI (`claude` or `codex`) are available on your `PATH`. It tells you exactly what is missing and how to install it.

---

## Step 2 — Repository configuration (per project)

### Initialize

From the root of your repository:

```bash
superkick init
```

This creates a starter `superkick.yaml`. It will **not** overwrite an existing config.

### Configure

Edit `superkick.yaml` to match your project. Key fields:

```yaml
runner:
  repo_root: .          # where worktrees/cache live (relative to cwd)
  base_branch: main     # branch to fork worktrees from
  setup_commands:
    - pnpm install --frozen-lockfile

agents:
  implementation:
    provider: claude     # or codex

workflow:
  steps:
    - type: commands
      run:
        - pnpm lint
        - pnpm test
```

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SUPERKICK_CONFIG` | `superkick.yaml` | Path to config file |
| `DATABASE_URL` | `sqlite:superkick.db` | SQLite database path |
| `PORT` | `3000` | HTTP listen port |
| `SUPERKICK_CACHE_DIR` | `.superkick-cache` | Bare clone cache directory |
| `RUST_LOG` | (none) | Log level, e.g. `info` or `superkick_runtime=debug` |

---

## Step 3 — Run

### Start the server

```bash
superkick serve
```

Or with options:

```bash
RUST_LOG=info superkick serve -c superkick.yaml -p 3100
```

The server auto-runs SQLite migrations on first start.

> **Legacy:** you can still use `cargo run -p superkick-api` with env vars, but the CLI is the recommended entry point.

### Check the server

```bash
superkick status
```

### Trigger a run

```bash
superkick run SK-001
```

This:
1. Reads `superkick.yaml` for `base_branch`
2. Derives `repo_slug` from your git remote
3. Creates the run via the local server
4. Streams live events to your terminal

Options:
- `--port <port>` — server port (default 3100)
- `--no-follow` — create the run and exit immediately

Press `Ctrl+C` to detach from the event stream. The run continues server-side.

You can also create a run directly via the API:

```bash
curl -X POST http://127.0.0.1:3100/runs \
  -H "Content-Type: application/json" \
  -d '{
    "repo_slug": "owner/repo",
    "issue_id": "issue-123",
    "issue_identifier": "SK-001",
    "base_branch": "main"
  }'
```

This returns the created run immediately. The engine executes in the background:
`Prepare (clone + worktree) -> Plan -> Code -> Commands -> Review -> PR`.

### Observe

Poll the run:

```bash
# Full state with steps and interrupts
curl http://127.0.0.1:3100/runs/<run-id> | jq

# Live event stream (SSE)
curl -N http://127.0.0.1:3100/runs/<run-id>/events
```

### Handle interrupts

When a step fails and the policy is `ask_human`, the run pauses in `waiting_human`.

```bash
# List interrupts
curl http://127.0.0.1:3100/runs/<run-id>/interrupts | jq

# Retry the failed step
curl -X POST http://127.0.0.1:3100/runs/<run-id>/interrupts/<interrupt-id>/answer \
  -H "Content-Type: application/json" \
  -d '"RetryStep"'

# Continue with a note (skip the failure)
curl -X POST http://127.0.0.1:3100/runs/<run-id>/interrupts/<interrupt-id>/answer \
  -H "Content-Type: application/json" \
  -d '{"ContinueWithNote":{"note":"Manually verified, proceeding."}}'

# Abort
curl -X POST http://127.0.0.1:3100/runs/<run-id>/interrupts/<interrupt-id>/answer \
  -H "Content-Type: application/json" \
  -d '"AbortRun"'
```

---

## Demo script

An interactive demo that walks through the full path:

```bash
REPO_SLUG=owner/repo ./examples/demo.sh
```

## Smoke tests

Validate the API surface without needing real agent CLIs:

```bash
# Start the server first, then in another terminal:
./examples/smoke-test.sh
```

## Cleanup

Worktrees are automatically cleaned up when a run completes or fails.
If you need to manually clean stale worktrees:

```bash
# List worktrees
ls .superkick/worktrees/

# Git-level cleanup
git -C .superkick-cache/<repo>.git worktree prune
```

The SQLite database can be reset by deleting the `.db` file:

```bash
rm superkick.db
```
