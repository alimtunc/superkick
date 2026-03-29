# ENG-001 — Agent Rules & Skills Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make dev-time rules visible to agents from session start, eliminate rule duplication, and clean up external skills.

**Architecture:** Single source of truth for conventions in `docs/conventions/`. CLAUDE.md and AGENTS.md point to them. Review skills reference them instead of inlining rules.

**Tech Stack:** Markdown files, Claude Code skills (SKILL.md), skills-lock.json

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `docs/conventions/rust.md` | Create | All Rust conventions (error handling, ownership, async, axum, sqlx, clean code, DRY) |
| `docs/conventions/frontend.md` | Create | All frontend conventions (React 19, TS clean code, DRY/SOC, Tailwind v4) |
| `CLAUDE.md` | Create | Dev contract for Claude Code: stack, before-you-code checklist, convention pointers, module boundaries, commands, review skills |
| `AGENTS.md` | Rewrite | Lighter mirror for Codex: stack, before-you-code, convention pointers, module boundaries, commands |
| `.claude/skills/pre-pr-review/SKILL.md` | Rewrite | Keep process (2 parallel agents, output format), replace inlined rules with convention references |
| `.claude/skills/pre-commit-review/SKILL.md` | Rewrite | Keep process (1 agent, auto-fix + report), replace inlined rules with convention references |
| `skills-lock.json` | Modify | Remove 4 redundant skills |

---

### Task 1: Create docs/conventions/rust.md

**Files:**
- Create: `docs/conventions/rust.md`

- [ ] **Step 1: Create the conventions directory and rust.md**

```markdown
# Rust Conventions — Superkick

Source of truth for Rust code in the Superkick workspace.
Applies during implementation and review.

## Error Handling

- `anyhow::Result` for application functions, `thiserror` for domain errors
- No `.unwrap()` in production code (tests only)
- No `panic!` in production — use `Result`
- Propagate with `?` and add context (`.context()` or `.with_context()`)
- Exhaustive `match` on `Result`/`Option`

## Ownership & Borrowing

- Prefer `&str` over `String` in function signatures when ownership is not needed
- Avoid unnecessary `.clone()` — check if a reference suffices
- Explicit lifetime annotations when the compiler cannot infer

## Async Patterns (tokio)

- No `.block_on()` in async code
- `tokio::spawn` for independent concurrent tasks
- `tokio::sync::Mutex` for async code, not `std::sync::Mutex`
- Avoid `.await` in tight loops — prefer `futures::join_all` or `tokio::join!`

## API (axum)

- Handlers return `Result` types with `IntoResponse`
- Extractors ordered correctly (`Path` before `Body`)
- Shared state via `Extension` or `State`, no globals

## SQL (sqlx)

- Use typed query macros (`query!`, `query_as!`) when possible
- No SQL string formatting — always use bound parameters
- Migrations must be idempotent

## Clean Code

- Functions > 30 lines → split
- Modules > 300 lines → split into submodules
- No unused imports
- No dead/commented code
- snake_case naming (no camelCase)
- Prefer iterators (`.map`, `.filter`, `.collect`) over manual `for` loops when appropriate
- `#[must_use]` for functions whose result should not be ignored
- Derive standard traits when appropriate (`Debug`, `Clone`, `PartialEq`)

## DRY

- Duplicated logic across crates → extract
- Similar types/structs → unify or use generics
- Utility code in the right crate (core for domain, runtime for infra)
```

- [ ] **Step 2: Verify file exists and content is correct**

Run: `cat docs/conventions/rust.md | head -5`
Expected: Shows the title and first lines

---

### Task 2: Create docs/conventions/frontend.md

**Files:**
- Create: `docs/conventions/frontend.md`

- [ ] **Step 1: Create frontend.md**

```markdown
# Frontend Conventions — Superkick

Source of truth for React 19 / TypeScript code in `ui/`.
Applies during implementation and review.

## React 19

- `forwardRef` is BANNED → ref is a standard prop
- `React.FC` / `React.FunctionComponent` are BANNED → use typed functions directly
- `JSX.Element` → use `ReactNode` for rendered props
- `defaultProps` is BANNED → use ES6 default values
- Prefer `use(MyContext)` over `useContext(MyContext)` for new components

## Clean Code

- Named exports only — no `export default`
- Conditional rendering: `condition ? <X /> : null`, NEVER `condition && <X />`
- Empty returns: `return null`, NEVER `return <></>`
- No unused imports
- No dead/commented code
- No `any` types — use precise types
- Components > 150 lines → split

## DRY / SOC

- Duplicated logic → extract into a hook or utility
- Business logic in components → must be in hooks
- No direct fetch — use separate API functions

## Tailwind v4

- No custom CSS classes if a Tailwind utility exists
- Consistent responsive design
```

- [ ] **Step 2: Verify**

Run: `cat docs/conventions/frontend.md | head -5`
Expected: Shows title and first lines

---

### Task 3: Create CLAUDE.md

**Files:**
- Create: `CLAUDE.md`

- [ ] **Step 1: Create CLAUDE.md at repo root**

```markdown
# Superkick — Development Rules

## Project

Local-first tool that turns Linear issues into reviewed PRs.
Rust workspace backend + React 19 dashboard UI.

## Stack

- **Backend**: Rust workspace (edition 2024, MSRV 1.85) — axum, tokio, sqlx/sqlite, serde, thiserror/anyhow
  - `superkick-api` — HTTP (axum). No business logic here.
  - `superkick-core` — Domain logic, run state machine, application services
  - `superkick-config` — Config parsing (superkick.yaml)
  - `superkick-runtime` — Async runtime, subprocess supervision, worktree lifecycle
  - `superkick-storage` — SQLite persistence, repository implementations
  - `superkick-integrations` — Linear/GitHub adapters (keep thin)
- **Frontend**: React 19 in `ui/` — Vite, Tailwind v4, react-router-dom, zustand, TanStack Router
- **No** Next.js, no server components

## Before you code

- Read the issue/spec fully before starting
- Run `just check` to confirm the workspace compiles
- Identify which crates/packages are impacted — stay within scope
- Do not commit unless explicitly asked

## Conventions

Follow these strictly during implementation AND review:
- Rust rules: `docs/conventions/rust.md`
- Frontend rules: `docs/conventions/frontend.md`

## Module boundaries (SOC)

- No business logic in `superkick-api` → must be in `superkick-core`
- No direct DB access in `superkick-core` → go through `superkick-storage`
- No circular dependencies between crates
- `superkick-integrations` adapts external systems to core interfaces — keep it thin

## Commands

| Action | Command |
|--------|---------|
| Compile check | `just check` |
| Format | `just fmt` |
| Lint | `just lint` |
| Dev (api + ui) | `just dev` |
| Build all | `just build` |

## Review skills

- `/pre-commit-review` — auto-fix + report before commit
- `/pre-pr-review` — full review before PR
- `/pr-description` — generate PR description
```

- [ ] **Step 2: Verify**

Run: `cat CLAUDE.md | head -5`
Expected: Shows title and first lines

---

### Task 4: Rewrite AGENTS.md

**Files:**
- Modify: `AGENTS.md` (full rewrite)

- [ ] **Step 1: Replace AGENTS.md content**

```markdown
# Superkick — Agent Instructions

## Project

Local-first tool: Linear issue → local run → playbook → review swarm → PR.
Rust workspace backend + React 19 dashboard UI.

## Stack

- **Backend**: Rust workspace (edition 2024, MSRV 1.85) — axum, tokio, sqlx/sqlite
  - Crates: superkick-api, superkick-core, superkick-config, superkick-runtime, superkick-storage, superkick-integrations
- **Frontend**: React 19 in `ui/` — Vite, Tailwind v4, react-router-dom
- **No** Next.js, no server components

## Before you code

- Read the issue/spec fully before starting
- Run `just check` to confirm the workspace compiles
- Stay within scope of the impacted crates/packages

## Conventions

- Rust: `docs/conventions/rust.md`
- Frontend: `docs/conventions/frontend.md`

## Module boundaries

- No business logic in `superkick-api` → `superkick-core`
- No direct DB in `superkick-core` → `superkick-storage`
- No circular dependencies between crates
- `superkick-integrations` stays thin

## Commands

| Action | Command |
|--------|---------|
| Compile check | `just check` |
| Format | `just fmt` |
| Lint | `just lint` |
| Dev | `just dev` |
| Build | `just build` |
```

- [ ] **Step 2: Verify**

Run: `wc -l AGENTS.md`
Expected: ~40 lines (down from ~243)

---

### Task 5: Rewrite pre-pr-review skill

**Files:**
- Modify: `.claude/skills/pre-pr-review/SKILL.md` (full rewrite)

- [ ] **Step 1: Replace SKILL.md content**

The skill keeps its process (identify files, launch 2 parallel agents, consolidate) but the agent prompts reference conventions files instead of inlining rules.

```markdown
---
name: pre-pr-review
description: Comprehensive PR review for Superkick — Rust backend + React 19 frontend. Run before creating a PR.
---

# Pre-PR Review — Superkick

Full review before PR: Rust + React 19 + Clean Code.
Launch **2 agents in parallel** and consolidate results.

## Usage

```bash
/pre-pr-review
```

## Process

**When invoked, you MUST:**

1. **Identify base branch and modified files:**

```bash
git diff main --name-only
```

Separate Rust files (`*.rs`, `Cargo.toml`) from frontend files (`ui/**`).

2. **Launch 2 agents IN PARALLEL** with the Agent tool — one message, 2 tool calls:

### Agent 1 — Rust Review (`subagent_type="feature-dev:code-reviewer"`)

> Only launch if `.rs` or `Cargo.toml` files are modified.

```
Code review Rust files modified vs main.

Context: Rust workspace — superkick-api (axum), superkick-core (domain), superkick-config, superkick-runtime (tokio), superkick-storage (sqlx/sqlite), superkick-integrations. Edition 2024, MSRV 1.85.

Read and apply ALL rules from docs/conventions/rust.md.
Also enforce module boundaries:
- No business logic in superkick-api → must be in superkick-core
- No direct DB access in superkick-core → go through superkick-storage
- No circular dependencies between crates

Do NOT auto-fix. Report only.

Files: [list of modified .rs and Cargo.toml files]
```

### Agent 2 — Frontend Review (`subagent_type="feature-dev:code-reviewer"`)

> Only launch if `ui/**` files are modified. Otherwise skip.

```
Code review React 19 + TypeScript files modified vs main.

Context: React 19, Vite, Tailwind v4, react-router-dom. No Next.js, no server components.

Read and apply ALL rules from docs/conventions/frontend.md.

Do NOT auto-fix. Report only.

Files: [list of modified ui/ files]
```

3. **Consolidate reports** in the format below.

## Output format

```markdown
# Pre-PR Review — Superkick

## Critical issues (X)

- [file:line] - **[Category]** Description → Fix

## Suggested improvements (X)

- [file:line] - **[Category]** Description → Fix

## Positive points

- Concise list

---

PR ready
OR
X critical issues to fix before PR
X improvements to consider
```

Categories: `Error Handling`, `Ownership`, `Async`, `API Design`, `SQL`, `Clean Code`, `DRY`, `SOC`, `React 19`, `Composition`, `Bundle`, `Tailwind`.
```

- [ ] **Step 2: Verify**

Run: `wc -l .claude/skills/pre-pr-review/SKILL.md`
Expected: ~80 lines (down from ~160)

---

### Task 6: Rewrite pre-commit-review skill

**Files:**
- Modify: `.claude/skills/pre-commit-review/SKILL.md` (full rewrite)

- [ ] **Step 1: Replace SKILL.md content**

```markdown
---
name: pre-commit-review
description: DRY, SOC, Clean Code review with auto-fix for Superkick (Rust + React 19) — one shot before commit.
---

# Pre-Commit Review — Superkick

Review + auto-fix in **one pass** before commit.

## Usage

```bash
/pre-commit-review
```

## Process

**When invoked, you MUST:**

1. **Identify modified files:**

```bash
git diff --name-only && echo "---STAGED---" && git diff --cached --name-only
```

2. **Launch the code-reviewer agent** with Agent tool (`subagent_type="feature-dev:code-reviewer"`):

```
One-shot code review + auto-fix on modified files.

Context: Rust workspace (axum, tokio, sqlx/sqlite, serde, thiserror/anyhow, edition 2024) + UI React 19 (Vite, Tailwind v4, react-router-dom).

Read docs/conventions/rust.md for Rust rules.
Read docs/conventions/frontend.md for frontend rules.

AUTO-FIX immediately:
- Remove unused imports (Rust + TS)
- Remove dead/commented code
- Replace any with precise types (if obvious)
- Remove forwardRef → ref-as-prop
- Remove React.FC → typed function
- Replace JSX.Element → ReactNode

REPORT ONLY (do not auto-fix):
- .unwrap() in production code
- Non-idiomatic names
- Functions > 30 lines (Rust) or components > 150 lines (React)
- Duplicated logic
- SOC violations (business logic in wrong crate/component)

Files: [list]
```

3. **Present the report** — concise, actionable.

## Output format

```markdown
## Auto-fixes applied (X)

- [file:line] - What was fixed

## Suggested refactoring (X)

- [file:line] - **Issue** → Suggested fix

## Positive points

- Concise list

---

Code validated
OR
X suggested refactorings to consider
```
```

- [ ] **Step 2: Verify**

Run: `wc -l .claude/skills/pre-commit-review/SKILL.md`
Expected: ~70 lines (down from ~100)

---

### Task 7: Clean up external skills

**Files:**
- Modify: `skills-lock.json`

- [ ] **Step 1: Remove 4 redundant skills from skills-lock.json**

Remove these entries from the `skills` object:
- `rust-skills` (leonardomso/rust-skills)
- `rust-async-patterns` (wshobson/agents)
- `code-review-excellence` (wshobson/agents)
- `find-skills` (vercel-labs/skills)

Keep these 5:
- `rust-best-practices` (apollographql/skills)
- `vercel-react-best-practices` (vercel-labs/agent-skills)
- `vercel-composition-patterns` (vercel-labs/agent-skills)
- `tailwind-design-system` (wshobson/agents)
- `web-design-guidelines` (vercel-labs/agent-skills)

- [ ] **Step 2: Verify**

Run: `cat skills-lock.json | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['skills']), 'skills')"`
Expected: `5 skills`

---

### Task 8: Final validation

- [ ] **Step 1: Verify no product code was touched**

Run: `git diff --name-only`
Expected: Only these files appear:
- `CLAUDE.md`
- `AGENTS.md`
- `docs/conventions/rust.md`
- `docs/conventions/frontend.md`
- `.claude/skills/pre-pr-review/SKILL.md`
- `.claude/skills/pre-commit-review/SKILL.md`
- `skills-lock.json`
- `docs/superpowers/specs/2026-03-29-eng-001-agent-rules-skills-hardening-design.md`
- `docs/superpowers/plans/2026-03-29-eng-001-agent-rules-skills-hardening.md`

- [ ] **Step 2: Verify workspace still compiles**

Run: `just check`
Expected: Success (no product code changed)

- [ ] **Step 3: Verify convention files are referenced consistently**

Run: `grep -r "docs/conventions" CLAUDE.md AGENTS.md .claude/skills/`
Expected: All 4 files reference the same paths (`docs/conventions/rust.md` and `docs/conventions/frontend.md`)

- [ ] **Step 4: Verify no rule duplication**

Confirm that neither AGENTS.md, pre-pr-review/SKILL.md, nor pre-commit-review/SKILL.md contain inlined Rust/React rules. They should only contain process instructions and references to convention files.
