---
description: Generate a short, concise PR description in English from the current branch's commits and changes.
allowed-tools: Bash(git *)
---

Analyze the git commits and changes on this branch, then generate a short PR description in English.

Steps:

1. `git log origin/main..HEAD --oneline` — list the branch commits
2. `git diff origin/main...HEAD --stat` — modified files
3. `git diff origin/main...HEAD` — actual changes
4. Emit the template below, ready to copy-paste

Rules:

- "What": 1–2 sentences max.
- "Changes": 3–5 bullets, focused on effect not implementation detail.
- "Tests": a checklist derived from what actually changed.

## Template

```markdown
## What

[1–2 sentence description of the feature or fix]

## Changes

- [main change 1]
- [main change 2]
- [main change 3]

## Tests

- [ ] [test scenario 1]
- [ ] [test scenario 2]
- [ ] [test scenario 3]
```
