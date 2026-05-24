# Issue Detail Mockup Parity Handoff

> For orchestrator use: create the follow-up Linear tickets below, then dispatch each with `Invoke ticket-triage on SUP-XXX`. Do not ask the implementation agent to skip triage or work on `main`.

**Goal:** Close concrete gaps between the approved Issue-centered V1 Issue Detail mockups and the current `/issues/:id` implementation without adding fake activity, comments, PRs, status changes, run events, costs, watchers, or milestones.

**Architecture:** Keep Issue Detail as the orchestration surface. The page remains a two-column layout: issue content/feed on the left, properties and task/run status in the right rail. Run internals stay in the compact drawer or `/runs/:id`; Issue Detail only shows truthful summaries and entry points.

**Tech Stack:** React 19, Vite, Tailwind v4, TanStack Router/Query, Rust Linear API contract in `superkick-integrations` and `superkick-api`.

---

## Source Material

- Approved design source: `docs/design/issue-centered-v1/README.md`
- Parity workflow: `docs/design/issue-centered-v1/visual-parity.md`
- Approved Issue Detail artboards: `docs/design/issue-centered-v1/artifacts/issues-redesign-linear-like.html`
- Target artboards only: `detail-idle`, `detail-running`, `detail-diff`
- Visual parity states: `ui/visual-parity/manifest.mjs`
- Existing SUP-169 parity output: `.visual-parity-output/latest/issue-detail-idle`, `.visual-parity-output/latest/issue-detail-running`, `.visual-parity-output/latest/issue-detail-diff`

## Audit Summary

Current status: **close**.

Latest local `main` matched `origin/main` at `377158b` during the audit. The current app has the correct page-level structure: two-column Issue Detail, sub-issues, comments, right rail properties, task/run card, composer placement, and run drawer entry from the task card.

The remaining gaps are not a full redesign. They are mostly:

- density and visual rhythm,
- activity feed semantics,
- disabled/scaffolded composer copy,
- missing real product data in the API contract,
- one visual parity harness mismatch for `detail-diff`.

SUP-169 parity diffs were:

- `issue-detail-idle`: `17.62%`
- `issue-detail-running`: `17.07%`
- `issue-detail-diff`: `17.11%`

Treat the pixel numbers as review triggers, not as standalone acceptance criteria.

## Hard Non-Goals

Do not implement story-only mockup data:

- no fake comments,
- no fake Linear status-change history,
- no fake PR links or PR numbers,
- no fake run events,
- no fake costs,
- no fake watchers/subscribers,
- no fake milestone row,
- no fake GitHub relation detail such as `#1483` unless the backend supplies it.

Do not analyze or redesign `/issues` list, Task Detail, Run Detail, or the drawer except where the Issue Detail page directly links into them.

Do not use `docs/design/issue-centered-v1/artifacts/issue-detail-with-execution-log.html` as the Issue Detail page baseline. That artifact is drawer reference only.

## Follow-Up Tickets

### Ticket 1: Issue Detail Shell And Density Polish

**Problem:** The page is structurally close but visually heavier than the approved artboard. The rail has a separate header band, property rows are tall and label-heavy, sub-issues reuse full issue list rows, and the header action cluster differs from the mockup.

**Scope:**

- Tighten the right rail without changing data semantics.
- Replace full-list sub-issue rows with compact Issue Detail rows.
- Remove duplicate live-run signaling from the topbar if the task card already shows it.
- Align header actions with the mockup where actions are backed by real behavior.

**Likely files:**

- `ui/src/components/issue-detail/IssueDetail.tsx`
- `ui/src/components/issue-detail/IssueDetailRail.tsx`
- `ui/src/components/issue-detail/IssuePropertiesBlock.tsx`
- `ui/src/components/issue-detail/ChildIssues.tsx`
- `ui/src/components/issue-detail/StatusChip.tsx`
- `ui/src/components/issue-detail/LabelChip.tsx`
- `ui/src/shell/Topbar.tsx` only if the existing slot API cannot support the header cluster cleanly.

**Acceptance criteria:**

- `/issues/:id` still has one left content column and one right properties/task rail.
- Right rail no longer reads as a second topbar.
- Property rows are denser and keep current real fields.
- Sub-issues render as compact detail rows with status, priority, identifier, title, and assignee when present.
- No fake milestone, subscriber, watcher, or relation details are introduced.
- Running state has one primary live-run signal, not both topbar and task card.

**Verification:**

- `pnpm --dir ui test:run -- ChildIssues IssueDescription`
- `pnpm --dir ui visual:parity -- --states issue-detail-idle,issue-detail-running`
- Manual screenshot review against `.visual-parity-output/latest/issue-detail-idle/mockup.png` and `issue-detail-running/mockup.png`.

### Ticket 2: Issue Detail Activity Feed Semantics

**Problem:** The mockup expects two classes of feed items: human comments as cards, and lightweight timeline events for status/run/PR summaries. The current implementation uses one timeline component shape and excludes active runs from the feed.

**Scope:**

- Keep human comments as comment cards.
- Add a lightweight event row variant for real issue/run events.
- Show a truthful run launch/completion summary when `linked_runs` contains real runs.
- Prefer opening the compact run drawer from Issue Detail run events; keep `/runs/:id` as a secondary detail action if needed.
- Do not surface live agent logs, test output, tool calls, costs, or PR diffs on Issue Detail.

**Likely files:**

- `ui/src/components/issue-detail/IssueFeed.tsx`
- `ui/src/components/issue-detail/ActivityNode.tsx`
- `ui/src/lib/domain/issueActivity.ts`
- `ui/src/components/issue-detail/RunPrBadge.tsx`
- `ui/src/components/issue-detail/run-drawer/RunDrawer.tsx`
- `ui/src/stores/runDrawer.ts`

**Acceptance criteria:**

- Comments remain visibly distinct from timeline events.
- Active or completed linked runs can appear as short event rows, sourced only from real `linked_runs`.
- Completed run rows can show real PR summary only when `LinkedRunSummary.pr` exists.
- No fake status-change history, GitHub links, PRs, or agent activity is rendered.
- Drawer tab order remains Activity, Tools, Files, Logs, Terminal.

**Verification:**

- Add or update focused tests around `buildIssueActivity` ordering and run inclusion.
- `pnpm --dir ui test:run -- issueActivity`
- `pnpm --dir ui visual:parity -- --states issue-detail-running,issue-detail-diff`
- Manual check that `detail-diff` is not treated as a product-screen pixel pass.

### Ticket 3: Issue Detail Composer Shell

**Problem:** Composer placement is correct, but the current disabled copy exposes implementation scaffolding: `Issue replies will land here in a follow-up.` The mockup shows a real comment affordance shape.

**Scope:**

- Replace the scaffold copy with a production-looking disabled or read-only composer shell.
- Keep sending disabled unless real Linear comment posting is implemented in this same ticket.
- Include avatar/prompt/toolbar shape close to the mockup.
- Do not create local-only comments.

**Likely files:**

- `ui/src/components/issue-detail/IssueReplyComposer.tsx`
- `ui/src/components/issue-detail/AuthorAvatar.tsx`
- Optional future backend files only if comment posting becomes explicit scope: `crates/superkick-integrations/src/linear/client.rs`, `crates/superkick-api/src/handlers/issues.rs`, `ui/src/api/issues.ts`.

**Acceptance criteria:**

- Composer no longer contains follow-up/TODO-style copy.
- Composer visually reads as the Issue Detail comment affordance.
- If still disabled, disabled state is clear but quiet.
- No fake comments are appended to the activity feed.

**Verification:**

- Component test for disabled composer rendering if local pattern exists.
- `pnpm --dir ui visual:parity -- --states issue-detail-idle`

### Ticket 4: Issue Detail Product Data Contract Gaps

**Problem:** Some mockup fields are not available in the current Issue Detail contract. The UI should not fake them, but the product can decide which real fields to wire.

**Scope:**

- Investigate real Linear API support for milestone/project milestone, subscriber/watch state, issue history/status changes, richer relation display, and comment mutation.
- Extend the Rust contract only for fields that can be backed by real Linear data.
- Keep current UI honest when data is absent.

**Likely files:**

- `crates/superkick-integrations/src/linear/client.rs`
- `crates/superkick-integrations/src/linear/types/contract.rs`
- `crates/superkick-integrations/src/linear/types/graphql.rs`
- `crates/superkick-integrations/src/linear/types/convert.rs`
- `crates/superkick-api/src/handlers/issues.rs`
- `ui/src/types/issues.ts`
- `ui/src/components/issue-detail/IssuePropertiesBlock.tsx`
- `ui/src/components/issue-detail/IssueDetail.tsx`

**Acceptance criteria:**

- A documented decision exists for each candidate field: implement now, defer, or reject.
- Any added UI field is backed by real API data.
- Relations render existing available blocker title/status better than only `Blocked by ISS-230`.
- No fake milestone/subscriber/history values are introduced.

**Verification:**

- Rust contract/conversion tests for every added field.
- `just check`
- Focused UI tests for optional-field rendering if fields are added to `ui/src/types/issues.ts`.

### Ticket 5: Visual Parity Harness Cleanup For `detail-diff`

**Problem:** `detail-diff` is configured as a visual parity state, but the approved artboard is a design-note board describing changes, not a product screen. Current screenshot comparison is guaranteed to fail and can mislead implementation.

**Scope:**

- Decide whether `detail-diff` should remain a manual checklist state or be replaced by a real product-state artboard.
- Update parity docs and manifest behavior accordingly.
- Keep `detail-idle` and `detail-running` as screenshot-comparable states.

**Likely files:**

- `ui/visual-parity/manifest.mjs`
- `docs/design/issue-centered-v1/visual-parity.md`
- `docs/design/issue-centered-v1/README.md` only if the approved interpretation changes.

**Acceptance criteria:**

- Running visual parity no longer implies `detail-diff` is expected to pixel-match the live route.
- Reviewers can still use the `detail-diff` content as an implementation checklist.
- No archived HTML artifact is edited in place.

**Verification:**

- `pnpm --dir ui visual:parity:list`
- `pnpm --dir ui visual:parity -- --states issue-detail-idle,issue-detail-running,issue-detail-diff`
- Confirm generated notes make the manual-review status clear.

## Suggested Ticket Order

1. Ticket 5 first if parity noise is blocking reviewers.
2. Ticket 1 for the biggest visible improvement with no backend dependency.
3. Ticket 3 because it removes scaffold copy without requiring fake comments.
4. Ticket 2 after shell polish, because feed semantics need careful tests.
5. Ticket 4 last or in parallel as a discovery spike, because it crosses Rust and UI contracts.

## Evidence Map

- Page composition: `ui/src/components/issue-detail/IssueDetail.tsx`
- Feed composition: `ui/src/components/issue-detail/IssueFeed.tsx`
- Timeline node shape: `ui/src/components/issue-detail/ActivityNode.tsx`
- Sub-issues: `ui/src/components/issue-detail/ChildIssues.tsx`
- Composer: `ui/src/components/issue-detail/IssueReplyComposer.tsx`
- Right rail: `ui/src/components/issue-detail/IssueDetailRail.tsx`
- Properties: `ui/src/components/issue-detail/IssuePropertiesBlock.tsx`
- Task/run card: `ui/src/components/issue-detail/ExecutionStatusCard.tsx`
- Drawer tabs: `ui/src/components/issue-detail/run-drawer/RunDrawerTabs.tsx`
- Current frontend issue type: `ui/src/types/issues.ts`
- Linear issue detail query: `crates/superkick-integrations/src/linear/client.rs`
- Rust contract: `crates/superkick-integrations/src/linear/types/contract.rs`

## Orchestrator Notes

- These are follow-up implementation tickets, not a request to patch `main` directly.
- Any ticket touching both Rust API contract and UI is cross-stack; route through plan-then-execute.
- UI-only polish tickets can be smaller, but still run triage.
- Keep screenshots attached from `.visual-parity-output/latest/` or fresh parity output, not from downloads.
- Manual acceptance should explain intentional data differences separately from visual defects.
