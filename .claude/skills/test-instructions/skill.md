---
name: test-instructions
description: Generate clear test instructions after completing an issue implementation. Auto-triggered after issue work is done.
autoTrigger: after finishing an issue implementation
---

# Test Instructions — Superkick

Generate concise, actionable test instructions after completing an issue.

## When to use

Automatically after finishing the implementation of a Linear issue — before or after commit.

## Process

**When triggered, you MUST:**

1. **Identify what was built** — summarize the feature/contract/fix in one line.

2. **List test commands** in order:

### Unit / integration tests
```bash
cargo test -p <affected-crate>
```

### Compile check
```bash
just check
```

### Live test (if applicable)
- Provide the exact commands to start the server with required env vars
- Provide the exact curl/browser commands to verify the feature
- Include expected output or status codes

### Edge cases to verify manually
- What happens without required config (e.g. missing API key → 503)
- What happens with bad input
- Frontend behavior (if UI hook/component was added)

3. **Format output** as a ready-to-copy checklist:

```markdown
## Test instructions — <ISSUE-ID>

**Feature**: <one-line summary>

### 1. Automated tests
\`\`\`bash
<commands>
\`\`\`

### 2. Live test
\`\`\`bash
<server start command with env vars>
\`\`\`

Then in another terminal:
\`\`\`bash
<curl or browser instructions>
\`\`\`

**Expected**: <what you should see>

### 3. Edge cases
- [ ] <edge case 1>
- [ ] <edge case 2>
```

## Key principles

- Commands must be copy-pasteable — no placeholders except secrets
- Always include the worktree path if working in one
- Always mention required env vars
- Keep it short — no explanations, just steps
