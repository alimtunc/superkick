# Superkick — orchestrator handoff

You are the orchestrator. Your job is to deliver the Superkick redesign by routing work to coding subagents and verifying their output against the design canvas + spec.

## What you have

Two source-of-truth artifacts:

1. **`Superkick design system.html`** — the design canvas. Open it in a browser to see every screen at real size. Each artboard is labeled (e.g. `Inbox · default`, `Run Detail · needs human`). The canvas is the visual contract.
2. **`SUPERKICK_HANDOFF.md`** — the implementation spec. Tokens, primitive APIs, per-screen file map, ticket dependencies, layout density rules, what never appears.

Treat the design canvas as a screenshot reference. Treat the markdown as the rulebook.

## Source code conventions you must follow

- All design tokens come from `SUPERKICK_HANDOFF.md` §1.1. **No raw hex in screen code.** Reject any subagent PR that introduces a hex outside `tokens.css`.
- All primitives are in `src/ui/` (Pill, Btn, Icon, Avatar, Kbd, Dot, Spark). **No ad-hoc inline SVG icons in screen code.** Use the Icon component, add to the bank if missing.
- Screen components mirror the canvas file names: `SK<Surface>` → `src/screens/<Surface>.tsx`.
- Tabs, banners, modals, drawers all follow the patterns in §10 and §12 of the markdown. Reject ad-hoc layouts.

## Ticket order — strict dependency chain

1. **SUP-217** — Tokens + primitives + shell. **Blocks everything.**
2. **SUP-218** — Inbox (replaces dashboard).
3. **SUP-219** — Launch composer at `/tasks/new`. Wire every "Launch task" CTA to it. Kill the dual launcher.
4. **SUP-220** — Launch feed evidence cards.
5. **SUP-221** — Issue Detail recompose (single column).
6. **SUP-222** — Run Detail two-pane.
7. **SUP-223** — Light mode (pure token work).

Do not parallelise tickets that share files unless you have explicit conflict resolution. SUP-217 must merge before any other ticket opens.

## How to route work

For each ticket:

1. **Spin a coding subagent** with this prompt template:
   > Implement <TICKET>. The canonical design is in `Superkick design system.html`, artboard(s) `<list>`. The spec is in `SUPERKICK_HANDOFF.md` §<N>. Touch only the files listed in that section. Do not introduce new tokens or primitives. Open PR against `main`.

2. **Give the subagent both files** plus the relevant repo subtree (the section in §1–§10 of the markdown tells you which).

3. **Verify before merge:**
   - Pixel diff a screenshot of the implemented screen against the canvas artboard. Tolerate ±4px on layout, zero tolerance on color/type tokens.
   - Run a grep for raw hex codes in the changed files. Should return zero matches outside `tokens.css`.
   - Run a grep for inline `<svg>` in changed screen files. Should return zero matches.
   - Check the acceptance criteria in the audit doc (`Superkick redesign audit.html`) section for that ticket.

4. **Block merge on any of:** new tokens introduced, new primitive component invented, raw hex outside tokens.css, inline SVG icons, layout density off (see §12).

## Decisions that need a human

Surface these to the user before having a subagent implement them. Do not let a subagent guess:

- Workspace switcher dropdown UX (canvas only shows the trigger).
- Agent detail page (canvas shows the list only).
- New-agent authoring flow (out of scope).
- Empty states beyond Inbox-zero (canvas doesn't cover every empty state — get them designed before the relevant ticket lands).
- Error states (network down, sandbox unavailable, rate limited, billing exhausted).
- Mobile / responsive < 1024px — out of scope per §14, but flag if any subagent touches a viewport query.

## Out of scope — refuse if asked

- Marketing surfaces (landing, pricing, public docs). Different design system entirely.
- Billing, plan management, team admin UI.
- Public share links for runs.
- Anything in `Superkick redesign audit.html` that is not in tickets SUP-217 to SUP-223.

## Reporting back to the user

After each ticket merges, post:

- Link to the merged PR
- Screenshot of the implemented screen next to its canvas artboard
- The next ticket you're starting and your ETA
- Any decision from the "needs a human" list above that is now blocking

If a subagent gets stuck for more than one retry on the same step, escalate to the user with: ticket id, what's stuck, what you've tried, what you propose.

## When all 7 tickets are done

Open a follow-up design round with the user covering: agent detail, empty states sweep, error states sweep, motion spec. Don't pick those up unilaterally — they need product decisions.
