# ENG-001 — Agent Rules & Skills Hardening

## Problem

The Superkick repo has useful agent guidance, but it's unevenly distributed:

- Rules exist only for review-time (pre-commit, pre-PR). Nothing guides agents during implementation.
- The same Rust/React rules are copied 3 times (AGENTS.md + 2 skills). Changing a rule means updating 3 files.
- No standard "before you code" contract — agents start coding without seeing repo-specific expectations.
- AGENTS.md mixes stack info, review workflows, and conventions in one file.
- 9 external skills installed, several redundant or overlapping.

## Approach

Separate guidance by concern, establish a single source of truth per domain, and make dev-time rules visible automatically.

### Structure

```
/
├── CLAUDE.md                          # Dev contract + stack + module boundaries + convention pointers
├── AGENTS.md                          # Lighter mirror for Codex (same structure, no review skills)
├── docs/
│   └── conventions/
│       ├── rust.md                    # All Rust rules (single source of truth)
│       └── frontend.md               # All React 19 / TS / Tailwind rules (single source of truth)
├── .claude/
│   └── skills/
│       ├── pre-pr-review/SKILL.md    # Process only — references docs/conventions/*
│       ├── pre-commit-review/SKILL.md # Process only — references docs/conventions/*
│       └── pr-description/SKILL.md    # Unchanged
└── skills-lock.json                   # Cleaned: 9 → 5 external skills
```

### CLAUDE.md (new)

Claude Code loads this automatically every session. Contains:

- **Project** — one-liner description
- **Stack** — crates breakdown with responsibilities
- **Before you code** — pre-flight checklist (read issue, `just check`, scope check, no auto-commit)
- **Conventions** — pointers to `docs/conventions/rust.md` and `docs/conventions/frontend.md`
- **Module boundaries (SOC)** — the most-violated rules at top level
- **Commands** — `just check`, `just fmt`, `just lint`, `just dev`, `just build`
- **Review skills** — lists available `/pre-commit-review`, `/pre-pr-review`, `/pr-description`

Does NOT contain: detailed Rust/React rules (delegated to conventions files), review process workflows (live in skills), worktree instructions (user's decision per task).

### AGENTS.md (rewrite)

Same structure as CLAUDE.md but:

- Shorter (no review skills section — Codex doesn't use Claude Code skills)
- Same convention pointers
- Same module boundaries

Title changes from "Codex Instructions" to "Agent Instructions" (both Claude and Codex read it).

### docs/conventions/rust.md (new)

Single source of truth for all Rust rules:

- Error handling (anyhow/thiserror, no unwrap, context propagation)
- Ownership & borrowing (prefer &str, avoid clone, explicit lifetimes)
- Async patterns (tokio::spawn, tokio::sync::Mutex, no block_on, no await in loops)
- API/axum (Result + IntoResponse, extractor order, State not globals)
- SQL/sqlx (typed macros, bound params, idempotent migrations)
- Clean code (function/module size limits, no dead code, snake_case, iterators, #[must_use], derive traits)
- DRY (extract duplicates, unify similar types, right crate for utility code)

### docs/conventions/frontend.md (new)

Single source of truth for all frontend rules:

- React 19 (no forwardRef, no React.FC, ReactNode not JSX.Element, no defaultProps, use() over useContext)
- Clean code (named exports, ternary rendering, return null, no any, component size limit)
- DRY/SOC (extract hooks, business logic in hooks not components, no direct fetch)
- Tailwind v4 (utilities over custom CSS, consistent responsive)

### Skills de review (simplified)

**pre-pr-review** keeps its process (2 parallel agents, consolidated report, same output format) but replaces the inlined rule blocks with:

> Apply conventions from `docs/conventions/rust.md`

> Apply conventions from `docs/conventions/frontend.md`

~160 lines → ~60 lines. Same behavior, zero duplication.

**pre-commit-review** — same treatment. Process stays, rules reference conventions.

**pr-description** — unchanged (already clean).

### External skills cleanup

| Skill | Action | Reason |
|-------|--------|--------|
| rust-best-practices (Apollo) | Keep | Complementary idiomatic Rust guidance |
| vercel-react-best-practices | Keep | React 19 performance patterns |
| vercel-composition-patterns | Keep | Component composition patterns |
| tailwind-design-system | Keep | Dashboard styling |
| web-design-guidelines | Keep | UI quality |
| rust-skills (leonardomso) | Remove | 179 generic rules, overlaps with Apollo + our conventions |
| rust-async-patterns (wshobson) | Remove | Overlaps with Apollo + our async conventions |
| code-review-excellence (wshobson) | Remove | Generic review process, we have our own skills |
| find-skills (vercel-labs) | Remove | Discovery utility, not useful day-to-day |

Result: 9 → 5 external skills.

## What changes for agents

### Before (dev-time)

1. Agent receives task prompt
2. Agent reads AGENTS.md — sees stack info + review rules mixed together
3. Agent starts coding with no explicit dev-time contract
4. Rules are discovered at review time → rework

### After (dev-time)

1. Agent receives task prompt
2. Claude Code auto-loads CLAUDE.md → sees "Before you code" checklist + convention pointers
3. Agent reads `docs/conventions/{rust,frontend}.md` for the impacted stack
4. Agent codes with rules visible from the start → fewer review corrections

### Before (review-time)

1. `/pre-pr-review` invoked
2. Skill contains 150+ lines of inlined rules (duplicated from AGENTS.md)
3. Rules may drift from AGENTS.md over time

### After (review-time)

1. `/pre-pr-review` invoked
2. Skill references `docs/conventions/*` — same source of truth as dev-time
3. Zero drift possible

## Files to create

- `CLAUDE.md` (new)
- `docs/conventions/rust.md` (new)
- `docs/conventions/frontend.md` (new)

## Files to modify

- `AGENTS.md` (rewrite)
- `.claude/skills/pre-pr-review/SKILL.md` (simplify)
- `.claude/skills/pre-commit-review/SKILL.md` (simplify)
- `skills-lock.json` (remove 4 entries)

## Files unchanged

- `.claude/skills/pr-description/SKILL.md`
- All product/runtime code

## Validation

- An agent launched on Superkick sees dev-time rules without being told to look for them
- The same rules apply during implementation and review (single source)
- Modifying a convention requires changing exactly one file
- Skills still produce the same review output format
- `just lint` and `just check` still pass
- No product/runtime code touched
