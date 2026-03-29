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

Context: Rust workspace (axum, tokio, sqlx/sqlite, serde, thiserror/anyhow, edition 2024) + UI React 19 (Vite, Tailwind v4, TanStack Router/Query/Form, zustand, shadcn/base-ui).

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