---
name: pre-pr-review
description: Comprehensive PR review for Superkick — Rust backend + React 19 frontend. Run before creating a PR.
---

# Pre-PR Review — Superkick

Full review before PR. Two subagents in parallel (Rust + frontend), then fix the criticals.
User-invoked only.

## Usage

```bash
/pre-pr-review
```

## Process

When invoked:

1. **Identify changed files vs `main`**:

   ```bash
   git diff main --name-only
   ```

   Split into Rust (`*.rs`, `Cargo.toml`) and frontend (`ui/**`).

2. **Launch both reviews in parallel** (one message, two `Agent` calls with
   `subagent_type="superpowers:code-reviewer"`).

   **Rust agent brief** (skip if no Rust files changed):

   > Review the listed Rust files against `docs/conventions/rust.md` and `docs/conventions/testing.md`. Enforce module boundaries (no business logic in `superkick-api`, no direct DB in `superkick-core`, no circular deps, `superkick-integrations` stays thin). Report only — do not fix. Cite rule names.
   > Files: [list]

   **Frontend agent brief** (skip if no `ui/**` files changed):

   > Review the listed React 19 / TypeScript files against `docs/conventions/frontend.md` and `docs/conventions/testing.md`. Report only — do not fix. Cite rule names.
   > Files: [list]

3. **Consolidate** the two reports in the format below.

4. **Fix all critical issues** directly. Do not ask for confirmation on criticals.

5. **Present suggested improvements** — let the operator decide.

6. **Run `just check`** to confirm nothing is broken.

## Output format

```markdown
# Pre-PR Review — Superkick

## Critical issues (X) — FIXED
- [file:line] — **[Rule]** description → fix applied

## Suggested improvements (X)
- [file:line] — **[Rule]** description → suggested fix

## Positive points
- concise bullets

---
All criticals fixed, X improvements to consider — or — PR ready, no issues
```
