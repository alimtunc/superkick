---
name: pre-commit-review
description: DRY, SOC, Clean Code review with auto-fix for Superkick (Rust + React 19) — one shot before commit.
---

# Pre-Commit Review — Superkick

Review + auto-fix in one pass, before committing. User-invoked only.

## Usage

```bash
/pre-commit-review
```

## Process

When invoked:

1. **Identify modified files** — staged + unstaged:

   ```bash
   git diff --name-only && echo "---STAGED---" && git diff --cached --name-only
   ```

2. **Dispatch a review** via the `superpowers:code-reviewer` subagent with this brief:

   > One-shot review + auto-fix on the listed files.
   > Conventions live in `docs/conventions/rust.md`, `frontend.md`, `testing.md`, `workflow.md` — read them, apply them, cite rule names in findings.
   >
   > Auto-fix silently:
   > - unused imports (Rust + TS)
   > - dead / commented-out code
   > - obvious `any` → precise type
   > - `forwardRef` → ref-as-prop (React 19)
   > - `React.FC` → typed function
   > - `JSX.Element` → `ReactNode`
   >
   > Report only (do not auto-fix):
   > - `.unwrap()` / `panic!` in production paths
   > - non-idiomatic names
   > - duplicated logic or SOC violations
   > - any change that alters runtime behaviour
   >
   > Files: [list]

3. **Present the consolidated report** — concise, actionable.

## Output format

```markdown
## Auto-fixes applied (X)
- [file:line] — what was fixed

## Suggested refactoring (X)
- [file:line] — **[Rule]** issue → suggested fix

## Positive points
- concise bullets

---
Code validated — or — X suggested refactorings to consider
```
