# superkick

Local daemon that turns Linear issues into pull requests using AI agents (Claude Code or Codex), orchestrated via Temporal.

## How it works

```
Linear (label "agent") --> Cloudflare Worker --> Tunnel --> Local daemon --> Temporal workflow
                                                                                |
                                                                          Clone/fetch repo
                                                                          Create worktree
                                                                                |
                                                                          Run AI agent
                                                                                |
                                                                          git push + gh pr create
                                                                                |
                                                                          Update Linear + Slack
```

1. Add the `agent` label (or `agent:codex` to override the LLM) to a Linear issue
2. Cloudflare Worker receives the webhook, validates signature, forwards via tunnel
3. Local Hono server receives the request, starts a Temporal workflow
4. Workflow resolves the repo (via `repos.yml`), clones it, creates a git worktree
5. Reads `.claude-agent.yml` from the repo, runs the configured agent with a single prompt
6. On success: commits, pushes, opens a PR via `gh`, updates Linear status to "In Review", notifies Slack
7. You review and merge

## Prerequisites

- [Node.js](https://nodejs.org/) >= 20
- [pnpm](https://pnpm.io/) >= 10
- [Temporal CLI](https://docs.temporal.io/cli) (`brew install temporal`)
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) (`npm i -g @anthropic-ai/claude-code`)
- [GitHub CLI](https://cli.github.com/) (`brew install gh`) -- authenticated
- [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/)

## Setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Fill in your secrets
```

### 3. Configure repo mapping

```bash
cp repos.yml.example repos.yml
```

```yaml
teams:
  ENG:
    repo: git@github.com:user/app.git
```

### 4. Start the daemon

```bash
pnpm dev
```

This starts concurrently:
- Temporal dev server (SQLite)
- Hono HTTP server (port 3100)
- Temporal worker

### 5. Set up Cloudflare Tunnel

```bash
cloudflared tunnel create agent-daemon
cloudflared tunnel route dns agent-daemon agent-daemon.yourdomain.com
cloudflared tunnel run agent-daemon
```

### 6. Deploy the Cloudflare Worker

```bash
cd cloudflare
wrangler secret put LINEAR_WEBHOOK_SECRET
wrangler secret put TUNNEL_URL
wrangler secret put TUNNEL_SECRET
wrangler deploy
```

### 7. Configure Linear webhook

In Linear Settings > Webhooks:
- URL: `https://agent-daemon-webhook.<your-workers>.workers.dev/webhook/linear`
- Events: Issue updates

## Dashboard

Access the live dashboard at `http://localhost:3100/dashboard` to monitor workflows in real-time.

**API endpoints:**

| Endpoint | Description |
|---|---|
| `GET /api/workflows` | List all workflows |
| `GET /api/workflows/:id` | Workflow details + logs |
| `GET /api/workflows/:id/logs` | SSE stream (real-time logs) |
| `POST /api/workflows/:id/cancel` | Cancel a running workflow |

## Logging

Each workflow produces a JSONL log file in `./logs/{workflowId}.jsonl`.

```json
{"ts": "2026-03-27T10:00:00Z", "workflowId": "issue-123", "step": "runAgent", "level": "info", "message": "Agent started"}
```

Levels: `info`, `warn`, `error`, `stdout`, `stderr`.

Logs are streamed in real-time to the dashboard via SSE.

## Per-repo configuration

Each repository needs a `.claude-agent.yml` at its root:

```yaml
repo: git@github.com:user/project.git
base_branch: main
test_command: npm run test
lint_command: npm run lint
max_retries: 2
default_agent: claude
command: claude --dangerously-skip-permissions
context: |
  Your project description, conventions, and stack info.
```

## Choosing the agent

- **Default**: set `default_agent` in `.claude-agent.yml` (`claude` or `codex`)
- **Override per issue**: use the label `agent:codex` or `agent:claude` in Linear
- **Fallback**: if just `agent` label is used, the repo default applies

## Project structure

```
src/
  server/
    index.ts              -- Hono HTTP server
    webhookRoute.ts       -- Webhook route + label parsing
    dashboardRoute.ts     -- Dashboard API endpoints
    dashboardHtml.ts      -- Dashboard UI
  temporal/
    worker.ts             -- Temporal worker setup
    workflows/
      issueWorkflow.ts    -- Main orchestration workflow
    activities/
      linear.ts           -- Linear API (fetch issue, update status)
      config.ts           -- repos.yml + .claude-agent.yml parsing
      repo.ts             -- git clone/fetch/worktree
      github.ts           -- git push + gh pr create
      slack.ts            -- Slack notification
      logStep.ts          -- JSONL structured logging
      agents/
        run.ts            -- Unified agent runner (Claude/Codex)
      index.ts            -- Activity exports
  shared/
    types.ts              -- TypeScript types + Zod schemas
    env.ts                -- Environment config
    logs.ts               -- Log utilities
cloudflare/
  worker.ts               -- CF Worker (webhook relay)
  wrangler.toml
repos.yml                 -- Team -> repo mapping
```

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `LINEAR_WEBHOOK_SECRET` | Yes | Linear webhook signing secret |
| `LINEAR_API_KEY` | Yes | Linear API key |
| `GITHUB_TOKEN` | Yes | GitHub personal access token |
| `SLACK_WEBHOOK_URL` | No | Slack incoming webhook URL |
| `TEMPORAL_ADDRESS` | No | Default: `localhost:7233` |
| `TEMPORAL_NAMESPACE` | No | Default: `default` |
| `TEMPORAL_TASK_QUEUE` | No | Default: `agent-daemon` |
| `AGENT_MAX_PARALLEL` | No | Max concurrent worktrees (default: `3`) |
| `AGENT_WORKTREES_DIR` | No | Default: `./worktrees` |
| `AGENT_REPOS_DIR` | No | Default: `./repos` |
| `CLOUDFLARE_TUNNEL_SECRET` | No | Secret for tunnel auth |

## License

MIT
