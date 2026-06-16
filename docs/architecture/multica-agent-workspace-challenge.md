# Multica Agent Workspace Challenge

Use this prompt for an independent Claude workflow audit. Do not implement code from
this document directly; the deliverable is a critical product/architecture review and
an actionable ticket proposal.

## Mission

Superkick needs a cleaner, more useful Agents / Skills / Runtimes experience. The
current product has strong runtime foundations, but the UX is still too scattered:
agents, skills, provider settings, launch profiles, runs, and issue workflows do not
feel like one coherent system.

Benchmark Multica and challenge how Superkick should evolve.

Reference:
- Multica repo: https://github.com/multica-ai/multica
- Superkick repo: current `main`

You must form your own view. Do not rubber-stamp the current Superkick direction.
Do not copy Multica code, branding, assets, or implementation details. Copy only
product concepts and interaction patterns if they are genuinely better.

## Product Intent

Superkick should stay issue-first:

```text
Linear issue -> agent/team assignment -> worktree/session/run -> review -> PR
```

The desired direction is closer to Multica:

- Agents are visible teammates, not hidden settings.
- Skills are a workspace library, not only launch-profile internals.
- Runtimes/providers are understandable to users.
- An issue should make it obvious which agent is working, what it is doing, and how
  the operator can interact or intervene.
- The product should eventually support talking to an agent inside an issue when
  the underlying execution mode supports it.

## Superkick Context To Verify

Read the current Superkick code before making claims. Start with:

- `crates/superkick-core/src/agent.rs`
- `crates/superkick-core/src/skill.rs`
- `crates/superkick-core/src/provider_settings.rs`
- `crates/superkick-core/src/launch_profile.rs`
- `crates/superkick-runtime/src/launch_profile_service.rs`
- `crates/superkick-runtime/src/skill_import.rs`
- `crates/superkick-runtime/src/claude_background.rs`
- `crates/superkick-runtime/src/launch_task_step_runner.rs`
- `crates/superkick-api/src/handlers/agents.rs`
- `crates/superkick-api/src/handlers/skills.rs`
- `crates/superkick-api/src/handlers/runtimes.rs`
- `crates/superkick-api/src/handlers/provider_settings.rs`
- `crates/superkick-api/src/handlers/launch_profiles.rs`
- `ui/src/api/agents.ts`
- `ui/src/api/skills.ts`
- `ui/src/api/runtimes.ts`
- `ui/src/api/providerSettings.ts`
- `ui/src/components/settings/SettingsPaneSkills.tsx`
- `ui/src/components/settings/SettingsPaneRuntimes.tsx`
- `ui/src/components/settings/SettingsPaneProviders.tsx`
- `ui/src/components/settings/SettingsPaneProfiles.tsx`
- `ui/src/components/launch/`
- `ui/src/routes/settings.tsx`

Also inspect recent UX state from `main`, especially the post-PR #201 shape if
available locally.

## Multica Areas To Benchmark

Use the Multica repo and docs to inspect the product model. Focus on concepts:

- Agents list / table
- Agent creation flow
- Agent detail page
- Agent tabs: Activity, Tasks, Instructions, Skills, Environment, Custom Args, MCP,
  Integrations
- Skills workspace library
- Skill creation / import / copy-from-runtime flows
- Runtime/provider model
- Issue assignment and agent comments
- Agent/team/squad model if relevant, but treat squads as likely later scope

Do not spend time on Multica's stack choice unless it exposes a product boundary we
should understand. Superkick is Rust + React + SQLite/Tauri; Multica's Go/Next/Postgres
architecture is not a migration target.

## Questions To Answer

Answer these directly with evidence or explicit uncertainty.

1. What exactly does Multica do better than Superkick for Agents / Skills / Runtimes?
2. Which Multica concepts map cleanly to Superkick's existing data model?
3. Which concepts would require new storage/API/domain work?
4. Should Superkick promote Agents and Skills to primary sidebar routes?
5. What should `/agents` show if activity/workload/runs are partially unavailable?
6. What should `/agents/:id` contain in V1 without fake data?
7. What should `/skills` contain in V1, and how should runtime import work?
8. What should stay in Settings vs move into product surfaces?
9. How should agent issue interaction work in the future?
10. Which execution modes can support interactive issue chat, and which cannot?
11. What should not be built yet?
12. What risks or misleading UI traps should be avoided?

## Constraints

Hard constraints:

- Keep Superkick issue-first.
- Do not rebuild the LLM harness in this work.
- Do not couple this to GitHub PR Review work.
- Do not fake usage, workload, online status, activity, or run history.
- Do not add Squads/Autopilot/Usage in the first PR unless you can prove they are
  tiny and backed by real data.
- Do not copy Multica code or assets.
- Reuse existing Superkick APIs and domain objects where possible.
- Preserve existing launch profiles / provider settings / skills rather than creating
  parallel systems.

Preferred product shape:

- `/agents` as primary product surface.
- `/agents/:id` as an agent cockpit.
- `/skills` as workspace skill library.
- Runtime import for skills where feasible.
- Existing Settings panes shrink to lower-level configuration, not the primary UX.

## Expected Output

Create one Markdown audit in `docs/reviews/` with this structure:

1. **Verdict**
   - One paragraph: what direction should Superkick take?

2. **Benchmark Summary**
   - What Multica gets right.
   - What Superkick already has.
   - What Superkick is missing.

3. **Concept Map**
   - Table: Multica concept -> Superkick equivalent -> reuse/new work -> confidence.

4. **Recommended V1 Product Shape**
   - `/agents`
   - `/agents/:id`
   - `/skills`
   - Settings changes
   - Issue interaction boundaries

5. **What Not To Build Yet**
   - Explicit deferred list with reasoning.

6. **Risks**
   - Product risks.
   - Architecture risks.
   - Misleading/fake-data risks.

7. **Ticket Proposal**
   - Minimum number of tickets.
   - Prefer one large ticket if feasible.
   - Each ticket must include scope, non-goals, acceptance criteria, and verification.

8. **First Ticket Exact Scope**
   - The precise first implementation ticket you recommend.
   - Include file areas to inspect and reuse.

## Review Posture

Be skeptical.

If the current Superkick model is wrong, say so.
If copying Multica too closely is wrong, say so.
If the right answer is "one big Agent Workspace V1 ticket", defend it.
If the right answer is "split storage/API first, UI second", defend it.

Separate:

- verified fact
- reasoned inference
- unknown / needs spike

Do not implement code. Do not create Linear tickets. Do not open a PR.

