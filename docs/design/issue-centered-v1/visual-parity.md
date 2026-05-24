# Issue-centered V1 Visual Parity Workflow

SUP-169 adds the capture workflow used by all follow-up parity passes. It does not change the archived design artifacts and does not implement the redesign.

## Source Artboards

The harness reads the approved artboard IDs listed in `README.md` from:

- `docs/design/issue-centered-v1/artifacts/issues-redesign-linear-like.html`
- `docs/design/issue-centered-v1/artifacts/task-and-run-rework.html`
- `docs/design/issue-centered-v1/artifacts/issue-detail-with-execution-log.html`

The archived HTML files stay read-only. If Design ships a new revision, replace the archived file in a separate handoff ticket.

## Capture

Install the browser once if needed:

```bash
pnpm --dir ui visual:parity:install
```

Capture all configured states:

```bash
pnpm --dir ui visual:parity
```

Capture a focused sample:

```bash
just visual-parity --states issues-list-default,issue-detail-running
```

Generated output is written to:

```text
.visual-parity-output/latest/
```

That folder is ignored by git so parity PRs can attach artifacts without committing binary screenshots.

## Artifact Contract

Each state folder contains:

- `mockup.png` — approved mockup artboard screenshot.
- `app.png` — live app route screenshot with deterministic fixtures.
- `diff.png` — generated when mockup and app dimensions match.
- `notes.md` — route, artboard, and diff/manual-review status.

The root `summary.md` is the PR-ready index. Copy its state table into the PR body and attach the PNGs requested by the reviewer.

## Manual Acceptance Rule

The configured pixel threshold is intentionally strict. During the redesign transition, many states will require manual review because the current app is not expected to match the approved mockups yet.

A parity PR is acceptable only when:

- every touched state has a current `mockup.png`, `app.png`, and either `diff.png` or a dimension-mismatch note;
- every mismatch above threshold is explained in the PR body;
- screenshots are attached from `.visual-parity-output/latest/`, not from `~/Downloads`;
- the PR states whether mismatches are intentional, pre-existing, or follow-up work.

## Required States

The manifest covers:

- `/issues`: default list, hover, filter dropdown, empty, shipped, and kanban.
- `/issues/:id`: idle, running, and diff/completed context.
- `/tasks/:id`: running, needs-human, and done.
- `/runs/:id`: running, needs-human, and done.
- Execution drawer: Activity, Tools, Files, Logs, Terminal, and completed Activity.

Future parity tickets may narrow `--states` to the surfaces they modify, but they must still attach screenshots for every changed surface.
