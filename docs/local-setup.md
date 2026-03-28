# Local Setup

Get superkick running locally against a real GitHub repo.

## Prerequisites

| Tool | Purpose | Install |
|------|---------|---------|
| Rust (1.82+) | Build | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| git | Repo operations | system package manager |
| gh | PR creation | `brew install gh` / [cli.github.com](https://cli.github.com) |
| claude | AI agent (plan/code) | [claude.ai/download](https://claude.ai/download) |
| curl + jq | Demo scripts | system package manager |

Authenticate `gh` before running:

```bash
gh auth login
```

## Build

```bash
cargo build --release
```

The binary lands at `target/release/superkick-api`.

## Configure

Copy and edit the example config:

```bash
cp examples/superkick.yaml superkick.yaml
```

Edit `superkick.yaml` to point at your target repo and adjust the workflow.
Key fields:

```yaml
runner:
  repo_root: .          # where worktrees/cache live (relative to cwd)
  base_branch: main     # branch to fork worktrees from

agents:
  implementation:
    provider: claude     # or codex
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SUPERKICK_CONFIG` | `superkick.yaml` | Path to config file |
| `DATABASE_URL` | `sqlite:superkick.db` | SQLite database path |
| `PORT` | `3000` | HTTP listen port |
| `SUPERKICK_CACHE_DIR` | `.superkick-cache` | Bare clone cache directory |
| `RUST_LOG` | (none) | Log level, e.g. `info` or `superkick_runtime=debug` |

## Start the server

```bash
SUPERKICK_CONFIG=superkick.yaml \
DATABASE_URL=sqlite:superkick.db \
PORT=3100 \
RUST_LOG=info \
cargo run -p superkick-api
```

The server auto-runs SQLite migrations on first start.

## Trigger a run

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

## Observe

Poll the run:

```bash
# Full state with steps and interrupts
curl http://127.0.0.1:3100/runs/<run-id> | jq

# Live event stream (SSE)
curl -N http://127.0.0.1:3100/runs/<run-id>/events
```

## Handle interrupts

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
