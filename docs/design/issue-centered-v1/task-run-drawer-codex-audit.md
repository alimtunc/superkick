# Task / Run / Drawer Codex Audit

Audit date: 2026-05-24

Scope:

- `/tasks/:id`
- `/runs/:id`
- Issue Detail execution drawer only

Read first:

- `docs/design/issue-centered-v1/README.md`
- `docs/design/issue-centered-v1/artifacts/task-and-run-rework.html`
- `docs/design/issue-centered-v1/artifacts/issue-detail-with-execution-log.html`
- `docs/design/issue-centered-v1/visual-parity.md`
- `ui/visual-parity/manifest.mjs`

Guardrails applied:

- Task and Run pages remain secondary deep links.
- Issue Detail remains the primary workflow surface.
- `issue-detail-with-execution-log.html` is drawer reference only, not the Issue Detail page baseline.
- Do not reintroduce Tasks/Runs into the primary sidebar.
- Do not fake runtime data, costs, PRs, terminal output, tool calls, or command history.

Verification notes:

- `ui/src/shell/Sidebar.tsx` still excludes Tasks/Runs from primary navigation. No sidebar regression found.
- `ui/src/components/ui/side-drawer.tsx` already maps `compact` to `w-[640px] max-w-full` and includes a backdrop, so the drawer shell width/overlay is broadly aligned with the drawer reference.
- A focused `just visual-parity --states task-running,task-needs-human,task-done,run-running,run-needs-human,run-done,drawer-activity,drawer-tools,drawer-files,drawer-logs,drawer-terminal,drawer-done` run failed before producing artifacts. The harness timed out waiting for `getByText('Execution')` on drawer states. See P2-3.

## Priority Summary

P0: none found.

P1 findings:

- P1-1: Tools tabs are not real tool-call surfaces.
- P1-2: Logs tabs do not consistently show raw stdout/stderr; Task logs label summaries as raw logs.
- P1-3: Files diff preview is not wired even though the backend diff endpoint exists.
- P1-4: Issue Detail execution history is collapsed to one task/run and several issue-surface run actions navigate to `/runs/:id`.
- P1-5: Terminal takeover run events are emitted by the backend but missing from the UI event contract.

P2 findings:

- P2-1: Structured activity parity depends on fixture-only `payload_json.activity_kind`.
- P2-2: Drawer Terminal tab reuses the full takeover control instead of a compact shell surface.
- P2-3: Drawer visual-parity states wait for Issue Detail page text from the drawer artifact.
- P2-4: Task Now panel invents `model = default` when the model is unknown.

## Findings

### P1-1 — Tools Tabs Are Not Real Tool Calls

Mockup expectation:

The drawer `Tools` artboard is for actual tool calls: expandable rows, copiable inputs/outputs, and the real invocation/result timeline. The Task Cockpit reference also calls out "tools called" as part of the operator's execution context.

Current app behavior:

- Run Detail and the execution drawer both use `ui/src/components/run-detail/RunWorkspaceTabs/ToolsTab.tsx`.
- `ToolsTab` filters run ledger events, not tool calls. It includes most non-attention ledger events through `events.filter(isLedgerEvent).filter(isToolEvent)`, so session lifecycle, step transitions, handoffs, budget events, and errors can appear under "Tools".
- The empty state says "No tool calls yet", but the populated state is a ledger list, not tool-call input/output rows.
- Task Cockpit `Tool calls` maps `LaunchTaskStep` rows in `ui/src/components/task-cockpit/TaskCockpitTabPanel.tsx`; steps are not tool calls.
- Real provider tool data already exists in the conversation contract: `tool_use` and `tool_result` in `ui/src/types/conversations.ts`, with run-scoped conversation lookup in `ui/src/api/conversations.ts`.

Likely files to patch:

- `ui/src/components/run-detail/RunWorkspaceTabs/ToolsTab.tsx`
- `ui/src/components/task-cockpit/TaskCockpitTabPanel.tsx`
- `ui/src/api/conversations.ts`
- `ui/src/types/conversations.ts`
- `ui/src/hooks/useTurnStream.ts` or a new run-scoped tool-call projection hook
- Potential backend aggregation if the UI needs a single run-level tool-call endpoint instead of stitching conversations client-side

Data-driven vs real defect:

Both. There is a data-contract gap at the run surface, but the current UI also mislabels non-tool data as tool calls. This should become a ticket. Do not fill this with fixture events or synthetic tool rows.

### P1-2 — Logs Are Not Raw Runtime Output

Mockup expectation:

The drawer `Logs` artboard is raw stdout/stderr. Task/Run log tabs should expose real runtime evidence, not summaries, generated prose, or reconstructed command history.

Current app behavior:

- Run Detail and drawer `LogsTab` only renders `RunEvent` kinds `agent_output` and `command_output`.
- That captures some real command/agent messages, but it is not the same as the primary PTY transcript. Real terminal history is available separately through `GET /runs/{id}/terminal-history` in `ui/src/api/terminal.ts`.
- Task Cockpit `Raw logs` filters launch task steps with summaries or failure classifications, then renders `structured_result.summary`, `step.summary`, or serialized failure classification in a `<pre>`. That is not raw output.

Likely files to patch:

- `ui/src/components/run-tabs/LogsTab.tsx`
- `ui/src/components/task-cockpit/TaskCockpitTabPanel.tsx`
- `ui/src/api/terminal.ts`
- `ui/src/components/run-detail/PtyTerminal.tsx`
- `crates/superkick-api/src/handlers/terminal.rs`
- `crates/superkick-storage/src/sqlite/transcripts.rs`

Data-driven vs real defect:

Task Cockpit is a real UI defect because it labels summaries as raw logs. Run/drawer logs are a data-surface mismatch: some output is real, but the tab does not meet the raw stdout/stderr expectation. This should become a ticket. Until real logs are wired, prefer honest empty or "open terminal history" states over pseudo-log summaries.

### P1-3 — Files Tab Does Not Use the Existing Run Diff Endpoint

Mockup expectation:

The drawer `Files` artboard expects a diff preview. Run Detail's simplified inspector should expose changed files/diffs without requiring the operator to leave for GitHub.

Current app behavior:

- `ChangesTab` shows a PR link when a PR exists.
- It explicitly renders the placeholder: "Detailed file-level diffs land here once the changes endpoint is wired."
- The backend already exposes `GET /runs/{id}/diff` in `crates/superkick-api/src/lib.rs`, implemented by `get_run_diff` in `crates/superkick-api/src/handlers/runs.rs`.
- `ui/src/api/runs.ts` has no `fetchRunDiff`, and `ui/src/lib/queries.ts` has no query for run diffs.
- Task Cockpit only lists `structured_result.changed_files` filenames; it does not show a diff preview. That can be acceptable for Task Cockpit if Run/drawer own the diff preview.

Likely files to patch:

- `ui/src/api/runs.ts`
- `ui/src/types/runs.ts`
- `ui/src/lib/queryKeys.ts`
- `ui/src/lib/queries.ts`
- `ui/src/components/run-detail/RunWorkspaceTabs/ChangesTab.tsx`
- Optional shared diff renderer under `ui/src/components/run-detail/`

Data-driven vs real defect:

Real UI wiring defect. The backend data exists. This should become a ticket.

### P1-4 — Issue Detail Execution Surface Is Too Single-Row and Still Routes Away for Primary Actions

Mockup expectation:

Issue Detail remains the primary workflow surface. The compact run drawer is the issue-surface debug/detail overlay. Past runs are collapsed by default, not absent. `/tasks/:id` and `/runs/:id` remain secondary deep links.

Current app behavior:

- `useIssueLaunchTasks` fetches all issue tasks but picks a single display task.
- `ExecutionStatusCard` then sets `taskCount = view ? 1 : 0`, labels the section "History", and renders only one row.
- The card's "Open run" button correctly opens the drawer for the active/latest run.
- Other Issue Detail affordances still navigate away to `/runs/:id`: the topbar `Active run` pill in `IssueDetail.tsx`, `NeedsHumanBody` in `IssueFeed.tsx`, and terminal run rows in `IssueFeed.tsx`.
- This makes the issue page partly primary and partly a handoff to the secondary run route, which is especially risky for waiting-human decisions.

Likely files to patch:

- `ui/src/hooks/useIssueLaunchTasks.ts`
- `ui/src/components/issue-detail/ExecutionStatusCard.tsx`
- `ui/src/components/issue-detail/IssueDetail.tsx`
- `ui/src/components/issue-detail/IssueFeed.tsx`
- `ui/src/stores/runDrawer.ts`

Data-driven vs real defect:

Real navigation/workflow defect with an intentional V1 shortcut behind it. The backend already returns multiple tasks/runs. This should become a ticket: render collapsed real history on Issue Detail and make issue-surface primary run actions open the drawer, while preserving explicit deep-link affordances for `/tasks/:id` and `/runs/:id`.

### P1-5 — Terminal Takeover Events Are Missing From the UI Contract

Mockup expectation:

The drawer Activity/Terminal surfaces should preserve the real execution audit trail. Terminal takeover is a high-impact operator action and should be visible as real run activity.

Current app behavior:

- Backend `EventKind` includes `TerminalTakeoverOpened` and `TerminalTakeoverClosed`.
- Runtime emits those events from `crates/superkick-runtime/src/terminal_takeover.rs`.
- Frontend `EventKind` in `ui/src/types/events.ts` does not include `terminal_takeover_opened` or `terminal_takeover_closed`.
- `LEDGER_KINDS` in `ui/src/lib/domain/ledger.ts` also omits those kinds, so even if the events arrive over SSE they do not render in Activity/Tools.
- `TerminalTakeover.tsx` user copy says force takeover writes a `TerminalTakeoverOpened` event, but the drawer/run ledger will not show it.

Likely files to patch:

- `ui/src/types/events.ts`
- `ui/src/lib/domain/ledger.ts`
- `ui/src/lib/workspaceEvents.invalidation.ts`
- `ui/src/components/run-detail/LedgerList.tsx`
- Tests around event typing and ledger rendering

Data-driven vs real defect:

Real frontend/backend contract drift. This should become a ticket because it hides real operator actions; it should not be solved by adding fake local rows.

### P2-1 — Structured Activity Depends on Fixture-Only Payloads

Mockup expectation:

Task/Run Activity artboards show rich, scan-friendly execution rows: spec/search/test/write/diff/summary with compact status and snippets.

Current app behavior:

- `ActivityTab` and `TaskCockpitTimeline` switch into `StructuredActivityList` only when a run event payload has `activity_kind`.
- `ui/visual-parity/fixtures.mjs` injects `activity_kind` payloads for parity states.
- The normal backend `RunEvent` contract does not define `activity_kind`; real emitters mostly produce ledger events, command output, attention, sessions, and handoffs.
- Production therefore falls back to `LedgerList`, while parity fixtures can make the UI appear closer to the artifact than real data will.

Likely files to patch:

- `ui/src/components/run-tabs/structuredActivity.ts`
- `ui/src/components/run-tabs/StructuredActivityList.tsx`
- `ui/src/components/run-tabs/ActivityTab.tsx`
- Backend event emission in `crates/superkick-runtime/src/step_engine/` or a new projection endpoint
- `ui/visual-parity/fixtures.mjs` once the production contract is real

Data-driven vs real defect:

Data-contract gap, not a fake production-data defect yet because production falls back honestly. Ticket only if structured activity remains a required parity target. Otherwise, document the fallback as an acceptable mismatch.

### P2-2 — Drawer Terminal Reuses Full Takeover UI

Mockup expectation:

The drawer `Terminal` artboard is a compact sandbox shell/debug tab inside a 640px overlay.

Current app behavior:

- Drawer Terminal uses `ShellTab`, which renders the full `TerminalTakeover` control.
- `TerminalTakeover` starts as a collapsed "Direct terminal access" accordion and includes mode descriptions, takeover mode selection, force takeover confirmation, active takeover management, and the run-primary PTY.
- The data is real, but the control is heavier than the drawer reference and can put destructive force-takeover controls inside a compact debug drawer.

Likely files to patch:

- `ui/src/components/issue-detail/run-drawer/RunDrawerContent.tsx`
- `ui/src/components/run-detail/RunWorkspaceTabs/ShellTab.tsx`
- `ui/src/components/run-detail/TerminalTakeover.tsx`
- Potential new `DrawerTerminalTab` that defaults to read-only history and gates takeover actions clearly

Data-driven vs real defect:

Real UI fit/safety defect, not a data problem. This should become a smaller follow-up ticket after the P1 data surfaces are fixed.

### P2-3 — Drawer Visual-Parity Manifest Uses Page Text From a Drawer-Only Artifact

Mockup expectation:

Drawer parity should use `issue-detail-with-execution-log.html` for drawer anatomy only. It should not force the production Issue Detail page to adopt that artifact's full-page labels.

Current app behavior:

- `ui/visual-parity/manifest.mjs` drawer states use `waitForText: 'Execution'`.
- Current Issue Detail rail renders the card heading as `Tasks`, inside a `Properties` rail.
- A focused drawer parity run timed out waiting for `Execution` before it could open/capture the drawer.
- Because the execution-log artifact is explicitly not the Issue Detail baseline, adding page text just for this wait condition would be the wrong fix.

Likely files to patch:

- `ui/visual-parity/manifest.mjs`
- `ui/visual-parity/capture.mjs`
- Optional stable test id on the actual drawer trigger, if the capture action needs a better target

Data-driven vs real defect:

Visual-parity harness defect / acceptable app mismatch. This should become a harness ticket, not an app UI ticket.

### P2-4 — Task Now Panel Invents a Default Model

Mockup expectation:

The Now panel should answer which agent/model is working, using real runtime data only.

Current app behavior:

- `TaskCockpitNowPanel` renders `model` as `currentStep?.model ?? 'default'`.
- If no model is attached, `default` is not a measured provider/model value. This violates the "do not fake runtime data" rule.
- Neighboring fields already use honest absence labels like `not attached`, `not assigned`, and `not set`.

Likely files to patch:

- `ui/src/components/task-cockpit/TaskCockpitNowPanel.tsx`

Data-driven vs real defect:

Real small UI defect. This should become a small cleanup ticket or be bundled into the next Task Cockpit parity ticket.

## Acceptable Mismatches / Do Not Ticket

- No Tasks/Runs in primary sidebar: current `Sidebar` is compliant. Root titles for `/tasks` and `/runs` with `active: null` are acceptable because deep links remain reachable.
- Drawer shell width/backdrop: `SideDrawer` compact width is 640px and uses a backdrop. Do not spend a ticket on the shell unless visual QA finds a concrete spacing issue inside the drawer content.
- Run Detail parent banner says "Decisions for this run live on its issue." This differs from older task/run artifact copy that nudged decisions back to the Task page, but it matches the issue-centered workflow constraint.
- Budget/cost display is acceptable: `RunBudgetCard` shows duration/retry budget from real data and renders tokens as `n/a` when aggregation is not wired. It does not fake costs.
- Visual-parity fixtures may contain fake PRs, commands, terminal snippets, and `activity_kind` payloads as deterministic test fixtures. That is acceptable as long as production UI does not depend on fixture-only data for real operator claims.
- Task Cockpit tab order is not a defect by itself. The README fixes tab order only for the execution drawer. Do not churn Task tab order unless Design explicitly scopes it.
