---
name: pre-pr-review
description: Comprehensive PR review for Superkick — Rust backend + React 19 frontend. Run before creating a PR.
---

# Pre-PR Review — Superkick

Review + fix before PR: Rust + React 19 + Clean Code.
Launch **2 agents in parallel**, consolidate results, then **fix all critical issues**.

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

Context: React 19, Vite, Tailwind v4, TanStack (Router, Query, Form), zustand, shadcn/base-ui. No Next.js, no server components.

Read and apply ALL rules from docs/conventions/frontend.md.

Do NOT auto-fix. Report only.

Files: [list of modified ui/ files]
```

3. **Consolidate reports** in the format below.

4. **Fix all critical issues** — apply fixes directly to the code. Do NOT ask for confirmation on criticals.

5. **Present suggested improvements** to the user — let them decide which to apply.

6. **Run `just check`** after fixes to confirm nothing is broken.

## Output format

```markdown
# Pre-PR Review — Superkick

## Critical issues (X) — FIXED

- [file:line] - **[Category]** Description → Fix applied

## Suggested improvements (X)

- [file:line] - **[Category]** Description → Suggested fix

## Positive points

- Concise list

---

All criticals fixed, X improvements to consider
OR
PR ready — no issues found
```

Categories: `Error Handling`, `Ownership`, `Async`, `API Design`, `SQL`, `Clean Code`, `DRY`, `SOC`, `React 19`, `Composition`, `Bundle`, `Tailwind`.
