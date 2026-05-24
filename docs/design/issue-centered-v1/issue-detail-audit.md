# Issue Detail — Design Audit vs Issue-centered V1

**Scope:** `/issues/:id` only — `detail-idle`, `detail-running`, `detail-diff` against `docs/design/issue-centered-v1/artifacts/issues-redesign-linear-like.html` (IssueDetailV3) and the current implementation in `ui/src/components/issue-detail/`.

## 1. Overall judgment

**Close, but visually flatter than the mockup.** The IA is right (single feed left, single rail right, properties stacked, composer at the bottom of the feed, Tasks tile at the bottom of the rail). What's missing is the *rhythm*: the mockup is denser, tighter, and lets the description breathe before the structured blocks; ours is taller, has more boxed sections, and runs the rail through a separate header band. Nothing is structurally wrong — but it reads as "Linear-shaped" rather than "Linear-feel."

## 2. Top 10 design gaps (ordered by product impact)

1. **Rail header band is wrong.** `IssueDetailRail.tsx:16-20` renders a 40px `border-b` "PROPERTIES" header bar. The mockup treats it as a tiny 10.5px uppercase caption flush with the first row — no separator, no horizontal rule. The current implementation creates a second topbar visually competing with the page topbar, which breaks the impression that the rail is the *quiet* side of the page.

2. **Property row label width and density.** Mockup is `92px` label column with `5px 8px` row padding and `minHeight: 28`. We use `w-20` (80px) with `py-2` (≈32px tall) at `IssuePropertiesBlock.tsx:18`. Result: the rail looks *taller and looser* than Linear-class. Compounded by uppercase tracking on every label — the mockup keeps property labels lowercase (`Status`, `Priority`) and lets typography do the de-emphasis through color, not letter-spacing.

3. **Activity stream uses heavy timeline rail instead of inline events.** `ActivityNode.tsx:60-67` gives every node a disc + a vertical connector line. The mockup ships *two distinct types*: full `Comment` cards (avatar + bordered card) **and** lightweight `TimelineEvent` rows (small circle, single line of text, no body). Treating status changes / PR links / launches as comment-sized cards is the single biggest reason the feed feels noisy and the page feels long.

4. **Composer is wrong shape and disabled.** Mockup composer is short (~56px text area), has an author avatar + "Leave a comment…" header row, has icon buttons (link / doc / terminal) and ⌘↵ on the right. Ours at `IssueReplyComposer.tsx:6-33` is a 3-row textarea, disabled, with "Attach" + "Send" only and the placeholder "Issue replies will land here in a follow-up." That last string is the most obviously-prototype thing on the page. If the feature can't ship, the composer should still *render* as the mockup shows (avatar + greyed prompt) without the apology text — currently it reads as scaffolding.

5. **Sub-issues panel overrelies on full list-row affordances.** `ChildIssues.tsx:53-57` reuses the heavyweight `IssueRow` from the list view. The mockup uses a compact 30px `SubIssueRow` (priority icon, status icon, mono ID, title, optional avatar — that's it). Reusing the full row imports list-only chrome (project pills, label pills, run badges) into a context where the eye needs a quick scan, not the whole record.

6. **Description has no `maxWidth` constraint.** Mockup pins description to `maxWidth: 720` with `lineHeight: 1.65`. We have `max-w-[670px]` on the column wrapper at `IssueDetail.tsx:131`, which is fine, but with `lg:ml-[52px]` and `px-6` the description ends up offset from where the mockup wants it (centered/left-padded under the topbar with the title above it). The asymmetric `ml-[52px]` is the source of a subtle "off-axis" feeling.

7. **Tasks tile button label/state mismatch.** `ExecutionStatusCard.tsx:43-53` shows the "Launch task" CTA inside the tile as a *secondary outline* even when there are no tasks — but flips it to primary-accent solid when `view` is null. Mockup is the opposite: when no run exists, the tile shows "Launch task" as primary (it is the only thing to do); when a run exists, "Launch another" is secondary. We have this backwards in the code path — the `border-transparent bg-accent text-white` branch is only hit when `view` is null, which is correct, but `view` is set whenever there's *any* launch task, including completed/failed, so a finished task makes the CTA secondary even though the issue is effectively idle.

8. **Header "Copy ID" is a button next to the pill instead of a hint.** `IssueDetail.tsx:60-89` renders `[ISS-216] [Copy ID]` as two clickable surfaces in the sub line. Mockup draws this as one quiet group: the mono identifier, then a small `copy` glyph + the words "Copy ID" with no button affordance until hover. As-built it reads as two separate controls.

9. **Right-side topbar actions are too few/too loud.** Mockup right cluster is `Subscribe (star) / copy / more / | / Launch task`. Ours is `Refresh / | / Launch task…` — the **Refresh** button is operator-friendly but wasn't in the mockup vocabulary, and missing Subscribe/copy/more makes the topbar feel under-furnished compared to Linear. Also, "Launch task…" with the ellipsis + arrow-right + zap = three glyphs on one button; mockup is one glyph (zap) + label.

10. **`Active run` pill in the subline is duplicate of the Tasks tile.** When a run is running, both the topbar sub and the rail Tasks tile communicate the same fact. Mockup keeps the topbar quiet and lets the Tasks tile carry that signal. The pulsing pill at the top *and* the pulsing dot in the rail produces two attention-grabbers competing on the same screen, which is the single thing Linear/Multica avoid hardest.

## 3. What matters most for Linear/Multica feel

In order:

- **Vertical rhythm.** Reduce row heights in the rail (28px target), tighten property label column, drop the separator under "Properties." That alone removes ~80px of dead air.
- **Two-class activity feed.** Comments are cards; everything else (status changes, PR links, run launches, agent posts) is a thin one-line event with a small inline icon. Don't give them all the same disc treatment.
- **Composer as a real visual object, not a disabled scaffold.** Even if reply send is unimplemented, the shape needs to match the mockup: avatar + prompt + thin toolbar + ⌘↵ hint + Comment button. Remove "will land here in a follow-up."
- **One source of "live" signaling.** Either the rail's Tasks tile carries the pulse or the topbar pill does, never both.
- **Property labels in sentence case, color-only de-emphasis.** Drop the uppercase tracking on `Status`, `Priority`, etc. — uppercase on every label is what makes us look like a generic admin panel instead of Linear.

## 4. What to ignore as data/story mismatch

- Specific copy in the mockup ("Checkout 500s spike after stripe-rust 0.18 bump", "PR #1483", "fix-bot", "Léa M"). That's prop fodder, not part of the spec.
- Sub-issue completion progress bar position/width — fine in either implementation.
- Exact font sizes 12.5 vs 13 — we hit the spirit; pixel-level matching here is not the bottleneck.
- Mockup's hard-coded "May 28 / 3h ago" dates — we feed real `fmtRelativeTime`, that's correct.
- The `agent` badge color in the mockup is `--sk-accent`; mapping that to our amber accent token is fine without further audit.
- The Sentry/GitHub link styling in the description — markdown rendering is good enough.

## 5. Smallest design corrections to make it feel right

These are surgical and high-leverage:

1. **`IssueDetailRail.tsx:16-20`** — delete the `<header>` row entirely; inline a 10.5px uppercase caption inside the scroll container, no border-bottom, no fixed-height topbar.
2. **`IssuePropertiesBlock.tsx:18-24`** — change `w-20` → `w-[92px]`, drop `uppercase tracking-[0.12em]`, change `py-2` → `py-[5px]`, lowercase the labels in JSX (`"Status"` not implicit uppercase from CSS).
3. **`ActivityNode.tsx`** — keep current shape for `kind === 'user'` (comment), but for `flag` / `pr` / `commit` / `system` switch to a one-line variant: small 12px icon in a 22-24px circle, single line "**Who** {text} · time", no `pb-5` (use `pb-2`), no large body padding. The `connect` line can stay but should not run between comment-and-event with the same spacing.
4. **`IssueFeed.tsx:104-112`** — the "Needs your decision" node should not be a flag-disc activity row; promote it to a callout sitting *above* the activity header, not in the timeline.
5. **`IssueReplyComposer.tsx:6-33`** — remove "Issue replies will land here in a follow-up." Replace with an avatar + "Leave a comment…" header row, shorter textarea, ⌘↵ hint on right of toolbar. Keep `disabled` if backend isn't wired, but make it look like the mockup, not a TODO.
6. **`ChildIssues.tsx:54-57`** — replace `<IssueRow>` with a thin 30px row component (PriorityIcon · StatusIcon · mono ID · truncated title · avatar). Sub-issues should look noticeably lighter than top-level issue rows.
7. **`IssueDetail.tsx:75-85`** — remove the `Active run` pill from the topbar subline; rely on the rail Tasks tile alone for live state.
8. **`IssueDetail.tsx:91-117`** — move `Refresh` into a `more` menu; bring `Subscribe / copy / more` ghost buttons in front of the divider to match the mockup's right cluster density.
9. **`ExecutionStatusCard.tsx:42-53`** — gate the primary-vs-secondary CTA on `activeRun`, not on `view`. Finished/failed runs should still show "Launch task" as primary.
10. **`IssueDetail.tsx:131`** — drop `lg:ml-[52px]`. The main column should center under the topbar, not be offset.

None of these are redesigns. Each one moves a single token, swaps one component variant, or deletes one visual element. The cumulative effect is what closes the gap between "Linear-shaped" and "Linear-feel."
