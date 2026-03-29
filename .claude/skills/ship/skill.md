---
name: ship
description: Commit, create PR, and mark the Linear issue as done — one command to ship.
---

# Ship — Superkick

Commit current changes, create a PR, and close the Linear issue. One shot.

## Usage

```bash
/ship
```

## Process

**When invoked, you MUST:**

1. **Identify context:**
   - Run `git status -s` and `git diff main --name-only` to see what's changed
   - Run `git log --oneline -5` to match commit message style
   - Identify the Linear issue ID from the branch name (e.g. `sup-23` from `alimtunc/sup-23-...`)

2. **Commit all changes:**
   - Stage all modified/new files relevant to the work
   - Write a concise commit message that follows the repo's style (lowercase, imperative)
   - Do NOT add Co-Authored-By or AI credit lines
   - Do NOT skip hooks

3. **Push and create PR:**
   - Push the branch with `-u` flag
   - Create a PR using `gh pr create` with:
     - Short title (under 70 chars)
     - Body with `## Summary` (1-3 bullets) and `## Test plan` (checklist)
   - Return the PR URL

4. **Mark the Linear issue as done:**
   - Use the `mcp__linear-superkick__save_issue` tool to set `state: "Done"` on the issue

5. **Output** the PR URL and confirm the issue is closed.
