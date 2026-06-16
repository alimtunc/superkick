# Launch profile selection + dangling-ref warnings

Date: 2026-06-16
Status: approved, implementing

## Problem

1. **Profiles invisible at launch.** Commit `b8260d4` (#207) removed `LaunchProfilePicker` and replaced it with the editable "agents-in-order" composer. `LaunchComposer` now auto-picks the default profile invisibly (`LaunchComposer.tsx:84-88`). The operator can no longer choose which saved profile to start from, even though profiles still exist (Settings → Launch profiles) and the backend still accepts `profile_id`.
2. **Silent orphan on delete.** Profile steps reference skills/agents by free-form ref string (`skill_ref`, `agent_ref`), no FK (migrations 038/050). Deleting a skill or agent leaves dangling refs; nothing warns the operator, and the profile editor gives no sign a step is now broken.

## Decisions (operator)

- **A.** A profile selector at the top of the composer; choosing one populates the editable agents-in-order step list. Profiles = saved starting templates. Keeps the #207 single editing surface.
- **B.** On skill/agent delete: **warn but allow** (matches the deliberate FK-free model; refs degrade gracefully at launch).
- **C.** Surface dangling refs via (1) a warning in the delete confirm dialog and (2) a "missing" badge in the profile editor. No launch-time change.

## Design

### Problem A — selector → composer (frontend only)

- New `ui/src/components/launch/LaunchProfileSelector.tsx` rendered at the top of `LaunchComposer`. Reads `useLaunchProfiles().profiles`.
- On change → `useLaunchComposerState().selectProfile(profile)`, which already sets `profileId` and repopulates the editable `steps` (`stores/launchComposerState.ts:33-41`).
- Filter the selector by `useHiddenLaunchProfilesStore` so the existing "Hidden from launcher" toggle (`ProfileHideToggle.tsx`) takes effect.
- Default selection unchanged (pre-pick `is_default`, else first) — now visible/changeable.
- Submit path unchanged (`profile_id` + `step_overrides` already sent, `LaunchComposer.tsx:134-143`).
- Fix stale copy in `SettingsPaneProfiles.tsx:33,50`.
- **Out of scope:** the legacy Inbox `LaunchDialog` (hardcoded recipe) stays untouched.

### Problem B — dangling-ref warnings

**Surface 1 (delete warning) — backend reverse-lookup.**
The skills/agents settings panes do not load the profiles list, so deriving client-side would force fetching every profile + all steps just to scan. A backend query returns only slim matches and is the correct home for a persisted-relationship lookup.

- `superkick-core`: new `ProfileUsage { id, name, steps: Vec<String> }` (matching step labels), `Serialize`/`Deserialize`.
- `superkick-storage`: extend `LaunchProfileRepo` with `profiles_using_skill(skill_id)` + `profiles_using_agent(agent_name)`; SQLite impl JOINs `launch_profile_steps` on `skill_ref` / `agent_ref`, grouped by profile.
- `superkick-api`: thin read handlers + routes `GET /skills/{id}/usages`, `GET /agents/{name}/usages` (direct `launch_profile_repo` read, mirroring the existing direct-repo delete handlers — no core/runtime service for a pure read).
- Frontend: `fetchSkillUsages`/`fetchAgentUsages` (`api/skills.ts`/`api/agents.ts`); lazy query hooks (`enabled` only when the delete dialog is open); feed the result into the `ConfirmDialog` description in `SettingsPaneSkills.tsx`, `AgentRoster.tsx`, `AgentCockpit.tsx`. Delete still proceeds.

**Surface 2 (editor badge) — client-side.**
The editor reflects the in-progress, unsaved profile and already holds the live `skills`/`agents` catalogs (it renders the pickers from them). A backend call can't see unsaved edits and would be redundant.

- In `StepListEditor.tsx`, flag a step whose `skill_ref` is not in `skills` or whose `agent_ref` is not in `agents` with a "missing" badge. The existing `LaunchStepSkillPicker` (keeps the orphan ref selectable) + `AgentPicker` ("choose…") are the re-attach control; saving the profile fixes it.

## Out of scope

Backend blocking on delete; launch-time behavior change; legacy Inbox `LaunchDialog`; schema/migration (queries only, no new columns).

## Test surface

- Rust storage integration test (real SQLite) for `profiles_using_skill` / `profiles_using_agent` (hit, multi-step aggregation, no-match).
- Manual: pick a profile at launch → steps populate, editable; hide a profile → gone from selector; delete a referenced skill/agent → warning lists profiles, delete proceeds; open that profile → broken step badged → re-pick → badge clears.
