---
name: test-instructions
description: Use after finishing an issue implementation to emit a copy-pasteable test checklist for the operator. Covers automated tests, live manual steps, edge cases, and a short French summary.
---

# Test Instructions — Superkick

Generate a concise test checklist the operator can copy-paste to verify the work.

## When to use

After finishing the implementation of an issue (before the operator takes over for manual verification). Can also be run manually via `/test-instructions`.

## Process

1. **Summarise what was built** in one line (feature / fix / contract).
2. **List the commands to run**, in order:
   - Automated tests: `cargo test -p <affected-crate>` and `just check`.
   - Live test (if applicable): server start command with required env vars, then curl or browser steps.
3. **Surface edge cases** worth checking manually (missing config, bad input, failure paths).
4. **Emit the checklist** in the template below, followed by a short French summary.

## Template

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
<curl or browser steps>
\`\`\`

**Expected**: <what you should see>

### 3. Edge cases
- [ ] <edge case 1>
- [ ] <edge case 2>

### Résumé

<2-3 phrases en français décrivant ce qui a été implémenté, le comportement attendu, et les points d'attention pour le test>
```

## Principles

- Commands must be copy-pasteable — no placeholders except secrets.
- Include the worktree path if working in one.
- Mention required env vars explicitly.
- Short — no explanations, just steps.
- The résumé section stays in French.
