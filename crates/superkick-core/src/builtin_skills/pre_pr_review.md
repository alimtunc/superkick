---
name: pre_pr_review
description: Full-branch pre-PR review pass over every change relative to the base branch before a PR is opened.
---

# Pre-PR Review

Review every change on this branch relative to the base branch, as a final pass before a pull request is opened. Go over the full diff — not just the most recent commit — for bugs, logic errors, security issues, and code quality. Check that the changes are coherent across commits, stay within scope, and match the project's conventions. If the branch is ready to ship, say 'LGTM'. If there are issues, list them clearly so they can be fixed before the PR. Only review code.
