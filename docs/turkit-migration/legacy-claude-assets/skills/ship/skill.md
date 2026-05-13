---
name: ship
description: Commit, create PR, and mark the Linear issue as done — one command to ship.
---

# Ship — Superkick

Commit current changes, push, open a PR, close the Linear issue. One shot.
Run this only after the operator has manually verified the work.

## Usage

```bash
/ship
```

## Steps

1. **Context** — `git status -s`, `git diff main --name-only`, `git log --oneline -5`. Extract the Linear issue ID from the branch name (e.g. `sup-23` from `alimtunc/sup-23-…`).
2. **Commit** — stage the relevant files (never `git add -A`), write a lowercase imperative message matching the repo style. No `Co-Authored-By`, no `--no-verify`, no amend after a hook failure.
3. **Push & PR** — `git push -u`, then `gh pr create` with a title under 70 chars, body: `## Summary` (1–3 bullets) + `## Test plan` (checklist). Return the PR URL.
4. **Linear** — `mcp__linear-superkick__save_issue` with `state: "Done"` on the issue.
5. **Output** — PR URL + Linear confirmation.
