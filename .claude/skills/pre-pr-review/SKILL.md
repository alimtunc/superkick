---
name: pre-pr-review
description: Comprehensive PR review for Superkick — Rust backend + React 19 frontend. Runs auto-fix + two-stream parallel review vs `main`. Operator-invoked only, never auto-chained.
---

# Pre-PR Review — Superkick

One unified review before opening the PR. Combines DRY/SOC auto-fix (formerly `pre-commit-review`) with the comprehensive Rust + React parallel review. Expensive — launches subagents — run only when you are ready to open the PR.

## Usage

```
/pre-pr-review
```

## Process

1. **Identify changed files** (branch diff vs `main`):

   ```bash
   git diff main --name-only
   ```

   Split into Rust (`*.rs`, `Cargo.toml`) and frontend (`ui/**`).

2. **Auto-fix pass** (first, before the deeper review):

   Dispatch one `superpowers:code-reviewer` subagent with this brief:

   > Auto-fix pass on the listed changed files. Read `docs/conventions/rust.md`, `frontend.md`, `testing.md`, `workflow.md` and apply silently:
   > - unused imports (Rust + TS)
   > - dead / commented-out code
   > - obvious `any` → precise type (only when the type is unambiguous at the boundary)
   > - `forwardRef` → ref-as-prop (React 19)
   > - `React.FC` → typed function
   > - `JSX.Element` → `ReactNode`
   >
   > Report only (do not auto-fix — intent matters):
   > - `.unwrap()` / `panic!` in production paths
   > - non-idiomatic names
   > - duplicated logic / SOC violations
   > - any change that alters runtime behaviour
   >
   > Files: [list]

3. **Deeper review**, two subagents in parallel (one message, two `Agent` calls with `subagent_type="superpowers:code-reviewer"`):

   **Rust agent brief** (skip if no Rust files):

   > Review the listed Rust files against `docs/conventions/rust.md` and `docs/conventions/testing.md`. Enforce module boundaries: no business logic in `superkick-api`, no direct DB in `superkick-core`, no circular deps, `superkick-integrations` stays thin. Report only — do not fix. Cite rule names.
   > Files: [list]

   **Frontend agent brief** (skip if no `ui/**` files):

   > Review the listed React 19 / TypeScript files against `docs/conventions/frontend.md` and `docs/conventions/testing.md`. Report only — do not fix. Cite rule names.
   > Files: [list]

4. **Consolidate**. Apply all critical fixes directly. Surface suggested improvements for the operator to decide.

5. **Run `just check`** to confirm nothing is broken after the fixes.

## Output format

```markdown
# Pre-PR Review — Superkick

## Auto-fixes applied (X)
- [file:line] — what was fixed

## Critical issues (X) — FIXED
- [file:line] — **[Rule]** description → fix applied

## Suggested improvements (X)
- [file:line] — **[Rule]** description → suggested fix

## Positive points
- concise bullets

---
All criticals fixed, X improvements to consider — or — PR ready, no issues
```

## Hard constraints

- Operator-invoked only. No other skill (`ticket-execute`, etc.) calls this one.
- Never commits, pushes, or opens a PR.
- Auto-fix is limited to unambiguous cleanup. Anything that changes runtime behaviour is reported, not fixed.
