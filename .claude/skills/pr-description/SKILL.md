---
name: pr-description
description: Generate a short, concise PR description in English from the current branch's commits and changes.
disable-model-invocation: true
allowed-tools: Bash(git *)
---

Analyze the git commits and changes on this branch, then generate a short, concise PR description in English.

Instructions:

1. Run `git log origin/main..HEAD --oneline` to list the branch commits
2. Run `git diff origin/main...HEAD --stat` to see modified files
3. Run `git diff origin/main...HEAD` to analyze the code changes
4. From this information, generate a PR description following the template below

Rules:

- Stay ultra-concise: 1-2 sentences max for "What", 3-5 bullet points max for "Changes"
- Focus on what actually changed, not implementation details
- List relevant test scenarios based on the changes
- Format for direct copy-paste into GitHub/Linear

Template:

```markdown
## What

[1-2 sentence description of the feature or fix]

## Changes

- [Main change 1]
- [Main change 2]
- [Main change 3]

## Tests

- [ ] [Test scenario 1]
- [ ] [Test scenario 2]
- [ ] [Test scenario 3]
```

Present the result in a well-formatted markdown block ready to copy.
