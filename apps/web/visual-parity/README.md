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
- `diff.png` — pixel diff when dimensions match and the state is screenshot-comparable.
- `notes.md` — state metadata, status, fixture used, manual-checklist reason if any, and a diagnostics section listing every console error / request failure / 4xx-or-5xx response seen during capture.

The root `summary.md` links every generated artifact and can be copied into a PR body. The summary table includes the fixture name and a per-state diagnostics tally so reviewers can spot unexpected 4xx responses or fixture gaps without opening each `notes.md`.

## State classes

Each state is one of:

- `pass` / `review` — screenshot-comparable. The pixel diff is compared against the threshold in `manifest.mjs`.
- `manual` — dimension mismatch between the mockup artboard and the live route screenshot. No pixel diff is generated; the reviewer compares visually.
- `manual-checklist` — the mockup artboard is a design-note board (e.g. an annotated "what changed" panel), not a product screen. Pixel diffing is intentionally skipped. The captured mockup is meant to be read as an implementation checklist; the captured app screenshot is the current baseline for that route.

A state opts into `manual-checklist` by setting `manualChecklist: '<reason>'` in the manifest. The reason is surfaced verbatim in `notes.md` and `summary.md`.

## Fixture notes

Some states deliberately diverge from the literal mockup composition (for example, hovering a different issue identifier than the approved artboard previews) because the API fixture only carries detail for one issue. When a state needs that context, the manifest sets a `fixtureNote: '<explanation>'`. The note is rendered into `notes.md` so a reviewer doesn't read the difference as a product defect.

## Acceptance Rule

Until the visual redesign lands, dimension mismatches and high pixel diffs are expected. A parity PR is acceptable only when:

- every touched state has a current `mockup.png`, `app.png`, and either `diff.png`, a manual-review note, or a manual-checklist note;
- every `review` status above the threshold is explained in the PR body;
- screenshots are attached from `.visual-parity-output/latest/`, not from `~/Downloads`;
- the PR states whether mismatches are intentional, pre-existing, or follow-up work.
