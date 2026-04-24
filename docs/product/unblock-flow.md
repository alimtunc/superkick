# Unblock flow — Linear blocker-driven launch routing (SUP-81)

## Why this document

Superkick already knew how to suspend work **between runs** (session handoffs,
`OwnershipResumed`). What it did *not* know how to do was gate work by
**Linear issue blockers**. A ticket whose Linear `blocks` relation was not
resolved sat silently in the launch queue — the operator had to remember that
SUP-81 depended on SUP-77, notice when SUP-77 shipped, and re-triage SUP-81
manually.

This doc pins the vocabulary, signals, surfaces, and routing policy of the
new issue-level unblock flow so the next orchestration ticket
(scheduler-driven dispatch) can build on a stable product model.

## Scope

- **In scope:** Linear `blocks` relations between issues, their persistence,
  how they gate the launch queue, and how the UI shows "why not launchable"
  and "just became launchable". Also: the corollary cleanup — stop treating
  a non-terminal Linear *parent* as a blocker (hierarchy ≠ dependency), and
  route a terminal Linear issue to `Done` instead of `Blocked`.
- **Out of scope:** run-to-run handoff suspension — the existing
  `SuspendReason::PendingHandoff` / `OwnershipResumed` path is untouched. A
  downstream issue whose Superkick run is parked on a handoff continues to
  resume through the run-level mechanism. SUP-81 targets the level above:
  Linear issue relations.

## Cascade reshape (correction vs. SUP-80)

SUP-80 shipped a first cut of the launch-queue classifier that conflated
two distinct Linear signals:

1. **Parent/child** — hierarchical grouping (epic → feature → task).
2. **`blocks`/`blocked by`** — declared inter-issue dependency.

SUP-80's cascade used (1) as a proxy for (2): any child whose parent was
not yet `completed`/`canceled` landed in `Blocked`. With a real blocker
signal now in place (SUP-81), that proxy rule is retired:

| Before (SUP-80) | After (SUP-81) |
|---|---|
| Parent not terminal → `Blocked` with "parent X not completed" | Removed. Sub-issues route on their own merits. |
| Terminal issue with non-terminal parent → `Blocked` | Terminal issue → `Done`. |
| Linear `blocks` relation → not tracked | Non-terminal blocker → `Blocked` with "blocked by Y (state)". |
| Non-trigger Linear state (`backlog` / `unstarted`) → `Blocked` with "trigger requires ..." | Split: `state.type == "backlog"` → `Backlog` bucket; everything else non-trigger non-terminal → `Todo` bucket. |
| Parent has active Superkick run → `Blocked` | Unchanged — concurrency guardrail. |

Rule of thumb: `Blocked` now means *really* blocked (explicit Linear
`blocks` relation or parent-run concurrency), not "sitting inside a
hierarchy that isn't done yet" and not "hasn't been started in Linear".
The launch-queue carries **9 columns** in the order: **Backlog → Todo →
Launchable → Waiting → Blocked → Active → NeedsHuman → InPr → Done**,
matching Linear's workflow reading order on the left and Superkick's run
lifecycle on the right. `Waiting` collapses what used to be two distinct
columns (`WaitingCapacity` + `WaitingApproval`) into one — the gate
matters less to the operator than "can't dispatch right now"; the
card-level `reason` string carries the cause.

### Visible vs. hidden columns

Only **Backlog**, **Todo**, and **Launchable** are pinned visible at all
times — they are the intake anchors the operator must always see, even
when empty. Every other column collapses out of the kanban when its
group is empty, so the visible width adapts to how much of the workflow
is actually in flight. The model still owns 9 buckets server-side; the
UI just hides columns with nothing to show.

### Within-column ordering

Items inside every column are sorted by Linear priority ascending (`1`
Urgent first, `4` Low last, `0` "no priority set" parked at the end),
then by `updated_at` descending. Runs sit after issues within mixed
buckets (Active, Done) since they don't carry a Linear priority signal.

The `Launchable` column surfaces this order explicitly: each card carries
a `#1`, `#2`, … position badge so the operator reads the dispatch queue
top-to-bottom without having to count cards.

## Semantics

| Term | Meaning |
|---|---|
| **Blocker** | A Linear issue with an outgoing `blocks` relation to this issue. Read from `Issue.inverseRelations` where `type == "blocks"`. |
| **Downstream** | The issue being blocked. |
| **Terminal blocker state** | Linear `state.type` ∈ { `completed`, `canceled` }. Mirrors the parent-terminal rule already used by the launch queue (SUP-80). |
| **Blocked by unknown** | A blocker outside the fetched workspace slice (different team, archived). State type recorded as `unknown`; the classifier keeps the issue `Blocked` and surfaces "unknown state" in the reason so the operator arbitrates. |
| **DependencyResolved** | Workspace-bus event emitted once when a blocker transitions from non-terminal to terminal. Ephemeral: persistence is the `issue_blockers` snapshot, not an event log. |

## Signal path

```
Linear GraphQL  →  superkick-integrations::linear::LinearClient
                     (ISSUES_QUERY / ISSUE_DETAIL_QUERY now include
                      inverseRelations { type, issue { … } })
      │
      ▼
LinearIssueListItem.blocked_by : Vec<IssueBlockerRef>
      │
      ▼
superkick-api::handlers::launch_queue::blockers::reconcile_blockers
      │   - list_all() → old snapshot
      │   - detect_transitions(old, fresh)
      │   - replace_for_downstream(fresh)
      │   - publish(DependencyResolved) per terminal transition
      ▼
WorkspaceEventBus (SUP-84 substrate)
      │
      ├──► classifier input: QueueIssueInput.blockers
      │       → classify_launch_queue sets bucket = Blocked with
      │         reason "blocked by SUP-77 (started)"
      │
      └──► SSE feed: frontend shell broker fans out
              { type: "issue_event", kind: "dependency_resolved", … }
              → useLaunchQueue records recentUnblocks[downstream_id]
              → invalidates launchQueue query
```

Trigger cadence: the launch-queue HTTP handler is the poll. Every operator
refresh (or SSE-driven query invalidation) runs the full reconcile →
classify pipeline. There is no separate scheduler tick today; introducing one
later only needs to call the same reconcile function.

## Storage model

Table `issue_blockers` (migration `013_issue_blockers.sql`):

| Column | Type | Notes |
|---|---|---|
| `downstream_issue_id` | TEXT | Linear UUID of the blocked issue. |
| `blocker_issue_id` | TEXT | Linear UUID of the blocker. |
| `blocker_identifier` | TEXT | E.g. `SUP-77`. Denormalised for queue rendering. |
| `blocker_title` | TEXT | Denormalised for queue rendering. |
| `blocker_state_type` | TEXT | `backlog` / `unstarted` / `started` / `completed` / `canceled` / `unknown`. |
| `recorded_at` | TEXT | RFC3339 wall-clock of last reconcile. |

Primary key `(downstream_issue_id, blocker_issue_id)`. Indexed on each column
individually.

Re-polling replaces rows per downstream wholesale (`replace_for_downstream`).
Diffing happens before the replace: the caller loads the pre-replace state,
detects transitions, then overwrites.

## Surfaces

### Launch queue (intake view)

- **Blocked column.** Cards carry the classifier reason (e.g. "blocked by
  SUP-77 (started)") and an inline chip list of every live blocker with its
  identifier and state name.
- **Recently unblocked.** When a `DependencyResolved` event arrives on the
  session bus, the downstream issue carries an "Unblocked" badge in the
  `Launchable` column for 24 hours. The badge is session-local: refreshing
  the page drops it. The authoritative trail lives on the event feed and the
  `issue_blockers.recorded_at` timestamp.

### Attention requests

Not used. An operator-initiated re-prioritisation that *does* merit an
attention request (e.g. "bump SUP-81 past SUP-90 after unblock") is left to a
later ticket. SUP-81 draws the line: the queue handles routing, attention
handles operator decisions.

## Routing policy

1. **Default: back to `Launchable` on next pulse.** No auto-dispatch, no
   implicit run spawn. The operator presses **Dispatch** on the card as
   before. Rationale: the scope of SUP-81 was intake classification — actual
   orchestration belongs to the scheduler ticket that will consume this feed.
2. **No double-surface.** An issue whose Superkick run is already parked on a
   handoff keeps resuming through `OwnershipResumed`. The two flows target
   different layers (issue vs. run) and do not overlap.
3. **Unknown blockers stay blocked.** A `blocker_state_type == "unknown"`
   keeps the card gated; the operator can override by promoting the issue
   manually once they've vetted the blocker externally.

## Audit trail

- **Machine-readable:** `issue_blockers` table + `DependencyResolved`
  events on the workspace bus. Events are ephemeral; the snapshot table is
  the durable audit state.
- **Operator-readable:** the reason string on Blocked cards always names the
  blocker identifier and state, so a screenshot tells the whole story.

## Glossary map

| Old term | New term | Why |
|---|---|---|
| "Run suspended" | unchanged | Run-level, handoff-driven — still the right name for that layer. |
| "Blocked" (launch-queue bucket) | unchanged | Broader than blockers: now covers parent-not-done OR blocker-not-done OR non-trigger state. The reason string distinguishes. |
| "Attention request" | unchanged | Explicit operator arbitration ask. Not what blocker resolution is. |
| (new) "Dependency resolved" | Terminal transition of a Linear `blocks` relation. Event kind on the workspace bus. |
| (new) "Recent unblock window" | 24 h, session-local. UI affordance, not server state. |

## Non-goals for SUP-81

- Auto-dispatch on unblock.
- Cross-team blocker resolution (relies on Linear access).
- Bubbling blocker state through parent/child chains. Parent/child is
  hierarchy; the `blocks` relation is the only dependency signal.
- Persisting the "recently unblocked" flag on the server. The bus + snapshot
  already constitute the audit trail; any persistent highlight belongs to a
  future UX ticket that opts in explicitly.
