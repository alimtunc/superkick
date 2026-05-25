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
- `diff.png` — generated when the state is screenshot-comparable and dimensions match.
- `notes.md` — route, artboard, fixture, status, manual-checklist reason (if any), and the per-state diagnostics list (console errors, request failures, and 4xx/5xx responses captured while the app screenshot was taken).

The root `summary.md` is the PR-ready index. Copy its state table into the PR body and attach the PNGs requested by the reviewer. The summary tallies diagnostics per state so unexpected 4xx responses or missing fixtures are visible without opening every `notes.md`.

## State Classes

SUP-175 introduces explicit state classes so reviewers don't read intentional differences as defects.

- **`pass` / `review`** — normal screenshot-comparable parity states. The pixel diff is compared against the configured threshold.
- **`manual`** — the mockup and app screenshots have different dimensions, so no pixel diff is generated. The reviewer compares the two visually.
- **`manual-checklist`** — the mockup artboard is a design-note board (annotated panels, what-changed boards, callouts), not a product screen. Pixel diffing is intentionally skipped. The captured mockup is meant to be read as an implementation checklist; the captured app screenshot is the current baseline for that route.

A state opts into `manual-checklist` by setting `manualChecklist: '<reason>'` in `ui/visual-parity/manifest.mjs`. The reason text is surfaced verbatim in `notes.md` and `summary.md`.

The current `manual-checklist` state is `issue-detail-diff`. Its artboard describes intended what-changed panel content, not the live `/issues/:id` view; pixel comparing it is guaranteed to mismatch and was misleading reviewers before SUP-175.

`issue-detail-idle` and `issue-detail-running` remain regular screenshot-comparable states.

## Fixture Notes

When a state deliberately diverges from the literal mockup composition (for example, hovering a different issue identifier than the approved artboard previews) because the harness fixture only carries detail for one issue, the manifest sets a `fixtureNote: '<explanation>'`. The note is rendered into `notes.md` so reviewers don't read the difference as a product defect.

`issues-list-hover` currently targets `ISS-216` — the same identifier as the approved `hover-dark` artboard — and the fixture serves detail for that issue so the hovered preview populates with real labels, last comment, and linked run rather than a sparse fallback.

## Manual Acceptance Rule

The configured pixel threshold is intentionally strict. During the redesign transition, many states will require manual review because the current app is not expected to match the approved mockups yet.

A parity PR is acceptable only when:

- every touched state has a current `mockup.png`, `app.png`, and either `diff.png`, a dimension-mismatch (`manual`) note, or a `manual-checklist` note;
- every `review` status above threshold is explained in the PR body;
- screenshots are attached from `.visual-parity-output/latest/`, not from `~/Downloads`;
- the PR states whether mismatches are intentional, pre-existing, or follow-up work.

## Required States

The manifest covers:

- `/issues`: default list, hover, filter dropdown, empty, shipped, and kanban.
- `/issues/:id`: idle, running, and the diff/what-changed manual checklist.
- `/tasks/:id`: running, needs-human, and done.
- `/runs/:id`: running, needs-human, and done.
- Execution drawer: Activity, Tools, Files, Logs, Terminal, and completed Activity.

Future parity tickets may narrow `--states` to the surfaces they modify, but they must still attach screenshots for every changed surface.
