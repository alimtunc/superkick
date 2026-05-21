# V1 Ship Gate

The single document an operator opens before tagging `v1.0`. Owns both the
automated parts (`just release-check`) and the manual parts that are too
brittle to script (UI live updates, terminal takeover, missing-auth UX).
Cross-checks against the SUP-137 harness in
[`crates/superkick-runtime/tests/release_validation.rs`](../../crates/superkick-runtime/tests/release_validation.rs).

Print this page, walk it top to bottom, only tag when every box is checked.

---

## 1. Pre-flight

- [ ] Local branch is `main` and is up to date with origin.
- [ ] `git status` is clean.
- [ ] `just check` is green.
- [ ] `just lint` is green.
- [ ] `cargo test --workspace` is green.

## 2. Automated harness — `just release-check`

Runs the SUP-137 validation suite end-to-end. Spawns real provider CLIs;
fast-skips any provider whose CLI is missing on `PATH` so the same command
works on a laptop with only one CLI installed.

```bash
just release-check
```

Expected on a machine with both CLIs installed:

```
running happy_path against codex
running happy_path against claude
running cancel against codex
running cancel against claude
running retry against codex
running retry against claude
test result: ok. 4 passed; 0 failed; 0 ignored; 0 measured; ...
```

Expected on a machine with only one CLI (or none):

```
skip: claude: CLI not found on PATH
running happy_path against codex
...
test result: ok. 4 passed; 0 failed; 0 ignored; 0 measured; ...
```

Both are pass states. A test that **errors** (not `ok`, not `skip:`) blocks
the ship.

### What the harness asserts

- Plan → Implement → Review all reach `Completed`.
- The shadow `Run` row is durable (`RunRepo::get` returns it).
- Each step row has a non-empty `summary`.
- The `LaunchTaskEventBus` emits `StepStarted` for each kind, in order.
- Cancel signals a live token and parks the task at `Cancelled`.
- Retry from `NeedsHuman` records a fresh shadow `RunId` on the retried
  step (SUP-120 contract).
- `FailureClassification::CliMissing` is persisted when the runner CLI is
  unreachable.

### Restricting the matrix

`SUPERKICK_RELEASE_RUNNERS` (default `codex,claude`) picks which providers
the harness probes. Examples:

```bash
SUPERKICK_RELEASE_RUNNERS=codex just release-check
SUPERKICK_RELEASE_RUNNERS=claude just release-check
```

## 3. Runner prerequisites

The harness gates on **`<binary> --version` succeeding** for each
requested provider. Missing or non-zero CLIs skip cleanly; nothing else is
required at the OS level.

| Provider | Binary    | Quick probe                            |
|----------|-----------|----------------------------------------|
| Codex    | `codex`   | `codex --version` exits 0              |
| Claude   | `claude`  | `claude --version` exits 0             |

Auth lives outside the V1 contract — provider CLIs handle their own
sessions. The "missing auth" surface is covered by the manual checklist
below.

## 4. Manual UI walkthrough

The harness asserts on bus events, which is upstream of the SSE bridge.
"No manual refresh" still needs eyeballs. Open the dashboard with
`just dev`, then:

1. **Canonical issue.** Create the Linear issue from
   [`test-issue.md`](./test-issue.md). Move it to **In Progress**.
2. **Visibility.** Confirm the issue appears in the dashboard's issues
   panel within seconds (no manual refresh).
3. **Launch Task creation.** Click "Launch Task" on the issue. The modal
   opens pre-filled with the three V1 roles (planner / coder / reviewer).
4. **Live updates.** Submit. Plan → Implement → Review transitions appear
   in the feed without manual refresh. Step status chips flip
   `Pending → Running → Completed` in real time.
5. **Cancel mid-task.** Re-launch the issue. While Plan is running, hit
   **Cancel**. Confirm the task moves to `Cancelled` and the in-flight
   step lands in `Cancelled` (not `Failed`).
6. **Retry from NeedsHuman.** Launch again. If the recipe does not
   organically fail, induce a failure by unsetting auth (see step 7);
   then re-set auth and hit **Retry** on the parked step. Recipe should
   resume from the failing step and reach `Completed`.
7. **Failure-mode surface.** Unset the provider's auth (e.g. `unset
   ANTHROPIC_API_KEY` for Claude, or move the CLI off `PATH`). Launch the
   issue. The dashboard must render an explicit error state — not a
   silent hang. A toast or feed entry mentioning the missing CLI / auth
   is acceptable. Re-set auth between scenarios.
8. **Terminal takeover.** While a task is active, open the run's terminal
   view. The PTY must attach (no blank pane) and accept input from the
   operator.

Anything that fails this walkthrough blocks the ship.

## 5. Sign-off

- [ ] All boxes in §1 ticked.
- [ ] `just release-check` returned `ok` for every requested runner.
- [ ] §4 walkthrough passed end-to-end.
- [ ] Release notes drafted (out of scope for this checklist, but the
      gate is incomplete without them).

When every line above is checked:

```bash
git tag v1.0
git push --tags
```
