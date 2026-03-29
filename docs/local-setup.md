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
