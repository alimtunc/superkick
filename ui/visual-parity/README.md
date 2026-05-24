# Issue-centered V1 Visual Parity Harness

This harness captures approved mockup artboards and matching live app surfaces for the Issue-centered V1 workstream.

## Commands

Install the browser once if Playwright asks for it:

```bash
pnpm --dir ui visual:parity:install
```

List available states:

```bash
pnpm --dir ui visual:parity:list
```

Capture every configured state:

```bash
pnpm --dir ui visual:parity
```

Capture a focused sample:

```bash
pnpm --dir ui visual:parity -- --states issues-list-default,issue-detail-running
```

Root wrapper:

```bash
just visual-parity --states issues-list-default,issue-detail-running
```

## Output

The default output folder is `.visual-parity-output/latest/` at the repo root. It is ignored by git.

Each state folder contains:

- `mockup.png` — cropped approved artboard from `docs/design/issue-centered-v1/artifacts/`.
- `app.png` — live Vite app route rendered with deterministic API fixtures.
- `diff.png` — pixel diff when dimensions match.
- `notes.md` — state metadata and pass/manual-review status.

The root `summary.md` links every generated artifact and can be copied into a PR body.

## Acceptance Rule

Until the visual redesign lands, dimension mismatches and high pixel diffs are expected. A future parity PR passes only when it attaches the generated screenshots and either:

- the diff is at or below the configured threshold in `manifest.mjs`, or
- the PR notes explain every intentional mismatch and list follow-up work.

No parity PR should merge with unexamined screenshot output.
