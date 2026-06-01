# Superkick — Full-Repo Architecture & Quality Audit

**Date:** 2026-05-30 · **Scope:** entire repository (7 Rust crates ≈ 55.8k LOC + React 19 UI ≈ 40k LOC, 1035 tracked files) · **Branch:** `main` (read-only — no changes applied)

> Bar for this review: not "does it work" (it does) but **best-in-class architecture** — clean, optimized, SOC, DRY — judged intransigently against `CLAUDE.md`, `docs/conventions/{rust,frontend,testing}.md`, and the Turkit pre-commit / React review rubrics.

---

## Executive verdict

**The codebase is in genuinely good health.** The expensive-to-retrofit correctness rules are well respected across the board: no `.unwrap()`/`panic!` in production paths, disciplined `.context()` error propagation, `thiserror` in domain / `anyhow` at the edge, real-SQLite integration tests (no mocked storage), correct tokio async (`tokio::sync::Mutex` across `.await`, `spawn_blocking` for blocking work, `AbortOnDrop` cancel bridges), no `any` in the UI, and a clean `clippy --all-targets --all-features -D warnings`. The domain state machine (`superkick-core`) is pure, I/O-free, and exhaustively matched. This is a well-built system, not one with pervasive rot.

**The gap to "best-in-class" is concentrated in eight recurring patterns, not scattered noise.** 189 findings stand after verification, but they cluster tightly: **DRY (48)** and **boundary erosion (24)** account for the structural work; the rest is dead code, comments, SOC, and a handful of correctness sharp edges. Two themes carry almost all the architectural risk: **business logic accreting into `superkick-api`** (the #1 issue — the boundary rule the conventions list first) and **dead/speculative public surface**. Both are addressable in well-scoped PRs.

| Severity | Count | Meaning |
|---|---:|---|
| 🔴 **P0** | **8** | Structural violation / dead public surface / business logic in the wrong crate. Each verified first-hand. |
| 🟠 **P1** | **113** | Real must-fix cleanup; behavior-sensitive but not broken today. |
| 🟡 **Suggested** | **68** | Judgment calls / polish. |

Dominant categories: `DRY` 48 · `Boundary` 24 · `Comments` 22 · `DeadCode` 20 · `SOC` 18 · `ErrorHandling` 13 · `Types` 12 · `Complexity` 11.

---

## How this review was run

A defensible verdict needs more than one pass of opinion, so this was structured as a verifiable pipeline:

1. **CI-faithful mechanical baseline** — ran the exact CI gate (`cargo fmt --check`, `cargo clippy --workspace --all-targets --all-features -D warnings`, `oxfmt --check`, `tsc -b && vite build`, `oxlint`) so the human review never re-flags what the linter already owns.
2. **23-shard parallel review (155 agents)** — every crate and every UI area assigned to a reviewer that walked the full rubric on its scope, plus 5 cross-cutting sweeps (Rust module-boundaries, panic/error-handling, repo-wide DRY, testing-conventions, build/perf/hygiene). Coverage is exhaustive — every source file belongs to exactly one area shard.
3. **Per-finding adversarial verification** — every P0/P1 got an independent skeptic (instructed to *refute*) that re-read the code. This dropped **22 false positives** (e.g. a `claude_stream`/`codex_stream` "duplication" that is really two different wire formats).
4. **Balanced re-adjudication (22 agents)** — the skeptic over-corrected and suppressed real issues whenever a reviewer cited "rubric §N" instead of a numbered house rule. A second, balanced pass re-read each dropped finding: **17 reinstated, 3 confirmed as genuine non-issues, 2 kept as minor notes.**
5. **First-hand P0 verification** — I personally read the code behind all 8 P0s before they entered this report.

The "✅ Reviewed and dismissed" section at the end lists what was correctly thrown out — transparency on the filtering, not just the keeps.

---

## Mechanical baseline (authoritative)

| Gate | Result |
|---|---|
| `cargo fmt --all --check` | ✅ clean |
| `cargo clippy --workspace --all-targets --all-features -D warnings` | ✅ **0 warnings** |
| `oxfmt --check` (UI) | ✅ clean |
| `tsc -b && vite build` (UI) | ✅ builds |
| `oxlint` (UI) | ⚠️ **12 warnings** (non-blocking — CI only fails on errors) |

The 12 oxlint warnings are real and several map to rubric-P0s that slip through because they're configured as warnings, not errors:

- **`no-unstable-nested-components` (×6)** — components defined *during render* (React-rubric **P0**): [RunningNowRow.tsx:39](ui/src/components/inbox/RunningNowRow.tsx#L39), [RecentlyDoneRow.tsx:31](ui/src/components/inbox/RecentlyDoneRow.tsx#L31), [ReadyToLaunchRow.tsx:35](ui/src/components/inbox/ReadyToLaunchRow.tsx#L35), [NeedsHumanRow.tsx:40](ui/src/components/inbox/NeedsHumanRow.tsx#L40), [TurnView.tsx:104](ui/src/components/chat/TurnView.tsx#L104), [ToolCallBlock.tsx:24](ui/src/components/chat/ToolCallBlock.tsx#L24).
- **`no-array-index-key` (×4)** — [HistoryEntryBody.tsx:11](ui/src/components/issue-detail/HistoryEntryBody.tsx#L11), [joinWithAnd.tsx:18](ui/src/components/issue-detail/joinWithAnd.tsx#L18), [historyFormat.tsx:113,121](ui/src/components/issue-detail/historyFormat.tsx#L113).
- **`no-object-type-as-default-prop`** — [ContextTab.tsx:22](ui/src/components/run-detail/RunWorkspaceTabs/ContextTab.tsx#L22) (array literal default prop re-created every render).
- **`jsx-a11y/no-noninteractive-element-to-interactive-role`** — [EditableTitle.tsx:68](ui/src/components/issue-detail/properties/EditableTitle.tsx#L68).

> **Recommendation:** promote `no-unstable-nested-components` and `no-array-index-key` to `error` in `.oxlintrc.json` so CI gates them instead of letting them accumulate silently.

**Repo hygiene** is otherwise clean (DBs/`target`/`dist`/`node_modules` correctly gitignored). One optimization signal: the production JS bundle is a **single 1.43 MB chunk** (gzip 410 KB) — Vite itself warns; no code-splitting.

---

## Architectural themes (the synthesis)

These eight themes are where "best possible architecture" actually lives. Fixing the *theme* is higher-leverage than fixing findings one by one.

### Theme 1 — `superkick-api` is accreting business logic · **the #1 architectural risk**
The boundary rule the conventions list first ("`superkick-api` holds no business logic — handlers are thin adapters") is eroding in a consistent, diagnosable way: **there is no runtime application-service layer for the run / PR / queue flows**, so cross-repo orchestration lands in handler files. (`LaunchTask` has one — `LaunchTaskExecutor` — and it is exemplary; `Run` does not, and that asymmetry is the leak.) Evidence forms a cluster: PR-record lifecycle + GitHub sync in [runs.rs:367](crates/superkick-api/src/handlers/runs.rs#L367) (**P0**), the Linear→core snapshot adapter in [issue_context.rs:76](crates/superkick-api/src/handlers/issue_context.rs#L76) (**P0**), the cross-repo triage fan-out in [queue_common.rs:51](crates/superkick-api/src/handlers/queue_common.rs#L51) (P1), the run-creation workflow in [runs.rs:80](crates/superkick-api/src/handlers/runs.rs#L80) (P1), the recovery scheduler loop in [recovery_scheduler.rs:41](crates/superkick-api/src/recovery_scheduler.rs#L41) (P1), and `cancel_run` in [runs.rs:298](crates/superkick-api/src/handlers/runs.rs#L298) (P1).
**Fix:** introduce runtime services — `PullRequestService`, `RunService`, `QueueTriageService` — mirroring `LaunchTaskExecutor`, taking explicit repos/services so they're testable without axum. Handlers shrink to `parse → call → map`. This is the single highest-payoff refactor in the repo; do it as its own PR.

### Theme 2 — Dead & speculative public surface · **fastest wins**
Four of the eight P0s are dead public surface: the entire SUP-79 `Orchestrator` substrate ([orchestrator.rs:47](crates/superkick-runtime/src/orchestrator.rs#L47) — and its reaper holds an `Arc<Self>` self-cycle that would leak forever if ever used), `HandoffService` ([handoff_service.rs:20](crates/superkick-runtime/src/handoff_service.rs#L20)), a dead `list_workflow_states_for_team` whose doc-comment *lies* about callers ([client.rs:723](crates/superkick-integrations/src/linear/client.rs#L723)), plus ~16 more dead UI exports, dead hook return fields, and a dead config alias. The convention is unambiguous: "Delete it; git remembers."
**Fix:** delete now; reintroduce with the caller. Zero-risk, shrinks the surface, ~1 hour of work.

### Theme 3 — DRY: bypassing helpers that already exist · **48 findings, biggest bucket**
This is not random copy-paste — the pattern is a **canonical helper existing but bypassed**, which is both the easiest to fix and the most corrosive (the duplicates drift). Standouts: `ensure_updated` inlined 5× across storage tables; `classify_graphql_errors` bypassed 7× in the Linear client; rfc3339 decode inlined ~28× in storage; `emit_event<RunEventRepo>` duplicated 4× (incl. two byte-identical free fns); the codex/claude adapter process-lifecycle block duplicated ~170 lines ([codex.rs:493](crates/superkick-runtime/src/protocol_adapter/codex.rs#L493) — **P0**); a duplicate `InterventionList` component ([LaunchTaskFeedBody.tsx:96](ui/src/components/launch/LaunchTaskFeedBody.tsx#L96) — **P0**); the UI API layer's fetch/ok/json envelope copy-pasted ~50× across 17 modules; and `subscribeToSse` re-implemented. Plus the design-system bypass (Theme 4).
**Fix:** a focused consolidation pass — make each canonical helper the only path. High LOC-deleted-to-risk ratio.

### Theme 4 — Frontend SOC + React-19 hygiene
Helpers/types/constants colocated in `.tsx` render files; multi-component files; the 6 nested-component definitions above; `key={index}` on dynamic lists; and a recurring **design-system bypass** — `Pill`/`Button`/`EmptyState`/`Switch` hand-rolled with legacy CSS across settings, agents, dashboard, and even shared primitives ([confirm-dialog.tsx:52](ui/src/components/ui/confirm-dialog.tsx#L52), [Toggle.tsx:13](ui/src/ui/Toggle.tsx#L13), [TerminalTakeover.tsx:159](ui/src/components/run-detail/TerminalTakeover.tsx#L159)), which the convention forbids ("never hand-roll interactive UI when a shadcn/base-ui primitive exists").
**Fix:** extract helpers to `lib/`/`types/`, hoist nested components, route every chip/button/empty-state through the shared primitives.

### Theme 5 — Type-safety escape hatches
The `no any` rule holds — but `as Foo` casts launder untyped external values into domain unions: `over.id as IssueState` that can actually throw inside an a11y announcement ([useIssueKanbanDnd.ts:70](ui/src/hooks/useIssueKanbanDnd.ts#L70)), ~20 `as string`/`as number` casts bridging a widened filter union, `as ActivityPayload` over raw JSON ([structuredActivity.ts:20](ui/src/components/run-tabs/structuredActivity.ts#L20)), and a duplicated `AgentIdentity`/`AgentProvider` union ([Avatar.tsx:9](ui/src/ui/Avatar.tsx#L9) — **P0**).
**Fix:** real type guards (`id is IssueState`), zod validation at JSON boundaries, one shared union imported from `@/types`.

### Theme 6 — Error-handling sharp edges · **correctness, small but worth doing early**
A handful that can silently mask real failures: a swallowed git error that defeats the PR divergence guard ([create_pr.rs:115](crates/superkick-runtime/src/step_engine/create_pr.rs#L115)), a swallowed review-swarm persist error ([review_swarm.rs:164](crates/superkick-runtime/src/step_engine/review_swarm.rs#L164)), a bare `unreachable!()` in an API request path ([issues.rs:415](crates/superkick-api/src/handlers/issues.rs#L415)), an `expect()` trusting an external Linear id as an ASCII header ([issues.rs:248](crates/superkick-api/src/handlers/issues.rs#L248)), the `CoreError→AppError` catch-all sending `InvalidTransition` to 500 instead of 409 ([error.rs:135](crates/superkick-api/src/error.rs#L135)), and blocking subprocesses inside async tasks ([step_failure_classifier.rs:71](crates/superkick-runtime/src/step_failure_classifier.rs#L71), and [run_diff.rs:75](crates/superkick-runtime/src/run_diff.rs#L75) spawning up to ~500 sequential `git` processes).

### Theme 7 — Comments
The zero-comment rule is well respected in Rust core but slips in UI hooks/components and a few Rust files: multi-line narrative JSDoc, ticket-reference banners (SUP-80/73), and implementation-narrating comments. Mostly mechanical deletions (the rubric's auto-fix bucket).

### Theme 8 — Testing & build hygiene
Tests: `sleep`-to-order timestamps (use an injected `created_at` constructor — the pattern already exists), CSS-class assertions instead of behavior, and a `migrations_are_idempotent` test that asserts nothing. Build/CI: **`just lint` omits the `--all-targets --all-features` that CI enforces** ([Justfile:32](Justfile#L32)) — local-green ≠ CI-green, the exact trap; CI pins **pnpm 10 while `package.json` declares `pnpm@11.0.9`**; `tokio = "full"` is forced workspace-wide; storage carries an unused `tokio` dependency; and the 8 MB orphan design HTML/PNG bloats every clone.

---

## Recommended sequencing (best ROI first)

1. **Delete dead code** (Theme 2) — zero-risk, includes 4 of the 8 P0s. ~1 hour.
2. **Align `just lint` with CI** (Theme 8) — one-line fix that prevents future "green locally, red in CI" churn. Do this before any other work.
3. **Fix the 6 error-handling sharp edges** (Theme 6) — small, prevents silently-masked failures.
4. **Carve the runtime service layer** (Theme 1) — the 2 boundary P0s + 4 P1s. Biggest architectural payoff; its own PR.
5. **DRY consolidation pass** (Theme 3) — route everything through existing canonical helpers; mechanical, large net deletion.
6. **UI design-system + React/type hygiene** (Themes 4 & 5) — `Pill`/`Button`/`EmptyState`/`Switch`, hoist nested components, type guards; promote the two oxlint rules to `error`.
7. **Comments + tests** (Themes 7 & 8 remainder) — mostly auto-fixable.

> **On applying fixes:** per your standing preference these are presented as findings, not bulk-applied (and we're on `main`). Say the word and I'll implement any single theme on a dedicated branch — Themes 2, 6, and 8 are the safest to start with; Theme 1 is the one worth the most care.

---
## 🔴 P0 — Blocking (8)

_Structural violations / dead public surface / business logic in the wrong crate. Each verified first-hand against the code._


### P0.1 `DeadCode` — Entire SUP-79 Orchestrator runtime substrate is dead public surface

**Where:** [crates/superkick-runtime/src/orchestrator.rs:47-303](crates/superkick-runtime/src/orchestrator.rs#L47)

**Problem:** `Orchestrator<S,E,T>`, `OrchestratedSession` (and its `join`), `SessionObservation`, and `spawn_lifecycle_persistence_sink` are re-exported from lib.rs (lines 66-68) but have no caller anywhere in the workspace — not in superkick-api, not in superkick-cli, not in any test. Grep for `Orchestrator::`, `OrchestratedSession`, `.wait_for_terminal`, `.active_session_ids`, `spawn_lifecycle_persistence_sink` returns only this module and the lib.rs re-export. `launch_task_executor.rs:177` explicitly states 'Orchestrator integration is a follow-up'. `SessionObservation` (lines 75-80) is never even constructed. Rubric §3 / Severity: dead public surface is P0; the spawn/observe/cancel/reaper machinery and the LiveRegistry exist purely speculatively.

**Fix:** Delete orchestrator.rs and its lib.rs re-exports until the launch-task executor actually wires it, or gate it clearly behind the follow-up ticket. If retained intentionally as a near-term integration, at minimum drop the never-constructed `SessionObservation`.


### P0.2 `DeadCode` — HandoffService has no callers in production or tests

**Where:** [crates/superkick-runtime/src/handoff_service.rs:20-207](crates/superkick-runtime/src/handoff_service.rs#L20)

**Problem:** `HandoffService` is exported from lib.rs:49 but `grep -rn HandoffService` across all crates returns only handoff_service.rs and the lib.rs re-export — no construction, no method call, no test. The underlying `Handoff` core type and `HandoffRepo` are exercised elsewhere, but this orchestrator-facing wrapper (create/mark_delivered/mark_accepted/complete/fail/escalate/supersede/list_by_run) is entirely unreached. Rubric Severity: dead public surface = P0.

**Fix:** Remove handoff_service.rs and the lib.rs export until a consumer exists, or wire it into the run flow that creates handoffs. Note the internal inconsistency to resolve if kept: create/mark_delivered/complete/fail emit run events while mark_accepted/escalate/supersede silently do not.


### P0.3 `Boundary` — Linear→core snapshot adapter (with team-key parsing) lives in the API crate

**Where:** [crates/superkick-api/src/handlers/issue_context.rs:76-99](crates/superkick-api/src/handlers/issue_context.rs#L76)

**Problem:** The production `impl IssueLookup for LinearClient` calls `self.get_issue(id)`, derives the team key with `identifier.split_once('-')`, and constructs the core `IssueWorkspaceContextSnapshot`. That is exactly the Linear→core adaptation that rust.md 'Module boundaries' assigns to `superkick-integrations` ('adapts Linear/GitHub to core interfaces') and forbids in `superkick-api` ('handlers are thin adapters to superkick-core', 'no business logic'). The handler crate now owns a domain mapping (and the only non-test construction of the snapshot from a Linear response) that should be a method on LinearClient / an integrations adapter, with the handler merely calling it.

**Fix:** Move the snapshot construction (get_issue + team-key derivation + IssueWorkspaceContextSnapshot build) into superkick-integrations as a LinearClient method (e.g. `issue_workspace_snapshot(id) -> Result<IssueWorkspaceContextSnapshot, LinearError>`). Keep only the object-safe IssueLookup seam + the trivial delegation in the handler.


### P0.4 `DeadCode` — Dead public method `list_workflow_states_for_team` with a doc comment that lies about callers

**Where:** [crates/superkick-integrations/src/linear/client.rs:723-745](crates/superkick-integrations/src/linear/client.rs#L723)

**Problem:** `pub async fn list_workflow_states_for_team` has zero callers anywhere in the workspace (grep across crates/, ui/, and tests returns only its own definition; the only other hits are stale copies under superkick-worktrees/). Its doc comment asserts "Used by handlers that need to translate a workflow-state lane the UI selected by id back into a display label" — no such handler exists. This violates the rubric's P0 "dead public surface" rule and rust.md "No dead code. Delete it; git remembers." The comment also lies about behavior (Naming/Comments rule). The same workflow-state data already ships to the UI via `list_options` -> `workflow_states_by_team`, so this method is redundant.

**Fix:** Delete the method and its doc comment. If a future caller is planned, leave it out until the caller lands (git remembers).


### P0.5 `DRY` — Duplicate InterventionList component reimplemented inline

**Where:** [ui/src/components/launch/LaunchTaskFeedBody.tsx:96-113](ui/src/components/launch/LaunchTaskFeedBody.tsx#L96)

**Problem:** The private `InterventionList` defined here (props {label, rows, variant}, same `spacing` logic, same `rows.map` over InterventionRow) is byte-for-byte identical to the shared exported component at ui/src/components/task-cockpit/InterventionList.tsx (verified via diff: files identical). Rubric DRY P0: 'new helper/hook/component duplicating one already in shared code.' TaskCockpitTimeline already imports the shared one; LaunchTaskFeedBody re-implements it.

**Fix:** Delete the local InterventionList and import { InterventionList } from '@/components/task-cockpit/InterventionList'. Consider moving InterventionList to a more neutral location (e.g. components/launch/) since both consumers are launch-task feeds.


### P0.6 `DRY` — Domain string union duplicated and exported from a component file

**Where:** [ui/src/ui/Avatar.tsx:9](ui/src/ui/Avatar.tsx#L9)

**Problem:** `export type AgentIdentity = 'claude' | 'codex'` is declared in a component file (Avatar.tsx) and re-consumed by components/agents/AgentCard.tsx (imports it from '@/ui/Avatar'). It is character-for-character the same union as `AgentProvider = 'claude' | 'codex'` in ui/src/types/agents.ts:3. This violates rubric §8 (duplicated string unions in 2+ files; domain types in .tsx files when shared types exist) and the frontend Types convention (exported type decls outside src/types/** are banned except *Props / hook return aliases).

**Fix:** Delete `AgentIdentity`; reuse `AgentProvider` from '@/types'. Update Avatar's `agent?: AgentProvider | boolean` prop and AgentCard's `agentIdentityOf(): AgentProvider`.


### P0.7 `Boundary` — PR record lifecycle + GitHub state sync is business logic living in superkick-api

**Where:** [crates/superkick-api/src/handlers/runs.rs:367-432](crates/superkick-api/src/handlers/runs.rs#L367)

**Problem:** `resolve_pr` and `sync_pr_state` implement a domain workflow inside the HTTP crate: lazily materialise a PullRequest record from a PrUrl artifact, persist it via pr_repo.upsert, decide staleness with a 60s magic threshold (line 377), call superkick_integrations::github::fetch_pr_state, mutate domain state, and write it back via pr_repo.update. This is the run/PR aggregate orchestrating storage + integrations, not HTTP adaptation. The Rust conventions (docs/conventions/rust.md 'Module boundaries') state superkick-api holds no business logic and handlers are thin adapters to core; cross-repo services belong in superkick-runtime (which already hosts OwnershipService/AttentionService/InterruptService). Grep confirms no PR-sync service exists in runtime (no pr_repo/fetch_pr_state references under crates/superkick-runtime/src), so this API copy is the sole owner and is consumed by three handlers (runs.rs:209, issues.rs:64, queue_common.rs:72), spreading the leak.

**Fix:** Extract a PullRequestService into superkick-runtime that owns get-or-create-from-artifact, the staleness policy, and the GitHub sync (taking PullRequestRepo + ArtifactRepo). Move the 60s threshold into a named const/config there. Handlers then call the service and map errors via AppError, keeping superkick-api thin.


### P0.8 `DRY` — Codex adapter duplicates Claude adapter's entire process-lifecycle helper block

**Where:** [crates/superkick-runtime/src/protocol_adapter/codex.rs:493-613](crates/superkick-runtime/src/protocol_adapter/codex.rs#L493)

**Problem:** `append_stderr_tail` (codex:493 vs claude:494 — verified byte-identical), `enum Termination` (codex:504 vs claude:505), `const CANCEL_REASON_OPERATOR` (codex:509 vs claude:510), `emit_terminal` (codex:511 vs claude:512), `kill_with_grace` (codex:568 vs claude:569), and `send_event` (codex:598 vs claude:600) are duplicated between the two adapters. `emit_terminal`, `kill_with_grace`, and `send_event` differ ONLY by the provider word baked into timeout-message/log strings ("codex" vs "claude"); `append_stderr_tail`, `Termination`, and the const are exactly identical. This is the rubric's 'two units doing almost the same thing under different names' / 'copy-pasted blocks differing only by parameters' P0. Both files already live in the same `protocol_adapter/` module with a `mod.rs` and shared seams (`ProtocolEventSender`, `send_event`-style helpers), so a shared home exists.

**Fix:** Extract the shared block into a sibling module (e.g. `protocol_adapter/process.rs` or extend `mod.rs`): a single `append_stderr_tail`, `Termination`, `CANCEL_REASON_OPERATOR`, `kill_with_grace`, `send_event`, and an `emit_terminal` parameterized by a `provider_label: &str` (or the existing `AgentProvider`). The adapters keep only their genuinely-distinct stream-parsing logic.


---

## 🟠 P1 — Must-fix before "best-in-class" (113)

_Real cleanup; behavior-sensitive but not broken today. `↩︎` = reinstated after balanced re-adjudication overturned an over-skeptical auto-drop._


**Boundary (16)**

- [.github/workflows/ci.yml:44](.github/workflows/ci.yml#L44) — CI pins pnpm 10 but the project declares pnpm@11.0.9
- [Justfile:32-35](Justfile#L32) — Local clippy gate omits --all-targets --all-features that CI enforces
- [crates/superkick-api/src/handlers/queue_common.rs:51-129](crates/superkick-api/src/handlers/queue_common.rs#L51) — Cross-repo run-triage fan-out service lives in superkick-api, not superkick-runtime ↩︎
- [crates/superkick-api/src/handlers/runs.rs:298-347](crates/superkick-api/src/handlers/runs.rs#L298) — cancel_run holds multi-step domain orchestration in the API layer
- [crates/superkick-api/src/handlers/runs.rs:80-189](crates/superkick-api/src/handlers/runs.rs#L80) — Run-creation workflow (validate + dedup race resolution + insert + spawn engine) lives in the handler module ↩︎
- [crates/superkick-api/src/recovery_scheduler.rs:41-136](crates/superkick-api/src/recovery_scheduler.rs#L41) — Recovery scheduler background loop lives in superkick-api instead of superkick-runtime
- [crates/superkick-storage/src/sqlite/runs.rs:104, 145](crates/superkick-storage/src/sqlite/runs.rs#L104) — Terminal run-states hardcoded as SQL string literals, duplicating RunState serde mapping
- [ui/src/components/agents/AgentCard.tsx:53-90](ui/src/components/agents/AgentCard.tsx#L53) — AgentCard hand-rolls pills/dots via legacy CSS instead of Pill primitive
- [ui/src/components/dashboard/BoardCol.tsx:27](ui/src/components/dashboard/BoardCol.tsx#L27) — Inline 'Empty' placeholder string instead of EmptyState
- [ui/src/components/issues/pickers/StatusPicker.tsx:16-25](ui/src/components/issues/pickers/StatusPicker.tsx#L16) — Inlined placeholder-string empty states instead of shared EmptyState
- [ui/src/components/run-shared/RunMetaStrip.test.tsx:79-91](ui/src/components/run-shared/RunMetaStrip.test.tsx#L79) — Test asserts on raw Tailwind class names instead of behavior
- [ui/src/components/settings/RuntimesBody.tsx:12-24](ui/src/components/settings/RuntimesBody.tsx#L12) — Inline loading/error/empty placeholder strings instead of shared state primitives
- [ui/src/components/settings/SettingsPaneGeneral.tsx:18-75](ui/src/components/settings/SettingsPaneGeneral.tsx#L18) — Pane bypasses the design system: legacy pill/btn/select/seg CSS + a11y gaps
- [ui/src/components/settings/SettingsPaneRules.tsx:7-27](ui/src/components/settings/SettingsPaneRules.tsx#L7) — Status pill mapped to legacy CSS modifiers instead of Pill tones
- [ui/src/components/ui/confirm-dialog.tsx:52-66](ui/src/components/ui/confirm-dialog.tsx#L52) — Shared dialog primitive hand-rolls buttons via legacy btn CSS instead of Button
- [ui/src/types/issuesView.ts:1](ui/src/types/issuesView.ts#L1) — Domain type module imports a UI-component type (layer inversion)

**SOC (13)**

- [crates/superkick-api/src/handlers/search.rs:217-295](crates/superkick-api/src/handlers/search.rs#L217) — Hardcoded action-registry catalog and a hand-rolled URL encoder inside the search handler file
- [crates/superkick-runtime/src/step_engine/mod.rs:547-1032](crates/superkick-runtime/src/step_engine/mod.rs#L547) — Gate / human-in-the-loop orchestration belongs in its own submodule
- [ui/src/components/chat/ProviderPicker.tsx:9-18](ui/src/components/chat/ProviderPicker.tsx#L9) — Provider options defined inline while sibling pickers source from lib
- [ui/src/components/chat/ToolCallBlock.tsx:4-16](ui/src/components/chat/ToolCallBlock.tsx#L4) — Pure string helpers colocated in a .tsx component
- [ui/src/components/chat/TurnView.tsx:24-54](ui/src/components/chat/TurnView.tsx#L24) — Domain helpers + status→tone map colocated in renderer; status badge bypasses Pill
- [ui/src/components/command/CommandBar.tsx:172-227](ui/src/components/command/CommandBar.tsx#L172) — Custom hook + pure helpers + constants colocated in the component file
- [ui/src/components/command/sections/EmptySectionsView.tsx:16-32](ui/src/components/command/sections/EmptySectionsView.tsx#L16) — Exported pure builder + domain type live in a .tsx view
- [ui/src/components/issues/IssueKeyboard.tsx:23-73](ui/src/components/issues/IssueKeyboard.tsx#L23) — Render-null component is really a hook (business logic in a component)
- [ui/src/components/issues/IssuesListView.tsx:96-124](ui/src/components/issues/IssuesListView.tsx#L96) — Full custom hook useCollapsedBuckets defined inside a component file
- [ui/src/components/run-detail/RunStatusBanner.tsx:33-89](ui/src/components/run-detail/RunStatusBanner.tsx#L33) — Three banner components in one file
- [ui/src/components/run-tabs/StructuredActivityList.tsx:38-115](ui/src/components/run-tabs/StructuredActivityList.tsx#L38) — Six components and three helpers in one file
- [ui/src/components/task-cockpit/TaskCockpitTimeline.tsx:104-154](ui/src/components/task-cockpit/TaskCockpitTimeline.tsx#L104) — Three components in one file
- [ui/src/routes/_shell/issues.tsx:245-309](ui/src/routes/_shell/issues.tsx#L245) — Pure domain/util/persistence logic colocated in a route file

**DRY (32)**

- [crates/superkick-api/src/handlers/ownership.rs:115-120](crates/superkick-api/src/handlers/ownership.rs#L115) — "run not found" existence check duplicated across handlers in three divergent shapes
- [crates/superkick-cli/src/net.rs:4-9](crates/superkick-cli/src/net.rs#L4) — Timed local HTTP GET builder duplicated 3x across CLI with no shared helper
- [crates/superkick-core/src/launch_queue.rs:266-381](crates/superkick-core/src/launch_queue.rs#L266) — classify_issue repeats the ClassifiedIssue literal 5x — extract a constructor like the existing blocked() helper
- [crates/superkick-integrations/src/linear/client.rs:382-385,433-436,485-488,517-520,533-535,753-755,815-817](crates/superkick-integrations/src/linear/client.rs#L382) — Seven hand-rolled GraphQL error-extraction blocks bypass the existing `classify_graphql_errors` helper
- [crates/superkick-integrations/src/linear/types/convert.rs:23,127,379,453](crates/superkick-integrations/src/linear/types/convert.rs#L23) — GqlUser→IssueAssignee re-inlined 4x while a canonical helper already exists
- [crates/superkick-integrations/src/linear/types/graphql.rs:10-14,196-200,209-213,372-376,386-390,422-426,458-462,476-480,499-503,520-524,541-545](crates/superkick-integrations/src/linear/types/graphql.rs#L10) — Thirteen near-identical GraphQL response envelopes should collapse to one generic `GqlEnvelope<T>` ↩︎
- [crates/superkick-runtime/src/agent_supervisor/output.rs:75-87](crates/superkick-runtime/src/agent_supervisor/output.rs#L75) — emit_event RunEventRepo helper duplicated with step_engine::emit_event
- [crates/superkick-runtime/src/attention_service.rs:143-156](crates/superkick-runtime/src/attention_service.rs#L143) — Event-emit helper triplicated across attention/handoff/ownership services ↩︎
- [crates/superkick-runtime/src/launch_task_step_runner.rs:79-85](crates/superkick-runtime/src/launch_task_step_runner.rs#L79) — Duplicate tail-truncation helper across sibling launch_task modules
- [crates/superkick-runtime/src/protocol_adapter/codex.rs:258-610](crates/superkick-runtime/src/protocol_adapter/codex.rs#L258) — Codex adapter duplicates the entire Claude pump driver near-verbatim
- [crates/superkick-runtime/src/step_engine/review_swarm.rs:79-88](crates/superkick-runtime/src/step_engine/review_swarm.rs#L79) — Review prompt hand-rolled instead of using the shared PromptStepKind::Review body
- [crates/superkick-runtime/src/terminal_takeover.rs:235-286](crates/superkick-runtime/src/terminal_takeover.rs#L235) — PTY-pair spawn helper (SpawnedPty + open/clone/take/spawn/drop) duplicated with lifecycle.rs
- [crates/superkick-runtime/tests/codex_protocol.rs:36-62](crates/superkick-runtime/tests/codex_protocol.rs#L36) — drain() and kinds() helpers duplicated verbatim across two protocol test files
- [crates/superkick-storage/src/sqlite/attention_requests.rs:94-96](crates/superkick-storage/src/sqlite/attention_requests.rs#L94) — Inlined rows_affected guard duplicates the shared ensure_updated helper
- [crates/superkick-storage/src/sqlite/codec.rs:1-15](crates/superkick-storage/src/sqlite/codec.rs#L1) — RFC3339 timestamp decode duplicated ~30x; helper exists but is module-private in conversations.rs
- [crates/superkick-storage/src/sqlite/codec.rs:1-16](crates/superkick-storage/src/sqlite/codec.rs#L1) — rfc3339 timestamp parse inlined ~28 times across storage; two ad-hoc private extractions
- [crates/superkick-storage/src/sqlite/handoffs.rs:88-90](crates/superkick-storage/src/sqlite/handoffs.rs#L88) — Inlined rows_affected guard duplicates the shared ensure_updated helper
- [crates/superkick-storage/src/sqlite/issue_workspace_contexts.rs:294-297, 306-309](crates/superkick-storage/src/sqlite/issue_workspace_contexts.rs#L294) — Two inlined rows_affected guards duplicate ensure_updated
- [crates/superkick-storage/src/sqlite/orchestrator_sessions.rs:148-150, 169-171](crates/superkick-storage/src/sqlite/orchestrator_sessions.rs#L148) — Inlined rows_affected guards in update / set_provider_session_id duplicate ensure_updated
- [crates/superkick-storage/src/sqlite/session_ownership.rs:207-230](crates/superkick-storage/src/sqlite/session_ownership.rs#L207) — reason_str / parse_reason reimplement serde + the shared enum codec
- [ui/src/api/_shared.ts:1-100](ui/src/api/_shared.ts#L1) — API layer copy-pastes the fetch/ok-check/json envelope ~50 times across 17 modules
- [ui/src/api/conversations.ts:114-151](ui/src/api/conversations.ts#L114) — `subscribeToTurnEvents` re-implements the shared `subscribeToSse` scaffolding
- [ui/src/api/conversations.ts:114-151](ui/src/api/conversations.ts#L114) — subscribeToTurnEvents re-implements the shared subscribeToSse plumbing
- [ui/src/components/CapabilityBadge.tsx:9-22](ui/src/components/CapabilityBadge.tsx#L9) — Capability chip hand-rolls a tone span instead of using Pill
- [ui/src/components/ProviderStatusBadge.tsx:3-20](ui/src/components/ProviderStatusBadge.tsx#L3) — Status badge hand-rolls a span with raw palette colors instead of Pill
- [ui/src/components/chat/ToolCallBlock.tsx:14](ui/src/components/chat/ToolCallBlock.tsx#L14) — `truncate` helper duplicated in 3 files
- [ui/src/components/command/CommandBar.tsx:185-227](ui/src/components/command/CommandBar.tsx#L185) — SECTION_LIMIT and isDone duplicated across CommandBar and section views, with a desync hazard
- [ui/src/components/command/sections/ScopedSectionsView.tsx:100-172](ui/src/components/command/sections/ScopedSectionsView.tsx#L100) — ScopedFlat is four copy-pasted JSX branches
- [ui/src/components/issues/pickers/AssigneePicker.tsx:17-20](ui/src/components/issues/pickers/AssigneePicker.tsx#L17) — Name-substring filter derive duplicated across 3 pickers
- [ui/src/components/task-cockpit/TaskCockpitNowPanel.tsx:33](ui/src/components/task-cockpit/TaskCockpitNowPanel.tsx#L33) — changed_files derivation duplicated across three files ↩︎
- [ui/src/lib/domain/formatters.ts:72-114](ui/src/lib/domain/formatters.ts#L72) — Duplicated value→epoch-ms coercion (nested ternary) in `fmtRelativeTime` and `fmtRelativeShort`
- [ui/src/stores/watchedSessions.ts:37-60](ui/src/stores/watchedSessions.ts#L37) — `toggleWatch` re-implements `watch`/`unwatch` bodies verbatim

**ErrorHandling (7)**

- [crates/superkick-api/src/error.rs:135](crates/superkick-api/src/error.rs#L135) — Catch-all arm in CoreError→AppError defeats exhaustive HTTP mapping ↩︎
- [crates/superkick-api/src/handlers/issues.rs:415](crates/superkick-api/src/handlers/issues.rs#L415) — Bare message-less unreachable!() in API request-handling path
- [crates/superkick-api/src/handlers/issues.rs:248-249](crates/superkick-api/src/handlers/issues.rs#L248) — expect() treats an external Linear-supplied id as guaranteed-ASCII header value
- [crates/superkick-core/src/handoff.rs:267-275](crates/superkick-core/src/handoff.rs#L267) — Handoff transition refusal mapped to InvalidInput (400) instead of a 409 transition variant
- [crates/superkick-runtime/src/step_engine/create_pr.rs:115-132](crates/superkick-runtime/src/step_engine/create_pr.rs#L115) — Swallowed git error silently defeats the divergence guard
- [crates/superkick-runtime/src/step_engine/review_swarm.rs:164](crates/superkick-runtime/src/step_engine/review_swarm.rs#L164) — Swallowed DB persistence error on review-swarm step output update
- [crates/superkick-runtime/src/step_failure_classifier.rs:71-92](crates/superkick-runtime/src/step_failure_classifier.rs#L71) — GitDiffProbe runs a synchronous blocking subprocess inside an async task

**Types (7)**

- [ui/src/components/command/CommandBar.tsx:154](ui/src/components/command/CommandBar.tsx#L154) — Unchecked `as Exclude<SearchScope,'all'>` narrowing cast ↩︎
- [ui/src/components/dashboard/CompletedTable.tsx:36-39](ui/src/components/dashboard/CompletedTable.tsx#L36) — Non-null assertion on finished_at that the renderer treats as nullable
- [ui/src/components/issues/IssueFilterDropdown.tsx:394-438](ui/src/components/issues/IssueFilterDropdown.tsx#L394) — Per-branch `as string`/`as number` casts bridging an untyped value union ↩︎
- [ui/src/components/launch/AgentPicker.tsx:52](ui/src/components/launch/AgentPicker.tsx#L52) — `as string` cast on base-ui any-typed callback value
- [ui/src/components/launch/InterventionRow.tsx:24](ui/src/components/launch/InterventionRow.tsx#L24) — Redundant `as string` cast despite prior null guard
- [ui/src/components/run-tabs/structuredActivity.ts:20](ui/src/components/run-tabs/structuredActivity.ts#L20) — Unvalidated `as ActivityPayload` cast over raw JSON
- [ui/src/hooks/useIssueKanbanDnd.ts:62,70,95](ui/src/hooks/useIssueKanbanDnd.ts#L62) — Unsound `over.id as IssueState` casts; one is reachable without a droppable guard ↩︎

**DeadCode (9)**

- [crates/superkick-config/src/model.rs:278-279](crates/superkick-config/src/model.rs#L278) — Dead `AgentConfig` type alias whose comment lies about callers
- [crates/superkick-runtime/src/launch_task_registry.rs:50-56](crates/superkick-runtime/src/launch_task_registry.rs#L50) — LaunchTaskRegistry::register (overwriting variant) has no production caller
- [crates/superkick-runtime/src/step_engine/create_pr.rs:36,291-302](crates/superkick-runtime/src/step_engine/create_pr.rs#L36) — find_pr_config returns a generate_description bool that no caller consumes
- [crates/superkick-storage/Cargo.toml:9](crates/superkick-storage/Cargo.toml#L9) — Unused production tokio dependency in superkick-storage
- [crates/superkick-storage/tests/sqlite_integration.rs:1231-1240](crates/superkick-storage/tests/sqlite_integration.rs#L1231) — Test named migrations_are_idempotent verifies nothing
- [ui/src/api/issueContext.ts:33-54](ui/src/api/issueContext.ts#L33) — Exported `appendIssueMemoryEntry` + `AppendIssueMemoryEntryInput` have zero consumers
- [ui/src/lib/domain/formatters.ts:12-32](ui/src/lib/domain/formatters.ts#L12) — `avgDuration` and `medianDuration` are dead exports
- [ui/src/lib/issueLabels.ts:5-15](ui/src/lib/issueLabels.ts#L5) — `buildLabelColorMap` is a dead export
- [ui/src/lib/issues/searchParams.ts:82](ui/src/lib/issues/searchParams.ts#L82) — Dead `kanban` branch + masking `as IssueViewLayout` cast in `resolveSearch`

**OverEng (4)**

- [crates/superkick-core/src/attach.rs:102-111](crates/superkick-core/src/attach.rs#L102) — Unreachable defensive catch-all arm in status_str match
- [ui/src/components/run-detail/RunWorkspaceTabs/ToolCallRow.tsx:15-16](ui/src/components/run-detail/RunWorkspaceTabs/ToolCallRow.tsx#L15) — Eager useMemo stringifies payloads of collapsed rows
- [ui/src/hooks/useEventStream.ts:10-14,96-99](ui/src/hooks/useEventStream.ts#L10) — `connected` / `done` are dead returned fields no consumer reads
- [ui/src/hooks/useTurnStream.ts:209-213](ui/src/hooks/useTurnStream.ts#L209) — `streamEnded` and `lagged: 0` are dead fields the sole consumer never reads

**Complexity (7)**

- [crates/superkick-api/tests/issue_context_memory.rs:246-260](crates/superkick-api/tests/issue_context_memory.rs#L246) — sleep-to-wait inside a 75-iteration loop violates the no-sleep testing rule
- [crates/superkick-runtime/src/orchestrator.rs:241-264](crates/superkick-runtime/src/orchestrator.rs#L241) — Reaper task holds Arc<Self>, creating a self-cycle that leaks the orchestrator forever
- [crates/superkick-runtime/src/ownership_service.rs:57](crates/superkick-runtime/src/ownership_service.rs#L57) — Per-session lock map grows unbounded — never evicted on session end
- [crates/superkick-runtime/tests/launch_task_step_runner_memory.rs:117-119](crates/superkick-runtime/tests/launch_task_step_runner_memory.rs#L117) — sleep-to-force monotonic memory-entry timestamps ↩︎
- [crates/superkick-storage/tests/sqlite_issue_workspace_contexts.rs:94-97](crates/superkick-storage/tests/sqlite_issue_workspace_contexts.rs#L94) — sleep-to-disambiguate captured_at ordering
- [crates/superkick-storage/tests/sqlite_launch_tasks.rs:99-102](crates/superkick-storage/tests/sqlite_launch_tasks.rs#L99) — sleep-to-disambiguate created_at ordering
- [ui/src/components/dashboard/FocusedRunPanel.tsx:75-136](ui/src/components/dashboard/FocusedRunPanel.tsx#L75) — Chained ternary over 3 render shapes + inline loading/error placeholders + data orchestration in a renderer

**Comments (12)**

- [crates/superkick-api/src/handlers/terminal.rs:136, 153](crates/superkick-api/src/handlers/terminal.rs#L136) — Narration comments restating the following line
- [crates/superkick-config/src/model.rs:532-537](crates/superkick-config/src/model.rs#L532) — Section banners carrying ticket references (SUP-80 / SUP-73)
- [crates/superkick-core/src/attach.rs:44, 51, 55, 66](crates/superkick-core/src/attach.rs#L44) — Narrative inline comments restating the following check
- [ui/src/api/launchTasks.ts:58](ui/src/api/launchTasks.ts#L58) — Task-reference section banner comment
- [ui/src/components/chat/ChatConversationView.tsx:18-23](ui/src/components/chat/ChatConversationView.tsx#L18) — Multi-line prop JSDoc + 6-line effect narrative comments
- [ui/src/components/chat/NewChatLauncher.tsx:16-29](ui/src/components/chat/NewChatLauncher.tsx#L16) — Multi-line narrative / JSDoc / history comments
- [ui/src/components/issues/IssueKeyboard.tsx:12-22](ui/src/components/issues/IssueKeyboard.tsx#L12) — Multi-line JSDoc narrating the key handlers
- [ui/src/components/launch-queue/LaunchQueueCard.tsx:10-16](ui/src/components/launch-queue/LaunchQueueCard.tsx#L10) — Ticket-referencing prop JSDoc comments
- [ui/src/components/launch-queue/LaunchQueueUnblockBadge.tsx:9-14](ui/src/components/launch-queue/LaunchQueueUnblockBadge.tsx#L9) — JSDoc block with ticket reference on internal component
- [ui/src/hooks/useChatSubjectPrefs.ts:28-40](ui/src/hooks/useChatSubjectPrefs.ts#L28) — 13-line narrative JSDoc with task reference on an internal hook
- [ui/src/hooks/useChatSubjectSelection.ts:24-37,51-56](ui/src/hooks/useChatSubjectSelection.ts#L24) — Multi-line narrative JSDoc and implementation-narrating block comments
- [ui/src/hooks/useChatSubjectStates.ts:9-22](ui/src/hooks/useChatSubjectStates.ts#L9) — 14-line narrative JSDoc with task reference

**Hooks (1)**

- [ui/src/components/dashboard/SessionWatchRail.tsx:20-25](ui/src/components/dashboard/SessionWatchRail.tsx#L20) — useMemo reads query cache imperatively with exhaustive-deps disabled

**Store (1)**

- [ui/src/stores/watchedSessions.ts:25-72](ui/src/stores/watchedSessions.ts#L25) — Derived getter `maxReached` is persisted by `persist` middleware

**A11y (1)**

- [ui/src/components/run-detail/TerminalTakeover.tsx:159-235](ui/src/components/run-detail/TerminalTakeover.tsx#L159) — Hand-rolled disclosure/select/buttons instead of shared primitives

**React 19 (2)**

- [ui/src/components/launch/LaunchTaskFeedBody.tsx:43-55](ui/src/components/launch/LaunchTaskFeedBody.tsx#L43) — Nested ternary in JSX
- [ui/src/ui/Toggle.tsx:13-37](ui/src/ui/Toggle.tsx#L13) — Hand-rolled switch on a <div> instead of the shadcn Switch primitive

**useEffect (1)**

- [ui/src/components/ui/client-date-time.tsx:10-23](ui/src/components/ui/client-date-time.tsx#L10) — Derived label computed in an effect in a client-only SPA ↩︎


---

## 🟡 Suggested — judgment calls / polish (68)


**Boundary (6)**

- [.oxlintrc.json:59-63](.oxlintrc.json#L59) — Lint config references a @superkick/ import alias the codebase never uses
- [crates/superkick-api/src/handlers/search.rs:217-295](crates/superkick-api/src/handlers/search.rs#L217) — Pure action-registry builder and url-encoder sit in the handler file ↩︎
- [crates/superkick-cli/src/serve.rs:37](crates/superkick-cli/src/serve.rs#L37) — Server binds 0.0.0.0 for an auth-less local-first tool
- [ui/src/components/issues/IssueRow.test.tsx:152-154](ui/src/components/issues/IssueRow.test.tsx#L152) — Negative assertion via CSS class selector instead of behavior
- [ui/src/components/issues/IssuesEmptyState.tsx:12-23](ui/src/components/issues/IssuesEmptyState.tsx#L12) — Bespoke empty-state component overlaps the shared EmptyState primitive
- [ui/src/ui/TaskBadge.test.tsx:37-50](ui/src/ui/TaskBadge.test.tsx#L37) — Pulse behavior asserted via CSS class selectors

**SOC (5)**

- [crates/superkick-runtime/src/step_engine/mod.rs:1204-1235](crates/superkick-runtime/src/step_engine/mod.rs#L1204) — build_full_prompt (pure prompt builder) lives in the orchestrator module
- [ui/src/components/issues/IssuePreview.tsx:152-165](ui/src/components/issues/IssuePreview.tsx#L152) — Generic derive helpers colocated in component (pickLastComment, shortRunId)
- [ui/src/components/launch/InterventionRow.tsx:8-19](ui/src/components/launch/InterventionRow.tsx#L8) — Misnamed time-formatting helper lives inside a render file
- [ui/src/components/settings/NoProvidersDetected.tsx:1-19](ui/src/components/settings/NoProvidersDetected.tsx#L1) — Empty-state reimplemented instead of using EmptyState primitive
- [ui/src/ui/StatusIcon.tsx:13-35](ui/src/ui/StatusIcon.tsx#L13) — Domain mapping helpers colocated with the StatusIcon component

**DRY (13)**

- [crates/superkick-api/src/handlers/issue_context.rs:70-81](crates/superkick-api/src/handlers/issue_context.rs#L70) — IssueLookup re-spells the LinearFuture future shape instead of reusing the alias
- [crates/superkick-api/src/handlers/me.rs:11](crates/superkick-api/src/handlers/me.rs#L11) — "LINEAR_API_KEY not configured" magic string repeated 6 times
- [crates/superkick-api/src/lib.rs:840-849](crates/superkick-api/src/lib.rs#L840) — git-remote-to-repo-slug detection duplicated between api and cli
- [crates/superkick-runtime/src/launch_task_step_runner.rs:575-579](crates/superkick-runtime/src/launch_task_step_runner.rs#L575) — Two identical StepLinks-from-shadow-run literals
- [crates/superkick-runtime/src/launch_task_step_runner.rs:714-974](crates/superkick-runtime/src/launch_task_step_runner.rs#L714) — run_step is a ~260-line function chaining many distinct concerns ↩︎
- [crates/superkick-runtime/src/workspace_bus.rs:32-70](crates/superkick-runtime/src/workspace_bus.rs#L32) — Three broadcast buses re-implement the identical single-channel pub/sub shape ↩︎
- [crates/superkick-storage/src/sqlite/orchestrator_sessions.rs:231-237](crates/superkick-storage/src/sqlite/orchestrator_sessions.rs#L231) — Checkpoint pointer-advance guard could route through ensure_updated with richer context
- [ui/src/components/dashboard/MetricCard.tsx:9-15](ui/src/components/dashboard/MetricCard.tsx#L9) — Three separate accent-name -> tailwind-color maps with loose string keys
- [ui/src/components/issue-detail/launch-task-feed/StepEvidenceList.tsx:12-16](ui/src/components/issue-detail/launch-task-feed/StepEvidenceList.tsx#L12) — Redundant hasLinks guard duplicated; LaunchStepLinks already self-guards ↩︎
- [ui/src/components/issue-detail/launch-task-feed/StepSummaryCard.tsx:12-30](ui/src/components/issue-detail/launch-task-feed/StepSummaryCard.tsx#L12) — Changed-files pill block duplicated across two cards
- [ui/src/components/issue-detail/properties/StatusRow.tsx:15-38](ui/src/components/issue-detail/properties/StatusRow.tsx#L15) — Seven property rows repeat the same open-state + no-op-guard + optimistic-mutate skeleton
- [ui/src/components/shell/RunDock.tsx:51-67](ui/src/components/shell/RunDock.tsx#L51) — Link-button styling string duplicated inline
- [ui/src/stores/workspaceChat.ts:1-18](ui/src/stores/workspaceChat.ts#L1) — Three identical boolean-disclosure stores differ only by concern

**ErrorHandling (6)**

- [crates/superkick-api/src/handlers/attention.rs:91-96](crates/superkick-api/src/handlers/attention.rs#L91) — Manual CoreError downcast helper because AttentionService returns anyhow
- [crates/superkick-api/src/handlers/issues.rs:414-415](crates/superkick-api/src/handlers/issues.rs#L414) — unreachable!() guarded only by a sibling validation call
- [crates/superkick-core/src/redaction.rs:38-39](crates/superkick-core/src/redaction.rs#L38) — panic! (not .expect("bug:")) in LazyLock regex-compile initializer
- [crates/superkick-runtime/src/ownership_service.rs:268](crates/superkick-runtime/src/ownership_service.rs#L268) — .ok() silently drops event-payload serialization (3 convergent sites)
- [crates/superkick-runtime/src/pty_session.rs:120-303](crates/superkick-runtime/src/pty_session.rs#L120) — Lock-poisoning .expect() guards omit the convention's "bug:" prefix (batch)
- [crates/superkick-runtime/src/runner_mode.rs:50-54](crates/superkick-runtime/src/runner_mode.rs#L50) — unreachable! in the spawn-path argv shaper (well-documented, but still a panic in the supervisor path)

**Types (5)**

- [crates/superkick-api/src/handlers/runs.rs:219-227](crates/superkick-api/src/handlers/runs.rs#L219) — get_run returns an ad-hoc serde_json::json! blob instead of a typed response
- [crates/superkick-integrations/src/linear/types/graphql.rs:106,163,231,285-287](crates/superkick-integrations/src/linear/types/graphql.rs#L106) — Issue-level `priority: u8` contradicts the history path's `Option<f32>` + clamp, despite Linear's `Float` wire type
- [crates/superkick-storage/src/sqlite/steps.rs:104](crates/superkick-storage/src/sqlite/steps.rs#L104) — Unchecked `as u32` cast on attempt; checked try_from idiom used elsewhere in same crate
- [ui/src/components/agents/AgentCard.tsx:7-18](ui/src/components/agents/AgentCard.tsx#L7) — Props re-declare 10 fields of AgentSummary instead of taking the domain object ↩︎
- [ui/src/components/run-inspector/RunInspectorPage.tsx:45](ui/src/components/run-inspector/RunInspectorPage.tsx#L45) — `detail as LoadedRunDetail` cast after manual narrowing

**DeadCode (8)**

- [crates/superkick-core/src/run.rs:58, 384-392](crates/superkick-core/src/run.rs#L58) — Failed → Queued retry edge has no caller and transition_to leaves finished_at stale on requeue
- [crates/superkick-runtime/src/cli_resume.rs:66](crates/superkick-runtime/src/cli_resume.rs#L66) — codex_interactive ignores its resume argument by design but still threads it
- [crates/superkick-runtime/src/launch_task_registry.rs:101-118](crates/superkick-runtime/src/launch_task_registry.rs#L101) — Registry::cancel and contains are test-only; production cancel goes through cancel_or_reserve
- [crates/superkick-storage/src/sqlite/conversations.rs:594-605](crates/superkick-storage/src/sqlite/conversations.rs#L594) — TurnEventRow carries three never-read columns mirroring data inside envelope_json
- [design/issues-search/README.md:1-3](design/issues-search/README.md#L1) — Stale top-level design/ branch-payload drop duplicates the docs/design convention
- [docs/design/issue-centered-v1/artifacts/issues-design/issues.html](docs/design/issue-centered-v1/artifacts/issues-design/issues.html) — 14MB of committed machine-generated design artifacts (7.3MB single HTML + 892KB PNG) ↩︎
- [ui/src/components/run-detail/PendingInterrupt.tsx:35](ui/src/components/run-detail/PendingInterrupt.tsx#L35) — Redundant String() wrap on already-string value
- [ui/src/lib/inbox/recentlyDone.ts:13-17](ui/src/lib/inbox/recentlyDone.ts#L13) — `runStateTone` is exported but consumed only in-file

**OverEng (5)**

- [Cargo.toml:23](Cargo.toml#L23) — tokio features = "full" forced on crates that use one module
- [crates/superkick-api/src/handlers/runs.rs:446-448](crates/superkick-api/src/handlers/runs.rs#L446) — One-method wrapper re-exporting superkick_storage::is_unique_violation
- [ui/src/components/dashboard/Badge.tsx:9-15](ui/src/components/dashboard/Badge.tsx#L9) — Thin Pill wrapper named Badge collides with the shadcn Badge
- [ui/src/components/issue-detail/launch-task-feed/LaunchTaskNeedsHumanCallout.tsx:53-57](ui/src/components/issue-detail/launch-task-feed/LaunchTaskNeedsHumanCallout.tsx#L53) — Inline style duplicates the opbanner--danger modifier intent
- [ui/src/components/run-inspector/RunInspector.tsx:60-120](ui/src/components/run-inspector/RunInspector.tsx#L60) — useMemo wrapping JSX passed to usePageActions

**Complexity (4)**

- [crates/superkick-core/src/issue_workspace_context.rs:332](crates/superkick-core/src/issue_workspace_context.rs#L332) — std::thread::sleep in a unit test to bump updated_at
- [crates/superkick-core/src/launch_queue.rs:266-381](crates/superkick-core/src/launch_queue.rs#L266) — classify_issue is ~115 lines branching on 6 distinct gates
- [crates/superkick-runtime/src/run_diff.rs:75-104](crates/superkick-runtime/src/run_diff.rs#L75) — Per-file git diff spawned sequentially in an await loop (up to 500 subprocesses)
- [crates/superkick-storage/src/sqlite/conversations.rs:527-531, 623-628](crates/superkick-storage/src/sqlite/conversations.rs#L527) — envelope_kind serializes then re-parses JSON to read a discriminant already in memory

**Comments (10)**

- [crates/superkick-config/src/repo_slug.rs:8,16](crates/superkick-config/src/repo_slug.rs#L8) — Inline comments narrate the obvious implementation
- [crates/superkick-core/src/lib.rs:43](crates/superkick-core/src/lib.rs#L43) — Comment restates the obvious re-export block
- [crates/superkick-runtime/src/launch_task_step_runner.rs:950-954](crates/superkick-runtime/src/launch_task_step_runner.rs#L950) — Narrative inline comment restating control flow already visible in the match
- [ui/src/components/chat/ChatComposer.tsx:21-24](ui/src/components/chat/ChatComposer.tsx#L21) — 3-line prop JSDoc narrating behavior
- [ui/src/components/issues/IssueLinkedItemsSection.tsx:56-59](ui/src/components/issues/IssueLinkedItemsSection.tsx#L56) — Four-line inline comment that belongs in commit/PR or one WHY line
- [ui/src/components/run-detail/PtyTerminal.tsx:136](ui/src/components/run-detail/PtyTerminal.tsx#L136) — Implementation-narrating comments
- [ui/src/hooks/useDispatchFromQueue.ts:14-22](ui/src/hooks/useDispatchFromQueue.ts#L14) — 9-line narrative JSDoc restating the implementation
- [ui/src/hooks/useLaunchQueue.ts:20-31,70-72](ui/src/hooks/useLaunchQueue.ts#L20) — Multi-line narrative JSDoc and a 3-line helper comment
- [ui/src/routes/_shell/queue.tsx:27-30](ui/src/routes/_shell/queue.tsx#L27) — Multi-line narrative comment in render body duplicating an existing const's rationale
- [ui/src/types/conversations.ts:20-24](ui/src/types/conversations.ts#L20) — Comment justifies file placement / cites the convention doc rather than a runtime invariant

**Naming (3)**

- [ui/src/components/launch/InterventionRow.tsx:8-19](ui/src/components/launch/InterventionRow.tsx#L8) — relativeTimestamp returns absolute time-of-day
- [ui/src/hooks/useCommandBarReducer.ts:8](ui/src/hooks/useCommandBarReducer.ts#L8) — `CommandBarState` collides with an unrelated type of the same name in stores/commandBar.ts
- [ui/src/ui/EstimateChip.tsx:4](ui/src/ui/EstimateChip.tsx#L4) — Single-letter prop name `n` violates the descriptive-naming convention

**Query (1)**

- [ui/src/components/inbox/UpdatesWorthALookSection.tsx:9-23](ui/src/components/inbox/UpdatesWorthALookSection.tsx#L9) — Duplicate hook subscriptions purely for a count; safeCount colocated

**useEffect (2)**

- [ui/src/components/issues/IssuePreview.tsx:43-51](ui/src/components/issues/IssuePreview.tsx#L43) — Global keydown effect used only to stopPropagation on Escape
- [ui/src/hooks/useLaunchFromInbox.ts:37-49](ui/src/hooks/useLaunchFromInbox.ts#L37) — Effect mirrors query data into selection state; candidate for derivation


---

## ✅ Reviewed and dismissed (not issues)

_Flagged by a reviewer, then refuted on a second, code-level read. Listed for transparency._

- [crates/superkick-runtime/src/conversation_runner.rs:703-864](crates/superkick-runtime/src/conversation_runner.rs#L703) — drive_turn mixes adapter start, cancel-bridge wiring, DB lifecycle, persistence, and SSE ordering in one ~160-line / 10-arg function — _drive_turn (conversation_runner.rs:703-864) has one cohesive concern per rust.md:62, which overrides the rubric's generic line-count heuristic: orchestrate one turn's lifecycle under the documented DB…_
- [crates/superkick-core/src/attach.rs:151-180](crates/superkick-core/src/attach.rs#L151) — Shell-command assembly (process concern) lives in a core domain module — minor note (Suggested)
- [ui/src/components/task-cockpit/TaskCockpitTabPanel.tsx:20-83](ui/src/components/task-cockpit/TaskCockpitTabPanel.tsx#L20) — Four tab-panel components defined in one file — _The drop is substantively correct, not over-literal. The governing rule (frontend.md:21) explicitly permits colocation for "a compound component's subparts," and that is exactly what this file is: Ste…_
- [ui/src/components/run-shared/RunMetaStrip.tsx:34-141](ui/src/components/run-shared/RunMetaStrip.tsx#L34) — Two large render-shape components in one file — _Verified the file directly. CompactContext (34-74) and ComfortableMeta (76-141) are both unexported, file-private render shapes of the single exported RunMetaStrip surface (143-146), selected by `dens…_
- [ui/src/lib/inbox/recentlyDone.ts:85, 92-95](ui/src/lib/inbox/recentlyDone.ts#L85) — `console.warn` in production domain derivation — minor note (Suggested)