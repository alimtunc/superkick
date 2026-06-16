# Multica Benchmark — Agents / Skills / Runtimes Surface Audit

**Date:** 2026-06-14
**Scope:** Independent product/architecture review of Superkick's future Agents / Skills / Runtimes surface, benchmarked against [Multica](https://github.com/multica-ai/multica).
**Author posture:** Skeptical. No implementation, no Linear ticket, no code/asset copying. Conclusions are mine, not a rubber-stamp of the current Superkick direction.

**Evidence classification used throughout:**
- **[F] Verified fact** — read directly in Superkick `main`, or confirmed first-party in Multica docs/repo (cross-checked by an adversarial verifier).
- **[I] Reasoned inference** — follows from the facts but not directly stated.
- **[?] Unknown / needs spike** — could not verify; flagged explicitly.

A note on the Multica evidence: the repo (`github.com/multica-ai/multica`, Apache-2.0, Next.js 16 + Go + Postgres/pgvector) is real and reachable. First-party docs are reliable. Several widely-circulated "facts" (polymorphic `actor_type`, `skills-lock.json`, port `:19514`, token-by-token message taxonomy) come from third-party reverse-engineering blogs, **not** Multica docs, and are treated as **[?]** below regardless of how confidently they are repeated elsewhere.

---

## 1. Verdict

**Superkick's problem is information architecture, not missing capability — and the right move is a read-only-first "Agent & Skill Workspace V1," not a teammate-platform rebuild.** Superkick already has, in its domain and runtime layers, most of what Multica exposes as product: a skill library with full CRUD + disk import (`SkillDefinition`, migrations 037/044), DB-backed launch profiles (recipes of skill-steps, migration 038), a runtime registry with a real capability matrix (`RuntimeCapabilities`, migration 017), per-provider settings (migration 036), and an execution audit trail richer than Multica's (`AgentSession` with MCP/tool snapshots, billing profile, launch lineage, parent/child handoffs). What Superkick lacks is **surfacing**: agents, skills, providers, profiles, and runtimes all live behind `/settings?pane=…`, so none of them feel like a coherent product. Multica's genuine lead is purely IA and framing — "agents are teammates, skills are a workspace library" — plus a clean issue→assign→task→comment loop. Adopt that framing. **Do not** adopt Multica's cloud-sync skills catalog, ClawHub marketplace, 12-provider breadth (partly aspirational/broken by its own honest matrix), squads, autopilots, mobile app, or its presence/analytics theater. One hard asymmetry constrains the plan: **Skills/Profiles/Providers/Runtimes are DB-backed and editable today; the Agent catalog is config-file-defined and read-only** (`superkick-config/src/model.rs` → in-memory `AgentCatalog`; there is no `agent_definitions` migration). So `/skills` can become a fully-featured product surface immediately by reusing existing CRUD, while `/agents` must ship **read-only** until a config→DB agent store is deliberately built. The first deliverable should promote what already exists, backed only by real data, and explicitly refuse to fabricate activity/workload/online status — the exact temptation behind the (correctly absent) `agentsFixture.ts`.

---

## 2. Benchmark Summary

### What Multica gets right (worth borrowing as concepts)

- **[F] Agents as first-class, visible workers.** Agents appear in the same assignee picker as humans, can be assigned issues and @-mentioned, and post comments/status changes back into the issue thread. This is the single most valuable concept gap vs Superkick — the "who is working on this issue and what are they doing" answer is built into the IA.
- **[F] Skills as a workspace library, not launch-internals.** A top-level, browsable, importable SKILL.md library (Anthropic Agent Skills open standard) that attaches many-to-many to agents and materializes into each provider's native discovery path at task start. The library/launch split is clean.
- **[F] Honest runtime/provider model exposed to users.** A `daemon → runtime → provider` model with a capability matrix that openly flags which tools have broken session-resume or ignore MCP. Candor that makes routing legible.
- **[F] Assignment-as-trigger with a legible task state machine.** Assign issue → enqueue task → `claim → start → complete|fail`, with the agent reporting blockers instead of silently spinning. Operationally honest.
- **[F] Steering model that matches reality.** Multica does **not** pretend you can converse with a running agent. Mid-run, the only control is a coarse cancel; to redirect, you post another comment/@-mention, which spawns a **new** task that resumes the provider session. This is the correct, achievable interaction shape — and notably the same shape Superkick's primitives already support.

### What Superkick already has (verified, often deeper than Multica)

- **[F] First-class skill library with CRUD + disk import.** `SkillDefinition` (id, label, kind, source, `origin: Builtin|Custom|Imported`, `body`, `artifact_kind: Skill|Command`). Endpoints: `GET/POST/PATCH/DELETE /skills`, `GET /skills/importable`, `POST /skills/import`. Import scans repo dirs to depth 6 for `SKILL.md` / `commands/*.md` and credential-scans bodies before persisting. This is Multica's "From local" copy-from-runtime flow — already shipped.
- **[F] DB-backed launch profiles** = ordered `ProfileStep{skill_ref, provider, model, reasoning, executor, session_policy, output_expectation}` pipelines, with immutable `ProfileSnapshot` frozen at launch. This is Superkick's de-facto "team/recipe" object.
- **[F] Runtime registry + capability matrix.** `Runtime` + `RuntimeProvider{capabilities: supports_pty, supports_protocol, supports_resume, supports_mcp_config, supports_structured_tools, supports_usage}`, detected from PATH, refreshable. The UI already renders this matrix in `SettingsPaneRuntimes`.
- **[F] Per-provider settings** (`ProviderSettings`: billing mode, sandbox policy, permission policy, default model/reasoning/executor; detection overlays for availability/install/auth).
- **[F] Agent catalog with instructions/tools/MCP.** `GET /agents` returns `AgentSummary{name, provider, role, model, runner_mode, billing_profile, origin}` — a projection of `AgentDefinition` (which also carries `system_prompt`, tool allowlist, `mcp_policy`). So Superkick already has a per-agent "instructions + provider + model + MCP" concept — Multica's core agent fields minus env vars / custom args / visibility.
- **[F] Execution audit trail richer than Multica's.** `AgentSession` records provider session id (resume), MCP servers used, tool allowlist snapshot, billing profile, launch reason (`InitialStep|Handoff|ReviewFanout|OperatorEscalation`), parent/child lineage. This is real "activity" data — no fabrication needed.
- **[F] Three execution modes already implemented.** PTY (interactive, attachable via `terminal_takeover`), Structured (Codex `exec --json` / Claude `--print --output-format stream-json`), Background (`claude --bg`, poll-only). Plus pre-spawn operator interventions (`launch_task_intervention`, `InterventionComposer`) and resume via `provider_session_id`.
- **[F] Issue↔task↔run linkage exists.** `LaunchTask{linear_issue_id, profile_snapshot, linked_run_id}` ties an issue to a run and the profile that produced it.

### What Superkick is genuinely missing

- **[F] No `/agents` or `/skills` routes.** Routes today: `index, board, issues, issues.$issueId, queue, runs, runs.$runId, tasks.$taskId, tasks.new, settings`. Everything agent/skill/provider/profile-related is `/settings?pane=…`. Agents are visible **only** inside the Launch Composer's `AgentPicker`.
- **[F] Agents are config-file-defined and read-only.** `AgentDefinition` lives in `superkick-config/src/model.rs`; served from an in-memory `AgentCatalog`. There is **no `agent_definitions` migration**, no `POST/PATCH/DELETE /agents`, no `GET /agents/{name}`. In-product agent creation/editing does not exist and cannot be cheaply added.
- **[F] No per-agent aggregation.** No "runs/tasks for this agent," no `GET /agents/{name}/runs`. The data to build it exists (`AgentSession.role`/`provider` via `run_step`; `LaunchTask.profile`), but no query/endpoint aggregates it.
- **[F] No issue-scoped agent interaction surface.** No agent comments into an issue, no @-mention trigger, no "talk to the agent on this issue." The execution primitives exist; the issue-facing surface does not.
- **[I] No "agent ↔ skill" direct attachment.** In Superkick, skills attach to **profiles** (via `ProfileStep.skill_ref`), not directly to an agent. Multica attaches skills to agents many-to-many. This is a modeling divergence, not a defect (see Concept Map).

---

## 3. Concept Map

| Multica concept | Superkick equivalent (today) | Reuse vs new work | Confidence |
|---|---|---|---|
| Agent (named worker: provider + instructions + model) | `AgentDefinition` / `AgentSummary` (config catalog: name, provider, role, model, `system_prompt`, tools, `mcp_policy`) | **Reuse for read.** New work for write (config→DB store + write API). | **[F]** structure exists; **[F]** read-only |
| Agent env vars / custom CLI args / visibility | — (not modeled) | **New** small fields, only if agents become editable | **[?]** |
| Agent ↔ Skill many-to-many attach | Skills attach to **profiles** (`ProfileStep.skill_ref`), not agents | **Divergent model.** Keep profile-as-recipe; do not bolt direct attach in V1 | **[I]** |
| Skills library (SKILL.md, browse/edit) | `SkillDefinition` + `GET/POST/PATCH/DELETE /skills` (DB-backed, migration 037/044) | **Reuse wholesale.** Only a new route + page needed. | **[F]** |
| Skill import "From local" (scan runtime dirs) | `GET /skills/importable` + `POST /skills/import` (disk scan, credential-scrubbed) | **Reuse wholesale.** | **[F]** |
| Skill import "From GitHub" / "From ClawHub" marketplace | — | **New, and deferred.** Not core to local-first Superkick. | **[F]** absent |
| Squad (agents under a leader) | `LaunchProfile` (ordered multi-step recipe) is the closest analog | **Reuse profiles as the "team" concept.** Do not build squads. | **[I]** |
| Runtime + daemon (PATH auto-detect, heartbeat) | `Runtime` + `RuntimeProvider` registry (migration 017), `POST /runtimes/refresh` | **Reuse.** Superkick is single-host local; no daemon fleet needed. | **[F]** |
| Provider / "AI coding tool" | `AgentProvider{Claude, Codex}` + `ProviderSettings` (migration 036) | **Reuse.** Keep 2 providers; do not chase 12. | **[F]** |
| Capability matrix (resume/MCP/etc.) | `RuntimeCapabilities` (already rendered in `SettingsPaneRuntimes`) | **Reuse.** Superkick's is arguably better-grounded. | **[F]** |
| Task (unit of agent run, state machine) | `LaunchTask` + `LaunchTaskStep` + shadow `Run`/`RunStep` | **Reuse.** | **[F]** |
| Agent activity / execution history | `AgentSession` audit trail; `LaunchTask`/`Run` history | **Reuse data; new aggregation/query** per agent. | **[F]** data; **[I]** aggregation |
| Issue assignment → auto-enqueue task | `LaunchTask{linear_issue_id}` exists; auto-enqueue-on-assign does not | **New** trigger wiring (defer). | **[F]** |
| Agent comments into issue / @-mention trigger | — (interventions are pre-spawn, not issue-thread) | **New, and deferred.** | **[F]** |
| Chat with agent (separate surface; each msg = new task) | `conversation{agent_id, subject: Run}` primitive exists; no UI | **New, and deferred.** | **[I]** |
| Mid-run interactive steering | **Not supported by any mode** (see §4 Issue interaction) | **Do not build.** Coarse cancel + re-prompt-as-new-task only. | **[F]** |
| Autopilots (cron/webhook automations) | `launch_queue` exists but not scheduler | **New, and deferred.** | **[F]** |
| Online presence / usage dashboards | Runtime liveness (`last_seen_at`) is the only real signal | **Do not build presence theater.** | **[F]** |

---

## 4. Recommended V1 Product Shape

Guiding rule: **promote what is real, refuse to fabricate the rest.** Every cell below is backed by data that already exists in `main`, or is explicitly deferred.

### `/agents` — read-only roster (the spine)

- A top-level route listing the config `AgentCatalog` (`GET /agents` → `AgentSummary[]`), grouped by provider, as today's `AgentPicker` already groups them.
- **Real columns only:** name, provider, model, role, runner mode, billing profile, origin (builtin/custom). These come straight from `AgentSummary`.
- **No fabricated columns.** No "online" dot, no workload bar, no success rate, no "last active." `AgentSession` history can power a real "runs" count once aggregated — but if that aggregation is not in this slice, the column simply does not appear. Absence is correct; invention is the trap.
- **Q5 answer (activity/workload partially unavailable):** show the static, true configuration and a real "recent runs for this agent" list **only if** the aggregation query exists; otherwise show nothing there. Never a placeholder metric.

### `/agents/:id` — read-only cockpit

- **Identity panel (all [F], all real):** name, provider, model, role, runner mode, billing profile, system prompt/instructions (from `AgentDefinition`), MCP policy summary, tool allowlist. Read-only — agents are config-defined.
- **Recent activity (real or absent):** list of `AgentSession`s for this agent's role/provider (joined via `run_step` → `run`), and/or `LaunchTask`s, with their true statuses and timestamps from the audit trail. If empty, show an honest empty state ("No runs yet"), never seeded examples.
- **Q6 answer (V1 without fake data):** identity/config + real linked runs + honest empty states. Explicitly **not** in V1: edit instructions, attach skills, env vars, "message this agent." Those require the agent store to move to DB.
- **[?] spike:** confirm the cleanest join for "runs for this agent" — by `AgentSession.role` + `provider`, or by `LaunchTaskStep.agent_name`. Both are real; pick one and document it.

### `/skills` — workspace skill library (fully featured, real CRUD)

- Promote the existing `SettingsPaneSkills` CRUD to a top-level route. This is a near-pure lift: list/create/edit/delete and the import flow (`GET /skills/importable` → `POST /skills/import`) already work end to end against the DB.
- **Q7 answer:** `/skills` shows the real `SkillDefinition[]` with create/edit/delete (respecting builtin immutability), plus the **runtime/disk import** flow already implemented. GitHub/marketplace import is **out of scope** (Multica-style cloud feature, not local-first).
- This is the lowest-risk, highest-fidelity surface in the whole plan — 100% real data, zero new domain, full editing on day one.

### Settings changes

- `SettingsPaneSkills` shrinks to a deep-link into `/skills` (or is removed once `/skills` ships). Skills stop being "launch-profile internals" in the UI.
- **Keep in Settings (low-level config, correctly):** providers (`SettingsPaneProviders` — billing/sandbox/permission), runtimes (`SettingsPaneRuntimes` — detection/capability matrix), profiles (`SettingsPaneProfiles` — recipe editing) — at least until they earn a product surface. **Q8 answer:** product surfaces are for things operators browse as teammates/library (agents, skills); Settings is for posture/credentials/detection (providers, runtimes) and power-user recipe editing (profiles).

### Issue interaction boundaries (the honest version)

- **[F] No mode supports true mid-run chat today.** PTY can attach a terminal but has no bidirectional prompt-injection pipe; Structured emits provider events outward only; Background polls state and has zero resume budget; interventions are **pre-spawn only**.
- **Q9/Q10 answer:** the only achievable model — and the same one Multica actually ships — is **between-run steering**: an operator posts a comment / instruction on the issue, which spawns a **new** task that resumes the provider session (`provider_session_id` exists for exactly this). 
  - **Can support resumed-turn steering:** Structured (Codex `ExecJson`, Claude `PrintStreamJson`) — they carry `provider_session_id`/resume keys. **[F]**
  - **Cannot support it cleanly:** Background (`claude --bg`, resume budget = 0) and PTY (own resume mechanics, no message pipe). **[F]**
- **V1 does not build issue chat at all.** It only makes the *current* agent/run legible. Issue chat is a later, separate ticket gated on the resume plumbing — and must never present a synchronous-chat affordance over an asynchronous task queue (Multica's documented over-promise).

---

## 5. What Not To Build Yet (with reasoning)

- **In-product agent creation / editing.** [F] Agents are config-defined (`superkick-config`), read-only, no DB table. Editing requires a config→DB migration + new domain + write API. Big, and not needed to make agents *visible*. Defer until the read-only roster proves the IA.
- **Issue-scoped agent chat / @-mention triggers / agent comments.** [F] No mode supports mid-run injection; the achievable version (resumed-turn-as-new-task) needs deliberate plumbing and a careful non-synchronous UX. Defer to its own ticket.
- **Auto-enqueue-on-assign.** [F] Trigger wiring not present; couples to Linear assignment semantics. Defer.
- **Squads / teams-of-agents.** [I] `LaunchProfile` already covers multi-step orchestration; squads add org-chart ceremony before the single-agent loop is even surfaced. Skip.
- **Autopilots (cron/webhook).** [F] A whole scheduler subsystem overlapping CI/cron. Out of "issue→run→PR." Skip.
- **GitHub / ClawHub / marketplace skill import + cloud skill sync + lockfiles.** [F] Cloud features for a local-first tool. The local disk import already covers the real need. Skip.
- **Usage / workload / success-rate / online-presence dashboards.** [F] Either fabricated or vanity metrics for non-deterministic agents; runtime `last_seen_at` is the only honest liveness signal. Hard no in V1 (and the brief forbids it).
- **Per-agent env vars / custom CLI args / visibility.** [?] Only meaningful once agents are editable; ride along with the future agent-store ticket.
- **Chasing provider breadth.** [F] Multica's own matrix admits several of its 12 tools have broken resume / ignored MCP. Keep Claude + Codex; depth over breadth.

---

## 6. Risks

### Product risks
- **Read-only `/agents` feels inert.** A roster you cannot edit, possibly with sparse run history, may underwhelm. *Mitigation:* lead the value with `/skills` (fully interactive, real CRUD) in the same release, and frame `/agents` honestly as "see your agents and what they've run," not "manage your team."
- **IA churn.** Moving skills out of Settings while leaving providers/runtimes/profiles there can feel half-migrated. *Mitigation:* state the rule explicitly in-product (browse-surfaces vs config-surfaces) and keep Settings deep-links.
- **Copying Multica's framing too literally** (teammate avatars, presence, "10 hires") imports humanizing theater Superkick's data can't back. *Mitigation:* borrow the *IA* (agents/skills as routes) not the *persona*.

### Architecture risks
- **The agent-store decision is load-bearing and easy to get wrong under pressure.** Promoting `/agents` to a product surface will create pull to make agents editable, which means moving the catalog from `superkick-config` to DB (mirroring skills/profiles migrations 037/038). That's a real domain change with snapshot/seed/migration implications (`docs` note: enum/CHECK widening needs the rebuild dance). *Mitigation:* keep V1 strictly read-only; make the config→DB move its own deliberate ticket with the migration discipline.
- **"Runs for this agent" join ambiguity.** [?] Two plausible joins (`AgentSession.role+provider` vs `LaunchTaskStep.agent_name`). Picking wrong yields confusing or empty cockpits. *Mitigation:* spike the join before building the cockpit panel.
- **Don't fork a parallel system.** [Constraint] Reuse `SkillDefinition`, `LaunchProfile`, `AgentCatalog`, `ProviderSettings`, `Runtime`. Do **not** introduce a new "Agent" entity that competes with the config catalog.

### Misleading / fake-data risks (the dominant constraint)
- **`agentsFixture.ts` is the canary.** [F] The IDE flagged this file as open, but it **does not exist on disk** — someone was about to seed fake agent data. That is precisely the trap. Any "agents" UI must bind to `GET /agents` + real audit data, never a fixture.
- **Placeholder metrics masquerading as truth.** Empty workload bars, "0% success," or grey "offline" dots read as real to operators. *Rule:* if the datum isn't real, the element doesn't render.
- **Synchronous-chat illusion.** Any future issue-chat must visibly behave as an async task queue (Multica's own documented over-promise), not a live IM thread.
- **Online/presence framing.** The only honest signal is runtime `last_seen_at` (host liveness), not "agent availability." Don't dress runtime heartbeat as agent presence.

---

## 7. Ticket Proposal

**Minimum: one umbrella ticket, one PR.** The work is coherent (promote existing surfaces), all-real-data, and adds no new domain — splitting it would create review overhead without de-risking anything. This matches the project's "umbrella split, single PR" preference for coherent multi-slice work.

### Ticket — "Agent & Skill Workspace V1 (read-only surfacing)"

**Scope**
- Add `/agents` route: read-only roster from `GET /agents`, grouped by provider, real columns only.
- Add `/agents/:id` route: read-only cockpit — identity/config from `AgentDefinition` + real recent `AgentSession`/`LaunchTask` activity (or honest empty state).
- Add `/skills` route: promote `SettingsPaneSkills` CRUD + disk-import flow to a top-level library page (reusing `ui/src/api/skills.ts` and existing endpoints).
- Shrink `SettingsPaneSkills` to a deep-link/redirect into `/skills`.
- Add the agents/skills entries to the sidebar nav.
- (If cheap and real) one read-only aggregation endpoint `GET /agents/{name}/runs` powering the cockpit's activity list — only if the join spike resolves cleanly; otherwise the cockpit ships with config-only + a follow-up.

**Non-goals (explicit)**
- No agent create/edit/delete; no env vars/custom args/visibility; no config→DB agent store.
- No issue chat, @-mention triggers, agent comments, or auto-enqueue-on-assign.
- No squads, autopilots, GitHub/marketplace skill import, cloud sync.
- No usage/workload/success-rate/online-presence UI. No fixtures. No fabricated columns.
- No changes to the LLM harness; no coupling to GitHub PR Review work.

**Acceptance criteria**
- `/agents` lists exactly what `GET /agents` returns, grouped by provider; every visible field traces to `AgentSummary`. No element renders without backing data.
- `/agents/:id` shows real config + either real linked runs or an explicit empty state; no seeded/example data anywhere.
- `/skills` supports list/create/edit/delete (respecting builtin immutability) and disk import, all against the existing DB endpoints; parity with the current Settings pane behavior.
- Settings no longer hosts the primary skills UI (redirect/deep-link remains).
- Grep proves no fixture/mock agent or skill data ships in non-test code; `agentsFixture.ts` is not introduced.

**Verification**
- `just check`, `just fmt`, `just lint` (CI parity: `clippy --all-targets --all-features`); `pnpm build` in `ui/` (CI runs `tsc -b`, stricter than `just check`).
- Frontend conventions: named exports, one component per file, shared types in `ui/src/types/**`, `cond ? <X/> : null`, no `forwardRef`/`React.FC`, no `any`.
- Manual: load `/agents` with the real catalog; open an agent with zero runs and confirm honest empty state; open one with runs and confirm they match `/runs`; exercise `/skills` create/edit/delete/import; confirm Settings redirect.
- Negative test: temporarily empty the catalog/skills and confirm the UI shows empty states, not placeholders.

---

## 8. First Ticket — Exact Scope

**Recommendation:** the umbrella above *is* the first (and ideally only V1) ticket, but if a single tighter PR is wanted, the precise first slice is **`/agents` read-only roster + `/agents/:id` read-only cockpit, shipped alongside the `/skills` lift in the same PR.** Lead with `/agents` deliberately: it is the surface where the fake-data trap lives (the `agentsFixture` canary), so building it honestly first sets the discipline for everything after, and it most directly serves the mission ("make it obvious which agent is working an issue"). `/skills` rides along because it is a near-zero-risk, fully-real lift that gives the release its interactive value.

**Precise deliverable**
1. `ui/src/routes/_shell/agents.tsx` — roster page; data via `ui/src/api/agents.ts` (`GET /agents`). Reuse the grouping logic already in `ui/src/components/launch/groupAgents.ts`. Real columns only.
2. `ui/src/routes/_shell/agents.$agentId.tsx` — cockpit; identity/config panel + real recent-activity list or honest empty state.
3. `ui/src/routes/_shell/skills.tsx` — library page; reuse `ui/src/api/skills.ts` and the CRUD/import logic currently in `SettingsPaneSkills`.
4. New `ui/src/components/agents/**` and `ui/src/components/skills/**` (one component per file; types in `ui/src/types/**`). **No `agentsFixture.ts`.**
5. Sidebar nav + route registration in `ui/src/routes/index.ts`.
6. `SettingsPaneSkills` → redirect/deep-link to `/skills`.
7. *(Conditional, gated on spike)* `GET /agents/{name}/runs` in `crates/superkick-api/src/handlers/agents.rs` + a runtime/storage query for `AgentSession`s by agent. Business logic in `superkick-runtime`, not the handler (module-boundary rule). If the join is non-trivial, defer this and ship cockpit config-only.

**File areas to inspect and reuse (do not duplicate)**
- Backend (read-only, already sufficient for the roster/cockpit-config): `crates/superkick-api/src/handlers/agents.rs` (`AgentCatalog`, `AgentSummary`), `crates/superkick-core/src/role_router.rs` + `crates/superkick-config/src/model.rs` (`AgentDefinition`), `crates/superkick-api/src/handlers/skills.rs`, `crates/superkick-core/src/skill.rs`, `crates/superkick-runtime/src/skill_import.rs`.
- For the activity join spike: `crates/superkick-core/src/agent.rs` (`AgentSession.role`/`provider`/`run_step_id`), `crates/superkick-api/src/handlers/runs.rs`, `crates/superkick-runtime/src/launch_task_step_runner.rs` (`LaunchTaskStep.agent_name`, `LaunchTask.linear_issue_id`).
- Frontend: `ui/src/api/agents.ts`, `ui/src/api/skills.ts`, `ui/src/components/settings/SettingsPaneSkills.tsx`, `ui/src/components/launch/AgentPicker*.tsx` + `groupAgents.ts`, `ui/src/routes/index.ts`, `ui/src/routes/settings.tsx`.

**What this ticket explicitly does not touch:** the agent config→DB store, any write path for agents, issue interaction, provider/runtime panes (stay in Settings), and the LLM harness.

---

### Open spikes (track separately)
- **[?]** Confirm whether `AgentDefinition.origin = custom` agents can already exist via config, and where — determines messaging on `/agents` (purely builtin vs config-extensible).
- **[?]** Choose the canonical "runs for this agent" join (`AgentSession.role+provider` vs `LaunchTaskStep.agent_name`) before building the cockpit activity panel.
- **[?]** Multica's exact agent-detail tab set is **Activity / Instructions / Skills / Environment / Custom Args** (5 tabs, no MCP/Connectors/Integrations panel) per issue #2385 (Desktop v0.2.24) — the challenge brief's longer tab list is aspirational, not shipped. Superkick should not mirror tabs it can't back with real data; the cockpit's panels should follow Superkick's real fields, not Multica's nav.
