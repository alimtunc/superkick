# Superkick - Architecture Schema

## Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            SUPERKICK                                        │
│                  AI-Powered Issue → PR Automation                            │
│                        (Local-First)                                        │
└─────────────────────────────────────────────────────────────────────────────┘

  ┌──────────┐     Webhook (issue → in_progress)      ┌──────────────────┐
  │  LINEAR   │ ──────────────────────────────────────▶ │  superkick-api   │
  │  (Issues) │ ◀── API (fetch issue details) ──────── │  (Axum :3100)    │
  └──────────┘                                         └────────┬─────────┘
                                                                │
                                                     ┌──────────┴──────────┐
                                                     │                     │
                                                     ▼                     ▼
                                              ┌─────────────┐    ┌────────────────┐
                                              │  REST API    │    │  SSE Stream    │
                                              │  /runs       │    │  /runs/:id/    │
                                              │  /interrupts │    │   events       │
                                              │  /webhooks   │    │  (live logs)   │
                                              └──────┬──────┘    └───────┬────────┘
                                                     │                   │
                                                     ▼                   ▼
                                              ┌──────────────────────────────────┐
                                              │         React Dashboard          │
                                              │  (Vite + React 19 + TypeScript)  │
                                              │                                  │
                                              │  • Run list / Run detail         │
                                              │  • Step timeline (live)          │
                                              │  • Interrupt action panel         │
                                              │  • Cancel / Retry controls        │
                                              └──────────────────────────────────┘
```

## Flux de données principal : Issue → PR

```
 ┌──────────┐    webhook     ┌──────────────────┐    create run    ┌──────────────┐
 │  LINEAR   │ ─────────────▶│  superkick-       │ ───────────────▶│  superkick-   │
 │  Issue    │               │  integrations     │                 │  core         │
 │  (status: │               │                   │                 │  (Run FSM)    │
 │  in_prog) │               │  • webhook verify │                 │               │
 └──────────┘               │  • issue fetch    │                 │  Queued       │
                             └──────────────────┘                 └───────┬───────┘
                                                                          │
                     ┌────────────────────────────────────────────────────┘
                     ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                        superkick-runtime (Step Engine)                       │
 │                                                                             │
 │  ┌───────────┐   ┌──────────┐   ┌──────────┐   ┌───────────┐   ┌────────┐ │
 │  │ 1.PREPARE │──▶│ 2. PLAN  │──▶│ 3. CODE  │──▶│4.COMMANDS │──▶│5.REVIEW│ │
 │  │           │   │          │   │          │   │           │   │ SWARM  │ │
 │  │ git clone │   │ Claude   │   │ Claude   │   │ pnpm lint │   │ 3x     │ │
 │  │ worktree  │   │ agent    │   │ agent    │   │ pnpm test │   │ agents │ │
 │  │ setup     │   │ → plan   │   │ → code   │   │ cargo test│   │parallel│ │
 │  └───────────┘   └──────────┘   └──────────┘   └───────────┘   └───┬────┘ │
 │                                                                     │      │
 │                        ┌──────────────────────┐    ┌────────────────┘      │
 │                        │  WAITING HUMAN       │    │                       │
 │                        │  (interrupt pause)    │◀───┤ (si conflit review)  │
 │                        │  question → answer    │    │                       │
 │                        └──────────────────────┘    ▼                       │
 │                                              ┌──────────┐                  │
 │                                              │ 6. PR    │                  │
 │                                              │          │                  │
 │                                              │ git push │                  │
 │                                              │ gh pr    │                  │
 │                                              │ create   │                  │
 │                                              └────┬─────┘                  │
 └───────────────────────────────────────────────────┼────────────────────────┘
                                                     │
                                                     ▼
                                              ┌──────────────┐
                                              │   GITHUB      │
                                              │   Pull Request │
                                              │   (ready for   │
                                              │    review)     │
                                              └──────────────┘
```

## State Machine (Run)

```
                          ┌──────────┐
                          │  Queued  │
                          └────┬─────┘
                               │
                          ┌────▼──────┐
                   ┌──────│ Preparing │──────┐
                   │      └────┬──────┘      │
                   │           │             │
                   │      ┌────▼──────┐      │
                   │  ┌───│ Planning  │───┐  │
                   │  │   └────┬──────┘   │  │
                   │  │        │          │  │
                   │  │   ┌────▼──────┐   │  │
                   │  │ ┌─│  Coding   │─┐ │  │
                   │  │ │ └────┬──────┘ │ │  │
                   │  │ │      │        │ │  │
                   │  │ │ ┌────▼──────────┐  │
                   │  │ │ │Running       ││  │    ┌───────────────┐
                   │  │ │ │Commands  ◀─retry  │    │ WaitingHuman │
                   │  │ │ └────┬──────────┘  │◀───│ (interrupt)   │
                   │  │ │      │        │ │  │    └───────────────┘
                   │  │ │ ┌────▼──────┐ │ │  │          ▲
                   │  │ │ │ Reviewing │─┘ │  │          │
                   │  │ │ └────┬──────┘   │  │    (on_blocked or
                   │  │ │      │          │  │     review_conflict)
                   │  │ │ ┌────▼──────┐   │  │
                   │  │ └─│ OpeningPr │   │  │
                   │  │   └────┬──────┘   │  │
                   │  │        │          │  │
                   │  │   ┌────▼──────┐   │  │
                   │  │   │ Completed │   │  │
                   │  │   └───────────┘   │  │
                   │  │                   │  │
                   ▼  ▼                   ▼  ▼
              ┌───────────┐         ┌───────────┐
              │ Cancelled │         │  Failed   │
              └───────────┘         └───────────┘
```

## Architecture des Crates

```
┌─────────────────────────────────────────────────────────────────┐
│                        superkick-api                             │
│  HTTP server, webhooks, REST, SSE, UI serving                   │
│  (Axum 0.8)                                                     │
└──────┬───────────┬──────────┬──────────┬───────────┬────────────┘
       │           │          │          │           │
       ▼           ▼          ▼          ▼           ▼
┌────────────┐ ┌────────┐ ┌────────┐ ┌──────────┐ ┌──────────────┐
│ superkick- │ │ super- │ │ super- │ │ super-   │ │ superkick-   │
│ config     │ │ kick-  │ │ kick-  │ │ kick-    │ │ integrations │
│            │ │ core   │ │storage │ │ runtime  │ │              │
│ YAML parse │ │ Domain │ │ SQLite │ │ Worktree │ │ Linear API   │
│ Validation │ │ Model  │ │ Repos  │ │ Agents   │ │ GitHub CLI   │
│            │ │ FSM    │ │ Events │ │ Subproc  │ │ Webhooks     │
└──────┬─────┘ │ Types  │ └───┬────┘ └────┬─────┘ └──────────────┘
       │       └───┬────┘     │           │
       │           │          │           │
       └───────────┴──────────┴───────────┘
                   │
              superkick-core est la dépendance
              commune de tous les crates
```

## Tech Stack

```
┌─────────────────────────────────────────────────┐
│  FRONTEND                                        │
│  ├─ React 19 + TypeScript                        │
│  ├─ Vite (bundler/dev server)                    │
│  └─ SSE pour les events en temps réel            │
├─────────────────────────────────────────────────┤
│  BACKEND (Rust 2024, edition resolver v2)        │
│  ├─ Axum 0.8 ─── HTTP framework                 │
│  ├─ Tokio 1 ──── async runtime                   │
│  ├─ SQLx 0.8 ─── SQLite (WAL mode)              │
│  ├─ Serde ────── JSON/YAML serialization         │
│  ├─ Tracing ──── structured logging              │
│  ├─ UUID v4 ──── entity IDs                      │
│  └─ Chrono ───── timestamps                      │
├─────────────────────────────────────────────────┤
│  INTEGRATIONS EXTERNES                           │
│  ├─ Linear ───── webhooks + API (issue source)   │
│  ├─ GitHub ───── gh CLI (PR creation)            │
│  ├─ Git ──────── CLI (worktrees, branches)       │
│  ├─ Claude ───── subprocess (AI agent)           │
│  └─ Codex ────── subprocess (AI agent alt)       │
├─────────────────────────────────────────────────┤
│  STORAGE                                         │
│  └─ SQLite ───── single file, WAL mode           │
│     ├─ runs, run_steps, run_events               │
│     ├─ agent_sessions, interrupts                │
│     └─ artifacts                                 │
├─────────────────────────────────────────────────┤
│  CONFIGURATION                                   │
│  ├─ superkick.yaml ── playbook par projet        │
│  ├─ .env ──────────── secrets & env vars         │
│  ├─ rustfmt.toml ──── formatting                 │
│  └─ clippy.toml ───── linting                    │
└─────────────────────────────────────────────────┘
```

## Playbook (superkick.yaml)

```yaml
# Chaque projet définit son propre playbook
version: 1

issue_source:
  provider: linear          # Source des issues
  trigger: in_progress      # Déclenche quand status → in_progress

runner:
  mode: local               # Exécution locale (pas cloud)
  repo_root: .
  base_branch: main
  worktree_prefix: superkick  # Isolation via git worktrees

agents:                      # Agents AI disponibles
  implementation:
    provider: claude         # Claude pour coder
  review:
    provider: codex          # Codex pour review

workflow:                    # Pipeline d'exécution
  steps:
    - plan (agent)           # 1. Planifier le travail
    - code (agent)           # 2. Implémenter
    - commands (shell)       # 3. Lint + Tests
    - review_swarm (3x)      # 4. Review parallèle
    - pr (git+gh)            # 5. Créer la PR

interrupts:                  # Quand bloquer
  on_blocked: ask_human
  on_review_conflict: ask_human

budget:                      # Limites
  max_retries: 2
  max_parallel: 3
  tokens: medium
```
